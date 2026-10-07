import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { PanePage, Pulse, Saved, BeatSettings } from '../types'
import { loopIndex, variant } from './animations'
import { PANE, paint, settingsPane, statusText } from './pane'
import { DEFAULTS, FRAME_MS, isLit, normalize, spans, tokens } from './settings'

const MIN = 60_000
export const IDLE = DEFAULTS.interval * MIN // default silence before a beat; must stay under the cache TTL
export const DEADLINE = DEFAULTS.stopAfterHours * 60 * MIN // default stop this long after the last real turn
export const RETRY = MIN // after a transient API error
export const MAX_TTL = 60 * MIN // past this since the last cache read, the cache is gone whatever the TTL

const pulse = atom({ plugin: 'cachebeat', key: 'pulse' } as const, 'hidden' as Pulse)
const saved = atom({ plugin: 'cachebeat', key: 'saved' } as const, null as Saved | null)
const frameAtom = atom({ plugin: 'cachebeat', key: 'frame' } as const, 0)
const lineAtom = atom({ plugin: 'cachebeat', key: 'line' } as const, '')
const settingsAtom = atom({ plugin: 'cachebeat', key: 'settings' } as const, DEFAULTS)
const tickAtom = atom({ plugin: 'cachebeat', key: 'tick' } as const, 0)
const pageAtom = atom({ plugin: 'cachebeat', key: 'page' } as const, 'main' as PanePage)

const fresh: Saved = {
  enabled: false, idle: null, lastReal: null, lastWarm: null, lastRead: null, nextAt: null, beats: 0, stretch: 0, row: null, rowsDone: {},
}
let s: Saved = { ...fresh }
let cfg: BeatSettings = DEFAULTS
let timer: { cancel: () => void } | undefined
let ticker: { cancel: () => void } | undefined
let paneTicker: { cancel: () => void } | undefined
let paneTick = 0
let frame = 0
let blast = -1 // the blast frame showing after a beat, or -1
let busy = false // a main-thread turn is running
let beating = false
let rowPending = false // the turn just ended: its closing row is the next new one drawn
const rowsSeen = new Set<string>()

export const fmt = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / MIN))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

const idle = () => s.idle ?? cfg.interval * MIN

function save($: EngineInterface) {
  const copy = { ...s, rowsDone: { ...s.rowsDone } }
  void update($, saved, () => copy)
}

async function setSettings($: EngineInterface, patch: Partial<BeatSettings>) {
  // from the store, not this session's copy: another session may have changed it since
  cfg = { ...normalize(await $.store.get('settings')), ...patch }
  const copy = { ...cfg }
  await $.store.set('settings', copy)
  await update($, settingsAtom, () => copy)
  // the clocks restart at the new speed, or stay stopped, as the next drawing finds them
  ticker?.cancel()
  ticker = undefined
  paneTicker?.cancel()
  paneTicker = undefined
  void update($, frameAtom, f => f + 1)
  void update($, tickAtom, t => t + 1)
  if (s.enabled && !busy && !beating) await schedule($)
  else await refreshLine($)
}

/** Picks up settings another session changed since this one last looked. */
async function syncSettings($: EngineInterface) {
  const now = normalize(await $.store.get('settings'))
  if (JSON.stringify(now) === JSON.stringify(cfg)) return
  cfg = now
  await update($, settingsAtom, () => now)
}

/** The beat line under the last turn's closing row, or '' while there is none. */
async function refreshLine($: EngineInterface) {
  let text = ''
  if (s.stretch > 0) {
    const next = s.enabled && s.nextAt !== null ? fmt(s.nextAt - (await $.clock.now())) : null
    text = statusText(cfg, s.stretch, s.lastRead, next)
  }
  if (text !== (await read($, lineAtom))) await update($, lineAtom, () => text)
}

/** The animation clock: runs while the heart is drawn beating (the hint row draws it). */
function animate($: EngineInterface) {
  const ms = FRAME_MS[cfg.speed]
  const perSecond = Math.round(1000 / ms)
  ticker ??= $.clock.every(ms, () => {
    frame++
    if (blast >= 0 && ++blast >= variant(cfg.variant).blast.length) blast = -1
    void update($, frameAtom, () => frame)
    if (frame % perSecond === 0) void refreshLine($) // the countdown, about once a second
  })
}

/** The heart as drawn now: the blast after a beat, the loop while armed, else the loop's first frame. */
function heartFrame(c: BeatSettings, p: Pulse, f: number) {
  const x = variant(c.variant)
  if (!c.animate) return x.loop[0]!
  if (blast >= 0) return x.blast[blast]!
  return p === 'armed' ? x.loop[loopIndex(x.loop.length, f, c.timing)]! : x.loop[0]!
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
      ms = Math.max(0, idle() - since)
      s.nextAt = now + ms
      timer = $.clock.after(ms, () => void beat($))
      setPulse($, 'armed')
    }
  }
  save($)
  await refreshLine($)
  return ms
}

function announce($: EngineInterface, text: string) {
  if (cfg.onStop === 'log') $.ui.log(text)
  else if (cfg.onStop === 'toast') $.ui.toast(`cachebeat ${text}`)
}

function stop($: EngineInterface, why?: string) {
  s.enabled = false
  void schedule($)
  if (!why) return 'off'
  announce($, `stopped: ${why}`)
  return `stopped: ${why}`
}

/** One beat: checks it is worth it, forks, and resolves what happened, in words. */
async function beat($: EngineInterface): Promise<string> {
  if (busy) return 'a turn is running; the beat waits for it to end'
  const now = await $.clock.now()
  if (now - (s.lastReal ?? now) >= cfg.stopAfterHours * 60 * MIN) return stop($, `${cfg.stopAfterHours}h since your last turn`)
  if (now - (s.lastWarm ?? now) >= MAX_TTL) return stop($, 'over an hour since the cache was last read, so it has expired')
  const { rateLimits, context } = await $.session.usage()
  const full = rateLimits.find(l => l.percentUsed >= cfg.stopAtUsage)
  if (full) {
    const kind = full.kind.replace('_', '-')
    return stop($, cfg.stopAtUsage >= 100 ? `${kind} usage limit reached` : `${kind} usage at ${full.percentUsed}%, past ${cfg.stopAtUsage}%`)
  }
  if (cfg.skipSmall && context.tokens !== undefined && context.tokens < cfg.skipSmallTokens) {
    s.lastWarm = null // not worth keeping; the next turn arms it again
    await schedule($)
    const why = `skipped: the context is ${tokens(context.tokens)} tokens, under ${tokens(cfg.skipSmallTokens)}`
    announce($, why)
    return why
  }

  beating = true
  const r = await $.model.fork({ prompt: 'Reply with a single period.' }).finally(() => (beating = false))
  if (!r.isAnswered && r.reason !== 'empty-reply') {
    if (r.reason === 'nothing-to-fork') return stop($, 'nothing to keep warm')
    const isTransient = r.reason === 'aborted' || r.error === 'overloaded' || r.error === 'server_error' || r.status === null
    if (!isTransient) return stop($, r.error === 'rate_limit' ? 'rate limited' : `API error (${r.error})`)
    if (!busy && s.enabled) timer = $.clock.after(RETRY, () => void beat($))
    return `${'error' in r ? r.error : r.reason}; ${s.enabled ? 'retrying in a minute' : 'not retried while off'}`
  }
  const { cache_read_input_tokens: got, cache_creation_input_tokens: wrote } = r.usage
  if (got < wrote) return stop($, `the cache was not served (${got.toLocaleString()} read, ${wrote.toLocaleString()} written)`)
  s.lastWarm = await $.clock.now()
  s.lastRead = got
  s.beats++
  s.stretch++
  if (cfg.animate) blast = 0
  const renewed = `♥ cache renewed (${got.toLocaleString()} read, ${wrote.toLocaleString()} written)`
  if (s.row === null) $.ui.log(renewed)
  if (cfg.onBeat === 'toast') $.ui.toast(`♥ cache kept warm · ${tokens(got)} read`)
  if (cfg.sound !== 'off') {
    // Linux's sound theme; a host without libcanberra plays nothing
    void $.process.run(['canberra-gtk-play', '-i', cfg.sound]).catch(err => $.ui.log(`sound: ${err}`, { to: 'debug' }))
  }
  await schedule($)
  return renewed
}

/** A beat asked for by hand: never one that would switch cachebeat off for having nothing to fork. */
const beatNow = ($: EngineInterface) => (s.lastReal === null ? Promise.resolve('nothing to keep warm until this session has a turn') : beat($))

const every = () => `every ${fmt(idle())} idle`
const when = (ms: number | undefined) =>
  ms === undefined ? 'starts after your next turn' : ms === 0 ? 'beating now' : `next beat in ${fmt(ms)}`

async function turnOn($: EngineInterface, minutes: number | undefined) {
  const wasOn = s.enabled
  const before = idle()
  if (minutes !== undefined) {
    const m = Math.min(55, Math.max(1, Math.round(minutes)))
    if (cfg.intervalScope === 'global') {
      s.idle = null
      await setSettings($, { interval: m })
    } else s.idle = m * MIN
  }
  s.enabled = true
  if (busy) {
    save($)
    return { text: `on, ${every()}; starts after this turn` }
  }
  if (wasOn && idle() === before) {
    const ms = s.nextAt === null ? undefined : Math.max(0, s.nextAt - (await $.clock.now()))
    return { text: `already on, ${every()} · ${when(ms)}` }
  }
  const ms = await schedule($)
  if (wasOn) return { text: `interval ${fmt(before)} → ${fmt(idle())} · ${when(ms)}` }
  return { text: `on, ${every()} · ${when(ms)}` }
}

async function openSettings($: EngineInterface) {
  await syncSettings($)
  await update($, pageAtom, () => 'main')
  await $.ui.open({ id: PANE, title: 'cachebeat', focus: true, closeOnEscape: true, rows: 40 })
}

const USAGE = 'usage: /cachebeat [on|off|<minutes>|now|global on|off|settings]'

export const register: Register = on => {
  // also runs after every reload: pick up where the last load left off
  on('session.start', async ($, e, next) => {
    cfg = normalize(await $.store.get('settings'))
    await update($, settingsAtom, () => cfg)
    const prev = await read($, saved)
    // a reload keeps this session's choice; a new session takes the global default
    s = prev ? { ...fresh, ...prev } : { ...fresh, enabled: cfg.defaultOn }
    await schedule($)
    await $.command.register({
      name: 'cachebeat',
      description: 'Keep the prompt cache warm while idle',
      argumentHint: '[on|off|<minutes>|now|global on|off|settings]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'cachebeat' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const minutes = words.find(w => /^\d+$/.test(w))
    switch (words[0]) {
      case 'settings':
      case 'config':
        await openSettings($)
        return { text: 'settings opened' }
      case 'now':
        return { text: await beatNow($) }
      case 'global': {
        if (words[1] !== 'on' && words[1] !== 'off') return { text: `new sessions start ${cfg.defaultOn ? 'on' : 'off'} · ${USAGE}` }
        await setSettings($, { defaultOn: words[1] === 'on' })
        const here = words[1] === 'on' ? (await turnOn($, undefined)).text : s.enabled ? stop($) : 'already off'
        return { text: `new sessions start ${words[1]} · this session: ${here}` }
      }
      case 'off':
        if (!s.enabled) return { text: 'already off' }
        return { text: stop($) }
    }
    if (words[0] === 'on' || minutes) return turnOn($, minutes === undefined ? undefined : Number(minutes))
    if (words.length) return { text: USAGE }
    if (!s.enabled) return { text: 'off' }
    const ms = s.nextAt === null ? undefined : Math.max(0, s.nextAt - (await $.clock.now()))
    return { text: `on, ${every()} · ${s.beats} beats · ${when(ms)}` }
  })

  on('turn.start', async ($, e, next) => {
    if (!beating) {
      busy = true
      if (s.row !== null && s.stretch > 0) {
        s.rowsDone[s.row] = statusText({ ...cfg, showCountdown: false }, s.stretch, s.lastRead, null) // the row keeps its final count
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
      await syncSettings($)
      await schedule($)
    }
    return next(e)
  })

  // the beat line, by the closing row of the last turn ("✻ Cogitated for 2s"), counting down
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!rowsSeen.has(e.requestId)) {
      rowsSeen.add(e.requestId)
      if (rowPending) {
        rowPending = false
        s.row = e.requestId // saved with the next beat: drawing never writes state
      }
    }
    const isLive = e.requestId === s.row
    const line = isLive ? await read($, lineAtom) : s.rowsDone[e.requestId]
    const c = await read($, settingsAtom)
    if (!line || c.statusLine === 'off') return next(e)
    // only the live row moves with the heart; finished rows hold still
    const moving = isLive && c.animate && c.effect !== 'steady'
    const f = moving ? await read($, frameAtom) : 0
    const p = moving ? await read($, pulse) : 'hidden'
    const { Box, Text } = $.ui.resolve(e)
    const painted = paint(Text, spans(line, moving ? c : { ...c, effect: 'steady' }, f, isLit(heartFrame(c, p, f))))
    if (c.statusLine === 'inline') {
      return (
        <Box>
          {await next(e)}
          <Text dimColor> · </Text>
          {painted}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box marginTop={c.statusLine === 'spaced' ? 1 : 0}>{painted}</Box>
      </Box>
    )
  })

  // the heart and beat count. The hint row ("⏸ manual mode on · ...") takes added text only as its dim
  // tail, so the heart rides it dim, or gets its own line under that row to take color.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const p = await read($, pulse)
    if (e.props.isWorking || p === 'hidden') return next(e)
    const c = await read($, settingsAtom)
    if (p === 'armed' && c.animate) animate($)
    const f = await read($, frameAtom)
    const heart = heartFrame(c, p, f)
    const count = c.showCount ? `${s.beats}` : ''
    if (c.heartPlacement === 'tail') return next({ ...e, props: { ...e.props, tail: `${heart}${count}` } })
    const { Box, Text } = $.ui.resolve(e)
    const look = p === 'waiting' ? [{ text: heart, dim: true }] : spans(heart, c, f, isLit(heart))
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box>
          {paint(Text, look)}
          <Text dimColor>{count}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const c = await read($, settingsAtom)
    const page = await read($, pageAtom)
    const tick = await read($, tickAtom)
    paneTicker ??= $.clock.every(FRAME_MS[c.speed], () => void update($, tickAtom, () => ++paneTick))
    const els = $.ui.resolve(e)
    if (!('Input' in els)) return <els.Text>Open cachebeat's settings in the terminal.</els.Text>
    return settingsPane(els, c, page, tick, {
      set: patch => void setSettings($, patch),
      page: p => void update($, pageAtom, () => p),
      beatNow: () => void beatNow($).then(text => $.ui.toast(text)),
      reset: () => void setSettings($, DEFAULTS),
      close: () => void $.ui.close({ id: PANE }),
    })
  })

  on('ui.close', { id: PANE }, ($, e, next) => {
    paneTicker?.cancel()
    paneTicker = undefined
    return next(e)
  })
}
