// The tools Claude calls to read and change cachebeat: their specs, drawn from the pane's rows so a
// range is written once, and the reading of a `set` call's input.
import type { ToolSpec } from 'claude-code'
import type { BeatSettings } from '../types'
import { shown } from './pane'
import type { Reader, Value } from './settings'
import { AUTO, DEFAULTS, HEX_KEYS, accept, isObject, minutesText, parseDuration, rowOf } from './settings'

/** Each setting, for the model; the unit and range are added from its reader. */
const ABOUT: Record<keyof BeatSettings, string> = {
  defaultOn: 'New sessions start beating; open sessions keep theirs.',
  interval:
    `Minutes idle before a beat; auto beats at ${AUTO['1h']} on a one-hour cache and ${AUTO['5m']} on a five-minute one, reading which the session has (state's cache.ttl).`,
  stopAfterHours: 'Beating stops after this long without a message from the user. A session with a keep-alive time (session.keepAliveMinutes) keeps to that instead.',
  stopAtUsage: 'Beating stops once any usage limit reaches this.',
  onCold: "If the cache goes cold before a beat reaches it (the computer slept, or retries ran past its lifetime): wait, and beat again after the user's next message, or stop beating.",
  skipSmall: 'Skips beating chats smaller than skipSmallTokens.',
  skipSmallTokens: "The smallest chat kept warm while skipSmall is on; setting it doesn't turn skipSmall on.",
  coldGuard: "Asks the user before their message is sent to a session whose cache has gone cold, saying how long it's been cold and the tokens sending caches again. Only messages typed at the terminal are asked about; a session can override it (session.coldGuard).",
  coldGuardTokens: 'The smallest chat the cold guard asks about, in tokens.',
  coldGuardUnanswered: "A cold guard question left unanswered: drop, the message isn't sent (the question closes after 5 minutes), or minutes after which it is sent. While it is open, other incoming messages wait for it.",
  heartPlacement: 'The prompt heart: tail, at the end of the hint line, always dim; line, on its own line, in color. Terminal only.',
  variant: "The prompt heart's animation. Terminal only.",
  showCount: 'Shows the beat count beside the prompt heart. Terminal only.',
  heartColor: 'The prompt heart\'s color when it has its own line: dim, a theme color, a preset, or custom (heartHex).',
  heartHex: "The prompt heart's color when heartColor is custom; setting it doesn't set heartColor to custom.",
  heartAnimate: 'Animates the prompt heart.',
  heartEffect: 'The prompt heart on its own line: steady; flash on each beat; flow, a shimmer sweeping across; mixed switches between them.',
  heartSpeed: "The prompt heart's animation speed: a name, or a frame time.",
  heartTiming: 'The prompt heart: lubdub beats twice, then rests; linear plays evenly.',
  statusLine: 'The turn line, under the latest turn: spaced (after a blank line), below (right under it), or off. On desktop it sits above the prompt.',
  showCountdown: 'Shows the time to the next beat, and the time left on a keep-alive time, in the turn line.',
  showTokens: 'Shows the tokens the last beat kept warm in the turn line.',
  statusHeart: "What the heart starting the turn line plays: beat (one heart, filling in time), off (still), or one of the prompt heart's animations.",
  lineColor: 'The turn line\'s color: dim, a theme color, a preset, or custom (lineHex).',
  lineHex: "The turn line's color when lineColor is custom; setting it doesn't set lineColor to custom.",
  lineAnimate: "Animates the turn line's heart and effect.",
  lineEffect: 'The turn line: steady; flash on each beat; flow, a shimmer sweeping across; mixed switches between them.',
  lineSpeed: "The turn line's animation speed: a name, or a frame time.",
  lineTiming: "The turn line's heart: lubdub beats twice, then rests; linear plays evenly.",
  onBeat: 'How a beat is announced: a transcript line (log), a toast, both, or none.',
  onStop: 'How beating stopping on its own is announced.',
  onModelSwitch: "After /model while idle: wait for the user's next turn, or have the next beat write the new model's cache (a full cache write, the one that turn would make).",
}

const KEYS = Object.keys(ABOUT) as (keyof BeatSettings)[]
const range = (r: Reader) => `${r.min}–${r.max} ${r.unit}`
const names = (values: readonly Value[]) => values.filter(v => typeof v === 'string')

/** What a setting takes, as schemas: on/off, its named choices, or a number in its reader's range, with or beside names. */
function kinds(key: keyof BeatSettings): Record<string, unknown>[] {
  if (HEX_KEYS.includes(key)) return [{ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }]
  const { row } = rowOf(key)!
  if (typeof row.values[0] === 'boolean') return [{ type: 'boolean' }]
  if (!row.custom) return [{ enum: [...row.values] }]
  const r = row.custom.parse
  const named = names(row.values)
  return [...(named.length ? [{ enum: named }] : []), { type: 'number', minimum: r.min, maximum: r.max }]
}

/** A setting's schema: what it takes, or null to reset it. */
function field(key: keyof BeatSettings): Record<string, unknown> {
  const r = HEX_KEYS.includes(key) ? undefined : rowOf(key)!.row.custom?.parse
  return { anyOf: [...kinds(key), { type: 'null' }], description: r ? `${ABOUT[key]} (${range(r)})` : ABOUT[key] }
}

/** The same as `field`, without the description: `folder` repeats every setting `settings` has, and its own text says so. */
const bare = (key: keyof BeatSettings) => ({ anyOf: [...kinds(key), { type: 'null' }] })

/** What a setting takes, each choice in words, for a refusal. */
function takes(key: keyof BeatSettings): string[] {
  if (HEX_KEYS.includes(key)) return ['a hex color (#rrggbb)']
  const { row } = rowOf(key)!
  if (typeof row.values[0] === 'boolean') return ['true', 'false']
  if (!row.custom) return row.values.map(String)
  return [...names(row.values), range(row.custom.parse)]
}

/** `a, b, or c`; `a or b`. */
const either = (choices: string[]) =>
  choices.length < 3 ? choices.join(' or ') : `${choices.slice(0, -1).join(', ')}, or ${choices.at(-1)}`

const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, additionalProperties: false })

/** What `state`'s `only` names. */
export const SECTIONS = ['context', 'cache', 'session', 'settings'] as const
export type Section = (typeof SECTIONS)[number]

export const STATE: ToolSpec = {
  name: 'state',
  description: [
    "Reads cachebeat in this session, and this conversation's context: how full the context window is and when it compacts, whether the prompt cache is likely still warm and for how long, what the next message would write to the cache again, this session's beating, and cachebeat's settings.",
    [
      '`only` names the sections to read: `context`, `cache`, `session`, `settings`. Name the ones you need; leave it out for all of them. A first read, and the first after a compaction or rewind, is answered whole whatever you name (`whole` says why). Settings can change outside this conversation (the menu, another session), so read `settings` again before you quote one.',
      "`context` is the main conversation's, also when a subagent asks (`of` says so then). `tokens`, `window` and `percent` are Claude Code's own figures, the status line's: the input of the last finished response against the model's window, so mid-turn they miss what the turn has added since; null when Claude Code has none. `autoCompactAt` is the token count at which Claude Code compacts on its own, null when that is off. `compactions` is the compactions cachebeat has seen in this conversation, with `lastCompactionMinutesAgo`. `lastMessageMinutesAgo` is the time since the current turn began (between turns, since the last turn ended).",
      "`cache` is whether this session's prompt cache is likely still warm, judged by the time since it was last read against its lifetime, as Claude Code judges it; only the next request confirms it. `state` is warm, cold, or unknown when no time of its last read is known; `ttl` is the lifetime, `1h` or `5m`, worked out on each call; then `lastReadMinutesAgo`, `minutesLeft` or `coldForMinutes`, and `contextTokens`: what the next message writes to the cache again if it is cold, the last request and its reply. `recacheInputTokens` is that written again at the model's cache-write price, in input-token equivalents.",
      "`session`: `nextBeat` is `in 42m` (mid-turn too: counted from when the turn's last request was sent), `due now`, `50m after the request on its way was sent`, `after this turn`, `after the next turn` (nothing cached yet), `none needed` (a keep-alive time is set and the cache outlasts it), or null when off or skipping. `intervalMinutes` is the beat interval in effect, read-only: `set` changes it through `settings.interval` or `folder.interval`, and `intervalFrom` says which it follows (`folder`, `all folders`, or `auto`). `keepAliveUntil` (UTC), `keepAliveUntilLocal` (the user's clock: tell the user this one) and `keepAliveMinutesLeft` are set while the session has a keep-alive time. `skipping` says why beats skip this chat. `paused` says why beats wait for the user's next turn; only that turn ends it. A beat re-sends the conversation as last sent, with one line tagged `[cachebeat]`; it reads the cached conversation (`lastBeatReadTokens`) and writes only what wasn't cached (`lastBeatWrittenTokens`), both null before the first beat. `coldGuard` is whether the cold guard asks in this session, and `coldGuardFrom` whether that is the session's own (`session`, set by `/cachebeat guard on|off` or `session.coldGuard`) or the settings'; `coldGuardAsked` is the messages it asked about, and `coldSends` and `coldSendTokens` the messages sent on a cold cache and the tokens they cached again, each since this conversation was opened in this session. `usageLimits` are the subscription's usage windows: `kind`, `percentUsed` and `resetsAt` (UTC, absent when unknown: tell the user it in their own time); empty off a subscription or before the first reading.",
      "`settings`: the values in effect here, this folder's own over those for all folders. `folder` is this session's folder (`path`) and the settings it has of its own (`own`); `allFolders`, present while it has any, has the settings for all folders; `defaults` has the default of each setting that differs from it.",
    ].join('\n\n'),
  ].join('\n\n'),
  inputSchema: object({
    only: { type: 'array', items: { enum: [...SECTIONS] } },
  }),
}

/** A `state` call's `only`, as read: the sections named, or none for all of them, or the refusal. */
export function parseOnly(only: unknown): Section[] | { error: string } {
  if (only === undefined) return []
  const want = `only takes ${either([...SECTIONS])}`
  if (!Array.isArray(only)) return { error: `nothing read: ${want}, in a list, not ${JSON.stringify(only)}` }
  const bad = only.filter(n => !SECTIONS.includes(n as Section))
  if (bad.length) return { error: `nothing read: ${want}, not ${either(bad.map(n => JSON.stringify(n)))}` }
  return SECTIONS.filter(n => only.includes(n))
}

/** A `state` call in one line, as the transcript shows it: what it read, or `the state` for all of it. */
export const readSummary = (only: unknown) => {
  const named = parseOnly(only)
  return `read ${'error' in named || !named.length ? 'the state' : named.join(', ')}`
}

export const SET: ToolSpec = {
  name: 'set',
  description: [
    "Changes cachebeat, which keeps this session's prompt cache warm while it sits idle by sending a small background request, a beat, shortly before the cache would go cold. Change only what the user asks for.",
    '`session` is this session alone. `settings` is saved for all folders and used by every session, open ones included: `settings.interval` is the beat interval, the minutes idle before a beat (or auto), and `settings.defaultOn` whether new sessions start on (open sessions keep theirs). `folder` is saved for this session\'s folder alone (state\'s `folder.path`), takes any setting, and wins over `settings` there; `null` for one setting drops it, so it follows all folders again, and `folder: null` drops every one. In `settings`, `null` puts a setting back to its default. When you change a setting, say where it applies: all folders, or this folder by its path, since a subfolder or another worktree has settings of its own.',
    'A request that names no scope ("turn it on", "keep it warm for 2 hours") is for this session. "In this repo", "in this folder", "here" or "for this project" mean `folder`. "Default", "new sessions", "every session", "everywhere", "always" or "from now on" mean `settings`. The beat interval has no session scope: "beat every 20 minutes" is `settings.interval`, or `folder.interval` when the user says this repo or folder. If you can\'t tell which the user means, ask. A change to `settings` doesn\'t reach a setting this folder has its own of: the answer lists those under `shadowed`, and you tell the user.',
    "Each beat counts toward the user's usage. The first time in a conversation a change starts beating or changes how often a beating session beats, say so once.",
    '`session.keepAliveMinutes` keeps the cache warm for that long from now, then turns this session off: a fixed deadline that messages in between don\'t extend. It turns beating on too, so it can\'t come with `enabled: false`; null drops the time, and the session keeps beating with no limit. While a keep-alive time is set, `stopAfterHours` doesn\'t apply; a usage limit or an API error still stops it. It is not the beat interval, which is `settings.interval`.',
    'Nothing changes if any value is invalid, and the refusal names each one. No `state` read is needed first. Subagents can read `state` but not call this. Returns what changed, this session\'s state, the changed settings (for all folders, and for this folder with its `path`, which you name to the user), and `shadowed`.',
  ].join('\n\n'),
  inputSchema: object({
    session: object({
      enabled: { type: 'boolean', description: 'Beat in this session.' },
      keepAliveMinutes: {
        anyOf: [{ type: 'number', minimum: parseDuration.min, maximum: parseDuration.max }, { type: 'null' }],
        description: `Keeps the cache warm for this many minutes from now, then turns this session off; turns beating on. null drops the time. (${range(parseDuration)})`,
      },
      coldGuard: {
        anyOf: [{ type: 'boolean' }, { type: 'null' }],
        description: "The cold guard for this session alone, over settings.coldGuard; null follows the setting again.",
      },
    }),
    settings: object(Object.fromEntries(KEYS.map(k => [k, field(k)]))),
    folder: {
      anyOf: [object(Object.fromEntries(KEYS.map(k => [k, bare(k)]))), { type: 'null' }],
      description: "This folder's own settings, as `settings` takes them; a setting's null drops it, so it follows all folders, and null for the whole drops every one.",
    },
  }),
}

/**
 * A `set` call's input, as read: this session's switch and keep-alive time (null drops it), the
 * settings to save for all folders, and this folder's own to save and drop (null drops every one).
 */
export type SetChange = {
  enabled?: boolean; keepAliveMinutes?: number | null; coldGuard?: boolean | null; patch: Partial<BeatSettings>
  folder?: { own: Partial<BeatSettings>; drop: (keyof BeatSettings)[] } | null
}

/** Reads a `set` call's input whole, or says every value it refuses. */
export function parseSet(input: { session?: unknown; settings?: unknown; folder?: unknown }): SetChange | { error: string } {
  const change: SetChange = { patch: {} }
  const bad: string[] = []
  const said = (v: unknown) => JSON.stringify(v)
  for (const part of ['session', 'settings'] as const) {
    if (input[part] !== undefined && !isObject(input[part])) bad.push(`${part} is an object, not ${said(input[part])}`)
  }
  if (input.folder !== undefined && input.folder !== null && !isObject(input.folder)) bad.push(`folder is an object or null, not ${said(input.folder)}`)
  const session = isObject(input.session) ? input.session : {}
  const settings = isObject(input.settings) ? input.settings : {}
  for (const [k, v] of Object.entries(session)) {
    if (k === 'enabled') {
      if (typeof v === 'boolean') change.enabled = v
      else bad.push(`session.enabled takes true or false, not ${said(v)}`)
    } else if (k === 'keepAliveMinutes') {
      const m = v === null ? null : typeof v === 'number' ? (v >= parseDuration.min && v <= parseDuration.max ? Math.round(v) : undefined) : typeof v === 'string' ? parseDuration(v) : undefined
      if (m !== undefined) change.keepAliveMinutes = m
      else bad.push(`session.keepAliveMinutes takes ${range(parseDuration)} or null, not ${said(v)}`)
    } else if (k === 'coldGuard') {
      if (typeof v === 'boolean' || v === null) change.coldGuard = v
      else bad.push(`session.coldGuard takes true, false or null, not ${said(v)}`)
    } else if (k === 'intervalMinutes') {
      // a session still holding the schema from before the interval became a setting
      bad.push('session has no intervalMinutes: the beat interval is settings.interval (or folder.interval), and session.keepAliveMinutes keeps the cache warm for that long')
    } else bad.push(`session has no ${k}`)
  }
  for (const [k, v] of Object.entries(settings)) {
    if (!(k in ABOUT)) {
      bad.push(`settings has no ${k}`)
      continue
    }
    const key = k as keyof BeatSettings
    const value = v === null ? DEFAULTS[key] : accept(key, v)
    if (value === undefined) bad.push(`settings.${key} takes ${either([...takes(key), 'null'])}, not ${said(v)}`)
    else change.patch = { ...change.patch, [key]: value }
  }
  if (input.folder === null) change.folder = null
  else if (isObject(input.folder)) {
    const folder: NonNullable<SetChange['folder']> = { own: {}, drop: [] }
    for (const [k, v] of Object.entries(input.folder)) {
      if (!(k in ABOUT)) {
        bad.push(`folder has no ${k}`)
        continue
      }
      const key = k as keyof BeatSettings
      const value = v === null ? null : accept(key, v)
      if (value === undefined) bad.push(`folder.${key} takes ${either([...takes(key), 'null'])}, not ${said(v)}`)
      else if (value === null) folder.drop.push(key)
      else folder.own = { ...folder.own, [key]: value }
    }
    change.folder = folder
  }
  // a keep-alive time is asked for to beat through, as `/cachebeat 2h` takes it
  if (typeof change.keepAliveMinutes === 'number') {
    if (change.enabled === false) bad.push('session.keepAliveMinutes keeps this session beating for that long, so it can\'t come with enabled: false')
    change.enabled ??= true
  }
  return bad.length ? { error: `nothing changed: ${bad.join('; ')}` } : change
}

/** A setting's name as the pane labels it, or as it reads out of its tab. */
export function label(key: keyof BeatSettings) {
  if (HEX_KEYS.includes(key)) return key === 'heartHex' ? 'Prompt heart color' : 'Turn line color'
  const { row } = rowOf(key)!
  return row.name ?? row.label.trim()
}

/**
 * A `set` call in one line, as the transcript shows it, `path` naming this folder:
 * `this session on, every 20m · all folders: Beat after idle 30m · this folder (…/api): New sessions start on`.
 */
export function summary(change: SetChange, s: BeatSettings, path: string) {
  const here = [
    change.keepAliveMinutes ? `on for ${minutesText(change.keepAliveMinutes)}` : change.enabled !== undefined && (change.enabled ? 'on' : 'off'),
    change.keepAliveMinutes === null && 'without a time limit',
    change.coldGuard !== undefined && (change.coldGuard === null ? 'Cold guard as settings' : `Cold guard ${change.coldGuard ? 'on' : 'off'}`),
  ].filter(Boolean)
  const each = (patch: Partial<BeatSettings>) => (Object.entries(patch) as [keyof BeatSettings, Value][]).map(([key, v]) =>
    `${label(key)} ${HEX_KEYS.includes(key) ? v : shown(rowOf(key)!.row, v, s)}`,
  )
  const saved = each(change.patch)
  const own = change.folder ? [...each(change.folder.own), ...change.folder.drop.map(k => `${label(k)} as all folders`)] : []
  return [
    here.length ? `this session ${here.join(', ')}` : '',
    saved.length ? `all folders: ${saved.join(', ')}` : '',
    change.folder === null ? `this folder (${path}) follows all folders again` : own.length ? `this folder (${path}): ${own.join(', ')}` : '',
  ].filter(Boolean).join(' · ') || 'no change'
}
