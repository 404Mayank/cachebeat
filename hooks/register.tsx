import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Alert, BeatSettings, PanePage, Pulse, Saved, Ttl } from '../types'
import { cells, loopIndex, slotText, slotWidths, statusFrame, variant } from './animations'
import { PANE, paint, settingsPane, statusText } from './pane'
import { AUTO, DEFAULTS, TABS, changed, frameMs, glyphs, isLit, lookOf, normalize, rowOf, spans, tokens } from './settings'
import type { Span, Value } from './settings'
import { SET, STATE, parseSet, summary } from './tools'

const MIN = 60_000
export const IDLE = AUTO['1h'] * MIN // the default silence before a beat on a subscription's one-hour cache
export const DEADLINE = DEFAULTS.stopAfterHours * 60 * MIN // default stop this long after the last real turn
export const RETRY = MIN // after a transient API error
export const MAX_TTL = 60 * MIN // past this since the last cache read, the cache is gone whatever the TTL

const pulse = atom({ plugin: 'cachebeat', key: 'pulse' } as const, 'hidden' as Pulse)
const saved = atom({ plugin: 'cachebeat', key: 'saved' } as const, null as Saved | null)
const frameAtom = atom({ plugin: 'cachebeat', key: 'frame' } as const, 0)
const lineFrameAtom = atom({ plugin: 'cachebeat', key: 'lineFrame' } as const, 0)
const lineAtom = atom({ plugin: 'cachebeat', key: 'line' } as const, '')
const settingsAtom = atom({ plugin: 'cachebeat', key: 'settings' } as const, DEFAULTS)
const tickAtom = atom({ plugin: 'cachebeat', key: 'tick' } as const, 0)
const pageAtom = atom({ plugin: 'cachebeat', key: 'page' } as const, { tab: 'beating', picker: null } as PanePage)
const focusAtom = atom({ plugin: 'cachebeat', key: 'focus' } as const, '')

const fresh: Saved = {
  enabled: false, idle: null, lastReal: null, lastWarm: null, lastRead: null, nextAt: null, beats: 0, row: null, small: null,
  isCacheShort: false, paused: null, warmModel: null,
}
let s: Saved = { ...fresh }
let cfg: BeatSettings = DEFAULTS
let timer: { cancel: () => void } | undefined
let ticker: { cancel: () => void } | undefined // the prompt heart's animation clock
let lineTicker: { cancel: () => void } | undefined // the turn line's, at its own speed
let paneTicker: { cancel: () => void } | undefined
let paneTick = 0
let ring: string[] = [] // the pane's focusable keys as last drawn, in order
let notice = '' // the pane's footer line
let isResetArmed = false
let frame = 0
let lineFrame = 0
let blast = -1 // the blast frame showing after a beat, or -1
let busy = false // a main-thread turn is running
let beating = false
let rowPending = false // the turn just ended: its closing row is the next new one drawn
let isStatusOnBand = false // the desktop draws no closing row: the band above the prompt carries the countdown
let paneSurface = 'terminal' // where the settings pane last drew: the terminal's keys are walked here, a desktop's its own
let ttl: Ttl = '1h' // the main conversation's cache lifetime, as last read
let scheduling = 0 // counts schedule() calls: one still awaiting when a newer starts leaves the timer to it
const rowsSeen = new Set<string>()

export const fmt = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / MIN))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

/** This session's interval: its own, else the setting's, `auto` read off the cache's lifetime. */
const idle = () => s.idle ?? (cfg.interval === 'auto' ? AUTO[s.isCacheShort ? '5m' : ttl] : cfg.interval) * MIN

const isSet = (v: string | undefined) => v !== undefined && /^(1|true|yes|on)$/i.test(v)

/**
 * The main conversation's cache lifetime, as Claude Code picks it: the first of the variables and the
 * setting that choose one, else an hour on a subscription within its plan's usage and five minutes on
 * usage credits, an API key or a cloud provider (code.claude.com/docs/en/prompt-caching).
 */
async function cacheTtl($: EngineInterface): Promise<Ttl> {
  if (isSet(await $.env.get('FORCE_PROMPT_CACHING_5M'))) return '5m'
  const chosen = (v: unknown) => (v === '5m' || v === '1h' ? v : undefined)
  const fromEnv = chosen(await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'))
  if (fromEnv) return fromEnv
  const merged = await $.settings.read()
  const fromSettings = chosen(merged.promptCacheTtl)
  if (fromSettings) return fromSettings
  if (isSet(await $.env.get('ENABLE_PROMPT_CACHING_1H'))) return '1h'
  // rate-limit windows are reported on a subscription alone; one used up means usage credits are paying
  const { rateLimits } = await $.session.usage()
  return rateLimits.length > 0 && rateLimits.every(l => l.percentUsed < 100) ? '1h' : '5m'
}

function save($: EngineInterface) {
  const copy = { ...s }
  void update($, saved, () => copy)
}

/**
 * The custom value each setting last took, in its own store key: a preset or a reset leaves it in the
 * setting's list, one Enter from coming back.
 */
let customs: Partial<Record<keyof BeatSettings, Value>> = {}

async function keepCustoms($: EngineInterface, patch: Partial<BeatSettings>) {
  const kept = Object.entries(patch).filter(([k, v]) => {
    const row = rowOf(k as keyof BeatSettings)?.row
    return row?.custom && !row.values.includes(v as Value)
  })
  if (!kept.length) return
  const stored = await $.store.get('customs')
  customs = { ...(stored as typeof customs | undefined), ...Object.fromEntries(kept) }
  await $.store.set('customs', customs)
}

async function setSettings($: EngineInterface, patch: Partial<BeatSettings>) {
  await keepCustoms($, patch)
  // from the store, not this session's copy: another session may have changed it since
  cfg = { ...normalize(await $.store.get('settings')), ...patch }
  const copy = { ...cfg }
  await $.store.set('settings', changed(copy))
  await update($, settingsAtom, () => copy)
  restartClocks($)
  if (s.enabled && !busy && !beating) await schedule($)
  else await refreshLine($)
}

/**
 * Picks up settings another session changed since this one last looked, and publishes them where
 * the drawings read them, which a /clear empties.
 */
async function syncSettings($: EngineInterface) {
  const now = normalize(await $.store.get('settings'))
  const same = (x: unknown) => JSON.stringify(x) === JSON.stringify(now)
  if (same(cfg) && same(await read($, settingsAtom))) return
  cfg = now
  await update($, settingsAtom, () => now)
  restartClocks($)
}

/** The animation clocks restart at the settings' speed, or stay stopped, as the next drawing finds them. */
function restartClocks($: EngineInterface) {
  stopClocks()
  stopPaneTicker()
  void update($, frameAtom, f => f + 1)
  void update($, lineFrameAtom, f => f + 1)
  void update($, tickAtom, t => t + 1)
}

/** The status line under the latest turn's closing row, or '' while there is nothing to say. */
async function refreshLine($: EngineInterface) {
  let text = ''
  if (s.enabled && s.small) text = `♡ beats skip · ${s.small}`
  else if (s.enabled && s.paused) text = s.beats > 0 ? `${statusText(cfg, s.beats, s.lastRead, null)} · waits for your next turn` : '♡ beats wait for your next turn'
  else if (s.enabled || s.beats > 0) {
    let next: string | null = null
    const at = s.nextAt
    if (s.enabled && at !== null) {
      const now = await $.clock.now()
      next = fmt(at - now)
    }
    text = statusText(cfg, s.beats, s.lastRead, next)
  }
  if (text !== (await read($, lineAtom))) await update($, lineAtom, () => text)
}

/** The prompt heart's animation clock: runs while the hint row draws the heart beating. */
function animate($: EngineInterface) {
  if (ticker) return
  const ms = frameMs(lookOf(cfg, 'heart'))
  const perSecond = Math.round(1000 / ms)
  ticker = $.clock.every(ms, () => {
    frame++
    if (blast >= 0 && ++blast >= variant(cfg.variant).blast.length) blast = -1
    void update($, frameAtom, () => frame)
    if (frame % perSecond === 0) void refreshLine($) // the countdown, about once a second
  })
}

/** The turn line's animation clock, at the line's own speed: runs while the line is drawn moving. */
function animateLine($: EngineInterface) {
  if (lineTicker) return
  const ms = frameMs(lookOf(cfg, 'line'))
  const perSecond = Math.round(1000 / ms)
  lineTicker = $.clock.every(ms, () => {
    lineFrame++
    void update($, lineFrameAtom, () => lineFrame)
    if (lineFrame % perSecond === 0) void refreshLine($)
  })
}

function stopClocks() {
  ticker?.cancel()
  ticker = undefined
  lineTicker?.cancel()
  lineTicker = undefined
}

/** The heart as drawn now: the blast after a beat, the loop while armed, else the loop's first frame. */
function heartFrame(c: BeatSettings, p: Pulse, f: number) {
  const x = variant(c.variant)
  if (!c.heartAnimate) return x.loop[0]!
  if (blast >= 0) return x.blast[blast]!
  return p === 'armed' ? x.loop[loopIndex(x, f, c.heartTiming)]! : x.loop[0]!
}

/**
 * The status line as drawn, in its effect, its leading heart playing the status line's own animation:
 * the heart's spans, then the rest's, and the cells the heart takes at its widest.
 */
function liveLine(line: string, c: BeatSettings, p: Pulse, f: number): { head: Span[]; rest: Span[]; width: number } {
  const look = lookOf(c, 'line')
  const isPlaying = look.animate && p === 'armed' && c.statusHeart !== 'off'
  const lead = /^[♥♡]/.test(line) ? line[0]! : ''
  const heart = lead && isPlaying ? statusFrame(c.statusHeart, f, look.timing) : lead
  // a flash lights the line as its heart fills, or as one would beat, the heart still or none
  const lit = isLit(isPlaying ? heart : statusFrame('beat', f, look.timing))
  const all = spans(heart + line.slice(lead.length), look.animate && look.effect !== 'steady' ? look : { ...look, effect: 'steady' }, f, lit)
  // the spans split where the heart ends, so it can sit in a box of its own
  const head: Span[] = []
  const rest: Span[] = []
  let left = heart.length
  for (const sp of all) {
    const take = Math.min(left, sp.text.length)
    if (take > 0) head.push({ ...sp, text: sp.text.slice(0, take) })
    if (take < sp.text.length) rest.push({ ...sp, text: sp.text.slice(take) })
    left -= take
  }
  return { head, rest, width: cells(heart) }
}

/** Spans in a row joined where they look alike, so a line draws as few runs of text as it can. */
const joined = (list: Span[]) => list.reduce<Span[]>((out, sp) => {
  const last = out.at(-1)
  if (last && last.color === sp.color && last.dim === sp.dim) last.text += sp.text
  else out.push({ ...sp })
  return out
}, [])

function setPulse($: EngineInterface, p: Pulse) {
  if (p !== 'armed') {
    stopClocks()
    blast = -1
  }
  void update($, pulse, () => p)
}

/** With Skip small contexts on, why this context is under the minimum; null when it is not. */
async function smallContext($: EngineInterface) {
  if (!cfg.skipSmall) return null
  const size = await chatSize($)
  if (size === undefined || size >= cfg.skipSmallTokens) return null
  return `this chat is ${tokens(size)} tokens, under your ${tokens(cfg.skipSmallTokens)} minimum`
}

/**
 * What a beat would read: the last response's whole prompt and its reply, which the next request
 * carries too. The window's own figure counts the prompt alone, short by a long last answer.
 */
async function chatSize($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' }) // estimated here, no request sent
  const u = context.breakdown?.apiUsage
  if (!u) return context.tokens
  return u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
}

/** Notes whether this chat is under the minimum, saying so in the log as it goes under. */
async function checkSmall($: EngineInterface) {
  const small = await smallContext($)
  if (small && !s.small) $.ui.log(`beats will skip: ${small}`)
  s.small = small
  return small !== null
}

/** Sets the next beat from the last cache read; resolves its delay, or undefined when none is set. */
async function schedule($: EngineInterface): Promise<number | undefined> {
  const call = ++scheduling
  timer?.cancel()
  timer = undefined
  s.nextAt = null
  let ms: number | undefined
  let p: Pulse = 'armed'
  if (!s.enabled) s.small = null
  if (!s.enabled || busy) p = 'hidden' // a turn keeps the last word on the context; its end checks again
  else if (await checkSmall($)) p = 'waiting' // nothing to beat for until a turn grows it
  else {
    const now = await $.clock.now()
    const since = s.lastWarm === null ? Infinity : now - s.lastWarm
    if (since >= MAX_TTL || s.paused) p = 'waiting' // nothing warm to keep, or none of use: the next turn starts it
    else {
      if (cfg.interval === 'auto' && s.idle === null) ttl = await cacheTtl($) // usage can cross into credits
      if (call !== scheduling) return undefined
      ms = Math.max(0, idle() - since)
      s.nextAt = now + ms
      timer = $.clock.after(ms, () => void scheduledBeat($))
    }
  }
  // a newer call, begun while this one awaited, sets the timer and the heart: two would each arm one
  if (call !== scheduling) return undefined
  setPulse($, p)
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

/** Beats wait for the next turn, which will cache what a beat would have to write: says why, once. */
async function pause($: EngineInterface, why: string, said: string) {
  if (s.enabled && s.paused !== why) $.ui.log(`beats wait for your next turn: ${said}`)
  s.paused = why
  await schedule($)
}

const MODEL_CHANGED = 'the model changed'
const SETTLE = 1000 // ms: a /model switch is applied once the hooks on it have settled

/** Beats paused for a model switch go on once the model is back to the one the cache was warmed on. */
async function resumeIfWarmed($: EngineInterface) {
  if (s.paused !== MODEL_CHANGED || busy) return
  const model = await $.session.model()
  if (model !== s.warmModel) return
  s.paused = null
  if (s.enabled) $.ui.log('beats go on: back on the model the cache was warmed on')
  await schedule($)
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
  const { rateLimits } = await $.session.usage()
  const full = rateLimits.find(l => l.percentUsed >= cfg.stopAtUsage)
  if (full) {
    const kind = full.kind.replace('_', '-')
    return stop($, cfg.stopAtUsage >= 100 ? `${kind} usage limit reached` : `${kind} usage at ${full.percentUsed}%, past ${cfg.stopAtUsage}%`)
  }
  if (await smallContext($)) {
    await schedule($) // says so, and waits for a turn to grow it
    return `beats skip: ${s.small}`
  }
  // a beat goes to the current model, whose cache is not the one warmed if the model changed since
  const model = await $.session.model()
  const isNewModel = s.warmModel !== null && model !== s.warmModel
  if (isNewModel && cfg.onModelSwitch === 'wait') {
    await pause($, MODEL_CHANGED, 'the new model has no cache yet')
    return `beats wait for your next turn: ${MODEL_CHANGED}`
  }

  beating = true
  const forking = $.model.fork({ prompt: 'Reply with a single period.' })
  const r = await forking.finally(() => (beating = false))
  if (!r.isAnswered && r.reason !== 'empty-reply') {
    if (r.reason === 'nothing-to-fork') return stop($, 'nothing to keep warm')
    const isTransient = r.reason === 'aborted' || r.error === 'overloaded' || r.error === 'server_error' || r.status === null
    if (!isTransient) return stop($, r.error === 'rate_limit' ? 'rate limited' : `API error (${r.error})`)
    if (!busy && s.enabled) timer = $.clock.after(RETRY, () => void scheduledBeat($))
    return `${'error' in r ? r.error : r.reason}; ${s.enabled ? 'retrying in a minute' : 'not retried while off'}`
  }
  const { cache_read_input_tokens: got, cache_creation_input_tokens: wrote } = r.usage
  if (isNewModel) {
    // the first beat on a new model writes its cache, as the next turn would have: kept warm from here
    s.warmModel = model
    s.lastWarm = await $.clock.now()
    const warmed = `♥ warmed the new model's cache (${wrote.toLocaleString()} written)`
    $.ui.log(warmed)
    await schedule($)
    return warmed
  }
  if (got < wrote) {
    const why = `the cache was not served (${got.toLocaleString()} read, ${wrote.toLocaleString()} written)`
    // under auto, a cache gone before an hour's interval lives five minutes, whatever the signs said:
    // this beat wrote it afresh, so beat at that from here
    if (cfg.interval !== 'auto' || s.idle !== null || s.isCacheShort || ttl === '5m') return stop($, why)
    s.isCacheShort = true
    s.lastWarm = await $.clock.now()
    announce($, `${why}: this session's cache lasts 5 minutes, so beats come every ${AUTO['5m']}m`)
    await schedule($)
    return `${why}; beating every ${AUTO['5m']}m`
  }
  s.lastWarm = await $.clock.now()
  s.lastRead = got
  s.beats++
  if (cfg.heartAnimate) blast = 0
  const renewed = `♥ cache renewed (${got.toLocaleString()} read, ${wrote.toLocaleString()} written)`
  if (logs(cfg.onBeat) || (s.row === null && !isStatusOnBand)) $.ui.log(renewed) // else no line at all says it
  if (toasts(cfg.onBeat)) $.ui.toast(`♥ cache kept warm · ${tokens(got)} read`)
  await schedule($)
  return renewed
}

/** A beat its timer brought: none once beating was turned off, whatever timer was still set. */
function scheduledBeat($: EngineInterface) {
  return s.enabled ? beat($) : Promise.resolve('off')
}

/** A beat asked for by hand: never one that would switch cachebeat off for having nothing to fork. */
function beatNow($: EngineInterface) {
  return s.lastReal === null ? Promise.resolve('nothing to keep warm until this session has a turn') : beat($)
}

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
    let ms: number | undefined
    const at = s.nextAt
    if (at !== null) {
      const now = await $.clock.now()
      ms = Math.max(0, at - now)
    }
    return { text: `already on, ${every()} · ${when(ms)}` }
  }
  const ms = await schedule($)
  if (wasOn) return { text: `interval ${fmt(before)} → ${fmt(idle())} · ${when(ms)}` }
  return { text: `on, ${every()} · ${when(ms)}` }
}

/** What the tools answer: this session's beating, and the settings every session shares. */
async function stateOf($: EngineInterface) {
  await syncSettings($)
  ttl = await cacheTtl($) // usage can cross into credits between turns
  const now = await $.clock.now()
  const nextBeat = !s.enabled || s.small ? null
    : s.nextAt !== null ? `in ${fmt(s.nextAt - now)}`
    : busy ? `${fmt(idle())} after this turn ends`
    : 'after the next turn'
  const session = {
    enabled: s.enabled, intervalMinutes: idle() / MIN, intervalFrom: s.idle !== null ? 'session' : cfg.interval === 'auto' ? 'auto' : 'default',
    cacheTtl: s.isCacheShort ? '5m' : ttl,
    beats: s.beats, lastBeatReadTokens: s.lastRead, nextBeat, skipping: s.small, paused: s.paused,
  }
  const defaults = Object.fromEntries(Object.keys(changed(cfg)).map(k => [k, DEFAULTS[k as keyof BeatSettings]]))
  return { session, settings: cfg, defaults }
}

type Before = { enabled: boolean; idle: number | null; settings: BeatSettings }

/**
 * `set`'s answer: the fields the call changed (this session's own switch and interval, not what follows
 * from the settings; its own patch, not what another session saved meanwhile), this session's state,
 * and the settings it changed.
 */
async function answerSet($: EngineInterface, before: Before, patch: Partial<BeatSettings>) {
  const settings = Object.entries(patch).filter(([k, v]) => before.settings[k as keyof BeatSettings] !== v)
  const changed = [
    ...(before.enabled !== s.enabled ? ['session.enabled'] : []),
    ...(before.idle !== s.idle ? ['session.intervalMinutes'] : []),
    ...settings.map(([k]) => `settings.${k}`),
  ]
  return { changed, session: (await stateOf($)).session, settings: Object.fromEntries(settings) }
}

const json = (x: unknown) => JSON.stringify(x, null, 2)

const PANE_OPEN = { id: PANE, title: 'cachebeat', focus: true, closeOnEscape: true, holdToasts: true, rows: 24 } as const

async function openSettings($: EngineInterface) {
  await syncSettings($)
  const stored = await $.store.get('customs')
  customs = (stored as typeof customs | undefined) ?? {}
  ttl = await cacheTtl($)
  notice = ''
  isResetArmed = false
  await update($, pageAtom, () => ({ tab: 'beating', picker: null }))
  await $.ui.open(PANE_OPEN)
  await focusOn($, 'tab:beating', true)
}

/**
 * Moves the pane's focus; a move this plugin makes skips its own ui.focus hook, so it notes it here.
 * A desktop's Tab and clicks move its own focus, and a move made for it after a press lands where the
 * person didn't look: there it moves only to land somewhere new, the pane or a list of choices opening.
 */
async function focusOn($: EngineInterface, key: string, isLanding = false) {
  if (paneSurface !== 'terminal' && !isLanding) return
  // a focus that cannot move leaves the page as it is (`claude plugin test` has no focus to move)
  let deny: string | undefined
  try {
    const moved = await $.ui.focus({ requestId: PANE, key })
    deny = moved.deny
  } catch (err) {
    deny = String(err)
  }
  if (deny) {
    $.ui.log(`focus ${key}: ${deny}`, { to: 'debug' })
    return
  }
  await update($, focusAtom, () => key)
  let stuck: string | undefined
  try {
    const scrolled = await $.ui.scroll({ to: { key }, in: PANE })
    stuck = scrolled.deny
  } catch (err) {
    stuck = String(err)
  }
  if (stuck) $.ui.log(`scroll to ${key}: ${stuck}`, { to: 'debug' })
}

function stopPaneTicker() {
  paneTicker?.cancel()
  paneTicker = undefined
}

/** Shows a page of the pane and puts the focus on `key` there; `isLanding` as `focusOn` takes it. */
async function goTo($: EngineInterface, page: PanePage, key: string, isLanding = false) {
  isResetArmed = false
  notice = '' // the last outcome was about where the person was, not where they go
  await update($, pageAtom, () => page)
  await focusOn($, key, isLanding)
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
    isStatusOnBand = false // until the band is drawn on a desktop
    paneSurface = 'terminal' // until the pane draws, on whichever surface
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
    await $.tool.register(STATE)
    await $.tool.register(SET)
    return next(e)
  })

  // a /clear goes on under a new session, with no session.start and its state empty: a new
  // conversation, so it starts its count afresh, keeping whether this session beats and how often
  on('session.end', { reason: 'clear' }, async ($, e, next) => {
    const r = await next(e)
    s = { ...fresh, enabled: s.enabled, idle: s.idle, isCacheShort: s.isCacheShort }
    await syncSettings($)
    await schedule($)
    return r
  })

  on('command.run', { command: 'cachebeat' }, async ($, e) => {
    ttl = await cacheTtl($) // what `auto` comes to, for the answer
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const minutes = words.find(w => /^\d+$/.test(w))
    if (words[0] === 'settings' || words[0] === 'config') {
      await openSettings($)
      return { text: 'settings opened' }
    }
    if (words[0] === 'now') return { text: await beatNow($) }
    if (words[0] === 'global') {
      if (words[1] !== 'on' && words[1] !== 'off') return { text: `new sessions start ${cfg.defaultOn ? 'on' : 'off'} · ${USAGE}` }
      await setSettings($, { defaultOn: words[1] === 'on' })
      let here = 'already off'
      if (words[1] === 'on') {
        const turned = await turnOn($, undefined)
        here = turned.text
      } else if (s.enabled) here = stop($)
      return { text: `new sessions start ${words[1]} · this session: ${here}` }
    }
    if (words[0] === 'off') {
      if (!s.enabled) return { text: 'already off' }
      return { text: stop($) }
    }
    if (words[0] === 'on' || minutes) return turnOn($, minutes === undefined ? undefined : Number(minutes))
    if (words.length) return { text: USAGE }
    if (!s.enabled) return { text: 'off' }
    let ms: number | undefined
    const at = s.nextAt
    if (at !== null) {
      const now = await $.clock.now()
      ms = Math.max(0, at - now)
    }
    return { text: `on, ${every()} · ${s.beats} beats · ${when(ms)}` }
  })

  on('tool.call', { tool: 'mcp__cachebeat__state' }, async $ => ({ result: json(await stateOf($)) }))

  on('tool.call', { tool: 'mcp__cachebeat__set' }, async ($, e) => {
    if (e.agentId) return { deny: 'Only the main conversation changes cachebeat.' }
    const change = parseSet({ session: e.session, settings: e.settings })
    if ('error' in change) return { deny: change.error }
    await syncSettings($)
    const before: Before = { enabled: s.enabled, idle: s.idle, settings: cfg }
    if (Object.keys(change.patch).length) await setSettings($, change.patch)
    if (change.intervalMinutes !== undefined) s.idle = change.intervalMinutes === null ? null : change.intervalMinutes * MIN
    if (change.enabled !== undefined) s.enabled = change.enabled
    // always: setSettings reschedules only while on, and this is what cancels a beat when turned off
    await schedule($)
    return { result: json(await answerSet($, before, change.patch)) }
  })

  // a call is one dim line in the transcript, and its answer, for the model alone, is not drawn
  on('ui.render', { component: 'ToolUse', props: { tool: 'mcp__cachebeat__state' } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>cachebeat: read the state</Text>
  })

  on('ui.render', { component: 'ToolUse', props: { tool: 'mcp__cachebeat__set' } }, async ($, e, next) => {
    const change = parseSet((e.props.input ?? {}) as { session?: unknown; settings?: unknown })
    if (e.props.isErrored || 'error' in change) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{`cachebeat: ${summary(change, await read($, settingsAtom))}`}</Text>
  })

  on('ui.render', { component: 'ToolResult', props: { tool: 'mcp__cachebeat__state' } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text>{''}</Text>
  })

  on('ui.render', { component: 'ToolResult', props: { tool: 'mcp__cachebeat__set' } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text>{''}</Text>
  })

  // each model has its own cache, and a beat goes to the current one: after a switch the old cache is
  // out of reach and the new model has none, so beats wait for the next turn, or the next writes it
  on('classic.PostModelSwitch', async ($, e, next) => {
    const r = await next(e)
    if (!busy && s.lastWarm !== null) {
      if (cfg.onModelSwitch === 'wait') {
        await pause($, MODEL_CHANGED, 'the new model has no cache yet')
        // the switch takes effect once this hook settles: a switch back finds the warmed model then
        $.clock.after(SETTLE, () => void resumeIfWarmed($))
      } else if (s.enabled) $.ui.log("the next beat writes the new model's cache")
    }
    return r
  })

  // a compaction replaces the conversation, so the prefix a beat would warm is gone; the next turn
  // caches the new one. One within a turn needs nothing: the turn's end starts the count from there
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    const isDone = e.agentId === undefined && e.trigger !== 'precompute' && r.skip === undefined
    if (isDone && !busy && s.lastWarm !== null) await pause($, 'compaction replaced the conversation', 'compaction replaced the conversation')
    return r
  })

  on('turn.start', async ($, e, next) => {
    if (!beating) {
      busy = true
      s.row = null // the line moves to this turn's row once it ends
      await schedule($)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && !beating) {
      busy = false
      rowPending = true
      s.lastReal = await $.clock.now()
      // a turn that sent no request (interrupted before one, refused by the API) warmed nothing
      if (e.usage) {
        s.lastWarm = s.lastReal
        s.warmModel = await $.session.model()
        s.paused = null
      }
      await syncSettings($)
      await schedule($)
    }
    return next(e)
  })

  // the status line, under the closing row of the latest turn ("✻ Cogitated for 2s"), counting down.
  // The engine hands that row over whole and full width, so nothing can sit beside it on its line
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!rowsSeen.has(e.requestId)) {
      rowsSeen.add(e.requestId)
      if (rowPending) {
        rowPending = false
        s.row = e.requestId // saved with the next beat: drawing never writes state
      }
    }
    const isLive = e.requestId === s.row
    const line = isLive ? await read($, lineAtom) : '' // one line, under the latest turn alone
    const c = await read($, settingsAtom)
    if (!line || c.statusLine === 'off') return next(e)
    const moving = c.lineAnimate && (c.lineEffect !== 'steady' || c.statusHeart !== 'off')
    const f = moving ? await read($, lineFrameAtom) : 0
    const p = moving ? await read($, pulse) : 'hidden'
    if (isLive && p === 'armed') animateLine($)
    const { Box, Text } = $.ui.resolve(e)
    const { head, rest } = liveLine(line, c, p, f)
    const painted = paint(Text, joined([...head, ...rest])) // monospace: the heart needs no box
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box marginTop={c.statusLine === 'spaced' ? 1 : 0}>{painted}</Box>
      </Box>
    )
  })

  // the heart and beat count. The hint row ("⏸ manual mode on · ...") takes added text only as its dim
  // tail, so the heart rides it dim, or gets its own line under that row to take color. The desktop
  // draws nothing added to the hint row: there the band above the prompt carries it
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const p = await read($, pulse)
    if (e.surface === 'desktop' || e.props.isWorking || p === 'hidden') return next(e)
    const c = await read($, settingsAtom)
    if (p === 'armed' && c.heartAnimate) animate($)
    const f = await read($, frameAtom)
    const heart = heartFrame(c, p, f)
    // a space past the frame's own blank edge: the heart sits as far from the count as from the ' · ' before it
    const count = c.showCount ? ` ×${s.beats}` : ''
    if (c.heartPlacement === 'tail') return next({ ...e, props: { ...e.props, tail: `${heart}${count}` } })
    const { Box, Text } = $.ui.resolve(e)
    const look = p === 'waiting' ? [{ text: heart, dim: true }] : spans(heart, lookOf(c, 'heart'), f, isLit(heart))
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

  // the desktop has neither the hint row's tail nor the closing row: there the status line stays above
  // the prompt, as it reads under the latest turn on the terminal
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const c = await read($, settingsAtom)
    isStatusOnBand = c.statusLine !== 'off'
    const line = await read($, lineAtom)
    if (!isStatusOnBand || !line || e.props.hasSurvey || e.props.isWorking) return next(e)
    const p = await read($, pulse)
    if (p === 'armed' && c.lineAnimate) animateLine($)
    const f = c.lineAnimate ? await read($, lineFrameAtom) : 0
    const { Box, Text } = $.ui.resolve(e)
    // the band's font is proportional: the heart's frames differ in width, so it gets a box of its own
    // and the words after it never move
    const { head, rest, width } = liveLine(line, c, p, f)
    // one glyph keeps its width as it beats: the line is one run of text, spaced as written
    if (width <= 1) return <Box>{paint(Text, joined([...head, ...rest]))}</Box>
    // a wider animation, on this proportional font, would change width from frame to frame and carry
    // the words after it along: each of its characters gets a cell of its own, centered in it, as the
    // terminal's grid has them, so it is as wide as its frames' cells. A cell's margin, not the space,
    // keeps the words off it: that space would collapse at the next box's start, as in HTML
    if (rest[0]) rest[0] = { ...rest[0], text: rest[0].text.replace(/^ /, '') }
    const slots = head.flatMap(sp => glyphs(sp.text).map(ch => ({ ...sp, text: ch })))
    const widths = slotWidths(variant(c.statusHeart)) // a heart's slot is wider, wherever any frame has one
    return (
      <Box flexDirection="row">
        <Box flexDirection="row" flexShrink={0} marginLeft={1} marginRight={1}>
          {slots.map((sp, i) => (
            <Box width={widths[i] ?? 1} flexShrink={0} justifyContent="center">
              {paint(Text, [{ ...sp, text: slotText(sp.text, widths[i] ?? 1) }])}
            </Box>
          ))}
        </Box>
        {paint(Text, rest)}
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
    // at the speed of the part on show: the turn line's on its tab, the heart's elsewhere
    const part = (picked?.tab.id ?? page.tab) === 'status' ? 'line' : 'heart'
    if (!isMoving) stopPaneTicker()
    else if (!paneTicker) paneTicker = $.clock.every(frameMs(lookOf(c, part)), () => void update($, tickAtom, () => ++paneTick))
    const els = $.ui.resolve(e)
    paneSurface = e.surface
    if (!('Input' in els)) return <els.Text>Open cachebeat's settings in the terminal.</els.Text>
    const view = {
      page, tick, focus, columns: e.props.bodyColumns, isOn: s.enabled, sessionMinutes: s.idle === null ? null : s.idle / MIN,
      autoMinutes: AUTO[s.isCacheShort ? '5m' : ttl], notice, isResetArmed, isTerminal: e.surface === 'terminal', customs,
    }
    const { tree, ring: walk } = settingsPane(els, c, view, {
      set: patch => void setSettings($, patch),
      // a press on a tab (Enter, 1-5, a click) shows it and goes into its settings
      tab: id => void goTo($, { tab: id, picker: null }, firstOf(id, c)),
      at: key => void focusOn($, key),
      open: key => {
        // the focus starts on the value set: one of the choices, or the custom field
        const { row } = rowOf(key)!
        const i = row.values.indexOf(c[key])
        void goTo($, { ...page, picker: key }, i >= 0 ? `opt:${i}` : row.custom ? 'custom' : 'opt:0', true)
      },
      pick: (key, value) => void setSettings($, { [key]: value }).then(() => (say($, ''), goTo($, { ...page, picker: null }, `row:${key}`))),
      refuse: text => say($, text),
      resetRow: key => void setSettings($, { [key]: DEFAULTS[key] }).then(() => say($, `${rowOf(key)!.row.label.trim()} back to its default`)),
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
    // a desktop moves its own focus (Tab, a click): the pane notes where, and a tab opens when pressed
    if (paneSurface !== 'terminal') {
      const r = await next(e)
      if (!r.deny) await update($, focusAtom, () => e.element ?? '')
      return r
    }
    // the tab bar and a tab's settings are two levels: the arrows never cross between them
    let to = e.element
    if (e.origin.kind === 'person' && to) {
      const from = await read($, focusAtom)
      const isToTab = to.startsWith('tab:')
      // with nothing focused yet, the first move goes anywhere
      if (from && from.startsWith('tab:') !== isToTab) {
        // off either end of the tab bar, round to the other end; between the levels, Enter and Esc
        const at = TABS.findIndex(t => `tab:${t.id}` === from)
        const end = !isToTab && at === TABS.length - 1 ? TABS[0] : !isToTab && at === 0 ? TABS.at(-1) : undefined
        if (!end) return { deny: 'Enter goes into a tab, Esc back out' }
        to = `tab:${end.id}`
      }
      const tab = to.startsWith('tab:') ? to.slice(4) : undefined
      if (tab) await update($, pageAtom, () => ({ tab, picker: null })) // the page follows the tabs
    }
    const r = await next(to === e.element ? e : { ...e, element: to })
    if (!r.deny) await update($, focusAtom, () => to ?? '')
    return r
  })

  // the arrows walk the focus ring, and the window follows it; the wheel and page keys scroll
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (paneSurface !== 'terminal' || e.origin.kind !== 'person' || e.pointer || Math.abs(e.by) !== 1) return next(e)
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
    // Esc steps back a level: a picker to its row, a tab's settings to the tab bar; the tab bar closes.
    // A desktop has no levels to its focus: there Esc leaves a picker, and otherwise closes
    const focus = await read($, focusAtom)
    const isInTab = paneSurface === 'terminal' && !focus.startsWith('tab:')
    if (e.origin.kind === 'person' && (page.picker || isInTab)) {
      // Esc has handed the keys back to the prompt: open asks for them again
      await $.ui.open(PANE_OPEN)
      await goTo($, { ...page, picker: null }, page.picker ? `row:${page.picker}` : `tab:${page.tab}`, true)
      return { value: undefined }
    }
    stopPaneTicker()
    return next(e)
  })
}
