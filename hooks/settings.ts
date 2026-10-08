import type { BeatSettings } from '../types'
import { VARIANTS } from './animations'

export const DEFAULTS: BeatSettings = {
  defaultOn: false,
  interval: 50,
  intervalScope: 'session',
  stopAfterHours: 8,
  stopAtUsage: 100,
  skipSmall: false,
  skipSmallTokens: 20_000,
  animate: true,
  variant: 'classic',
  speed: 'normal',
  timing: 'linear',
  heartPlacement: 'tail',
  showCount: true,
  color: 'claude',
  customColor: '#e6a8b9',
  effect: 'steady',
  statusLine: 'spaced',
  showCountdown: true,
  showTokens: false,
  onBeat: 'none',
  onStop: 'log',
}

/** What the store keeps: the settings that differ from the defaults, so a new default reaches the rest. */
export const changed = (s: BeatSettings): Partial<BeatSettings> =>
  Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== DEFAULTS[k as keyof BeatSettings]))

/** Store values from an older or hand-edited store fall back to the default one by one. */
export function normalize(stored: unknown): BeatSettings {
  const s: Record<string, unknown> = { ...DEFAULTS }
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      if (k in DEFAULTS && (typeof v === typeof DEFAULTS[k as keyof BeatSettings] || (k === 'speed' && typeof v === 'number'))) s[k] = v
    }
  }
  const out = s as BeatSettings
  if (!VARIANTS.some(v => v.id === out.variant)) out.variant = DEFAULTS.variant
  if (!['below', 'spaced', 'off'].includes(out.statusLine)) out.statusLine = DEFAULTS.statusLine
  if (typeof out.speed === 'number' && parseFrameMs(`${out.speed}`) === undefined) out.speed = DEFAULTS.speed
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
const glyphs = (text: string) => [...text].reduce<string[]>((out, ch) => {
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

/**
 * Reads a typed number with an optional unit (`units` maps each to its scale; '' is none), kept
 * when it lands within [min, max]: '35k' → 35000 tokens, '90m' → 1.5 hours.
 */
function reader(units: Record<string, number>, min: number, max: number, isWhole: boolean) {
  return (text: string): number | undefined => {
    const m = /^(\d+(?:\.\d+)?)\s*([a-z%]*)$/i.exec(text.trim().replaceAll(',', ''))
    const scale = m ? units[m[2]!.toLowerCase()] : undefined
    if (scale === undefined) return undefined
    const n = Number(m![1]) * scale
    const v = isWhole ? Math.round(n) : Math.round(n * 100) / 100
    return v >= min && v <= max ? v : undefined
  }
}

export const parseTokens = reader({ '': 1, k: 1e3, m: 1e6 }, 1_000, 1_000_000, true)
export const parseMinutes = reader({ '': 1, m: 1, min: 1 }, 1, 55, true) // under the hour the cache lives
export const parseHours = reader({ '': 1, h: 1, m: 1 / 60, min: 1 / 60 }, 0.5, 48, false)
export const parsePercent = reader({ '': 1, '%': 1 }, 10, 100, true)
export const parseFrameMs = reader({ '': 1, ms: 1 }, 20, 500, true)

/** 184000 → 184k, 1250000 → 1.3M. */
export const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export type Value = string | number | boolean
/**
 * One row of the settings pane. An on/off row toggles in place on Enter; one of named choices opens
 * a picker, whose focused option the preview shows before it is picked.
 */
export type Row = {
  key: keyof BeatSettings
  label: string
  values: readonly Value[]
  show?: (s: BeatSettings) => boolean
  fmt?: (v: Value, s: BeatSettings) => string
  note?: string // a dim hint under the picker's choices
  custom?: { placeholder: string; parse: (text: string) => Value | undefined } // a typed value besides the choices
}

export type Preview = 'heart' | 'status' | 'both'
export type Tab = { id: string; title: string; rows: readonly Row[]; preview?: Preview }

const onOff = (v: Value) => (v ? 'on' : 'off')
const ALERTS = ['none', 'log', 'toast', 'both']
const alert = (v: Value) => (v === 'both' ? 'log + toast' : `${v}`)

export const TABS: readonly Tab[] = [
  {
    id: 'beating', title: 'Beating',
    rows: [
      { key: 'defaultOn', label: 'New sessions start', values: [false, true], fmt: onOff },
      {
        key: 'interval', label: 'Beat after idle', values: [4, 30, 50, 55], fmt: v => `${v}m`, // 4: under a five-minute cache
        custom: { placeholder: 'minutes, 1 to 55: e.g. 35', parse: parseMinutes },
      },
      {
        key: 'intervalScope', label: '/cachebeat <min> sets', values: ['session', 'global'],
        fmt: v => (v === 'session' ? 'this session' : 'the default'),
      },
      {
        key: 'stopAfterHours', label: 'Stop after idle', values: [1, 4, 8, 24], fmt: v => `${v}h`,
        custom: { placeholder: 'hours, up to 48: e.g. 10 or 90m', parse: parseHours },
      },
      {
        key: 'stopAtUsage', label: 'Stop at usage', values: [80, 90, 100], fmt: v => `${v}%`,
        custom: { placeholder: 'percent, 10 to 100: e.g. 85', parse: parsePercent },
      },
      { key: 'skipSmall', label: 'Skip small contexts', values: [false, true], fmt: onOff },
      {
        key: 'skipSmallTokens', label: '  smaller than', values: [10_000, 20_000, 50_000, 100_000],
        show: s => s.skipSmall, fmt: v => `${tokens(Number(v))} tokens`,
        custom: { placeholder: 'tokens, 1k to 1M: e.g. 35k', parse: parseTokens },
      },
    ],
  },
  {
    id: 'heart', title: 'Heart', preview: 'heart',
    rows: [
      { key: 'variant', label: 'Animation', values: VARIANTS.map(v => v.id), fmt: v => VARIANTS.find(x => x.id === v)?.name ?? `${v}` },
      { key: 'animate', label: 'Animate', values: [true, false], fmt: onOff },
      {
        key: 'speed', label: 'Speed', values: ['slow', 'normal', 'fast'], show: s => s.animate,
        fmt: v => (typeof v === 'number' ? `${v}ms a frame` : `${v} · ${FRAME_MS[v as keyof typeof FRAME_MS]}ms`),
        custom: { placeholder: 'ms a frame, 20 to 500: e.g. 65', parse: parseFrameMs },
      },
      {
        key: 'timing', label: 'Timing', values: ['linear', 'lubdub'], show: s => s.animate, fmt: v => (v === 'lubdub' ? 'lub-dub' : 'linear'),
        note: `Linear suits the line animations (${VARIANTS.filter(x => x.isEndless).map(x => x.name).join(', ')}); lub-dub, the hearts.`,
      },
      { key: 'heartPlacement', label: 'Placement', values: ['tail', 'line'], fmt: v => (v === 'tail' ? 'hint line · dim' : 'own line') },
      { key: 'showCount', label: 'Beat count', values: [true, false], fmt: onOff },
    ],
  },
  {
    id: 'look', title: 'Look', preview: 'both',
    rows: [
      { key: 'color', label: 'Color', values: COLORS, fmt: (v, s) => (v === 'custom' ? `custom ${s.customColor}` : `${v}`) },
      { key: 'effect', label: 'Effect', values: ['steady', 'flash', 'flow', 'mixed'], show: s => s.animate },
    ],
  },
  {
    id: 'status', title: 'Status', preview: 'status',
    rows: [
      {
        key: 'statusLine', label: 'Placement', values: ['spaced', 'below', 'off'],
        fmt: v => ({ spaced: 'after a blank line', below: 'right below the turn row', off: 'off' })[v as string]!,
      },
      { key: 'showCountdown', label: 'Countdown', values: [true, false], show: s => s.statusLine !== 'off', fmt: onOff },
      { key: 'showTokens', label: 'Tokens kept', values: [false, true], show: s => s.statusLine !== 'off', fmt: onOff },
    ],
  },
  {
    id: 'alerts', title: 'Alerts',
    rows: [
      { key: 'onBeat', label: 'On a beat', values: ALERTS, fmt: alert },
      { key: 'onStop', label: 'On stop', values: ALERTS, fmt: alert },
    ],
  },
]

export const rowOf = (key: keyof BeatSettings) => {
  for (const tab of TABS) for (const row of tab.rows) if (row.key === key) return { tab, row }
  return undefined
}

export const isPicker = (row: Row) => typeof row.values[0] !== 'boolean'

