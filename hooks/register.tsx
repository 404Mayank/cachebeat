import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Alert, BeatSettings, PanePage, Pulse, Saved } from '../types'
import { loopIndex, variant } from './animations'
import { PANE, paint, settingsPane, statusText } from './pane'
import { DEFAULTS, TABS, changed, frameMs, isLit, normalize, rowOf, spans, tokens } from './settings'

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
const pageAtom = atom({ plugin: 'cachebeat', key: 'page' } as const, { tab: 'beating', picker: null } as PanePage)
const focusAtom = atom({ plugin: 'cachebeat', key: 'focus' } as const, '')

const fresh: Saved = {
  enabled: false, idle: null, lastReal: null, lastWarm: null, lastRead: null, nextAt: null, beats: 0, stretch: 0, row: null, small: null, rowsDone: {},
}
let s: Saved = { ...fresh }
let cfg: BeatSettings = DEFAULTS
let timer: { cancel: () => void } | undefined
let ticker: { cancel: () => void } | undefined
let paneTicker: { cancel: () => void } | undefined
let paneTick = 0
let ring: string[] = [] // the pane's focusable keys as last drawn, in order
let notice = '' // the pane's footer line
let isResetArmed = false
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
  await $.store.set('settings', changed(copy))
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
  let text = s.small && s.enabled ? `♡ beats skip · ${s.small}` : ''
  if (s.stretch > 0) {
    const next = s.enabled && s.nextAt !== null ? fmt(s.nextAt - (await $.clock.now())) : null
    text = statusText(cfg, s.stretch, s.lastRead, next)
  }
  if (text !== (await read($, lineAtom))) await update($, lineAtom, () => text)
}

/** The animation clock: runs while the heart is drawn beating (the hint row draws it). */
function animate($: EngineInterface) {
  const ms = frameMs(cfg)
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
  return p === 'armed' ? x.loop[loopIndex(x, f, c.timing)]! : x.loop[0]!
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
/** With Skip small contexts on, why this context is under the minimum; null when it is not. */
async function smallContext($: EngineInterface) {
  if (!cfg.skipSmall) return null
  const { context } = await $.session.usage()
  if (context.tokens === undefined || context.tokens >= cfg.skipSmallTokens) return null
  return `this chat is ${tokens(context.tokens)} tokens, under your ${tokens(cfg.skipSmallTokens)} minimum`
}

/** Notes whether this chat is under the minimum, saying so in the log as it goes under. */
async function checkSmall($: EngineInterface) {
  const small = await smallContext($)
  if (small && !s.small) $.ui.log(`beats will skip: ${small}`)
  s.small = small
  return small !== null
}

async function schedule($: EngineInterface): Promise<number | undefined> {
  timer?.cancel()
  timer = undefined
  s.nextAt = null
  let ms: number | undefined
  if (!s.enabled) s.small = null
  if (!s.enabled || busy) setPulse($, 'hidden') // a turn keeps the last word on the context; its end checks again
  else if (await checkSmall($)) setPulse($, 'waiting') // nothing to beat for until a turn grows it
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

const logs = (how: Alert) => how === 'log' || how === 'both'
const toasts = (how: Alert) => how === 'toast' || how === 'both'

function announce($: EngineInterface, text: string) {
  if (logs(cfg.onStop)) $.ui.log(text)
  if (toasts(cfg.onStop)) $.ui.toast(`cachebeat ${text}`)
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
    await schedule($) // says so, and waits for a turn to grow it
    return `beats skip: ${s.small}`
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
  if (logs(cfg.onBeat) || s.row === null) $.ui.log(renewed) // with no closing row, no status line says it
  if (toasts(cfg.onBeat)) $.ui.toast(`♥ cache kept warm · ${tokens(got)} read`)
  await schedule($)
  return renewed
}

/** A beat asked for by hand: never one that would switch cachebeat off for having nothing to fork. */
const beatNow = ($: EngineInterface) => (s.lastReal === null ? Promise.resolve('nothing to keep warm until this session has a turn') : beat($))

const every = () => `every ${fmt(idle())} idle`
const when = (ms: number | undefined) =>
  s.small ? `beats skip: ${s.small}`
  : ms === undefined ? 'starts after your next turn' : ms === 0 ? 'beating now' : `next beat in ${fmt(ms)}`

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

const PANE_OPEN = { id: PANE, title: 'cachebeat', focus: true, closeOnEscape: true, holdToasts: true, rows: 24 } as const

async function openSettings($: EngineInterface) {
  await syncSettings($)
  notice = ''
  isResetArmed = false
  await update($, pageAtom, () => ({ tab: 'beating', picker: null }))
  await $.ui.open(PANE_OPEN)
  await focusOn($, 'tab:beating')
}

/** Moves the pane's focus; a move this plugin makes skips its own ui.focus hook, so it notes it here. */
async function focusOn($: EngineInterface, key: string) {
  // a focus that cannot move leaves the page as it is (`claude plugin test` has no focus to move)
  const { deny } = await $.ui.focus({ requestId: PANE, key }).catch((err: unknown) => ({ deny: String(err) }))
  if (deny) return $.ui.log(`focus ${key}: ${deny}`, { to: 'debug' })
  await update($, focusAtom, () => key)
  await $.ui.scroll({ to: { key }, in: PANE }).catch((err: unknown) => $.ui.log(`scroll to ${key}: ${err}`, { to: 'debug' }))
}

function stopPaneTicker() {
  paneTicker?.cancel()
  paneTicker = undefined
}

/** Shows a page of the pane and puts the focus on `key` there. */
async function goTo($: EngineInterface, page: PanePage, key: string) {
  isResetArmed = false
  await update($, pageAtom, () => page)
  await focusOn($, key)
}

/** The first element of a tab's settings, where going into it lands. */
const firstOf = (id: string, c: BeatSettings) =>
  id === 'beating' ? 'session' : `row:${TABS.find(t => t.id === id)!.rows.find(r => !r.show || r.show(c))!.key}`

/** Puts a line in the pane's footer. */
function say($: EngineInterface, text: string) {
  notice = text
  void update($, tickAtom, t => t + 1)
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
      const line = await read($, lineAtom)
      if (s.row !== null && line) {
        // the row keeps its final count, or why it was not kept warm
        s.rowsDone[s.row] = s.stretch > 0 ? statusText({ ...cfg, showCountdown: false }, s.stretch, s.lastRead, null) : line
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

  // the beat line, under the closing row of the last turn. The engine hands that row over whole
  // and full width, so nothing can sit beside it on its line ("✻ Cogitated for 2s"), counting down
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
    // a space past the frame's own blank edge: the heart sits as far from the count as from the ' · ' before it
    const count = c.showCount ? ` ×${s.beats}` : ''
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
    const focus = await read($, focusAtom)
    await read($, pulse) // redraws "This session" as it turns on or off
    // the preview's clock runs only while there is a preview to move
    const picked = page.picker ? rowOf(page.picker) : undefined
    const isMoving = picked ? picked.row.key === 'variant' || !!picked.tab.preview : !!TABS.find(t => t.id === page.tab)?.preview
    if (isMoving) paneTicker ??= $.clock.every(frameMs(c), () => void update($, tickAtom, () => ++paneTick))
    else stopPaneTicker()
    const els = $.ui.resolve(e)
    if (!('Input' in els)) return <els.Text>Open cachebeat's settings in the terminal.</els.Text>
    const view = { page, tick, focus, columns: e.props.bodyColumns, isOn: s.enabled, notice, isResetArmed }
    const { tree, ring: walk } = settingsPane(els, c, view, {
      set: patch => void setSettings($, patch),
      // a press on a tab (Enter, 1-5, a click) shows it and goes into its settings
      tab: id => void goTo($, { tab: id, picker: null }, firstOf(id, c)),
      at: key => void focusOn($, key),
      open: key => void goTo($, { ...page, picker: key }, `opt:${Math.max(0, rowOf(key)!.row.values.indexOf(c[key]))}`),
      pick: (key, value) => void setSettings($, { [key]: value }).then(() => goTo($, { ...page, picker: null }, `row:${key}`)),
      back: () => void goTo($, { ...page, picker: null }, `row:${page.picker}`),
      toggleSession: () => void (s.enabled ? Promise.resolve(stop($)) : turnOn($, undefined).then(r => r.text)).then(t => say($, `this session: ${t}`)),
      beatNow: () => void beatNow($).then(t => say($, t)),
      reset: () => {
        if (!isResetArmed) {
          isResetArmed = true
          return say($, '')
        }
        isResetArmed = false
        void setSettings($, DEFAULTS).then(() => say($, 'settings reset to the defaults'))
      },
    })
    ring = walk
    return tree
  })

  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    // the tab bar and a tab's settings are two levels: the arrows never cross between them
    if (e.origin.kind === 'person' && e.element) {
      const from = await read($, focusAtom)
      const isToTab = e.element.startsWith('tab:')
      // with nothing focused yet, the first move goes anywhere
      if (from && from.startsWith('tab:') !== isToTab) {
        // off either end of the tab bar, round to the other end; between the levels, Enter and Esc
        const at = TABS.findIndex(t => `tab:${t.id}` === from)
        const end = !isToTab && at === TABS.length - 1 ? TABS[0] : !isToTab && at === 0 ? TABS.at(-1) : undefined
        if (!end) return { deny: 'Enter goes into a tab, Esc back out' }
        e = { ...e, element: `tab:${end.id}` }
      }
      if (e.element!.startsWith('tab:')) await update($, pageAtom, () => ({ tab: e.element!.slice(4), picker: null })) // the page follows the tabs
    }
    const r = await next(e)
    if (!r.deny) await update($, focusAtom, () => e.element ?? '')
    return r
  })

  // the arrows walk the focus ring, and the window follows it; the wheel and page keys scroll
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person' || e.pointer || Math.abs(e.by) !== 1) return next(e)
    const focus = await read($, focusAtom)
    if (focus.startsWith('tab:')) {
      const t = TABS[(TABS.findIndex(x => `tab:${x.id}` === focus) + e.by + TABS.length) % TABS.length]!
      await goTo($, { tab: t.id, picker: null }, `tab:${t.id}`)
      return {}
    }
    const i = ring.indexOf(focus)
    const j = i < 0 ? (e.by > 0 ? 0 : ring.length - 1) : i + e.by
    if (j < 0 || j >= ring.length) return next(e) // past either end, the window scrolls on to its edge
    await focusOn($, ring[j]!)
    return {}
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const page = await read($, pageAtom)
    // Esc steps back a level: a picker to its row, a tab's settings to the tab bar; the tab bar closes
    const focus = await read($, focusAtom)
    if (e.origin.kind === 'person' && (page.picker || !focus.startsWith('tab:'))) {
      // Esc has handed the keys back to the prompt: open asks for them again
      await $.ui.open(PANE_OPEN)
      await goTo($, { ...page, picker: null }, page.picker ? `row:${page.picker}` : `tab:${page.tab}`)
      return { value: undefined }
    }
    stopPaneTicker()
    return next(e)
  })
}
