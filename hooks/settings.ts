import type { BeatSettings, Ttl } from '../types'
import { STATUS_HEARTS, VARIANTS } from './animations'

export const DEFAULTS: BeatSettings = {
  defaultOn: false,
  interval: 'auto',
  intervalScope: 'session',
  stopAfterHours: 8,
  stopAtUsage: 90,
  skipSmall: false,
  skipSmallTokens: 20_000,
  animate: true,
  variant: 'classic',
  speed: 'normal',
  timing: 'lubdub',
  heartPlacement: 'tail',
  showCount: true,
  color: 'claude',
  customColor: '#e6a8b9',
  effect: 'steady',
  statusLine: 'spaced',
  showCountdown: true,
  showTokens: true,
  statusHeart: 'beat',
  onBeat: 'none',
  onStop: 'log',
  onModelSwitch: 'wait',
}

/** The interval `auto` beats at for each cache lifetime, in minutes: under it, with room for a slow request. */
export const AUTO: Record<Ttl, number> = { '1h': 50, '5m': 4 }

/** What the store keeps: the settings that differ from the defaults, so a new default reaches the rest. */
export const changed = (s: BeatSettings): Partial<BeatSettings> =>
  Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== DEFAULTS[k as keyof BeatSettings]))

/** Store values from an older or hand-edited store fall back to the default one by one. */
export function normalize(stored: unknown): BeatSettings {
  const s: Record<string, unknown> = { ...DEFAULTS }
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      const isNumberFor = (key: string) => k === key && typeof v === 'number'
      if (k in DEFAULTS && (typeof v === typeof DEFAULTS[k as keyof BeatSettings] || isNumberFor('speed') || isNumberFor('interval'))) s[k] = v
    }
  }
  const out = s as BeatSettings
  if (!VARIANTS.some(v => v.id === out.variant)) out.variant = DEFAULTS.variant
  if (!STATUS_HEARTS.includes(out.statusHeart)) out.statusHeart = DEFAULTS.statusHeart
  if (!['below', 'spaced', 'off'].includes(out.statusLine)) out.statusLine = DEFAULTS.statusLine
  if (typeof out.speed === 'number' && parseFrameMs(`${out.speed}`) === undefined) out.speed = DEFAULTS.speed
  if (out.interval !== 'auto' && (typeof out.interval !== 'number' || parseMinutes(`${out.interval}`) === undefined)) out.interval = DEFAULTS.interval
  if (!['wait', 'warm'].includes(out.onModelSwitch)) out.onModelSwitch = DEFAULTS.onModelSwitch
  return out
}

export const FRAME_MS = { slow: 120, normal: 80, fast: 50 } as const
/** A frame's time: a named speed's, or the milliseconds typed in. */
export const frameMs = (s: BeatSettings) => (typeof s.speed === 'number' ? s.speed : FRAME_MS[s.speed])

// theme keys with a shimmer pair in Claude Code's themes, so they follow the active theme
export const THEME_COLORS = ['claude', 'permission', 'warning', 'fastMode', 'inactive'] as const
// drawn as hex, a raw color every surface takes; the highlight is a lighter shade
const PRESETS: Record<string, string> = {
  red: '#e5534b', magenta: '#c678dd', yellow: '#e5c07b', green: '#98c379', cyan: '#56b6c2', white: '#d7d7d7',
}
export const PRESET_COLORS = Object.keys(PRESETS)
export const COLORS = ['dim', ...THEME_COLORS, ...PRESET_COLORS, 'custom']

const lighten = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift: number) => {
    const c = (n >> shift) & 0xff
    return Math.round(c + (255 - c) * 0.45).toString(16).padStart(2, '0')
  }
  return `#${ch(16)}${ch(8)}${ch(0)}`
}
export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

/** A run of text in one style. `color` undefined with `dim` false is the terminal's own text color. */
export type Span = { text: string; color?: string; dim: boolean }
type Tone = { color?: string; dim: boolean }

/** The color's resting tone and its highlight: the theme's shimmer, a bright preset, a lighter hex. */
export function tones(s: BeatSettings): { base: Tone; hi: Tone } {
  const c = s.color
  if (c === 'dim') return { base: { dim: true }, hi: { dim: false } }
  if ((THEME_COLORS as readonly string[]).includes(c)) return { base: { color: c, dim: false }, hi: { color: `${c}Shimmer`, dim: false } }
  const hex = c === 'custom' ? (isHex(s.customColor) ? s.customColor : DEFAULTS.customColor) : (PRESETS[c] ?? PRESETS.red!)
  return { base: { color: hex, dim: false }, hi: { color: lighten(hex), dim: false } }
}

/** A frame with a filled heart in it: the beat of the animation, where `flash` lights up. */
export const isLit = (frame: string) => /[♥❤]/.test(frame)

/** Characters as a terminal cell sees them: a heart's text-presentation selector stays with its heart. */
export const glyphs = (text: string) => [...text].reduce<string[]>((out, ch) => {
  if (ch === '︎' && out.length) out[out.length - 1] += ch
  else out.push(ch)
  return out
}, [])

type Mode = 'flash' | 'flow' | 'both'
const MODES: readonly Mode[] = ['flash', 'flow', 'both']
export const EPISODE = 40 // ticks one mixed mode lasts: 3.2s at normal speed

/**
 * The mode `mixed` plays at `tick`: drawn at random for each episode, never twice in a row. A hash of
 * the episode's number, not a stored roll, so every drawing at one tick agrees.
 */
export function mixedMode(tick: number): Mode {
  const roll = (n: number) => {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    return ((h ^ (h >>> 16)) >>> 0) % 2
  }
  // each episode steps one or two modes on from the last, so it always changes
  let i = 0
  for (let n = 1; n <= Math.floor(tick / EPISODE); n++) i = (i + 1 + roll(n)) % 3
  return MODES[i]!
}

/**
 * Styles `text` by the color and effect: steady holds the resting tone, flash lights the whole
 * text while `lit`, flow sweeps a three-glyph highlight across it with `tick`, as the spinner's
 * shimmer does. Both does the two at once, the sweep dipping to the resting tone while lit;
 * mixed plays flash, flow or both, a few seconds of each.
 */
export function spans(text: string, s: BeatSettings, tick: number, lit: boolean): Span[] {
  const { base, hi } = tones(s)
  if (s.effect === 'steady' || !s.animate) return [{ text, ...base }]
  const mode = s.effect === 'mixed' ? mixedMode(tick) : s.effect
  if (mode === 'flash') return [{ text, ...(lit ? hi : base) }]
  const [rest, sweep] = mode === 'both' && lit ? [hi, base] : [base, hi]
  const g = glyphs(text)
  const at = (tick % (g.length + 6)) - 3
  const out: Span[] = []
  g.forEach((ch, i) => {
    const tone = Math.abs(i - at) <= 1 ? sweep : rest
    const last = out.at(-1)
    if (last && last.color === tone.color && last.dim === tone.dim) last.text += ch
    else out.push({ text: ch, ...tone })
  })
  return out
}

/** Reads a typed number into a setting's unit, undefined outside its range; it carries that unit and range. */
export type Reader = ((text: string) => number | undefined) & { unit: string; min: number; max: number }

/**
 * Reads a typed number with an optional unit (`units` maps each to its scale; '' is none), kept
 * when it lands within [min, max]: '35k' → 35000 tokens, '90m' → 1.5 hours.
 */
function reader(unit: string, units: Record<string, number>, min: number, max: number, isWhole: boolean): Reader {
  const read = (text: string): number | undefined => {
    const m = /^(\d+(?:\.\d+)?)\s*([a-z%]*)$/i.exec(text.trim().replaceAll(',', ''))
    const scale = m ? units[m[2]!.toLowerCase()] : undefined
    if (scale === undefined) return undefined
    const n = Number(m![1]) * scale
    const v = isWhole ? Math.round(n) : Math.round(n * 100) / 100
    return v >= min && v <= max ? v : undefined
  }
  return Object.assign(read, { unit, min, max })
}

export const parseTokens = reader('tokens', { '': 1, k: 1e3, m: 1e6 }, 1_000, 1_000_000, true)
export const parseMinutes = reader('minutes', { '': 1, m: 1, min: 1 }, 1, 55, true) // under the hour the cache lives
export const parseHours = reader('hours', { '': 1, h: 1, m: 1 / 60, min: 1 / 60 }, 0.5, 48, false)
export const parsePercent = reader('percent', { '': 1, '%': 1 }, 10, 100, true)
export const parseFrameMs = reader('ms a frame', { '': 1, ms: 1 }, 20, 500, true)

/** 184000 → 184k, 1250000 → 1.3M. */
export const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export type Value = string | number | boolean
/**
 * One row of the settings pane. A row of two choices (on/off among them) flips in place on Enter;
 * one of more, or that takes a typed value, opens a list, whose focused choice the preview shows
 * before it is picked. `help` is what the row does, shown while it is focused and above its list.
 */
export type Row = {
  key: keyof BeatSettings
  label: string
  name?: string // the label out of its tab, where it would be unclear: in Claude's transcript line
  values: readonly Value[]
  help: string
  show?: (s: BeatSettings) => boolean
  fmt?: (v: Value, s: BeatSettings) => string
  custom?: { placeholder: string; parse: Reader } // a typed value besides the choices
}

export type Preview = 'heart' | 'status' | 'both'
export type Tab = { id: string; title: string; rows: readonly Row[]; preview?: Preview }

const onOff = (v: Value) => (v ? 'on' : 'off')
const ALERTS = ['none', 'log', 'toast', 'both']
const alert = (v: Value) => (v === 'both' ? 'log + toast' : `${v}`)

/** The pane's own row on the Beating tab, not a setting: whether this session beats. */
export const SESSION_HELP = "Beats for this session alone. New sessions start as 'New sessions start' says."

const TERMINAL_ONLY = 'The desktop app draws no heart under the prompt: there the status line carries it.'

export const TABS: readonly Tab[] = [
  {
    id: 'beating', title: 'Beating',
    rows: [
      { key: 'defaultOn', label: 'New sessions start', values: [false, true], fmt: onOff, help: 'Whether new sessions start beating. Open sessions keep what they have.' },
      {
        key: 'interval', label: 'Beat after idle', values: ['auto', 4, 15, 30, 45, 55], fmt: v => (v === 'auto' ? 'auto' : `${v}m`),
        help: `How long you're idle before a beat. auto fits your cache: every ${AUTO['1h']}m on a one-hour cache, every ${AUTO['5m']}m on a five-minute one.`,
        custom: { placeholder: 'e.g. 35m', parse: parseMinutes },
      },
      {
        key: 'onModelSwitch', label: 'After /model', values: ['wait', 'warm'],
        fmt: v => (v === 'wait' ? 'wait for your next turn' : 'warm the new model'),
        help: "After /model while you're idle: wait for your next message, or have the next beat write the new model's cache, at the cost your message would pay.",
      },
      {
        key: 'intervalScope', label: '/cachebeat 30 changes', values: ['session', 'global'],
        fmt: v => (v === 'session' ? 'this session' : 'the default'),
        help: "What typing /cachebeat with a number changes: this session's interval, or the default for every session.",
      },
    ],
  },
  {
    id: 'limits', title: 'Limits',
    rows: [
      {
        key: 'stopAfterHours', label: 'Stop after idle', values: [1, 4, 8, 24], fmt: v => `${v}h`,
        help: 'Beating stops after this long without a message from you.',
        custom: { placeholder: 'e.g. 10h or 90m', parse: parseHours },
      },
      {
        key: 'stopAtUsage', label: 'Stop at usage', values: [80, 90, 100], fmt: v => `${v}%`,
        help: 'Beating stops once any of your usage limits reaches this.',
        custom: { placeholder: 'e.g. 85%', parse: parsePercent },
      },
      { key: 'skipSmall', label: 'Skip small chats', values: [false, true], fmt: onOff, help: "Doesn't beat chats smaller than the size below." },
      {
        key: 'skipSmallTokens', label: '  smaller than', values: [10_000, 20_000, 50_000, 100_000],
        show: s => s.skipSmall, fmt: v => `${tokens(Number(v))} tokens`,
        help: 'The smallest chat kept warm.',
        custom: { placeholder: 'e.g. 35k', parse: parseTokens },
      },
    ],
  },
  {
    id: 'heart', title: 'Heart', preview: 'heart',
    rows: [
      {
        key: 'heartPlacement', label: 'Placement', name: 'Heart placement', values: ['tail', 'line'], fmt: v => (v === 'tail' ? 'hint line · dim' : 'own line'),
        help: `At the end of the hint line under the prompt, drawn dim, or on a line of its own, in color. ${TERMINAL_ONLY}`,
      },
      {
        key: 'variant', label: 'Animation', name: 'Heart animation', values: VARIANTS.map(v => v.id), fmt: v => VARIANTS.find(x => x.id === v)?.name ?? `${v}`,
        help: `What the heart under the prompt plays. ${TERMINAL_ONLY}`,
      },
      { key: 'showCount', label: 'Beat count', values: [true, false], fmt: onOff, help: `Shows ×3, the beats so far, beside the heart. ${TERMINAL_ONLY}` },
    ],
  },
  {
    id: 'status', title: 'Status line', preview: 'status',
    rows: [
      {
        key: 'statusLine', label: 'Show', name: 'Status line', values: ['spaced', 'below', 'off'],
        fmt: v => ({ spaced: 'after a blank line', below: 'right below the turn row', off: 'off' })[v as string]!,
        help: 'Where the line goes under your latest turn, or off. In the desktop app it sits above the prompt.',
      },
      { key: 'showCountdown', label: 'Countdown', values: [true, false], show: s => s.statusLine !== 'off', fmt: onOff, help: 'Shows the time to the next beat.' },
      { key: 'showTokens', label: 'Tokens kept', values: [true, false], show: s => s.statusLine !== 'off', fmt: onOff, help: 'Shows how much the last beat kept warm, as · 347k cached.' },
      {
        key: 'statusHeart', label: 'Animation', name: 'Status line animation', values: STATUS_HEARTS, show: s => s.statusLine !== 'off' && s.animate,
        fmt: v => (v === 'beat' ? 'one heart, beating' : v === 'off' ? 'still' : VARIANTS.find(x => x.id === v)?.name ?? `${v}`),
        help: 'What the heart starting the line plays. One heart beating keeps the words still; a wider animation moves them as it plays.',
      },
    ],
  },
  {
    id: 'style', title: 'Style', preview: 'both',
    rows: [
      {
        key: 'color', label: 'Color', values: COLORS, fmt: (v, s) => (v === 'custom' ? `custom ${s.customColor}` : `${v}`),
        help: 'The status line, and the heart on a line of its own. On the hint line the heart is always dim.',
      },
      { key: 'animate', label: 'Animate', values: [true, false], fmt: onOff, help: 'Animates the heart and the status line. Off, both hold still.' },
      {
        key: 'effect', label: 'Effect', values: ['steady', 'flash', 'flow', 'mixed'], show: s => s.animate,
        help: 'steady; flash on each beat; flow, a shimmer sweeping across; mixed switches between them.',
      },
      {
        key: 'speed', label: 'Speed', values: ['slow', 'normal', 'fast'], show: s => s.animate,
        fmt: v => (typeof v === 'number' ? `${v}ms a frame` : `${v} · ${FRAME_MS[v as keyof typeof FRAME_MS]}ms`),
        help: 'How fast the animations play: a speed, or a frame time.',
        custom: { placeholder: 'e.g. 65ms', parse: parseFrameMs },
      },
      {
        key: 'timing', label: 'Timing', values: ['lubdub', 'linear'], show: s => s.animate, fmt: v => (v === 'lubdub' ? 'lub-dub' : 'linear'),
        help: `lub-dub beats twice, then rests, and suits the hearts; linear plays evenly, and suits the line animations (${VARIANTS.filter(x => x.isEndless).map(x => x.name).join(', ')}).`,
      },
    ],
  },
  {
    id: 'alerts', title: 'Alerts',
    rows: [
      { key: 'onBeat', label: 'On a beat', values: ALERTS, fmt: alert, help: 'How a beat landing is told: a line in the transcript (log), a toast, both, or nothing.' },
      { key: 'onStop', label: 'On stop', values: ALERTS, fmt: alert, help: 'How beating stopping on its own is told, and why.' },
    ],
  },
]

export const rowOf = (key: keyof BeatSettings) => {
  for (const tab of TABS) for (const row of tab.rows) if (row.key === key) return { tab, row }
  return undefined
}

/** A row Enter flips in place: two choices and no typed value. Any other opens its list. */
export const isFlip = (row: Row) => row.values.length === 2 && !row.custom

/**
 * `value` as `key` takes it, the way the pane does: one of the row's choices, or a custom value its
 * reader accepts (35000, or '35k'); a hex for the custom color. Undefined when it takes no such value.
 */
export function accept(key: string, value: unknown): Value | undefined {
  if (key === 'customColor') return typeof value === 'string' && isHex(value) ? value.toLowerCase() : undefined
  const row = rowOf(key as keyof BeatSettings)?.row
  if (!row) return undefined
  if (row.values.includes(value as Value)) return value as Value
  return row.custom && (typeof value === 'number' || typeof value === 'string') ? row.custom.parse(String(value)) : undefined
}

