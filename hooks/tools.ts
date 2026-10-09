// The tools Claude calls to read and change cachebeat: their specs, drawn from the pane's rows so a
// range is written once, and the reading of a `set` call's input.
import type { ToolSpec } from 'claude-code'
import type { BeatSettings } from '../types'
import { shown } from './pane'
import type { Reader, Value } from './settings'
import { AUTO, DEFAULTS, TABS, accept, parseMinutes, rowOf } from './settings'

/** Each setting, for the model; the unit and range are added from its reader. */
const ABOUT: Record<keyof BeatSettings, string> = {
  defaultOn: 'New sessions start beating; open sessions keep theirs.',
  interval:
    `Minutes idle before a beat, for sessions without their own; auto beats at ${AUTO['1h']} on a one-hour cache and ${AUTO['5m']} on a five-minute one, reading which the session has (state's cacheTtl).`,
  intervalScope: "What the user's `/cachebeat <minutes>` changes: this session's interval, or settings.interval.",
  stopAfterHours: 'Beating stops after this long without a message from the user.',
  stopAtUsage: 'Beating stops once any usage limit reaches this.',
  skipSmall: 'Skips beating chats smaller than skipSmallTokens.',
  skipSmallTokens: "The smallest chat kept warm while skipSmall is on; setting it doesn't turn skipSmall on.",
  animate: 'Animates the heart under the prompt.',
  variant: "The heart's animation.",
  speed: 'Animation speed: a name, or a frame time.',
  timing: 'linear plays evenly; lubdub beats twice, then rests.',
  heartPlacement: 'tail: the end of the hint line, always dim. line: its own line, in color.',
  showCount: 'Shows the beat count beside the heart.',
  color: 'The heart and status line color: dim, a theme color, a preset, or custom (customColor).',
  customColor: "The color when color is custom; setting it doesn't set color to custom.",
  effect: 'steady; flash on each beat; flow, a shimmer sweeping across; mixed switches between them.',
  statusLine: 'The line under the latest turn: spaced (after a blank line), below (right under it), or off.',
  showCountdown: 'Shows the time to the next beat in the status line.',
  showTokens: 'Shows the tokens the last beat kept warm in the status line.',
  statusHeart: "What the heart starting the status line plays: beat (one heart, filling in time with the heart's animation), off (still), or one of the animations the heart under the prompt has.",
  onBeat: 'How a beat is announced: a transcript line (log), a toast, both, or none.',
  onStop: 'How beating stopping on its own is announced.',
  onModelSwitch: "After /model while idle: wait for the user's next turn, or have the next beat write the new model's cache (a full cache write, the one that turn would make).",
}

const KEYS = Object.keys(ABOUT) as (keyof BeatSettings)[]
const range = (r: Reader) => `${r.min}–${r.max} ${r.unit}`
const names = (values: readonly Value[]) => values.filter(v => typeof v === 'string')

/** What a setting takes, as schemas: on/off, its named choices, or a number in its reader's range, with or beside names. */
function kinds(key: keyof BeatSettings): Record<string, unknown>[] {
  if (key === 'customColor') return [{ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }]
  const { row } = rowOf(key)!
  if (typeof row.values[0] === 'boolean') return [{ type: 'boolean' }]
  if (!row.custom) return [{ enum: [...row.values] }]
  const r = row.custom.parse
  const named = names(row.values)
  return [...(named.length ? [{ enum: named }] : []), { type: 'number', minimum: r.min, maximum: r.max }]
}

/** A setting's schema: what it takes, or null to reset it. */
function field(key: keyof BeatSettings): Record<string, unknown> {
  const r = key === 'customColor' ? undefined : rowOf(key)!.row.custom?.parse
  return { anyOf: [...kinds(key), { type: 'null' }], description: r ? `${ABOUT[key]} (${range(r)})` : ABOUT[key] }
}

/** What a setting takes, each choice in words, for a refusal. */
function takes(key: keyof BeatSettings): string[] {
  if (key === 'customColor') return ['a hex color (#rrggbb)']
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
    "cachebeat's state in this session and every setting with its value.",
    [
      "`nextBeat` is `in 42m`, `50m after this turn ends` (as seen mid-turn), `after the next turn` (nothing cached to keep warm yet), or null when off or skipping.",
      '`intervalFrom` is `session` when this session has its own interval, `default` when it follows a settings.interval in minutes, and `auto` when it follows an auto one.',
      "`cacheTtl` is how long this session's cache lives, `1h` or `5m`, worked out on each call from Claude Code's cache settings and whether a subscription is within its usage; an auto interval beats within it (50 or 4 minutes).",
      '`skipping`, when set, says why beats skip this chat (under the skipSmallTokens minimum).',
      "`paused`, when set, says why beats wait for the user's next turn (a model switch, a compaction); only that turn ends it, not `set`.",
      '`lastBeatReadTokens` is how much the last beat read from the cache. `defaults` has the default of each setting that differs from it.',
    ].join(' '),
  ].join('\n\n'),
  inputSchema: object({}),
}

export const SET: ToolSpec = {
  name: 'set',
  description: [
    "Changes cachebeat, which keeps this session's prompt cache warm while it sits idle by sending a small background request, a beat, shortly before the cache would expire. Change only what the user asks for.",
    '`session` is this session alone. `settings` is saved and used by every session, open ones included: `settings.interval` is the default interval, `settings.defaultOn` whether new sessions start on (open sessions keep theirs). The other settings (the stop rules, skipSmall and skipSmallTokens, the heart, the status line, alerts) exist only there; when you change one, say it applies to every session. `null` puts a setting back to its default.',
    'A request that names no scope ("turn it on", "beat every 20 minutes") is for this session. "Default", "new sessions", "every session", "always" or "from now on" mean `settings`. If you can\'t tell which the user means, ask.',
    "Each beat counts toward the user's usage. The first time in a conversation a change starts beating or changes how often a beating session beats, say so once.",
    'Setting `intervalMinutes` turns beating on too, unless `enabled: false` comes with it. A session with its own interval keeps it when the default changes: tell the user, and `intervalMinutes: null` makes it follow the default.',
    'Nothing changes if any value is invalid, and the refusal names each one. Subagents can read `state` but not call this. Returns what changed, this session\'s state, and the changed settings.',
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
  }),
}

/** A `set` call's input, as read: this session's switch and interval (null follows the default), and the settings to save. */
export type SetChange = { enabled?: boolean; intervalMinutes?: number | null; patch: Partial<BeatSettings> }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Reads a `set` call's input whole, or says every value it refuses. */
export function parseSet(input: { session?: unknown; settings?: unknown }): SetChange | { error: string } {
  const change: SetChange = { patch: {} }
  const bad: string[] = []
  const said = (v: unknown) => JSON.stringify(v)
  for (const part of ['session', 'settings'] as const) {
    if (input[part] !== undefined && !isObject(input[part])) bad.push(`${part} is an object, not ${said(input[part])}`)
  }
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
  // an interval of its own is asked for to beat at, as `/cachebeat <minutes>` takes it
  if (typeof change.intervalMinutes === 'number') change.enabled ??= true
  return bad.length ? { error: `nothing changed: ${bad.join('; ')}` } : change
}

/** A setting's name as the pane labels it, its tab's title beside a label two tabs share. */
function label(key: keyof BeatSettings) {
  if (key === 'customColor') return 'Color'
  const { tab, row } = rowOf(key)!
  const name = row.label.trim()
  const isShared = TABS.some(t => t !== tab && t.rows.some(r => r.label.trim() === name))
  return isShared ? `${tab.title} ${name.toLowerCase()}` : name
}

/** A `set` call in one line, as the transcript shows it: `this session on, every 20m · Beat after idle 30m`. */
export function summary(change: SetChange, s: BeatSettings) {
  const here = [
    change.enabled !== undefined && (change.enabled ? 'on' : 'off'),
    change.intervalMinutes !== undefined && (change.intervalMinutes === null ? 'at the default interval' : `every ${change.intervalMinutes}m`),
  ].filter(Boolean)
  const saved = (Object.entries(change.patch) as [keyof BeatSettings, Value][]).map(([key, v]) =>
    `${label(key)} ${key === 'customColor' ? v : shown(rowOf(key)!.row, v, s)}`,
  )
  return [here.length ? `this session ${here.join(', ')}` : '', saved.join(', ')].filter(Boolean).join(' · ') || 'no change'
}
