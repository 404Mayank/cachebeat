import type { Elements, RenderElement } from 'claude-code'
import type { BeatSettings, PanePage } from '../types'
import { previewFrame, variant } from './animations'
import type { Preview, Row, Span, Value } from './settings'
import { TABS, isHex, isLit, isPicker, rowOf, spans, tokens } from './settings'

export const PANE = 'cachebeat-settings'

type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input'>
export type Actions = {
  set: (patch: Partial<BeatSettings>) => void
  tab: (id: string) => void
  open: (key: keyof BeatSettings) => void
  pick: (key: keyof BeatSettings, value: Value) => void
  back: () => void
  toggleSession: () => void
  beatNow: () => void
  reset: () => void
}
/** What the pane draws from, besides the settings. */
export type View = {
  page: PanePage
  tick: number
  focus: string
  columns: number
  isOn: boolean // this session beats
  notice: string // the last action's outcome, shown in the footer
  isResetArmed: boolean
}

const LABEL = 22

export function paint(Text: Els['Text'], list: Span[]) {
  return list.map(sp => (sp.color ? <Text color={sp.color} dimColor={sp.dim}>{sp.text}</Text> : <Text dimColor={sp.dim}>{sp.text}</Text>))
}

/** The beat line as the status line draws it, from this session's figures. */
export function statusText(s: BeatSettings, stretch: number, read: number | null, next: string | null) {
  let text = `♥ cache kept warm ×${stretch}`
  if (s.showTokens && read) text += ` · ${tokens(read)} cached`
  if (s.showCountdown && next) text += ` · next in ${next}`
  return text
}

const shown = (row: Row, v: Value, s: BeatSettings) => (row.fmt ? row.fmt(v, s) : String(v))

function preview(els: Els, s: BeatSettings, kind: Preview, tick: number) {
  const { Box, Text } = els
  const x = variant(s.variant)
  const frame = s.animate ? previewFrame(x, tick, s.timing) : x.loop[0]!
  const lit = isLit(frame)
  // the hint line takes text alone, drawn dim
  const heart = s.heartPlacement === 'tail' ? [{ text: frame, dim: true }] : spans(frame, s, tick, lit)
  const line = paint(Text, spans(statusText(s, 3, 184_000, '42m'), s, tick, lit))
  const turn = <Text dimColor>✻ Brewed for 2s</Text>
  const status = s.statusLine === 'off' ? turn
    : (
      <Box flexDirection="column">
        {turn}
        <Box marginTop={s.statusLine === 'spaced' ? 1 : 0}>{line}</Box>
      </Box>
    )
  return (
    <Box flexDirection="column">
      {kind !== 'status' && (
        <Box>
          <Text dimColor>{'heart'.padEnd(8)}</Text>
          {paint(Text, heart)}
          {s.showCount && <Text dimColor>3</Text>}
        </Box>
      )}
      {kind !== 'heart' && (
        <Box>
          <Text dimColor>{'status'.padEnd(8)}</Text>
          {status}
        </Box>
      )}
    </Box>
  )
}

/** The pane and its focus ring: the keys of its elements, in the order the arrows walk them. */
export function settingsPane(els: Els, s: BeatSettings, v: View, act: Actions): { tree: RenderElement; ring: string[] } {
  const { Box, Text, Button, Input } = els
  const ring: string[] = []
  const rule = <Text dimColor>{'─'.repeat(Math.max(10, v.columns))}</Text>
  const at = v.page.picker ? rowOf(v.page.picker) : undefined

  if (at) {
    const { row, tab } = at
    const key = row.key
    const isVariant = key === 'variant'
    // the focused option stands in for the setting in the preview, before it is picked
    const focused = /^opt:(\d+)$/.exec(v.focus)
    const trial = focused ? { ...s, [key]: row.values[Number(focused[1])] } : s
    ring.push('back', ...row.values.map((_, i) => `opt:${i}`))
    const tree = (
      <Box flexDirection="column">
        <Box gap={1}>
          <Button plain key="back" onPress={() => act.back()}>‹</Button>
          <Text bold>{row.label}</Text>
        </Box>
        {rule}
        {row.values.map((val, i) => {
          const sample = isVariant
            ? spans(previewFrame(variant(String(val)), v.tick, s.timing), { ...s, animate: true }, v.tick, isLit(previewFrame(variant(String(val)), v.tick, s.timing)))
            : key === 'color' && val !== 'dim'
              ? spans('♥ ♥ ♥', { ...s, color: String(val), effect: 'steady' }, 0, false)
              : []
          return (
            <Box>
              <Button plain key={`opt:${i}`} onPress={() => act.pick(key, val)}>
                {`${val === s[key] ? '●' : ' '} ${shown(row, val, s).padEnd(isVariant ? 11 : LABEL)}`}
              </Button>
              {sample.length > 0 && <Text> </Text>}
              {paint(Text, sample)}
            </Box>
          )
        })}
        {tab.preview && !isVariant && rule}
        {tab.preview && !isVariant && preview(els, trial, tab.preview, v.tick)}
        <Text dimColor>↑↓ move · enter picks · esc back</Text>
      </Box>
    )
    return { tree, ring }
  }

  const tab = TABS.find(t => t.id === v.page.tab) ?? TABS[0]!
  const rows = tab.rows.filter(r => !r.show || r.show(s))
  // the arrows reach the open tab alone; Enter there moves on to the next, 1-5 and a click to any
  ring.push(`tab:${tab.id}`)
  if (tab.id === 'beating') ring.push('session')
  for (const r of rows) {
    ring.push(`row:${r.key}`)
    if (r.key === 'color' && s.color === 'custom') ring.push('customColor')
  }
  ring.push('beatNow', 'reset')

  const line = (label: string, value: string, more = '') => `${label.padEnd(LABEL)}${value}${more}`
  const tree = (
    <Box flexDirection="column">
      <Box columnGap={1} flexWrap="wrap">
        {TABS.map((t, i) => (
          <Button
            plain
            hotkey={`${i + 1}`}
            key={`tab:${t.id}`}
            dimColor={t.id !== tab.id}
            onPress={() => act.tab(t.id === tab.id ? TABS[(i + 1) % TABS.length]!.id : t.id)}
          >
            {t.title}
          </Button>
        ))}
      </Box>
      {rule}
      {tab.id === 'beating' && (
        <Button plain key="session" onPress={() => act.toggleSession()}>{line('This session', v.isOn ? 'on' : 'off')}</Button>
      )}
      {rows.map(r => (
        <Box flexDirection="column">
          <Button
            plain
            key={`row:${r.key}`}
            onPress={() => (isPicker(r) ? act.open(r.key) : act.set({ [r.key]: r.values[r.values.indexOf(s[r.key]) === 0 ? 1 : 0] }))}
          >
            {line(r.label, shown(r, s[r.key], s), isPicker(r) ? ' ›' : '')}
          </Button>
          {r.key === 'color' && s.color === 'custom' && (
            <Input
              key="customColor"
              label={'  hex'.padEnd(LABEL)}
              placeholder="#rrggbb"
              value={s.customColor}
              submitLabel="set"
              onSubmit={val => isHex(val.trim()) && act.set({ customColor: val.trim().toLowerCase() })}
            />
          )}
        </Box>
      ))}
      {tab.id === 'look' && s.heartPlacement === 'tail' && <Text dimColor>The heart is on the hint line, which draws it dim: color reaches the status line.</Text>}
      {tab.preview && rule}
      {tab.preview && preview(els, s, tab.preview, v.tick)}
      {rule}
      <Box gap={1}>
        <Button key="beatNow" onPress={() => act.beatNow()}>Beat now</Button>
        <Button key="reset" onPress={() => act.reset()}>{v.isResetArmed ? 'Press again to reset' : 'Reset'}</Button>
      </Box>
      {v.notice && <Text dimColor>{v.notice}</Text>}
      <Text dimColor>↑↓ move · enter changes · 1-5 or enter on the tab switches tabs · esc closes</Text>
    </Box>
  )
  return { tree, ring }
}
