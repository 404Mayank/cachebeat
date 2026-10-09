import type { Elements, RenderElement } from 'claude-code'
import type { BeatSettings, PanePage } from '../types'
import { previewFrame, statusFrame, variant } from './animations'
import type { Preview, Row, Span, Value } from './settings'
import { DEFAULTS, HEX_OF, SESSION_HELP, TABS, isFlip, isHex, isLit, lookOf, rowOf, spans, tokens } from './settings'

export const PANE = 'cachebeat-settings'

type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input'>
export type Actions = {
  set: (patch: Partial<BeatSettings>) => void
  tab: (id: string) => void
  at: (key: string) => void // a press lands the focus on what was pressed (a click on a row from the tabs)
  open: (key: keyof BeatSettings) => void
  pick: (key: keyof BeatSettings, value: Value) => void
  back: () => void
  toggleSession: () => void
  beatNow: () => void
  reset: () => void
  refuse: (text: string) => void // a typed value the setting doesn't take: says why in the footer
  resetRow: (key: keyof BeatSettings) => void // one setting back to its default
}
/** What the pane draws from, besides the settings. */
export type View = {
  page: PanePage
  tick: number
  focus: string
  columns: number
  isOn: boolean // this session beats
  sessionMinutes: number | null // this session's own interval, set by /cachebeat <minutes>
  autoMinutes: number // what `auto` beats at for this session's cache
  isTerminal: boolean // the terminal's keys walk the pane; a desktop's Tab and clicks move its own focus
  notice: string // the last action's outcome, shown in the footer
  isResetArmed: boolean
  customs: Partial<Record<keyof BeatSettings, Value>> // the custom value each setting last took, kept past a preset
}

const LABEL = 22

/** What the pane's buttons do, for the help line while one is focused. */
const BUTTON_HELP: Record<string, string> = {
  beatNow: 'Beats now, and counts the next from there.',
  reset: 'Puts every setting back to its default; press twice.',
}

export function paint(Text: Els['Text'], list: Span[]) {
  return list.map(sp => (sp.color ? <Text color={sp.color} dimColor={sp.dim}>{sp.text}</Text> : <Text dimColor={sp.dim}>{sp.text}</Text>))
}

/**
 * The status line from the session's figures: its beats, what the last one read, the time to the
 * next; before the first beat, the time to it alone. '' when there is nothing to say.
 */
export function statusText(s: BeatSettings, beats: number, read: number | null, next: string | null) {
  const countdown = s.showCountdown && next
  if (beats === 0) return countdown ? `♡ next beat in ${next}` : ''
  let text = `♥ cache kept warm ×${beats}`
  if (s.showTokens && read) text += ` · ${tokens(read)} cached`
  if (countdown) text += ` · next in ${next}`
  return text
}

/** A value as its row shows it. */
export const shown = (row: Row, v: Value, s: BeatSettings) => (row.fmt ? row.fmt(v, s) : String(v))

function preview(els: Els, s: BeatSettings, kind: Preview, tick: number) {
  const { Box, Text } = els
  const x = variant(s.variant)
  const heartLook = lookOf(s, 'heart')
  const lineLook = lookOf(s, 'line')
  const frame = heartLook.animate ? previewFrame(x, tick, heartLook.timing) : x.loop[0]!
  // the hint line takes text alone, drawn dim
  const heart = s.heartPlacement === 'tail' ? [{ text: frame, dim: true }] : spans(frame, heartLook, tick, isLit(frame))
  const sample = statusText(s, 3, 184_000, '42m')
  const lead = lineLook.animate && s.statusHeart !== 'off' ? statusFrame(s.statusHeart, tick, lineLook.timing) : ''
  const lineLit = isLit(lead || statusFrame('beat', tick, lineLook.timing))
  const line = paint(Text, spans(lead ? sample.replace(/^[♥♡]/, lead) : sample, lineLook, tick, lineLit))
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
          {s.showCount && <Text dimColor> ×3</Text>}
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

/** What `Beat after idle` adds to its value: what `auto` comes to now, and this session's own interval. */
const intervalTail = (s: BeatSettings, v: View) =>
  (s.interval === 'auto' ? ` · ${v.autoMinutes}m now` : '') + (v.sessionMinutes !== null ? ` · this session ${v.sessionMinutes}m` : '')

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
    const isStatusHeart = key === 'statusHeart'
    // the focused option stands in for the setting in the preview, before it is picked
    const focused = /^opt:(\d+)$/.exec(v.focus)
    const trial = focused ? { ...s, [key]: row.values[Number(focused[1])] } : s
    ring.push('back', ...row.values.map((_, i) => `opt:${i}`))
    if (row.custom) ring.push('custom')
    const isCustom = !row.values.includes(s[key])
    const tree = (
      <Box flexDirection="column">
        <Box gap={1}>
          <Button plain key="back" onPress={() => act.back()}>‹</Button>
          <Text bold>{row.label.trim()}</Text>
        </Box>
        <Text dimColor>{row.help}</Text>
        {rule}
        {row.values.map((val, i) => {
          const look = lookOf(s, key === 'statusHeart' || key === 'lineColor' ? 'line' : 'heart')
          const frame = isVariant ? previewFrame(variant(String(val)), v.tick, look.timing)
            : isStatusHeart ? statusFrame(String(val), v.tick, look.timing)
            : ''
          const sample = frame
            ? spans(frame, { ...look, animate: true }, v.tick, isLit(frame))
            : HEX_OF[key] && val !== 'dim'
              ? spans('♥ ♥ ♥', { ...look, color: String(val), effect: 'steady' }, 0, false)
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
        {row.custom && (
          <Input
            key="custom"
            label={`${isCustom ? '●' : ' '} ${'custom'.padEnd(LABEL)}`}
            placeholder={row.custom.placeholder}
            value={isCustom ? shown(row, s[key], s) : v.customs[key] !== undefined ? shown(row, v.customs[key]!, s) : ''}
            submitLabel="set"
            onSubmit={text => {
              const r = row.custom!.parse
              const val = r(text)
              if (val !== undefined) act.pick(key, val)
              else act.refuse(`${row.label.trim()} takes ${r.min}–${r.max} ${r.unit}, not "${text.trim()}"`)
            }}
          />
        )}
        {tab.preview && !isVariant && rule}
        {tab.preview && !isVariant && preview(els, trial, tab.preview, v.tick)}
        {v.notice && <Text dimColor>{v.notice}</Text>}
        <Text dimColor>{v.isTerminal ? '↑↓ move · enter picks · esc back' : 'enter or a click picks · esc back'}</Text>
      </Box>
    )
    return { tree, ring }
  }

  const tab = TABS.find(t => t.id === v.page.tab) ?? TABS[0]!
  const rows = tab.rows.filter(r => !r.show || r.show(s))
  // the tab's own ring: the tab bar above it is a level of its own, reached by Esc
  if (tab.id === 'beating') ring.push('session')
  const hexOf = (r: Row) => (HEX_OF[r.key] && s[r.key] === 'custom' ? HEX_OF[r.key] : undefined)
  for (const r of rows) {
    ring.push(`row:${r.key}`)
    const hex = hexOf(r)
    if (hex) ring.push(hex)
  }
  if (tab.id === 'beating') ring.push('beatNow', 'reset') // the buttons sit with beating
  const focusedRow = rows.find(r => v.focus === `row:${r.key}` || v.focus === hexOf(r))
  const help = v.focus === 'session' ? SESSION_HELP : focusedRow?.help ?? BUTTON_HELP[v.focus] ?? ''
  // r takes the focused setting back to its default, its custom value kept in its list
  const resettable = focusedRow && s[focusedRow.key] !== DEFAULTS[focusedRow.key] ? focusedRow : undefined
  const keys = `1-${TABS.length}`

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
            onPress={() => act.tab(t.id)}
          >
            {t.title}
          </Button>
        ))}
      </Box>
      {rule}
      <Text dimColor>{tab.id === 'beating' ? 'This session is this session alone; every other setting applies to every session.' : 'These apply to every session.'}</Text>
      {tab.id === 'beating' && (
        <Button plain key="session" onPress={() => (act.at('session'), act.toggleSession())}>{line('This session', v.isOn ? 'on' : 'off')}</Button>
      )}
      {rows.map(r => (
        <Box flexDirection="column">
          <Button
            plain
            key={`row:${r.key}`}
            onPress={() => (isFlip(r) ? (act.at(`row:${r.key}`), act.set({ [r.key]: r.values[r.values.indexOf(s[r.key]) === 0 ? 1 : 0] })) : act.open(r.key))}
          >
            {line(
              r.label,
              shown(r, s[r.key], s) + (r.key === 'interval' ? intervalTail(s, v) : ''),
              isFlip(r) ? '' : ' ›',
            )}
          </Button>
          {hexOf(r) && (
            <Input
              key={hexOf(r)!}
              label={'  hex'.padEnd(LABEL)}
              placeholder="#rrggbb"
              value={String(s[hexOf(r)!])}
              submitLabel="set"
              onSubmit={val => (isHex(val.trim()) ? act.set({ [hexOf(r)!]: val.trim().toLowerCase() }) : act.refuse(`hex takes #rrggbb, not "${val.trim()}"`))}
            />
          )}
        </Box>
      ))}
      {tab.preview && rule}
      {tab.preview && preview(els, s, tab.preview, v.tick)}
      {rule}
      {(tab.id === 'beating' || resettable) && (
        <Box gap={1}>
          {tab.id === 'beating' && <Button key="beatNow" onPress={() => (act.at('beatNow'), act.beatNow())}>Beat now</Button>}
          {tab.id === 'beating' && (
            <Button key="reset" onPress={() => (act.at('reset'), act.reset())}>{v.isResetArmed ? 'Press again to reset all' : 'Reset all'}</Button>
          )}
          {resettable && (
            <Button plain hotkey="r" key="resetRow" onPress={() => act.resetRow(resettable.key)}>
              <Text dimColor>{`back to ${shown(resettable, DEFAULTS[resettable.key], s)}`}</Text>
            </Button>
          )}
        </Box>
      )}
      {help && <Text dimColor>{help}</Text>}
      {v.notice && <Text dimColor>{v.notice}</Text>}
      <Text dimColor>
        {!v.isTerminal ? `tab moves · enter or a click changes · ${keys} tabs · esc closes`
          : v.focus.startsWith('tab:') ? `↑↓ tabs · enter or ${keys} opens · esc closes`
          : `↑↓ move · enter changes · ${keys} tabs · esc back to the tabs`}
      </Text>
    </Box>
  )
  return { tree, ring }
}
