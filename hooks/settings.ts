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
  color: 'dim',
  customColor: '#e6a8b9',
  effect: 'steady',
  statusLine: 'below',
  showCountdown: true,
  showTokens: false,
  onBeat: 'none',
  sound: 'off',
  onStop: 'log',
}

/** Store values from an older or hand-edited store fall back to the default one by one. */
export function normalize(stored: unknown): BeatSettings {
  const s: Record<string, unknown> = { ...DEFAULTS }
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored)) {
      if (k in DEFAULTS && typeof v === typeof DEFAULTS[k as keyof BeatSettings]) s[k] = v
    }
  }
  const out = s as BeatSettings
  if (!VARIANTS.some(v => v.id === out.variant)) out.variant = DEFAULTS.variant
  return out
}

export const FRAME_MS = { slow: 120, normal: 80, fast: 50 } as const

// theme keys with a shimmer pair in Claude Code's themes, so they follow the active theme
export const THEME_COLORS = ['claude', 'permission', 'warning', 'fastMode', 'inactive'] as const
export const PRESET_COLORS = ['red', 'magenta', 'yellow', 'green', 'cyan', 'white'] as const
export const COLORS = ['dim', ...THEME_COLORS, ...PRESET_COLORS, 'custom'] as const

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
  if (c === 'custom') {
    const hex = isHex(s.customColor) ? s.customColor : DEFAULTS.customColor
    return { base: { color: hex, dim: false }, hi: { color: lighten(hex), dim: false } }
  }
  return { base: { color: c, dim: false }, hi: { color: `${c}Bright`, dim: false } }
}

/** A frame with a filled heart in it: the beat of the animation, where `flash` lights up. */
export const isLit = (frame: string) => /[♥❤]/.test(frame)

/** Characters as a terminal cell sees them: a heart's text-presentation selector stays with its heart. */
const glyphs = (text: string) => [...text].reduce<string[]>((out, ch) => {
  if (ch === '︎' && out.length) out[out.length - 1] += ch
  else out.push(ch)
  return out
}, [])

/**
 * Styles `text` by the color and effect: steady holds the resting tone, flash lights the whole
 * text while `lit`, flow sweeps a three-glyph highlight across it with `tick`, as the spinner's
 * shimmer does.
 */
export function spans(text: string, s: BeatSettings, tick: number, lit: boolean): Span[] {
  const { base, hi } = tones(s)
  if (s.effect === 'steady' || !s.animate) return [{ text, ...base }]
  if (s.effect === 'flash') return [{ text, ...(lit ? hi : base) }]
  const g = glyphs(text)
  const at = (tick % (g.length + 6)) - 3
  const out: Span[] = []
  g.forEach((ch, i) => {
    const tone = Math.abs(i - at) <= 1 ? hi : base
    const last = out.at(-1)
    if (last && last.color === tone.color && last.dim === tone.dim) last.text += ch
    else out.push({ text: ch, ...tone })
  })
  return out
}

/** 184000 → 184k, 1250000 → 1.3M. */
export const tokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

type Value = string | number | boolean
/** One row of the settings pane: pressing it moves to the next of `values`. */
export type Row = {
  key: keyof BeatSettings
  label: string
  values: readonly Value[]
  show?: (s: BeatSettings) => boolean
  fmt?: (v: Value, s: BeatSettings) => string
}

const onOff = (v: Value) => (v ? 'on' : 'off')
const SOUNDS = ['off', 'message', 'bell', 'complete', 'dialog-information'] as const

export const SECTIONS: readonly { title: string; rows: readonly Row[] }[] = [
  {
    title: 'Beating',
    rows: [
      { key: 'defaultOn', label: 'New sessions start', values: [false, true], fmt: onOff },
      { key: 'interval', label: 'Beat after idle', values: [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 45, 50, 55], fmt: v => `${v}m` },
      {
        key: 'intervalScope', label: '/cachebeat <min> sets', values: ['session', 'global'],
        fmt: v => (v === 'session' ? 'this session only' : 'the global default'),
      },
      { key: 'stopAfterHours', label: 'Stop after idle', values: [1, 2, 4, 6, 8, 12, 24], fmt: v => `${v}h` },
      { key: 'stopAtUsage', label: 'Stop at usage', values: [50, 60, 70, 80, 90, 95, 100], fmt: v => `${v}%` },
      { key: 'skipSmall', label: 'Skip small contexts', values: [false, true], fmt: onOff },
      {
        key: 'skipSmallTokens', label: '  smaller than', values: [5_000, 10_000, 20_000, 30_000, 50_000, 100_000],
        show: s => s.skipSmall, fmt: v => `${tokens(Number(v))} tokens`,
      },
    ],
  },
  {
    title: 'Heart',
    rows: [
      { key: 'animate', label: 'Animate', values: [true, false], fmt: onOff },
      { key: 'speed', label: 'Speed', values: ['slow', 'normal', 'fast'], fmt: v => `${v} (${FRAME_MS[v as BeatSettings['speed']]}ms)` },
      { key: 'timing', label: 'Timing', values: ['linear', 'lubdub'], fmt: v => (v === 'lubdub' ? 'lub-dub' : 'linear') },
      {
        key: 'heartPlacement', label: 'Placement', values: ['tail', 'line'],
        fmt: v => (v === 'tail' ? 'end of the hint line (always dim)' : 'own line under the hint'),
      },
      { key: 'showCount', label: 'Beat count', values: [true, false], fmt: onOff },
    ],
  },
  {
    title: 'Look',
    rows: [
      { key: 'color', label: 'Color', values: COLORS, fmt: (v, s) => (v === 'custom' ? `custom ${s.customColor}` : `${v}`) },
      { key: 'effect', label: 'Effect', values: ['steady', 'flash', 'flow'] },
    ],
  },
  {
    title: 'Status line',
    rows: [
      {
        key: 'statusLine', label: 'Placement', values: ['below', 'spaced', 'inline', 'off'],
        fmt: v => ({ below: 'below the turn row', spaced: 'below, after a blank line', inline: 'on the turn row', off: 'off' })[v as string]!,
      },
      { key: 'showCountdown', label: 'Countdown', values: [true, false], fmt: onOff },
      { key: 'showTokens', label: 'Tokens kept', values: [false, true], fmt: onOff },
    ],
  },
  {
    title: 'Notify',
    rows: [
      { key: 'onBeat', label: 'On a beat', values: ['none', 'toast'] },
      { key: 'sound', label: 'Sound on a beat', values: SOUNDS },
      { key: 'onStop', label: 'On stop', values: ['log', 'toast', 'none'] },
    ],
  },
]

export const cycle = (row: Row, s: BeatSettings): Value => {
  const i = row.values.indexOf(s[row.key])
  return row.values[(i + 1) % row.values.length]!
}
