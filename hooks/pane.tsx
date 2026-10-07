import type { Elements, RenderElement } from 'claude-code'
import type { PanePage, BeatSettings } from '../types'
import { VARIANTS, previewFrame, variant } from './animations'
import type { Row, Span } from './settings'
import { SECTIONS, cycle, isHex, isLit, spans, tokens } from './settings'

export const PANE = 'cachebeat-settings'

type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input'>
export type Actions = {
  set: (patch: Partial<BeatSettings>) => void
  page: (p: PanePage) => void
  beatNow: () => void
  reset: () => void
  close: () => void
}

const WIDTH = 24 // the label column

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

function preview(els: Els, s: BeatSettings, tick: number) {
  const { Box, Text } = els
  const x = variant(s.variant)
  const frame = s.animate ? previewFrame(x, tick, s.timing) : x.loop[0]!
  const lit = isLit(frame)
  // the hint line's tail takes text alone, drawn dim
  const heart = s.heartPlacement === 'tail' ? [{ text: frame, dim: true }] : spans(frame, s, tick, lit)
  const line = paint(Text, spans(statusText(s, 3, 184_000, '42m'), s, tick, lit))
  const turn = <Text dimColor>✻ Brewed for 2s</Text>
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{'Heart'.padEnd(WIDTH)}</Text>
        {paint(Text, heart)}
        {s.showCount && <Text dimColor>3</Text>}
      </Box>
      <Box flexDirection="column">
        <Text bold>Status line</Text>
        {s.statusLine === 'off' ? (
          turn
        ) : s.statusLine === 'inline' ? (
          <Box>
            {turn}
            <Text dimColor> · </Text>
            {line}
          </Box>
        ) : (
          <Box flexDirection="column">
            {turn}
            <Box marginTop={s.statusLine === 'spaced' ? 1 : 0}>{line}</Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function row(els: Els, r: Row, s: BeatSettings, act: Actions) {
  const { Button } = els
  const v = s[r.key]
  const shown = r.fmt ? r.fmt(v, s) : String(v)
  return <Button plain key={`row:${r.key}`} onPress={() => act.set({ [r.key]: cycle(r, s) })}>{`  ${r.label.padEnd(WIDTH - 2)}${shown}`}</Button>
}

function main(els: Els, s: BeatSettings, tick: number, act: Actions) {
  const { Box, Text, Button, Input } = els
  return (
    <Box flexDirection="column">
      {preview(els, s, tick)}
      {SECTIONS.map(sec => (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{sec.title}</Text>
          {sec.title === 'Heart' && (
            <Button plain key="animations" onPress={() => act.page('animations')}>
              {`  ${'Animation'.padEnd(WIDTH - 2)}${variant(s.variant).name} ›`}
            </Button>
          )}
          {sec.rows.filter(r => !r.show || r.show(s)).map(r => row(els, r, s, act))}
          {sec.title === 'Look' && s.color === 'custom' && (
            <Input
              key="customColor"
              label={`  ${'Custom color'.padEnd(WIDTH - 2)}`}
              placeholder="#rrggbb"
              value={s.customColor}
              submitLabel="set"
              onSubmit={v => isHex(v.trim()) && act.set({ customColor: v.trim().toLowerCase() })}
            />
          )}
        </Box>
      ))}
      <Box gap={1}>
        <Button key="beatNow" onPress={() => act.beatNow()}>Beat now</Button>
        <Button key="reset" onPress={() => act.reset()}>Reset to defaults</Button>
        <Button key="close" role="dismiss" onPress={() => act.close()}>Close</Button>
      </Box>
      <Text dimColor>Tab moves · Enter changes · Esc closes · saved for every session</Text>
    </Box>
  )
}

function gallery(els: Els, s: BeatSettings, tick: number, act: Actions) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="column">
      <Box gap={1} marginBottom={1}>
        <Button key="back" onPress={() => act.page('main')}>‹ Back</Button>
        <Text dimColor>Enter picks · each plays five loops, then the blast a beat sets off</Text>
      </Box>
      {VARIANTS.map(x => {
        const frame = previewFrame(x, tick, s.timing)
        return (
          <Box>
            <Button plain key={`variant:${x.id}`} onPress={() => act.set({ variant: x.id })}>
              {`${x.id === s.variant ? '●' : ' '} ${x.name.padEnd(11)}`}
            </Button>
            {paint(Text, spans(frame, { ...s, animate: true }, tick, isLit(frame)))}
          </Box>
        )
      })}
    </Box>
  )
}

export function settingsPane(els: Els, s: BeatSettings, page: PanePage, tick: number, act: Actions): RenderElement {
  return page === 'animations' ? gallery(els, s, tick, act) : main(els, s, tick, act)
}
