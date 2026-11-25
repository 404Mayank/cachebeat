import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'
import type { Alert, BeatSettings, Days, Folder, PanePage, Pulse, Saved, Ttl } from '../types'
import { TTL_MS, viewOf } from './cache'
import type { CacheFacts, CacheView } from './cache'
import { cells, loopIndex, slotText, slotWidths, statusFrame, variant } from './animations'
import { PANE, cut, paint, settingsPane, shown, statusText } from './pane'
import { AUTO, DEFAULTS, PAGES, READ_ONLY, TABS, changed, fmt, frameMs, glyphs, isLit, isObject, lookOf, minutesText, normalize, normalizeOwn, parseDuration, rowOf, spans, tabBeside, tokens } from './settings'
import type { Span, Value } from './settings'
import { ratiosOf } from './prices'
import { usageName } from './status'
import type { StatusFacts } from './status'
import { addTo, beatAdd, daysOf, factsFrom, keptAdd, statsText, sumOf } from './stats'
import type { StatsFacts } from './stats'
import { SET, STATE, label, parseOnly, parseSet, readSummary, summary } from './tools'
import type { Section, SetChange } from './tools'

const MIN = 60_000
export const IDLE = AUTO['1h'] * MIN // the default silence before a beat on a subscription's one-hour cache
export const DEADLINE = DEFAULTS.stopAfterHours * 60 * MIN // default stop this long after the last real turn
export const RETRY = MIN // after a transient API error
export const STEP = MIN // the longest one timer waits: the deadline is the wall clock's, checked at each step (a sleep costs one)
export const MAX_TTL = 60 * MIN // past this since the last cache read, the cache is gone whatever the TTL

const pulse = atom({ plugin: 'cachebeat', key: 'pulse' } as const, 'hidden' as Pulse)
const saved = atom({ plugin: 'cachebeat', key: 'saved' } as const, null as Saved | null)
const frameAtom = atom({ plugin: 'cachebeat', key: 'frame' } as const, 0)
const lineFrameAtom = atom({ plugin: 'cachebeat', key: 'lineFrame' } as const, 0)
const lineAtom = atom({ plugin: 'cachebeat', key: 'line' } as const, '')
const settingsAtom = atom({ plugin: 'cachebeat', key: 'settings' } as const, DEFAULTS)
const folderAtom = atom({ plugin: 'cachebeat', key: 'folder' } as const, { root: '', own: {} } as Folder)
const tickAtom = atom({ plugin: 'cachebeat', key: 'tick' } as const, 0)
const pageAtom = atom({ plugin: 'cachebeat', key: 'page' } as const, { tab: 'beating', picker: null } as PanePage)
const focusAtom = atom({ plugin: 'cachebeat', key: 'focus' } as const, '')

const fresh: Saved = {
  enabled: false, keepUntil: null, lastReal: null, lastWarm: null, lastRead: null, lastWrote: null, nextAt: null, beats: 0, row: null, small: null,
  isCacheShort: false, paused: null, warmModel: null, tail: null, asked: null, turns: 0, compactions: 0, lastCompactAt: null,
  guard: null, stats: {},
}
let s: Saved = { ...fresh }

/** A saved state as this version reads it: the keys it has, so one a past version saved (the per-session `idle`) is dropped. */
export const restored = (prev: Saved): Saved => ({ ...fresh, ...Object.fromEntries(Object.entries(prev).filter(([k]) => k in fresh)) })
let cfg: BeatSettings = DEFAULTS // as they apply here: this folder's own over those for all folders
let global: BeatSettings = DEFAULTS // the settings for all folders
let root = '' // this session's folder: where it started, or where /cd or a worktree move took it
let own: Partial<BeatSettings> = {} // the settings this folder has of its own
let editsFolder = false // the menu saves changes for this folder alone, not all folders
let timer: { cancel: () => void } | undefined
let ticker: { cancel: () => void } | undefined // the prompt heart's animation clock
let lineTicker: { cancel: () => void } | undefined // the turn line's, at its own speed
let paneTicker: { cancel: () => void } | undefined
let paneTick = 0
let paneEvery = 0 // the pane's ticker redraws at this many ms; 0 while none runs
let isPaneOpen = false // the pane is up: a render still reading its figures when it closes arms no ticker
let ring: string[] = [] // the pane's focusable keys as last drawn, in order
let notice = '' // the pane's footer line
let isResetArmed = false
let frame = 0
let lineFrame = 0
let blast = -1 // the blast frame showing after a beat, or -1
let busy = false // a main-thread turn is running
let turnId = '' // that turn's id: its end is told from a fork's by it
let stepping = false // a request of that turn is on its way, which keeps the cache warm itself
let isStoreFull = false // a write of the conversation's record was refused: said once in this session
let beatsSince = 0 // beats since the main conversation's last request: a turn coming back after them may have been kept warm by them
let isFirstStep = false // the running turn's first request has not yet answered
let others: { at: number; days: Days[] } | null = null // the other sessions' recorded days: read when the pane or `/cachebeat stats` opens, then every ten minutes
let isTurnWarmed = false // a request of that turn read the cache, and stamped when it was sent
let cached = 0 // tokens the main conversation's last request read from the cache or wrote to it
let resent = false // that turn's last request sent the conversation anew, caching it where a beat can't reach
let beating = false
let beatClaimed = false // a beat has entered and not yet been answered: the guard's claim, made before its first await
let isResumeUnsaid = false // a /resume paused beats, to be said once the resumed conversation is in place
let conv: string | null = null // the conversation this session's record is kept under; none while /clear or /resume hands over
let lastKept = '' // the record as last written or read, so a save writes only what changed
let keeping: Promise<unknown> = Promise.resolve() // record writes, one after another
let resumeHint: ResumeHint | null = null // Claude Code's figures for the resumed conversation, until they're applied
let isRestored = false // session.start put the resumed conversation's own state in place: a hint arriving later applies at once
let offNote: string | null = null // why a resumed conversation came back off when the one before was on, or its keep-alive time ran out
let convs = 0 // conversations this session has held: a beat answered after /clear or /resume was the one left behind's
let rowPending = false // the turn just ended: its closing row is the next new one drawn
let isStatusOnBand = false // the desktop draws no closing row: the band above the prompt carries the countdown
let paneSurface = 'terminal' // where the settings pane last drew: the terminal's keys are walked here, a desktop's its own
let ttl: Ttl = '1h' // the main conversation's cache lifetime, as last read
let scheduling = 0 // counts schedule() calls: one still awaiting when a newer starts leaves the timer to it
let isCovered = false // the keep-alive time is set and the cache outlives it, so schedule() armed no beat
const fullReads = new Set<string>() // the loops (`main`, or a subagent's id) whose copy of `state` is whole: a narrow read of any other is widened
const rowsSeen = new Set<string>()

export { fmt }

/** A time of day, with the weekday when it isn't `now`'s day: `4:30 PM`, `Thu 4:30 PM`. */
export const clockText = (at: number, now: number) => {
  const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (new Date(at).toDateString() === new Date(now).toDateString()) return time
  return `${new Date(at).toLocaleDateString([], { weekday: 'short' })} ${time}`
}

/** The keep-alive time left in words; past it, that it is up (a turn still running ends it at its own end). */
const keepLeft = (keepUntil: number, now: number) => (keepUntil > now ? `${fmt(keepUntil - now)} left` : busy ? "time's up · ends after this turn" : "time's up")

/** The time to the next beat in words, so a deadline that has passed reads the same everywhere. */
const untilNext = (ms: number) => (ms <= 0 ? 'due now' : `in ${fmt(ms)}`)

/** The interval between beats: the setting's, `auto` read off the cache's lifetime. */
const idle = () => (cfg.interval === 'auto' ? AUTO[s.isCacheShort ? '5m' : ttl] : cfg.interval) * MIN

/** The lifetime of this session's cache: five minutes once a beat found it so, else what Claude Code picked. */
const lifetime = (): Ttl => (s.isCacheShort ? '5m' : ttl)

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

async function save($: EngineInterface) {
  const copy = { ...s }
  void update($, saved, () => copy)
  await keepRecord($)
}

/**
 * A conversation's own on/off, keep-alive time and beat count, in the store by its id, for a resume to pick up, and
 * when its cache was last read: a beat moves that, and Claude Code's resume hint, counting from the last response, doesn't.
 */
type Kept = { v: 1; at: number; enabled: boolean; keepUntil: number | null; beats: number; warm?: number | null; guard?: boolean | null; stats?: unknown }

/** What Claude Code says about a resumed conversation as it comes back: the time since its last response. */
type ResumeHint = { id: string | undefined; secondsSince: number | undefined; at: number }

const DAY = 24 * 60 * MIN
const OTHERS_EVERY = 10 * MIN // how long the Stats page keeps what it read of the other sessions' records
const KEEP_DAYS = 30 // a record not written for this long is dropped
const keyOf = () => JSON.stringify([conv, s.enabled, s.keepUntil, s.beats, s.guard, s.stats])

/** The record stored under a key, if it is one this version reads. */
const keptOf = (x: unknown): Kept | null =>
  isObject(x) && x.v === 1 && typeof x.at === 'number' && typeof x.enabled === 'boolean' && typeof x.beats === 'number'
    && (x.keepUntil === null || typeof x.keepUntil === 'number') && (x.warm == null || typeof x.warm === 'number')
    && (x.guard == null || typeof x.guard === 'boolean') ? x as Kept : null

/** From here, this session's record is `id`'s; it is written at the next change, not now. */
function keepAs(id: string | null) {
  conv = id
  others = null // the other sessions' days exclude this conversation's own record
  lastKept = keyOf()
}

/** Writes this conversation's record when its on/off, keep-alive time or beat count changed since it was last written. */
async function keepRecord($: EngineInterface) {
  if (conv === null) return
  const kept = keyOf()
  if (kept === lastKept) return
  lastKept = kept
  const key = `session:${conv}`
  // a beat changes the count, so the record has the read it made; a turn's read is the resume hint's
  const record = { enabled: s.enabled, keepUntil: s.keepUntil, beats: s.beats, warm: s.lastWarm, guard: s.guard, stats: s.stats }
  // in order: two saves close together would otherwise race, and the earlier could land last
  const writing = keeping.then(async () => $.store.set(key, { v: 1, at: await $.clock.now(), ...record }))
  keeping = writing.catch(() => undefined)
  // a store that can't take the record (it is over its size limit) costs the record and Stats, and no more: beating goes on
  try {
    await writing
  } catch {
    if (!isStoreFull) $.ui.log("cachebeat: its store can't be written (it may be full), so records and Stats aren't kept")
    isStoreFull = true
  }
}

/** Drops the records of conversations not written for 30 days, at most once a day: each read goes through the store's whole file. */
async function pruneRecords($: EngineInterface) {
  const now = await $.clock.now()
  const last = await $.store.get('prunedAt')
  if (typeof last === 'number' && now - last < DAY) return
  await $.store.set('prunedAt', now)
  for (const key of await $.store.keys()) {
    if (!key.startsWith('session:')) continue
    const value = await $.store.get(key)
    if (!isObject(value) || typeof value.at !== 'number' || now - value.at > KEEP_DAYS * DAY) await $.store.delete(key)
  }
}

/**
 * A resumed conversation's own state, from the record of the session that last held it: on or off, the keep-alive
 * time (off once it has passed) and the beat count. With no record, it starts as New sessions start says. Beats wait
 * for the next message either way: nothing of it is cached in this process yet.
 */
async function restoreConversation($: EngineInterface, id: string | null) {
  const stored = id === null ? null : keptOf(await $.store.get(`session:${id}`))
  const now = await $.clock.now()
  const kept = stored && now - stored.at <= KEEP_DAYS * DAY ? stored : null // one not yet pruned is as good as gone
  const isOver = kept?.keepUntil != null && kept.keepUntil <= now
  const wasOn = s.enabled // the conversation left behind, on /resume
  s = {
    ...fresh, isCacheShort: s.isCacheShort, paused: RESUMED,
    ...(kept ? { enabled: kept.enabled && !isOver, keepUntil: isOver ? null : kept.keepUntil, beats: kept.beats, guard: kept.guard ?? null, stats: daysOf(kept.stats) } : { enabled: cfg.defaultOn }),
  }
  if (kept?.warm != null) warmFrom(kept.warm)
  offNote = kept?.enabled && isOver ? `beats are off: the keep-alive time ended at ${clockText(kept.keepUntil!, now)}`
    : !kept && wasOn && !s.enabled ? 'beats are off in this conversation' : null
  keepAs(id)
  if (id === null) return
  isRestored = true
  if (resumeHint) await takeHint($, resumeHint)
}

/**
 * Claude Code's hint on a resumed or forked conversation, once this session's state is in place. One naming another
 * conversation than the one kept is a hand-over, as /clear is: from here, changes go to that conversation's record.
 */
async function takeHint($: EngineInterface, hint: ResumeHint) {
  seedFromResume(hint)
  if (hint.id === undefined || hint.id === conv) return
  keepAs(hint.id)
  lastKept = ''
  await keepRecord($)
}

/**
 * The cache as Claude Code found it on resuming: last read when its last response came. Its first request's answer
 * then counts from when it was sent, as any request's does.
 */
function seedFromResume(hint: ResumeHint) {
  resumeHint = null
  if (hint.secondsSince !== undefined) warmFrom(hint.at - hint.secondsSince * 1000)
}

/** The resume line: when beats start, and whether the cache is likely still warm, as far as the resume hint said. */
async function sayResumed($: EngineInterface) {
  const note = offNote
  offNote = null
  if (!s.enabled) {
    if (note) tell($, note)
    return
  }
  ttl = await cacheTtl($)
  const view = viewOf(cacheFacts(null), await $.clock.now())
  const cache = view.state === 'warm' ? ` · cache likely warm for ${fmt(view.expiresAt! - view.at)} more`
    : view.state === 'cold' ? ` · cache cold for ${fmt(view.coldFor!)}` : ''
  tell($, `beats resume after your next message${cache}`)
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

/** Where a change is saved: the settings for all folders, or this folder's own. */
type Target = 'global' | 'folder'

/** The settings as they apply here: this folder's own over those for all folders. */
const merged = (): BeatSettings => ({ ...global, ...own })

/** This session's folder, the settings for all folders and the folder's own, from the store: another session may have changed them. */
async function load($: EngineInterface) {
  root = await $.session.root()
  const stored = await $.store.get('settings')
  global = normalize(stored)
  const folders = await $.store.get('folders')
  own = normalizeOwn(isObject(folders) ? folders[root] : undefined)
  cfg = merged()
}

/** Publishes the settings and the folder where the drawings read them, which a /clear empties. */
async function publish($: EngineInterface) {
  const copy = { ...cfg }
  await update($, settingsAtom, () => copy)
  const view = { root, own }
  await update($, folderAtom, () => view)
}

/** Saves this folder's own settings among every other folder's as the store has them; a folder with none goes. */
async function saveOwn($: EngineInterface) {
  const stored = await $.store.get('folders')
  const folders = isObject(stored) ? { ...stored } : {}
  if (Object.keys(own).length) folders[root] = own
  else delete folders[root]
  await $.store.set('folders', folders)
}

/** `settings` without `keys`: those follow all folders again. */
const without = (settings: Partial<BeatSettings>, keys: readonly string[]) =>
  Object.fromEntries(Object.entries(settings).filter(([k]) => !keys.includes(k))) as Partial<BeatSettings>

/** A change to the saved settings: some for all folders, and some of this folder's own set or dropped ('all', every one). */
type Change = { global?: Partial<BeatSettings>; own?: Partial<BeatSettings>; drop?: readonly string[] | 'all' }

/** Saves a change, read against the store as it is now (another session may have changed it), then draws and schedules by it. */
async function changeSettings($: EngineInterface, change: Change) {
  const set = { ...change.global, ...change.own }
  await keepCustoms($, set)
  await load($)
  if (change.global) {
    global = { ...global, ...change.global }
    await $.store.set('settings', changed(global))
  }
  if (change.own || change.drop) {
    own = change.drop === 'all' ? { ...change.own } : without({ ...own, ...change.own }, change.drop ?? [])
    await saveOwn($)
  }
  cfg = merged()
  await publish($)
  restartClocks($)
  await save($)
  if (s.enabled && !stepping && !beating) await schedule($)
  else await refreshLine($)
}

const setSettings = ($: EngineInterface, patch: Partial<BeatSettings>, to: Target) =>
  changeSettings($, to === 'folder' ? { own: patch } : { global: patch })

/**
 * Picks up settings another session changed since this one last looked, or the folder a /cd moved it
 * to, publishes them where the drawings read them, which a /clear empties, and moves the next beat
 * if its interval changed.
 */
async function syncSettings($: EngineInterface) {
  const before = JSON.stringify([global, root, own])
  const was = idle()
  await load($)
  const drawn = JSON.stringify([await read($, settingsAtom), await read($, folderAtom)])
  if (JSON.stringify([global, root, own]) === before && drawn === JSON.stringify([cfg, { root, own }])) return
  await publish($)
  restartClocks($)
  if (idle() !== was && s.enabled && !stepping && !beating) await schedule($)
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
  else if (s.enabled && s.paused === COLD) text = '♡ cache went cold · beats start again on your next message'
  else if (s.enabled && s.paused) text = s.beats > 0 ? `${statusText(cfg, s.beats, s.lastRead, null)} · waits for your next turn` : '♡ beats wait for your next turn'
  else if (s.enabled || s.beats > 0) {
    let next: string | null = null
    let left: string | null = null
    const at = s.nextAt
    if (s.enabled && (at !== null || s.keepUntil !== null)) {
      const now = await $.clock.now()
      // past the keep-alive time, no beat is coming
      if (at !== null && (s.keepUntil === null || s.keepUntil > now)) next = untilNext(at - now)
      if (s.keepUntil !== null) left = keepLeft(s.keepUntil, now)
    }
    text = statusText(cfg, s.beats, s.lastRead, next, left)
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

/** What `viewOf` works the cache out from, as this session has it. */
const cacheFacts = (contextTokens: number | null): CacheFacts => ({
  lastWarm: s.lastWarm, ttl: s.isCacheShort ? '5m' : ttl, contextTokens,
})

/** Whether the cache is warm, cold or not yet cached, and what re-caching it would send: the one place this is read. */
async function cacheNow($: EngineInterface): Promise<CacheView> {
  const now = await $.clock.now()
  const size = await chatSize($)
  return viewOf(cacheFacts(size ?? null), now)
}

/** Notes whether this chat is under the minimum, saying so in the log as it goes under. */
async function checkSmall($: EngineInterface) {
  const small = await smallContext($)
  if (small && !s.small) tell($, `beats will skip: ${small}`)
  s.small = small
  return small !== null
}

/**
 * Waits for the next beat or the end of the keep-alive time, whichever comes first, at most a step: the deadline is the
 * wall clock's, and a timer stops while the machine sleeps, so one long wait would run on for what was left of it.
 * `call` is the `schedule()` call this chain belongs to.
 */
function armStep($: EngineInterface, call: number, now: number) {
  const at = Math.min(s.nextAt ?? Infinity, s.keepUntil ?? Infinity)
  if (at === Infinity) return
  const wait = Math.min(STEP, Math.max(0, at - now))
  timer = $.clock.after(wait, () => void wallCheck($, call))
}

/**
 * The keep-alive time is up: this session turns off. It says "kept warm" only when the cache did last to the time;
 * a session that never had a turn, a cache gone cold on the way, beats waiting for a turn, or a sleep past the time
 * kept nothing warm, and the words don't claim it.
 */
function endKeep($: EngineInterface, now: number) {
  const until = clockText(s.keepUntil!, now)
  const lasts = viewOf(cacheFacts(null), now).expiresAt
  const isKept = !s.paused && lasts !== null && lasts >= s.keepUntil!
  return stop($, isKept ? `kept warm until ${until}, as asked` : `keep-alive time up (${until})`)
}

/**
 * A step's end: the keep-alive time over when it has come by the wall clock (a turn running ends it at its own end),
 * else the beat when its deadline has, else the line redrawn and another step.
 */
async function wallCheck($: EngineInterface, call: number) {
  const now = await $.clock.now()
  // a newer schedule() armed its own chain meanwhile: two would each beat
  if (call !== scheduling || (s.nextAt === null && s.keepUntil === null)) return
  if (s.keepUntil !== null && now >= s.keepUntil) {
    if (busy) await refreshLine($) // the line says the time is up, not the minute it last counted
    else await endKeep($, now)
    return
  }
  if (s.nextAt !== null && now >= s.nextAt) return scheduledBeat($)
  await refreshLine($)
  if (call !== scheduling) return
  armStep($, call, now)
}

/** Sets the next beat from the last cache read; resolves its delay, or undefined when none is set. */
async function schedule($: EngineInterface): Promise<number | undefined> {
  const call = ++scheduling
  timer?.cancel()
  timer = undefined
  s.nextAt = null
  isCovered = false
  let ms: number | undefined
  let p: Pulse = 'armed'
  if (!s.enabled) {
    s.small = null
    s.keepUntil = null // a keep-alive time is for a session that beats: off ends it
  }
  if (!s.enabled) p = 'hidden'
  else if (stepping) p = 'waiting' // a request on its way keeps the cache warm; once answered, the count runs from when it was sent
  else if (resent) p = 'waiting' // a beat would write the conversation again: the turn's next request or its end counts
  // a conversation's first turn: its next request may send it anew, and a beat would write what that won't read
  else if (busy && s.turns === 0) p = 'waiting'
  else if (await checkSmall($)) p = 'waiting' // nothing to beat for until a turn grows it
  else {
    const now = await $.clock.now()
    const since = s.lastWarm === null ? Infinity : now - s.lastWarm
    if (since >= MAX_TTL || s.paused) p = 'waiting' // nothing warm to keep, or none of use: the next turn starts it
    else {
      // usage can cross into credits; the keep-alive time's check below judges the cache by the lifetime too
      if (cfg.interval === 'auto' || s.keepUntil !== null) ttl = await cacheTtl($)
      if (call !== scheduling) return undefined
      // the cache outlives the keep-alive time without a beat: none is armed, and the time's end is waited for
      isCovered = s.keepUntil !== null && (viewOf(cacheFacts(null), now).expiresAt ?? 0) >= s.keepUntil
      if (!isCovered) {
        ms = Math.max(0, idle() - since)
        s.nextAt = now + ms
      }
      armStep($, call, now)
    }
  }
  // a newer call, begun while this one awaited, sets the timer and the heart: two would each arm one
  if (call !== scheduling) return undefined
  // the keep-alive time's end is watched whatever the beats are doing (waiting, skipping, a request on its way)
  if (s.enabled && s.keepUntil !== null) {
    const now = await $.clock.now()
    if (call !== scheduling) return undefined
    if (now >= s.keepUntil && !busy) {
      await endKeep($, now)
      return undefined
    }
    if (!timer) armStep($, call, now)
  }
  setPulse($, p)
  await save($)
  await refreshLine($)
  return ms
}

const logs = (how: Alert) => how === 'log' || how === 'both'
const toasts = (how: Alert) => how === 'toast' || how === 'both'

function announce($: EngineInterface, text: string) {
  if (logs(cfg.onStop)) $.ui.log(text)
  if (toasts(cfg.onStop)) $.ui.toast(`cachebeat ${text}`)
}

/** What cachebeat does along the way that is neither a beat nor a stop (a wait, a skip, a new model's cache), told as Notices says. */
function tell($: EngineInterface, text: string) {
  if (logs(cfg.notices)) $.ui.log(text)
  if (toasts(cfg.notices)) $.ui.toast(text.startsWith('♥') ? text : `cachebeat ${text}`) // a heart's line reads as a beat's toast does
}

/** Beats wait for the next turn, which will cache what a beat would have to write: says why, once. */
async function pause($: EngineInterface, why: string, said: string) {
  if (s.enabled && s.paused !== why) tell($, `beats wait for your next turn: ${said}`)
  s.paused = why
  await schedule($)
}

const MODEL_CHANGED = 'the model changed'
const COLD = 'the cache went cold'
const REWOUND = 'the conversation was rewound'
// nothing of a resumed conversation is cached in this process, and Claude Code may warn it's uncached before the next
// message re-reads it: a beat would pay for that re-read before the user chose to
const RESUMED = 'this conversation was resumed'
const OUT_OF_REACH = 'Claude Code cached this conversation anew, out of a beat\'s reach'
/** Tokens past which a beat wrote more than its own line: it missed what the last request cached. */
const MISSED = 1000

/**
 * How the conversation ends, in short: its length and a hash of its last messages. A beat re-sends the
 * request the last turn sent, so an ending other than the one that turn left means /rewind took the
 * conversation back, and the beat would keep warm what the next turn no longer sends.
 */
async function tailOf($: EngineInterface) {
  const messages = await $.session.messages()
  return `${messages.length}:${hashOf(messages.slice(-3))}`
}

type Said = { role: string; text: string; toolUses: readonly unknown[] }

const hashOf = (messages: readonly Said[]) => {
  const said = messages.map(m => `${m.role}\u0000${m.text}\u0000${m.toolUses.length}`).join('\u0001')
  let hash = 0x811c9dc5 // FNV-1a
  for (let i = 0; i < said.length; i++) hash = Math.imul(hash ^ said.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(36)
}

/** The newest messages `$.session.messages()` lists: past them, an ending can't be found by its place. */
const LISTED = 4096

/**
 * Whether the conversation no longer holds the ending `tail` recorded: shorter now, or its messages there changed.
 * Messages added since (a `! command`'s output, a notice) leave that ending where it was.
 */
async function isRewound($: EngineInterface, tail: string) {
  const [count, hash] = tail.split(':')
  const n = Number(count)
  if (n >= LISTED) return false
  const messages = await $.session.messages()
  if (messages.length >= LISTED) return false // past n, the list starts later: the ending isn't at its place
  return messages.length < n || hashOf(messages.slice(Math.max(0, n - 3), n)) !== hash
}
const SETTLE = 1000 // ms: a /model switch is applied once the hooks on it have settled

/** Beats paused for a model switch go on once the model is back to the one the cache was warmed on. */
async function resumeIfWarmed($: EngineInterface) {
  if (s.paused !== MODEL_CHANGED || busy) return
  const model = await $.session.model()
  if (model !== s.warmModel) return
  s.paused = null
  if (s.enabled) tell($, 'beats go on: back on the model the cache was warmed on')
  await schedule($)
}

async function stop($: EngineInterface, why?: string) {
  s.enabled = false
  await schedule($) // and the conversation's record says it's off
  if (!why) return 'off'
  announce($, `stopped: ${why}`)
  return `stopped: ${why}`
}

const ASK = '[cachebeat] Automated prompt cache keep-alive, not a message from the user. Do not continue any task or use any tool. Reply with a single period and nothing else.'
// mid-turn, the request a beat re-sends ends with the user's message, the tool call made for it left out: told
// only not to continue, the model took the task up again and tried the tool, which a fork denies, then asked again
const ASK_MID_TURN = '[cachebeat] Automated prompt cache keep-alive, not a message from the user. The request above is already being carried out elsewhere: do not start or continue it, and do not use any tool. Reply with a single period and nothing else.'

/** One beat: checks it is worth it, forks, and resolves what happened, in words. */
async function beat($: EngineInterface): Promise<string> {
  if (stepping) return 'a request is on its way; the beat waits for it'
  // one on its way sets the next when it's answered: a turn ending meanwhile, or /cachebeat now, would send a second.
  // Claimed here, before any await: a timer's beat and /cachebeat now that both entered while the first's checks were
  // parked would otherwise both pass, as `beating` is set only when the fork starts
  if (beatClaimed) return 'a beat is on its way; the next counts from it'
  beatClaimed = true
  let isHeld = true
  // the claim ends when the fork is answered, before the answered branches schedule the next beat (a request sent
  // meanwhile whose timer came due must not be dropped by it), or at any earlier exit, a throw included. Once
  // released, a newer beat may hold it: this one's end must not release that
  const release = () => {
    if (!isHeld) return
    isHeld = false
    beatClaimed = false
  }
  try {
    return await beatChecked($, release)
  } finally {
    release()
  }
}

/** A beat that holds the claim: `release` ends it. */
async function beatChecked($: EngineInterface, release: () => void): Promise<string> {
  const now = await $.clock.now()
  const since = now - (s.lastWarm ?? now)
  const warmedAt = s.lastWarm
  // from the user's last message: a turn's start, or its end for one begun before cachebeat saw it
  const lastWord = Math.max(s.lastReal ?? now, s.asked ?? -Infinity)
  // a keep-alive time is what the user asked for, up to 48 hours: Stop after idle doesn't apply while one is set
  if (s.keepUntil === null && now - lastWord >= cfg.stopAfterHours * 60 * MIN) return stop($, `${cfg.stopAfterHours}h since your last message`)
  // A cache past its lifetime is cold when this beat is late (a sleeping or stalled process, or retries), or when the
  // interval is shorter than the lifetime, so an on-time beat came before it lapsed. Only an on-time beat on an interval
  // as long as the lifetime or longer finds it gone by design: that is "not served" below.
  // schedule() reads it under auto, near when the cache was written, and that lifetime is the one that counts: usage crossing into
  // credits since would read a warm one-hour cache as five minutes. A custom interval never reads it there unless a keep-alive time is set
  if (cfg.interval !== 'auto') ttl = await cacheTtl($)
  const isLate = since > idle() + 2 * STEP
  const mayBeCold = isLate || idle() < TTL_MS[s.isCacheShort ? '5m' : ttl]
  if (since >= MAX_TTL || (mayBeCold && viewOf(cacheFacts(null), now).state === 'cold')) {
    const said = `the cache went cold (${fmt(since)} since it was last read)`
    // asked for by hand with beating off (/cachebeat now): nothing to pause or stop
    if (!s.enabled) return `${said}; no beat sent`
    if (cfg.onCold === 'stop') return stop($, said)
    await pause($, COLD, said)
    return `beats wait for your next turn: ${said}`
  }
  const { rateLimits } = await $.session.usage()
  const full = rateLimits.find(l => l.percentUsed >= cfg.stopAtUsage)
  if (full) {
    const kind = usageName(full.kind)
    return stop($, cfg.stopAtUsage >= 100 ? `${kind} usage limit reached` : `${kind} usage at ${full.percentUsed}%, past ${cfg.stopAtUsage}%`)
  }
  if (await smallContext($)) {
    await schedule($) // says so, and waits for a turn to grow it
    return `beats skip: ${s.small}`
  }
  // no event marks /rewind, which runs between turns: the conversation's ending tells it. Mid-turn the ending
  // grows by itself, as each tool's result lands
  if (!busy && s.tail !== null && await isRewound($, s.tail)) {
    await pause($, REWOUND, REWOUND)
    return `beats wait for your next turn: ${REWOUND}`
  }
  // a beat goes to the current model, whose cache is not the one warmed if the model changed since
  const model = await $.session.model()
  const isNewModel = s.warmModel !== null && model !== s.warmModel
  if (isNewModel && cfg.onModelSwitch === 'wait') {
    await pause($, MODEL_CHANGED, 'the new model has no cache yet')
    return `beats wait for your next turn: ${MODEL_CHANGED}`
  }

  // as the beat starts: a turn may end, and its last request cache more, while the beat is on its way
  const wasIdle = !busy
  const wasCached = cached
  const wasFirst = s.turns === 1
  const era = convs
  const sentAt = await $.clock.now() // the cache it reads lives from here, however long the answer takes
  beating = true
  // tagged, so a request log or a proxy tells a beat from the user's own messages, and the model too
  const forking = $.model.fork({ prompt: busy ? ASK_MID_TURN : ASK })
  const r = await forking.finally(() => {
    beating = false
    release()
  })
  // /clear or /resume while it was on its way: what it read was the conversation left behind's, none of this one's
  if (era !== convs) return 'the conversation changed while the beat was on its way; its answer is set aside'
  if (!r.isAnswered && r.reason !== 'empty-reply') {
    if (r.reason === 'nothing-to-fork') return stop($, 'nothing to keep warm')
    const isTransient = r.reason === 'aborted' || r.error === 'overloaded' || r.error === 'server_error' || r.status === null
    if (!isTransient) return stop($, r.error === 'rate_limit' ? 'rate limited' : `API error (${r.error})`)
    // a request sent meanwhile warmed the cache: no retry, the next beat counts from it. That request's own schedule() may
    // have come due while this beat was on its way, and the guard above dropped the beat it brought: set it again here
    const isWarmedSince = s.lastWarm !== warmedAt
    if (s.enabled && !stepping) {
      if (isWarmedSince) await schedule($)
      else {
        const call = scheduling
        const at = await $.clock.now()
        if (call === scheduling) {
          // its own call number, so a step check parked in an await on an older chain ends instead of running on beside it
          const mine = ++scheduling
          timer?.cancel()
          s.nextAt = at + RETRY
          armStep($, mine, at)
        }
      }
    }
    const then = !s.enabled ? 'not retried while off' : isWarmedSince ? 'a request since keeps it warm' : 'retrying in a minute'
    return `${'error' in r ? r.error : r.reason}; ${then}`
  }
  const { cache_read_input_tokens: got, cache_creation_input_tokens: wrote } = r.usage
  // after a conversation's first turn, a beat reading well short of what that turn cached, and writing the rest:
  // Claude Code sent the conversation anew and cached it where a beat can't reach, so each beat would write it
  // again. Within five minutes of that request the cache can't have lapsed, so even a beat writing more than it
  // read is this. Mid-turn, or after later turns, a beat writes the message before its cache mark, which a long
  // answer or tool call makes big: no sign of this
  const isOutOfReach = wasIdle && wasFirst && !isNewModel && wasCached > 0 && got + MISSED < wasCached && wrote > MISSED
    && (got >= wrote || since < 5 * MIN)
  if (isOutOfReach) {
    await pause($, OUT_OF_REACH, OUT_OF_REACH)
    return `beats wait for your next turn: ${OUT_OF_REACH}`
  }
  if (isNewModel) {
    // the first beat on a new model writes its cache, as the next turn would have: kept warm from here
    s.warmModel = model
    warmFrom(sentAt)
    await countDay($, beatAdd(model, lifetime(), got, wrote, false)) // it paid for the write, though it is no beat of the count
    const warmed = `♥ warmed the new model's cache (${wrote.toLocaleString()} written)`
    tell($, warmed)
    await schedule($)
    return warmed
  }
  // mid-turn, a beat writes the message before its cache mark, which a big tool result makes bigger than what it
  // read: no sign the cache lapsed
  if (got < wrote && wasIdle) {
    const why = `the cache was not served (${got.toLocaleString()} read, ${wrote.toLocaleString()} written)`
    await countDay($, beatAdd(model, lifetime(), got, wrote, false)) // what it cost, though no beat of the count
    // under auto, a cache gone before an hour's interval lives five minutes, whatever the signs said:
    // this beat wrote it afresh, so beat at that from here
    if (cfg.interval !== 'auto' || s.isCacheShort || ttl === '5m') return stop($, why)
    s.isCacheShort = true
    warmFrom(sentAt)
    tell($, `${why}: this session's cache lasts 5 minutes, so beats come every ${AUTO['5m']}m`)
    await schedule($)
    return `${why}; beating every ${AUTO['5m']}m`
  }
  warmFrom(sentAt)
  // what the conversation's cache holds: a fork that tried a tool asks twice, and its usage counts both reads
  s.lastRead = cached > 0 ? Math.min(got, cached) : got
  s.lastWrote = wrote
  s.beats++
  beatsSince++
  await countDay($, beatAdd(model, lifetime(), got, wrote, true))
  if (cfg.heartAnimate) blast = 0
  const renewed = `♥ cache renewed (${got.toLocaleString()} read, ${wrote.toLocaleString()} written)`
  if (logs(cfg.onBeat) || (s.row === null && !isStatusOnBand)) $.ui.log(renewed) // else no line at all says it
  if (toasts(cfg.onBeat)) $.ui.toast(`♥ cache kept warm · ${tokens(s.lastRead)} read`)
  await schedule($)
  return renewed
}

/** A beat its timer brought: none once beating was turned off, whatever timer was still set. */
function scheduledBeat($: EngineInterface) {
  return s.enabled ? beat($) : Promise.resolve('off')
}

/** A beat asked for by hand: never one that would switch cachebeat off for having nothing to fork. */
function beatNow($: EngineInterface) {
  if (busy) return Promise.resolve('a turn is running; the beat waits for it to end')
  return s.lastReal === null ? Promise.resolve('nothing to keep warm until this session has a turn') : beat($)
}

const every = () => `every ${fmt(idle())} idle`
const when = (ms: number | undefined) =>
  s.small ? `beats skip: ${s.small}`
  : ms === undefined ? (stepping ? 'counts from when the request on its way was sent' : busy ? 'starts after this turn' : isCovered ? 'no beat needed' : 'starts after your next turn')
  : `next beat ${untilNext(ms)}`

/** Where the interval comes from: this folder's own, or the settings for all folders. */
const intervalFrom = () => (own.interval !== undefined ? 'folder' : 'all folders')

const isWhole = (word: string) => /^\d+$/.test(word)

/**
 * A request sent at `at` read or wrote the cache. Its lifetime runs from a request's start, not the end of its answer,
 * so that is the time kept: the latest of them, as a beat can be answered after a request sent later than it.
 */
const warmFrom = (at: number) => {
  s.lastWarm = Math.max(s.lastWarm ?? at, at)
}

/** A request of the main conversation, sent at `sentAt`, read the cache: the count starts again from it. */
async function markWarm($: EngineInterface, sentAt: number) {
  warmFrom(sentAt)
  s.warmModel = await $.session.model()
  s.paused = null
}

/** After /clear or /resume: another conversation, its count from zero, this session's switch and keep-alive time kept. */
async function anotherConversation($: EngineInterface) {
  convs++
  asking?.close?.(LEFT_BEHIND) // a question about the conversation left behind: its message is dropped
  asking = null
  s = { ...fresh, enabled: s.enabled, keepUntil: s.keepUntil, isCacheShort: s.isCacheShort, guard: s.guard }
  fullReads.clear() // Claude's copy of the state went with the conversation
  cached = 0 // nothing of it cached yet
  resent = false
  beatsSince = 0
  await syncSettings($)
}

/** Minutes typed, kept under the hour the cache lives. */
const minutesOf = (word: string) => Math.min(55, Math.max(1, Math.round(Number(word))))

/** Where the paths of folders are shown cut to, in answers and in the menu alike. */
const PATH = 24
const here = () => `this folder (${cut(root, PATH)})`

/**
 * Turns this session on after `change` (a saved setting), saying how its interval moved. `keep` is the
 * keep-alive time in minutes from now, or null for none; left out, the session's time stays as it is.
 */
async function turnOn($: EngineInterface, change?: () => Promise<void>, keep?: number | null) {
  const wasOn = s.enabled
  const before = idle()
  const limit = s.keepUntil
  if (change) await change()
  const now = await $.clock.now()
  s.enabled = true
  if (keep !== undefined) s.keepUntil = keep === null ? null : now + keep * MIN
  // on until 4:30 PM (2h); with no time limit once one was dropped
  const lead = s.keepUntil !== null ? `on until ${clockText(s.keepUntil, now)} (${fmt(s.keepUntil - now)})` : limit !== null ? 'on with no time limit' : 'on'
  if (stepping) {
    await save($)
    return `${lead}, ${every()}; ${when(undefined)}`
  }
  if (wasOn && idle() === before && limit === s.keepUntil) {
    const at = s.nextAt
    const ms = at === null ? undefined : Math.max(0, at - now)
    return `already ${lead}, ${every()} · ${when(ms)}`
  }
  const ms = await schedule($)
  return `${lead}, ${every()} · ${when(ms)}`
}

/** Settings and their values as the menu names them: `New sessions start on, Beat after idle 45m`. */
const listed = (settings: Partial<BeatSettings>) =>
  (Object.entries(settings) as [keyof BeatSettings, Value][]).map(([k, v]) => `${label(k)} ${shown(rowOf(k)!.row, v, cfg)}`).join(', ')

/**
 * `/cachebeat global …` and `local …`: whether new sessions start on, or the interval, saved for all
 * folders or this one, and applied to this session too.
 */
async function scoped($: EngineInterface, to: Target, word: string | undefined) {
  await syncSettings($)
  const where = to === 'folder' ? here() : 'all folders'
  const session = () => `this session: ${s.enabled ? `on, ${every()}` : 'off'}`
  if (to === 'folder' && word === 'reset') {
    await changeSettings($, { drop: 'all' })
    return `${where} follows all folders again · ${session()}`
  }
  const isMinutes = word !== undefined && isWhole(word)
  const wasOn = s.enabled
  if (word !== 'on' && word !== 'off' && !isMinutes) {
    if (to === 'global') return `${where}: ${listed({ defaultOn: global.defaultOn, interval: global.interval })} · usage: /cachebeat global on|off|<minutes>`
    return `${where}: ${Object.keys(own).length ? listed(own) : 'follows all folders'} · usage: /cachebeat local on|off|<minutes>|reset`
  }
  const patch: Partial<BeatSettings> = isMinutes ? { interval: minutesOf(word) } : { defaultOn: word === 'on' }
  if (word === 'off') {
    await setSettings($, patch, to)
    if (s.enabled) await stop($)
  } else await turnOn($, () => setSettings($, patch, to))
  const key = isMinutes ? 'interval' : 'defaultOn'
  // what this folder sets for itself, that a change for all folders doesn't reach here
  const kept = to === 'global' && own[key] !== undefined ? ` · this folder keeps ${shown(rowOf(key)!.row, own[key]!, cfg)}` : ''
  // this session as it now is: `now` where the command turned it on or off, its interval unless it's the one just saved
  const now = s.enabled === wasOn ? '' : 'now '
  const sameInterval = isMinutes && idle() === minutesOf(word) * MIN
  const state = s.enabled ? `${now}on${sameInterval ? '' : `, ${every()}`}` : `${now}off`
  return `${where}: ${isMinutes ? `every ${patch.interval}m idle` : `new sessions start ${word}`}${kept} · this session: ${state}`
}

/** What the tools answer: this session's beating, the settings as they apply here, and this folder's own. */
const wholeMinutes = (ms: number | null) => (ms === null ? null : Math.floor(ms / MIN))

/** This session's beating. */
async function sessionOf($: EngineInterface, now: number) {
  const nextBeat = !s.enabled || s.small ? null
    : s.nextAt !== null ? untilNext(s.nextAt - now)
    : stepping ? `${fmt(idle())} after the request on its way was sent`
    : busy ? 'after this turn'
    : isCovered ? 'none needed'
    : 'after the next turn'
  const from = intervalFrom()
  const mine = sumOf([s.stats], new Set(Object.keys(s.stats)))
  return {
    enabled: s.enabled, intervalMinutes: idle() / MIN, intervalFrom: from === 'all folders' && cfg.interval === 'auto' ? 'auto' : from,
    keepAliveUntil: s.keepUntil === null ? null : new Date(s.keepUntil).toISOString(),
    keepAliveUntilLocal: s.keepUntil === null ? null : clockText(s.keepUntil, now),
    keepAliveMinutesLeft: s.keepUntil === null ? null : wholeMinutes(Math.max(0, s.keepUntil - now)),
    beats: s.beats, lastBeatReadTokens: s.lastRead, lastBeatWrittenTokens: s.lastWrote, nextBeat, skipping: s.small, paused: s.paused,
    coldGuard: s.guard ?? cfg.coldGuard, coldGuardFrom: s.guard === null ? 'settings' : 'session',
    coldGuardAsked: mine.held, coldSends: mine.cold, coldSendTokens: mine.coldTokens,
  }
}

/** The prompt cache as it is judged now, and what writing the conversation to it again would come to. */
async function cacheOf($: EngineInterface, view?: CacheView) {
  view ??= await cacheNow($)
  const write = ratiosOf(await $.session.model())[view.ttl === '1h' ? 'write1h' : 'write5m']
  return {
    state: view.state, ttl: view.ttl,
    lastReadMinutesAgo: wholeMinutes(view.lastWarm === null ? null : view.at - view.lastWarm),
    minutesLeft: wholeMinutes(view.state === 'warm' ? view.expiresAt! - view.at : null),
    coldForMinutes: wholeMinutes(view.coldFor), contextTokens: view.contextTokens,
    recacheInputTokens: view.contextTokens === null ? null : Math.round(view.contextTokens * write),
  }
}

/** The main conversation's context window as the engine reports it, and what cachebeat saw of its compactions. */
async function contextOf($: EngineInterface, now: number, isSubagent: boolean) {
  const { context } = await $.session.usage({ breakdown: 'summary' }) // estimated here, no request sent
  const breakdown = context.breakdown
  const lastWord = Math.max(s.lastReal ?? -Infinity, s.asked ?? -Infinity)
  return {
    tokens: context.tokens ?? null, window: context.window, percent: context.percent ?? null,
    autoCompactAt: breakdown?.isAutoCompactEnabled ? breakdown.autoCompactThreshold ?? null : null,
    compactions: s.compactions, lastCompactionMinutesAgo: wholeMinutes(s.lastCompactAt === null ? null : now - s.lastCompactAt),
    lastMessageMinutesAgo: wholeMinutes(lastWord === -Infinity ? null : now - lastWord),
    ...(isSubagent ? { of: 'main conversation' } : {}),
  }
}

/**
 * What the Stats tab draws: the other sessions' recorded days, read when the pane or the command opens and then every ten
 * minutes (each read of the store goes through its whole file), and this conversation's own, live.
 */
async function statsFacts($: EngineInterface): Promise<StatsFacts> {
  const now = await $.clock.now()
  if (!others || now - others.at >= OTHERS_EVERY) {
    const days: Days[] = []
    for (const key of await $.store.keys()) {
      if (!key.startsWith('session:') || key === `session:${conv}`) continue
      const kept = keptOf(await $.store.get(key))
      if (kept) days.push(daysOf(kept.stats))
    }
    others = { at: now, days }
  }
  return factsFrom(others.days, s.stats, now)
}

/** What `state` answers: each section asked for (none named: all of them), the main conversation's however a subagent asks. */
async function stateOf($: EngineInterface, only: readonly Section[] = [], isSubagent = false) {
  await syncSettings($)
  ttl = await cacheTtl($) // usage can cross into credits between turns
  const now = await $.clock.now()
  const wants = (name: Section) => only.length === 0 || only.includes(name)
  const defaults = Object.fromEntries(Object.keys(changed(cfg)).map(k => [k, DEFAULTS[k as keyof BeatSettings]]))
  const { rateLimits } = wants('session') ? await $.session.usage() : { rateLimits: [] }
  return {
    ...(wants('session') ? { session: { ...await sessionOf($, now), usageLimits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })) } } : {}),
    ...(wants('cache') ? { cache: await cacheOf($) } : {}),
    ...(wants('context') ? { context: await contextOf($, now, isSubagent) } : {}),
    ...(wants('settings') ? {
      settings: cfg, folder: { path: root, own },
      ...(Object.keys(own).length ? { allFolders: global } : {}), defaults,
    } : {}),
  }
}

/** What the Status tab draws: the figures `state` reports, read the same way. */
async function factsOf($: EngineInterface): Promise<StatusFacts> {
  ttl = await cacheTtl($) // usage can cross into credits between turns
  const now = await $.clock.now()
  const { rateLimits } = await $.session.usage()
  const { lastMessageMinutesAgo } = await contextOf($, now, false)
  const view = await cacheNow($)
  // the time left is drawn as the turn line draws it, rounded up (`fmt`): the page and the line must read alike
  return {
    cache: { ...await cacheOf($, view), leftMs: view.state === 'warm' ? view.expiresAt! - view.at : null },
    session: {
      ...await sessionOf($, now), keepAliveLeftMs: s.keepUntil === null ? null : Math.max(0, s.keepUntil - now),
      usageLimits: rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed })),
    },
    lastMessageMinutesAgo, coldGuardTokens: cfg.coldGuardTokens, stopAtUsage: cfg.stopAtUsage,
  }
}

type Before = { enabled: boolean; keepUntil: number | null; guard: boolean | null; settings: BeatSettings; own: Partial<BeatSettings> }

/**
 * `set`'s answer: the fields the call changed (this session's own switch and keep-alive time, not what follows
 * from the settings; its own patches, not what another session saved meanwhile), this session's state,
 * and the settings it changed, for all folders and this one.
 */
async function answerSet($: EngineInterface, before: Before, change: SetChange) {
  const settings = Object.entries(change.patch).filter(([k, v]) => before.settings[k as keyof BeatSettings] !== v)
  const set = Object.entries(change.folder?.own ?? {}).filter(([k, v]) => before.own[k as keyof BeatSettings] !== v)
  const drop = change.folder === null ? Object.keys(before.own) : change.folder?.drop ?? []
  const dropped = drop.filter(k => k in before.own)
  const changed = [
    ...(before.enabled !== s.enabled ? ['session.enabled'] : []),
    ...(change.keepAliveMinutes !== undefined && before.keepUntil !== s.keepUntil ? ['session.keepAliveMinutes'] : []),
    ...(before.guard !== s.guard ? ['session.coldGuard'] : []),
    ...settings.map(([k]) => `settings.${k}`),
    ...[...set.map(([k]) => k), ...dropped].map(k => `folder.${k}`),
  ]
  const folder = change.folder === undefined ? {} : { folder: { path: root, ...Object.fromEntries([...set, ...dropped.map(k => [k, null])]) } }
  await syncSettings($)
  ttl = await cacheTtl($) // the interval it answers is what `auto` comes to
  // saved for all folders, and not what this folder follows: it has its own, whether the call changed the saved value or not
  const shadowed = Object.keys(change.patch).filter(k => k in own)
  return { changed, session: await sessionOf($, await $.clock.now()), settings: Object.fromEntries(settings), ...folder, shadowed }
}

const json = (x: unknown) => JSON.stringify(x)

/** Opens the pane on `tab`: the Beating tab for the settings, Status for a bare /cachebeat. */
async function openSettings($: EngineInterface, tab = 'beating') {
  await syncSettings($)
  const stored = await $.store.get('customs')
  customs = (stored as typeof customs | undefined) ?? {}
  ttl = await cacheTtl($)
  notice = ''
  isResetArmed = false
  others = null // read afresh
  editsFolder = Object.keys(own).length > 0 // a folder with settings of its own opens on them
  isPaneOpen = true
  await update($, pageAtom, () => ({ tab, picker: null }))
  await $.ui.open({ id: PANE, title: 'cachebeat', focus: true, closeOnEscape: true, holdToasts: true, rows: 24 })
  await focusOn($, `tab:${tab}`, true)
}

/**
 * Moves the pane's focus; a move this plugin makes skips its own ui.focus hook, so it notes it here.
 * A desktop's Tab and clicks move its own focus, and a move made for it after a press lands where the
 * person didn't look: there it moves only to land somewhere new, the pane or a list of choices opening.
 */
async function focusOn($: EngineInterface, key: string, isLanding = false) {
  if (paneSurface !== 'terminal' && !isLanding) return
  // a focus that cannot move leaves the page as it is (`claude plugin test` has no focus to move)
  const focusing = $.ui.focus({ requestId: PANE, key })
  const moved = await focusing.catch((err: unknown) => ({ deny: String(err) }))
  if (moved.deny) {
    $.ui.log(`focus ${key}: ${moved.deny}`, { to: 'debug' })
    return
  }
  await update($, focusAtom, () => key)
  const scrolling = $.ui.scroll({ to: { key }, in: PANE })
  const scrolled = await scrolling.catch((err: unknown) => ({ deny: String(err) }))
  if (scrolled.deny) $.ui.log(`scroll to ${key}: ${scrolled.deny}`, { to: 'debug' })
}

function stopPaneTicker() {
  paneTicker?.cancel()
  paneTicker = undefined
  paneEvery = 0
}

/** Shows a page of the pane and puts the focus on `key` there; `isLanding` as `focusOn` takes it. */
async function goTo($: EngineInterface, page: PanePage, key: string, isLanding = false) {
  isResetArmed = false
  notice = '' // the last outcome was about where the person was, not where they go
  await update($, pageAtom, () => page)
  await focusOn($, key, isLanding)
}

/** The first element of a tab's settings, where going into it lands; a read-only tab has none, so the focus stays on the tab bar. */
const firstOf = (id: string, c: BeatSettings) =>
  READ_ONLY.some(p => p.id === id) ? `tab:${id}` : id === 'beating' ? 'session' : `row:${TABS.find(t => t.id === id)!.rows.find(r => !r.show || r.show(c))!.key}`

/** Puts a line in the pane's footer. */
function say($: EngineInterface, text: string) {
  notice = text
  void update($, tickAtom, t => t + 1)
}

/** `/cachebeat guard on|off`: this session's own Cold guard, over the setting's; bare, how it stands. */
async function guardCommand($: EngineInterface, word: string | undefined) {
  if (word === 'on' || word === 'off') {
    s.guard = word === 'on'
    await save($)
    return `this session: Cold guard ${word}`
  }
  await syncSettings($)
  const from = s.guard !== null ? 'this session' : own.coldGuard !== undefined ? 'this folder' : 'all folders'
  return `Cold guard ${s.guard ?? cfg.coldGuard ? 'on' : 'off'} (${from}) · usage: /cachebeat guard on|off`
}

/** Origins the cold guard asks about: a person at this terminal. Every other is sent, logged and counted. */
const ASKED_ORIGINS: readonly string[] = ['composer']

/**
 * The cold guard's question while it's open: its text, which the AskUserQuestion hook knows it by, and how to close it
 * unanswered, with the reason the ask then rejects with.
 */
let asking: { text: string; close: ((reason: string) => void) | null } | null = null

// why the guard closed its own question: the ask's rejection carries it, so none is taken for the user's Esc
const TIMED_OUT = 'unanswered: cachebeat sent the message'
const LEFT_OPEN = 'unanswered too long: cachebeat dropped the message'
const LEFT_BEHIND = 'the conversation changed: cachebeat dropped the message'

/**
 * How long a question under `don't send` stays open. Claude Code runs incoming messages through `prompt.submit` one at a
 * time, so while it is open every queued message, other sessions' among them, waits behind it.
 */
const DROP_AFTER = 5 * MIN

/** How the guard's own timer closed its question: the wait under `send after`, or the ceiling under `don't send`. */
export type Closed = 'wait' | 'ceiling' | 'left' | null

/**
 * What the cold guard does with its question's outcome: any answer decides (Send sends, anything else drops). With none,
 * the timer of `send after` sends; the ceiling of `don't send` drops, saying so; a dismissal drops.
 */
export const coldOutcome = (answer: string | null, closed: Closed): 'send' | 'send-unanswered' | 'drop' | 'drop-unanswered' | 'drop-left' =>
  answer === 'Send' ? 'send' : answer !== null ? 'drop' : closed === 'wait' ? 'send-unanswered'
    : closed === 'ceiling' ? 'drop-unanswered' : closed === 'left' ? 'drop-left' : 'drop'

/** Why the guard dropped a message, and the way to send it. */
const dropped = (why: string) => `cachebeat: not sent. ${why} Send it again to be asked, or /cachebeat guard off.`

/**
 * A turn's first request, answered: if it came back to a cache that beats alone kept warm, it is counted, and the
 * re-cache it avoided. That is so when beats ran since the last request, it read what that one cached, and it came later
 * than the cache would have lasted from the turn before: counted from that turn's end, which can only miss a kept turn.
 */
async function countKept($: EngineInterface, model: string, got: number, wasCached: number, sentAt: number) {
  const since = beatsSince
  beatsSince = 0
  if (since === 0 || s.lastReal === null || wasCached === 0 || got + MISSED < wasCached) return
  if (sentAt - s.lastReal <= TTL_MS[lifetime()]) return
  await countDay($, keptAdd(model, lifetime(), got))
}

/** Adds to today's counts in this conversation's record, which the next save writes. */
async function countDay($: EngineInterface, add: Parameters<typeof addTo>[2]) {
  s.stats = addTo(s.stats, await $.clock.now(), add)
}

/**
 * A message about to go to the cache the guard asked about, read again: a turn or a beat may have warmed it while the
 * question was open, and then it goes as any message does. Still cold, it is counted and said before it goes: said
 * unless `isSaid` is off, for a send the guard never asked about (it is off, or the chat is under its size), which Stats counts all the same.
 */
async function noteColdSend($: EngineInterface, how: string, isSaid = true) {
  const view = await cacheNow($)
  if (view.state !== 'cold' || view.contextTokens === null) return
  await countDay($, { cold: 1, coldTokens: view.contextTokens })
  await save($)
  if (isSaid) tell($, `sent on a cold cache${how}: cold for ${fmt(view.coldFor!)}, ${tokens(view.contextTokens)} tokens cached again`)
}

/** Asks the cold guard's question; resolves the answer, or null when it was dismissed, closed unanswered, or couldn't be asked. */
async function askCold($: EngineInterface, text: string, wait: 'drop' | number) {
  const open: NonNullable<typeof asking> = { text, close: null }
  asking = open
  let timer: { cancel: () => void } | undefined
  try {
    await countDay($, { held: 1 })
    await save($)
    // past the wait, the AskUserQuestion hook closes the dialog, and the ask rejects with the timer's own reason
    // under don't send, a ceiling: the question closes and the message is dropped, so the messages queued behind it go on
    timer = $.clock.after(wait === 'drop' ? DROP_AFTER : wait * MIN, () => open.close?.(wait === 'drop' ? LEFT_OPEN : TIMED_OUT))
    let answer: string | null = null
    let closed: Closed = null
    try {
      answer = await $.ui.ask(text, ['Send', "Don't send"])
    } catch (err) {
      // dismissed (Esc), closed by the timer or a change of conversation, or nowhere to ask: only the timer's reason sends
      const why = String(err)
      closed = why.includes(TIMED_OUT) ? 'wait' : why.includes(LEFT_OPEN) ? 'ceiling' : why.includes(LEFT_BEHIND) ? 'left' : null
    }
    return { answer, closed }
  } finally {
    timer?.cancel()
    if (asking === open) asking = null
  }
}

const OPENED = 'settings opened'
const USAGE = 'usage: on, off, a time like 2h, now, guard on|off, stats, settings · global or local: on, off, minutes · local reset'

export const register: Register = on => {
  // also runs after every reload: pick up where the last load left off
  on('session.start', async ($, e, next) => {
    isStatusOnBand = false // until the band is drawn on a desktop
    paneSurface = 'terminal' // until the pane draws, on whichever surface
    stopPaneTicker() // a pane left up by the module before a reload has no ticker of this load's
    isPaneOpen = false
    others = null
    isStoreFull = false
    await load($)
    await publish($)
    const prev = await read($, saved)
    const id = await $.session.id()
    const messages = prev ? [] : await $.session.messages()
    if (messages.length) {
      // a new process with a conversation already in it: --resume, --continue. Claude Code's hint on it may come before
      // this or after, and is applied once both are in. The line waits for it, and is said once the conversation is drawn
      await restoreConversation($, id)
      $.clock.after(SETTLE, () => void sayResumed($))
    } else {
      // a reload keeps this session's choice; a new session starts as its folder's settings say
      s = prev ? restored(prev) : { ...fresh, enabled: cfg.defaultOn }
      keepAs(id)
    }
    await schedule($)
    await $.command.register({
      name: 'cachebeat',
      description: 'Keep the prompt cache warm while idle',
      argumentHint: '[on|off|<time, like 2h>|now|guard on|off|stats|global …|local …|settings]',
      immediate: true,
    })
    await $.tool.register(STATE)
    await $.tool.register(SET)
    await pruneRecords($)
    return next(e)
  })

  // a /clear goes on under a new session, with no session.start and its state empty: a new
  // conversation, so it starts its count afresh, keeping whether this session beats and how often
  on('session.end', { reason: 'clear' }, async ($, e, next) => {
    const r = await next(e)
    keepAs(null) // the record left behind keeps what it had: the new conversation's id comes with its start
    await anotherConversation($)
    await schedule($)
    return r
  })

  // /resume within a session: another conversation takes this one's place, with no session.start. A line logged here
  // would land in the conversation left behind: the resumed one's start says it
  on('session.end', { reason: 'resume' }, async ($, e, next) => {
    const r = await next(e)
    keepAs(null) // the record left behind keeps what it had: the resumed conversation's own is read at its start
    await anotherConversation($)
    s.paused = RESUMED
    isResumeUnsaid = true
    await schedule($)
    return r
  })

  // a conversation's start. Its id comes from the event: in this hook after /resume, $.session.id() is still the one left behind
  on('classic.SessionStart', async ($, e, next) => {
    const id = e.session_id ?? null
    if (e.source === 'clear') {
      // the new conversation has this session's on/off and keep-alive time: its record says so from the start
      keepAs(id)
      lastKept = ''
      await keepRecord($)
    }
    if (e.source === 'resume' || e.source === 'fork') {
      const hint = { id: e.session_id, secondsSince: e.seconds_since_last_response, at: await $.clock.now() }
      if (isResumeUnsaid) {
        // /resume within this session: no session.start comes, so its state is put in place here
        isResumeUnsaid = false
        await restoreConversation($, id)
        seedFromResume(hint)
        await schedule($)
        // the resumed conversation is drawn once this hook settles: a line logged before that is drawn over
        $.clock.after(SETTLE, () => void sayResumed($))
      } else if (isRestored) await takeHint($, hint)
      else resumeHint = hint // --resume, --continue, a fork: session.start is still restoring, and applies it
    }
    return next(e)
  })

  // the cold guard: a message to a session whose cache has gone cold re-caches the whole conversation, so the user is asked
  // first. It fails open (a hook that fails lets the prompt through), except at the question: one not answered Send drops it
  on('prompt.submit', async ($, e, next) => {
    // mid-turn, the turn's own requests read the cache anyway
    if (e.turnId !== undefined || busy) return next(e)
    await syncSettings($)
    ttl = await cacheTtl($) // the lifetime the cache is judged by, as it is now
    const view = await cacheNow($)
    if (view.state !== 'cold' || view.contextTokens === null) return next(e)
    // a cold send the guard doesn't ask about still re-caches the chat, and Stats counts it: quietly, as it isn't the guard's to say
    if (!(s.guard ?? cfg.coldGuard) || view.contextTokens < cfg.coldGuardTokens) {
      await noteColdSend($, '', false)
      return next(e)
    }
    const coldFor = fmt(view.coldFor!)
    const size = view.contextTokens
    if (!ASKED_ORIGINS.includes(e.origin.kind)) {
      await noteColdSend($, '')
      return next(e)
    }
    // a second message can't wait on the open question: a hook waiting with no question of its own is cut at 10s and sent
    if (asking) return { drop: dropped('A question about the cold cache is open: answer it first.') }
    const wait = cfg.coldGuardUnanswered
    const said = `The cache has been cold for ${coldFor}, so this message caches ${tokens(size)} tokens again. Send it?`
    const { answer, closed } = await askCold($, said, wait)
    const then = coldOutcome(answer, closed)
    if (then === 'drop-unanswered') return { drop: dropped(`The question went unanswered for ${fmt(DROP_AFTER)}.`) }
    if (then === 'drop-left') return { drop: 'cachebeat: not sent. The conversation changed: send it again.' }
    if (then === 'drop') return { drop: dropped(`The cache has been cold for ${coldFor}, and sending caches ${tokens(size)} tokens again.`) }
    await noteColdSend($, then === 'send' ? '' : ` after ${wait}m unanswered`)
    return next(e)
  })

  // the cold guard's own question: closed unanswered when its wait is up. Every other question, the model's own among them, passes
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const open = asking
    if (!open || e.questions[0]?.question !== open.text) return next(e)
    const closed = new Promise<{ deny: string }>(resolve => {
      open.close = reason => resolve({ deny: reason })
    })
    return Promise.race([next(e), closed])
  })

  // typed over a running turn, the command runs at once but its reply is drawn only when the turn ends: the toast says it was taken.
  // The settings pane opens at once and is feedback enough; it holds toasts, so this one would show only after the pane closes
  on('command.run', { command: 'cachebeat' }, async ($, e, next) => {
    const r = await next(e)
    if (busy && r.text && r.text !== OPENED) $.ui.toast(`cachebeat: ${r.text}`)
    return r
  })

  on('command.run', { command: 'cachebeat' }, async ($, e) => {
    ttl = await cacheTtl($) // what `auto` comes to, for the answer
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words[0] === 'settings' || words[0] === 'config') {
      await openSettings($)
      return { text: OPENED }
    }
    if (words[0] === 'stats') {
      others = null // read afresh
      if (!busy && e.origin.kind === 'composer') await openSettings($, 'stats')
      return { text: statsText(await statsFacts($)) }
    }
    if (words[0] === 'now') return { text: await beatNow($) }
    if (words[0] === 'guard') return { text: await guardCommand($, words[1]) }
    if (words[0] === 'global' || words[0] === 'local') return { text: await scoped($, words[0] === 'local' ? 'folder' : 'global', words[1]) }
    if (words[0] === 'off') return { text: `this session: ${s.enabled ? await stop($) : 'already off'}` }
    // `on` (no time limit), a keep-alive time (`2h`, `1h 30m`), or both
    const rest = words[0] === 'on' ? words.slice(1) : words
    if (words[0] === 'on' && !rest.length) return { text: `this session: ${await turnOn($, undefined, null)}` }
    const asked = rest.join('')
    if (/^\d/.test(asked)) {
      // a number alone was the interval of this session, before the interval became a setting: it changes nothing now
      if (isWhole(asked)) return { text: `nothing changed: add a unit, like 30m · interval: /cachebeat global ${minutesOf(asked)}` }
      const keep = parseDuration(asked)
      if (keep === undefined) return { text: `nothing changed: /cachebeat takes a time from 5m to 48h with its unit, like 30m, 2h or 1h30m, not "${rest.join(' ')}".` }
      return { text: `this session: ${await turnOn($, undefined, keep)}` }
    }
    if (words.length) return { text: USAGE }
    // the pane opens on Status, and the line is the answer all the same: the transcript keeps it, and so do a remote client, a -p
    // run and the toast of a command typed mid-turn. Mid-turn the pane stays shut: it holds toasts, and the line is the feedback.
    // Nor does one open for a command that isn't the person's at this terminal (a Remote Control client, a -p run): no one is at its keys
    if (!busy && e.origin.kind === 'composer') await openSettings($, 'summary')
    // the cache as it stands, on or off: what a message sent now would find
    const view = await cacheNow($)
    const cache = view.state === 'warm' ? ` · cache warm, ${fmt(view.expiresAt! - view.at)} left` : view.state === 'cold' ? ` · cache cold for ${fmt(view.coldFor!)}` : ''
    if (!s.enabled) return { text: `off${cache}` }
    const now = await $.clock.now()
    const at = s.nextAt
    const ms = at === null ? undefined : Math.max(0, at - now)
    const from = intervalFrom()
    const source = from === 'all folders' ? '' : ` (this ${from}'s)`
    const left = s.keepUntil === null ? '' : ` · ${keepLeft(s.keepUntil, now)}`
    const upcoming = s.keepUntil !== null && s.keepUntil <= now ? '' : ` · ${when(ms)}` // past the time, no beat is coming
    return { text: `on, ${every()}${source}${left} · ${s.beats} beat${s.beats === 1 ? '' : 's'}${upcoming}${cache}` }
  })

  // a loop's first read is answered whole whatever it names: Claude holds nothing of cachebeat's state until it has read it
  on('tool.call', { tool: 'mcp__cachebeat__state' }, async ($, e) => {
    const only = parseOnly(e.only)
    if ('error' in only) return { deny: only.error }
    const loop = e.agentId ?? 'main'
    const isFirst = !fullReads.has(loop)
    fullReads.add(loop)
    const answer = await stateOf($, isFirst ? [] : only, e.agentId !== undefined)
    return { result: json(isFirst && only.length ? { whole: 'your first read in this conversation', ...answer } : answer) }
  })

  on('tool.call', { tool: 'mcp__cachebeat__set' }, async ($, e) => {
    if (e.agentId) return { deny: 'Only the main conversation changes cachebeat.' }
    const change = parseSet({ session: e.session, settings: e.settings, folder: e.folder })
    if ('error' in change) return { deny: change.error }
    await syncSettings($)
    const before: Before = { enabled: s.enabled, keepUntil: s.keepUntil, guard: s.guard, settings: global, own }
    const hasPatch = Object.keys(change.patch).length > 0
    if (hasPatch || change.folder !== undefined) {
      await changeSettings($, {
        global: hasPatch ? change.patch : undefined,
        own: change.folder?.own, drop: change.folder === null ? 'all' : change.folder?.drop,
      })
    }
    const now = await $.clock.now()
    if (change.enabled !== undefined) s.enabled = change.enabled
    if (change.keepAliveMinutes !== undefined) s.keepUntil = change.keepAliveMinutes === null ? null : now + change.keepAliveMinutes * MIN
    if (change.coldGuard !== undefined) s.guard = change.coldGuard
    // always: setSettings reschedules only while on, and this is what cancels a beat when turned off
    await schedule($)
    return { result: json(await answerSet($, before, change)) }
  })

  // a call is one dim line in the transcript, and its answer, for the model alone, is not drawn
  on('ui.render', { component: 'ToolUse', props: { tool: 'mcp__cachebeat__state' } }, async ($, e, next) => {
    if (e.props.isErrored) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{`cachebeat · ${readSummary((e.props.input as { only?: unknown } | undefined)?.only)}`}</Text>
  })

  on('ui.render', { component: 'ToolUse', props: { tool: 'mcp__cachebeat__set' } }, async ($, e, next) => {
    const change = parseSet((e.props.input ?? {}) as { session?: unknown; settings?: unknown; folder?: unknown })
    if (e.props.isErrored || 'error' in change) return next(e)
    const { Text } = $.ui.resolve(e)
    const { root: path } = await read($, folderAtom)
    return <Text dimColor>{`cachebeat · ${summary(change, await read($, settingsAtom), cut(path, PATH))}`}</Text>
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
      } else if (s.enabled) tell($, "the next beat writes the new model's cache")
    }
    return r
  })

  // a compaction replaces the conversation, so the prefix a beat would warm is gone; the next turn
  // caches the new one. One within a turn needs nothing: the turn's next request starts the count from when it's sent
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    const stands = e.trigger !== 'precompute' && r.skip === undefined
    const isDone = e.agentId === undefined && stands
    if (stands && e.agentId !== undefined) fullReads.delete(e.agentId) // the subagent's own conversation is replaced: what it read of the state is gone
    if (isDone) {
      s.turns = 0 // a conversation anew: its next turn sends it as a first one
      s.compactions++
      s.lastCompactAt = await $.clock.now()
      fullReads.clear() // the conversation Claude read cachebeat's state in is gone
      await save($)
    }
    if (isDone && !busy && s.lastWarm !== null) await pause($, 'compaction replaced the conversation', 'compaction replaced the conversation')
    return r
  })

  on('turn.start', async ($, e, next) => {
    // a fork's own turn, on an engine that raises one, carries the beat's line: a user's message sent while a beat
    // is on its way is a turn all the same
    if (!(beating && (e.text === ASK || e.text === ASK_MID_TURN))) {
      busy = true
      turnId = e.turnId
      stepping = true // its first request goes out next
      isFirstStep = true
      isTurnWarmed = false // a turn.complete skipped (one ending while a beat runs, after a reload) left it set
      // /rewind runs between turns: a read of cachebeat's state made in the turns it took back went with them
      if (s.tail !== null && await isRewound($, s.tail)) fullReads.clear()
      s.asked = await $.clock.now()
      s.row = null // the line moves to this turn's row once it ends
      await schedule($)
    }
    return next(e)
  })

  // each request of the main conversation's turn reads the cache, so the count starts again from when it was sent,
  // once its answer shows it read or wrote the cache; a turn that then goes quiet for the whole interval (a long tool
  // run, a permission prompt left waiting) gets a beat
  on('turn.step', async function* ($, e, next) {
    const isMain = busy && e.agentId === undefined && e.turnId === turnId
    let sentAt = 0
    if (isMain) {
      stepping = true
      await schedule($)
      sentAt = await $.clock.now() // the cache's lifetime runs from the request's start, not the end of its answer
    }
    const r = yield* next(e)
    if (isMain) {
      stepping = false
      if (r.usage) {
        const { cache_read_input_tokens: got, cache_creation_input_tokens: wrote } = r.usage
        // reading well short of what the last request cached (a few tokens short is usual: 44,964 of 44,989), it
        // sent the conversation anew (as a session's second turn can) and cached it through this turn's message. A
        // beat re-sends it short of that message, so it would write it all again: beats wait for the turn's next
        // request, or its end
        resent = got + MISSED < cached
        const wasCached = cached
        cached = got + wrote
        await markWarm($, sentAt)
        isTurnWarmed = true
        if (isFirstStep) await countKept($, e.model, got, wasCached, sentAt)
        isFirstStep = false
      }
      await schedule($)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    // the turn's own end, by its id, even while a beat runs within it; a fork's end, if one is raised, is not it
    if (e.agentId === undefined && (!beating || (busy && e.turnId === turnId))) {
      busy = false
      stepping = false
      resent = false // after the turn, a beat reaches what its last request cached
      rowPending = true
      const now = await $.clock.now()
      s.lastReal = now
      // a turn that sent no request (interrupted before one, refused by the API) warmed nothing. Its requests stamped
      // the cache when each was sent, and its end moves nothing later; one whose requests cachebeat didn't see (begun
      // before it loaded) counts from the turn's start, the earliest its last request can have been sent
      if (e.usage) {
        if (!isTurnWarmed) await markWarm($, now - e.durationMs)
        s.tail = await tailOf($)
        s.turns++
      }
      isTurnWarmed = false
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
    if (e.surface === 'desktop' || p === 'hidden') return next(e)
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
    if (!isStatusOnBand || !line || e.props.hasSurvey) return next(e)
    const p = await read($, pulse)
    if (p === 'armed' && c.lineAnimate) animateLine($)
    const f = c.lineAnimate ? await read($, lineFrameAtom) : 0
    const { Box, Text } = $.ui.resolve(e)
    // the band is shared: what the other mods and the engine draw on it stays, the line after it
    const below = await next(e)
    const band = (line: RenderElement) => (
      <Box flexDirection="column">
        {below}
        {line}
      </Box>
    )
    // the band's font is proportional: the heart's frames differ in width, so it gets a box of its own
    // and the words after it never move
    const { head, rest, width } = liveLine(line, c, p, f)
    // one glyph keeps its width as it beats: the line is one run of text, spaced as written
    if (width <= 1) return band(<Box>{paint(Text, joined([...head, ...rest]))}</Box>)
    // a wider animation, on this proportional font, would change width from frame to frame and carry
    // the words after it along: each of its characters gets a cell of its own, centered in it, as the
    // terminal's grid has them, so it is as wide as its frames' cells. A cell's margin, not the space,
    // keeps the words off it: that space would collapse at the next box's start, as in HTML
    if (rest[0]) rest[0] = { ...rest[0], text: rest[0].text.replace(/^ /, '') }
    const slots = head.flatMap(sp => glyphs(sp.text).map(ch => ({ ...sp, text: ch })))
    const widths = slotWidths(variant(c.statusHeart)) // a heart's slot is wider, wherever any frame has one
    return band(
      <Box flexDirection="row">
        <Box flexDirection="row" flexShrink={0} marginLeft={1} marginRight={1}>
          {slots.map((sp, i) => (
            <Box width={widths[i] ?? 1} flexShrink={0} justifyContent="center">
              {paint(Text, [{ ...sp, text: slotText(sp.text, widths[i] ?? 1) }])}
            </Box>
          ))}
        </Box>
        {paint(Text, rest)}
      </Box>,
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const c = await read($, settingsAtom)
    const page = await read($, pageAtom)
    const tick = await read($, tickAtom)
    const focus = await read($, focusAtom)
    const place = await read($, folderAtom)
    const now = await $.clock.now()
    await read($, pulse) // redraws "This session" as it turns on or off
    // the preview's clock runs only while there is a preview to move
    const picked = page.picker ? rowOf(page.picker) : undefined
    const isMoving = picked ? picked.row.key === 'variant' || !!picked.tab.preview : !!TABS.find(t => t.id === page.tab)?.preview
    // at the speed of the part on show: the turn line's on its tab, the heart's elsewhere
    const part = (picked?.tab.id ?? page.tab) === 'status' ? 'line' : 'heart'
    // the Status tab reads the session as it is now, and nothing else redraws it while beats wait or are off: one redraw a step
    const status = page.tab === 'summary' ? await factsOf($) : null
    const stats = page.tab === 'stats' ? await statsFacts($) : null
    const wanted = !isPaneOpen ? 0 : isMoving ? frameMs(lookOf(c, part)) : status || stats ? STEP : 0
    if (wanted !== paneEvery) {
      stopPaneTicker()
      if (wanted) paneTicker = $.clock.every(wanted, () => void update($, tickAtom, () => ++paneTick))
      paneEvery = wanted
    }
    const els = $.ui.resolve(e)
    paneSurface = e.surface
    const { Text } = els // every surface has it: taken before the check, which may narrow `els` to never
    // a read-only page needs no input: Status draws where the settings can't be changed
    if (!('Input' in els) && !READ_ONLY.some(p => p.id === page.tab)) return <Text>Open cachebeat's settings in the terminal.</Text>
    // the menu shows the settings it saves to: this folder's own over all folders', or all folders'
    const shownSettings = editsFolder ? c : global
    const to: Target = editsFolder ? 'folder' : 'global'
    const where = cut(place.root, PATH)
    const view = {
      page, tick, focus, columns: e.props.bodyColumns, status, stats, isOn: s.enabled, keepUntil: s.keepUntil === null ? null : clockText(s.keepUntil, now), guard: s.guard,
      autoMinutes: AUTO[s.isCacheShort ? '5m' : ttl], notice, isResetArmed, isTerminal: e.surface === 'terminal', customs,
      own: place.own, path: where, editsFolder, allFolders: global,
    }
    const { tree, ring: walk } = settingsPane(els as never, shownSettings, view, {
      set: patch => void setSettings($, patch, to),
      // a press on a tab (Enter, 1-6, a click) shows it and goes into its settings
      tab: id => void goTo($, { tab: id, picker: null }, firstOf(id, shownSettings)),
      at: key => void focusOn($, key),
      open: key => {
        // the focus starts on the value set: one of the choices, or the custom field
        const { row } = rowOf(key)!
        const i = row.values.indexOf(shownSettings[key])
        void goTo($, { ...page, picker: key }, i >= 0 ? `opt:${i}` : row.custom ? 'custom' : 'opt:0', true)
      },
      pick: (key, value) => void setSettings($, { [key]: value }, to).then(() => (say($, ''), goTo($, { ...page, picker: null }, `row:${key}`))),
      refuse: text => say($, text),
      resetRow: key => {
        if (!editsFolder) return void setSettings($, { [key]: DEFAULTS[key] }, 'global').then(() => say($, `${label(key)} back to its default`))
        void changeSettings($, { drop: [key] }).then(() => say($, `${label(key)} follows all folders again`))
      },
      dropGuard: () => {
        s.guard = null
        void save($).then(() => say($, 'Cold guard follows the settings again in this session'))
      },
      dropKeep: () => {
        s.keepUntil = null
        void schedule($).then(() => say($, 'this session beats with no time limit'))
      },
      toggleFolder: () => {
        editsFolder = !editsFolder
        say($, `menu changes now save for ${editsFolder ? `${where} only` : 'all folders'}`)
      },
      back: () => void goTo($, { ...page, picker: null }, `row:${page.picker}`),
      toggleSession: () => void (s.enabled ? stop($) : turnOn($)).then(t => say($, `this session: ${t}`)),
      beatNow: () => void beatNow($).then(t => say($, t)),
      reset: () => {
        if (!isResetArmed) {
          isResetArmed = true
          return say($, '')
        }
        isResetArmed = false
        if (editsFolder) return void changeSettings($, { drop: 'all' }).then(() => say($, `${where}'s own settings dropped: it follows all folders`))
        void changeSettings($, { global: DEFAULTS }).then(() => say($, 'settings reset to the defaults'))
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
        const at = PAGES.findIndex(t => `tab:${t.id}` === from)
        const end = !isToTab && at === PAGES.length - 1 ? PAGES[0] : !isToTab && at === 0 ? PAGES.at(-1) : undefined
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
      const t = tabBeside(focus, e.by)
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
      await $.ui.open({ id: PANE, title: 'cachebeat', focus: true, closeOnEscape: true, holdToasts: true, rows: 24 })
      await goTo($, { ...page, picker: null }, page.picker ? `row:${page.picker}` : `tab:${page.tab}`, true)
      return { value: undefined }
    }
    isPaneOpen = false
    stopPaneTicker()
    return next(e)
  })
}
