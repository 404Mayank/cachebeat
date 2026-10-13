// The tools Claude calls to read and change cachebeat: their specs, drawn from the pane's rows so a
// range is written once, and the reading of a `set` call's input.
import type { ToolSpec } from 'claude-code'
import type { BeatSettings } from '../types'
import { shown } from './pane'
import type { Reader, Value } from './settings'
import { AUTO, DEFAULTS, HEX_KEYS, accept, isObject, parseMinutes, rowOf } from './settings'

/** Each setting, for the model; the unit and range are added from its reader. */
const ABOUT: Record<keyof BeatSettings, string> = {
  defaultOn: 'New sessions start beating; open sessions keep theirs.',
  interval:
    `Minutes idle before a beat, for sessions without their own; auto beats at ${AUTO['1h']} on a one-hour cache and ${AUTO['5m']} on a five-minute one, reading which the session has (state's cacheTtl).`,
  stopAfterHours: 'Beating stops after this long without a message from the user.',
  stopAtUsage: 'Beating stops once any usage limit reaches this.',
  skipSmall: 'Skips beating chats smaller than skipSmallTokens.',
  skipSmallTokens: "The smallest chat kept warm while skipSmall is on; setting it doesn't turn skipSmall on.",
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
  showCountdown: 'Shows the time to the next beat in the turn line.',
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

export const STATE: ToolSpec = {
  name: 'state',
  description: [
    "cachebeat's state in this session, every setting as it applies here, and this folder's own settings.",
    [
      '`settings` are the values in effect in this session: this folder\'s own over those for all folders. `folder` is this session\'s folder (`path`) and the settings it has of its own (`own`). `allFolders`, shown while the folder has any of its own, has the settings for all folders.',
      "`nextBeat` is `in 42m` (mid-turn too: counted from the end of the turn's last request, for a turn that goes quiet), `50m after the request on its way` (a request of the turn is being answered), `after this turn` (a turn whose beats wait for its end), `after the next turn` (nothing cached to keep warm yet), or null when off or skipping.",
      '`intervalFrom` is `session` when this session has its own interval, `folder` when it follows this folder\'s own, `all folders` when it follows the interval for all folders in minutes, and `auto` when that is auto.',
      "`cacheTtl` is how long this session's cache lives, `1h` or `5m`, worked out on each call from Claude Code's cache settings and whether a subscription is within its usage; an auto interval beats within it (50 or 4 minutes).",
      '`skipping`, when set, says why beats skip this chat (under the skipSmallTokens minimum).',
      "`paused`, when set, says why beats wait for the user's next turn (a model switch, a compaction); only that turn ends it, not `set`.",
      'A beat re-sends the conversation as this session last sent it, with one short line tagged `[cachebeat]` asking for a one-character reply, which is thrown away. It reads the cached conversation (`lastBeatReadTokens`, the last beat\'s) and writes only what wasn\'t cached (`lastBeatWrittenTokens`), usually a few tokens; both are null before the first beat. `defaults` has the default of each setting that differs from it.',
    ].join(' '),
  ].join('\n\n'),
  inputSchema: object({}),
}

export const SET: ToolSpec = {
  name: 'set',
  description: [
    "Changes cachebeat, which keeps this session's prompt cache warm while it sits idle by sending a small background request, a beat, shortly before the cache would expire. Change only what the user asks for.",
    '`session` is this session alone. `settings` is saved for all folders and used by every session, open ones included: `settings.interval` is the default interval, `settings.defaultOn` whether new sessions start on (open sessions keep theirs). `folder` is saved for this session\'s folder alone (state\'s `folder.path`), takes any setting, and wins over `settings` there; `null` for one setting drops it, so it follows all folders again, and `folder: null` drops every one. In `settings`, `null` puts a setting back to its default. When you change a setting, say where it applies: all folders, or this folder by its path, since a subfolder or another worktree has settings of its own.',
    'A request that names no scope ("turn it on", "beat every 20 minutes") is for this session. "In this repo", "in this folder", "here" or "for this project" mean `folder`. "Default", "new sessions", "every session", "everywhere", "always" or "from now on" mean `settings`. If you can\'t tell which the user means, ask. A change to `settings` doesn\'t reach a setting this folder has its own of (`state`\'s `folder.own`): tell the user.',
    "Each beat counts toward the user's usage. The first time in a conversation a change starts beating or changes how often a beating session beats, say so once.",
    'Setting `intervalMinutes` turns beating on too, unless `enabled: false` comes with it. Saving an interval in `settings` or `folder` drops this session\'s own, so it beats at the saved one, unless `intervalMinutes` comes with it; `intervalMinutes: null` alone makes it follow the settings.',
    'Nothing changes if any value is invalid, and the refusal names each one. Subagents can read `state` but not call this. Returns what changed, this session\'s state, and the changed settings: for all folders, and for this folder with its `path`, which you name to the user.',
  ].join('\n\n'),
  inputSchema: object({
    session: object({
      enabled: { type: 'boolean', description: 'Beat in this session.' },
      intervalMinutes: {
        anyOf: [{ type: 'number', minimum: parseMinutes.min, maximum: parseMinutes.max }, { type: 'null' }],
        description: `This session's interval in minutes, which turns beating on; null follows settings.interval, auto included. (${range(parseMinutes)})`,
      },
    }),
    settings: object(Object.fromEntries(KEYS.map(k => [k, field(k)]))),
    folder: {
      anyOf: [object(Object.fromEntries(KEYS.map(k => [k, field(k)]))), { type: 'null' }],
      description: "This folder's own settings, as `settings` takes them; a setting's null drops it, so it follows all folders, and null for the whole drops every one.",
    },
  }),
}

/**
 * A `set` call's input, as read: this session's switch and interval (null follows the settings), the
 * settings to save for all folders, and this folder's own to save and drop (null drops every one).
 */
export type SetChange = {
  enabled?: boolean; intervalMinutes?: number | null; patch: Partial<BeatSettings>
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
    } else if (k === 'intervalMinutes') {
      const m = v === null ? null : typeof v === 'number' || typeof v === 'string' ? parseMinutes(String(v)) : undefined
      if (m !== undefined) change.intervalMinutes = m
      else bad.push(`session.intervalMinutes takes ${range(parseMinutes)} or null, not ${said(v)}`)
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
  // an interval of its own is asked for to beat at, as `/cachebeat <minutes>` takes it
  if (typeof change.intervalMinutes === 'number') change.enabled ??= true
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
    change.enabled !== undefined && (change.enabled ? 'on' : 'off'),
    change.intervalMinutes !== undefined && (change.intervalMinutes === null ? 'its own interval dropped' : `every ${change.intervalMinutes}m`),
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
