import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Pulse, Saved } from '../types'

const MIN = 60_000
export const IDLE = 50 * MIN // default silence before a beat; must stay under the cache TTL
export const DEADLINE = 8 * 60 * MIN // stop this long after the last real turn
export const RETRY = MIN // after a transient API error
export const MAX_TTL = 60 * MIN // past this since the last cache read, the cache is gone whatever the TTL
const FRAME_MS = 90
// padded with U+2800 (blank, but not whitespace a surface could collapse) so every frame is 5 cells
const pad = (frames: string[]) => frames.map(f => f.replaceAll(' ', '⠀'))
export const BEAT = pad(['  ♡  ', '  ♥  ', ' (❤︎) ', '( ♥ )', '⋅ ♡ ⋅', '  ♥  ', ' (♥) ', ' ⋅♡⋅ ', '  ♡  ', '  ♡  ', '  ♡  '])
export const BLAST = pad(['  ♥  ', ' (❤︎) ', ' ♥♥♥ ', '♥ ♥ ♥', '♥ ♡ ♥', '♡   ♡', '⋅   ⋅', '     ', '  ⋅  '])

const pulse = atom({ plugin: 'cachebeat', key: 'pulse' } as const, 'hidden' as Pulse)
const saved = atom({ plugin: 'cachebeat', key: 'saved' } as const, null as Saved | null)
const frameAtom = atom({ plugin: 'cachebeat', key: 'frame' } as const, 0)
const lineAtom = atom({ plugin: 'cachebeat', key: 'line' } as const, '')

const fresh: Saved = {
  enabled: false, idle: IDLE, lastReal: null, lastWarm: null, nextAt: null, beats: 0, stretch: 0, row: null, rowsDone: {},
}
let s: Saved = { ...fresh }
let options = { heartColor: 'dim' }
let timer: { cancel: () => void } | undefined
let ticker: { cancel: () => void } | undefined
let frame = 0
let blast = -1 // the BLAST frame showing after a beat, or -1
let busy = false // a main-thread turn is running
let beating = false
let rowPending = false // the turn just ended: its closing row is the next new one drawn
const rowsSeen = new Set<string>()

export const fmt = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / MIN))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

function save($: EngineInterface) {
  const copy = { ...s, rowsDone: { ...s.rowsDone } }
  void update($, saved, () => copy)
}

/** The beat line under the last turn's closing row, or '' while there is none. */
async function refreshLine($: EngineInterface) {
  let text = ''
  if (s.stretch > 0) {
    text = `♥ cache kept warm ×${s.stretch}`
    if (s.enabled && s.nextAt !== null) text += ` · next in ${fmt(s.nextAt - (await $.clock.now()))}`
  }
  if (text !== (await read($, lineAtom))) await update($, lineAtom, () => text)
}

/** The animation clock: runs while the heart is drawn beating (the hint row draws it). */
function animate($: EngineInterface) {
  ticker ??= $.clock.every(FRAME_MS, () => {
    frame++
    if (blast >= 0 && ++blast >= BLAST.length) blast = -1
    void update($, frameAtom, () => frame)
    if (frame % 10 === 0) void refreshLine($) // the countdown, about once a second
  })
}

function setPulse($: EngineInterface, p: Pulse) {
  if (p !== 'armed') {
    ticker?.cancel()
    ticker = undefined
    blast = -1
  }
  void update($, pulse, () => p)
}

/** Sets the next beat from the last cache read; resolves its delay, or undefined when none is set. */
async function schedule($: EngineInterface): Promise<number | undefined> {
  timer?.cancel()
  timer = undefined
  s.nextAt = null
  let ms: number | undefined
  if (!s.enabled || busy) setPulse($, 'hidden')
  else {
    const now = await $.clock.now()
    const since = s.lastWarm === null ? Infinity : now - s.lastWarm
    if (since >= MAX_TTL) setPulse($, 'waiting') // nothing warm to keep; the next turn starts it
    else {
      ms = Math.max(0, s.idle - since)
      s.nextAt = now + ms
      timer = $.clock.after(ms, () => void beat($))
      setPulse($, 'armed')
    }
  }
  save($)
  await refreshLine($)
  return ms
}

function stop($: EngineInterface, why?: string) {
  s.enabled = false
  void schedule($)
  if (why) $.ui.log(`stopped: ${why}`)
}

async function beat($: EngineInterface) {
  if (busy) return
  const now = await $.clock.now()
  if (now - (s.lastReal ?? now) >= DEADLINE) return stop($, `${DEADLINE / 60 / MIN}h since your last turn`)
  if (now - (s.lastWarm ?? now) >= MAX_TTL) return stop($, 'over an hour since the cache was last read, so it has expired')
  const { rateLimits } = await $.session.usage()
  const full = rateLimits.find(l => l.percentUsed >= 100)
  if (full) return stop($, `${full.kind.replace('_', '-')} usage limit reached`)

  beating = true
  const r = await $.model.fork({ prompt: 'Reply with a single period.' }).finally(() => (beating = false))
  if (!r.isAnswered && r.reason !== 'empty-reply') {
    if (r.reason === 'nothing-to-fork') return stop($, 'nothing to keep warm')
    const isTransient = r.reason === 'aborted' || r.error === 'overloaded' || r.error === 'server_error' || r.status === null
    if (!isTransient) return stop($, r.error === 'rate_limit' ? 'rate limited' : `API error (${r.error})`)
    if (!busy) timer = $.clock.after(RETRY, () => void beat($))
    return
  }
  const { cache_read_input_tokens: read, cache_creation_input_tokens: wrote } = r.usage
  if (read < wrote) return stop($, `the cache was not served (${read.toLocaleString()} read, ${wrote.toLocaleString()} written)`)
  s.lastWarm = await $.clock.now()
  s.beats++
  s.stretch++
  blast = 0
  if (s.row === null) $.ui.log(`♥ cache renewed (${read.toLocaleString()} read, ${wrote.toLocaleString()} written)`)
  await schedule($)
}

const every = () => `every ${fmt(s.idle)} idle`
const when = (ms: number | undefined) =>
  ms === undefined ? 'starts after your next turn' : ms === 0 ? 'beating now' : `next beat in ${fmt(ms)}`

async function turnOn($: EngineInterface, minutes: number | undefined) {
  const wasOn = s.enabled
  const before = s.idle
  if (minutes !== undefined) s.idle = Math.min(55, Math.max(1, Math.round(minutes))) * MIN
  s.enabled = true
  if (busy) {
    save($)
    return { text: `on, ${every()}; starts after this turn` }
  }
  if (wasOn && s.idle === before) {
    const ms = s.nextAt === null ? undefined : Math.max(0, s.nextAt - (await $.clock.now()))
    return { text: `already on, ${every()} · ${when(ms)}` }
  }
  const ms = await schedule($)
  if (wasOn) return { text: `interval ${fmt(before)} → ${fmt(s.idle)} · ${when(ms)}` }
  return { text: `on, ${every()} · ${when(ms)}` }
}

export const register: Register = (on, opts) => {
  options = { heartColor: String(opts.heartColor ?? 'dim') }

  // also runs after every reload: pick up where the last load left off
  on('session.start', async ($, e, next) => {
    s = { ...fresh, ...((await read($, saved)) ?? {}) }
    await schedule($)
    await $.command.register({
      name: 'cachebeat',
      description: 'Keep the prompt cache warm while idle (off by default)',
      argumentHint: '[on|off|<minutes>]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'cachebeat' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const minutes = words.find(w => /^\d+$/.test(w))
    if (words[0] === 'off') {
      if (!s.enabled) return { text: 'already off' }
      stop($)
      return { text: 'off' }
    }
    if (words[0] === 'on' || minutes) return turnOn($, minutes === undefined ? undefined : Number(minutes))
    if (words.length) return { text: 'usage: /cachebeat [on|off|<minutes>]' }
    if (!s.enabled) return { text: 'off' }
    const ms = s.nextAt === null ? undefined : Math.max(0, s.nextAt - (await $.clock.now()))
    return { text: `on, ${every()} · ${s.beats} beats · ${when(ms)}` }
  })

  on('turn.start', async ($, e, next) => {
    if (!beating) {
      busy = true
      if (s.row !== null && s.stretch > 0) {
        s.rowsDone[s.row] = `♥ cache kept warm ×${s.stretch}` // the row keeps its final count
        const ids = Object.keys(s.rowsDone)
        for (const id of ids.slice(0, Math.max(0, ids.length - 50))) delete s.rowsDone[id]
      }
      s.row = null
      s.stretch = 0
      await schedule($)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && !beating) {
      busy = false
      rowPending = true
      s.lastReal = s.lastWarm = await $.clock.now()
      await schedule($)
    }
    return next(e)
  })

  // the beat line, under the closing row of the last turn ("✻ Cogitated for 2s"), counting down
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!rowsSeen.has(e.requestId)) {
      rowsSeen.add(e.requestId)
      if (rowPending) {
        rowPending = false
        s.row = e.requestId // saved with the next beat: drawing never writes state
      }
    }
    const line = e.requestId === s.row ? await read($, lineAtom) : s.rowsDone[e.requestId]
    if (!line) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Text dimColor>{line}</Text>
      </Box>
    )
  })

  // the heart and beat count. The hint row ("⏸ manual mode on · ...") takes added text only as its dim
  // tail, so a colored heart gets its own line under that row; a dim one rides the row itself.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const p = await read($, pulse)
    if (e.props.isWorking || p === 'hidden') return next(e)
    if (p === 'armed') animate($)
    const f = await read($, frameAtom)
    const heart = blast >= 0 ? BLAST[blast] : BEAT[p === 'armed' ? f % BEAT.length : 0]
    const { heartColor } = options
    if (heartColor === 'dim') return next({ ...e, props: { ...e.props, tail: `${heart}${s.beats}` } })
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box>
          <Text color={p === 'waiting' ? undefined : heartColor} dimColor={p === 'waiting'}>
            {heart}
          </Text>
          <Text dimColor>{s.beats}</Text>
        </Box>
      </Box>
    )
  })
}
