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
  resetRow: (key: keyof BeatSettings) => void // one setting back to its default; one of this folder's own dropped
  dropSession: () => void // this session's own interval dropped: it follows the settings
  toggleFolder: () => void // menu changes save for this folder alone, or all folders
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
  own: Partial<BeatSettings> // the settings this folder has of its own
  path: string // this folder, cut to fit
  editsFolder: boolean // the menu shows and saves this folder's own settings; else all folders'
  allFolders: BeatSettings // the settings for all folders, which a folder's own setting goes back to
}

const LABEL = 22

/** What the pane's buttons do, for the help line while one is focused. */
const BUTTON_HELP: Record<string, string> = {
  beatNow: 'Beats now, and counts the next from there.',
  reset: 'Puts every setting back to its default; press twice.',
}

/** `path` cut from the left to `width` cells, whole folders kept where they fit: …/code/api. */
export function cut(path: string, width: number) {
  if (path.length <= width) return path
  const sep = path.includes('/') ? '/' : '\\'
  const parts = path.split(sep)
  let tail = parts.pop()!
  while (parts.length && `…${sep}${parts.at(-1)}${sep}${tail}`.length <= width) tail = `${parts.pop()}${sep}${tail}`
  return `…${sep}${tail}`.length <= width ? `…${sep}${tail}` : `…${tail.slice(-(width - 1))}`
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

/** What `Beat after idle` adds to its value: what `auto` comes to now. */
const intervalTail = (s: BeatSettings, v: View) => (s.interval === 'auto' ? ` · ${v.autoMinutes}m now` : '')

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
          {v.editsFolder && <Text dimColor>{`for ${v.path} only`}</Text>}
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
  ring.push('folder')
  const hexOf = (r: Row) => (HEX_OF[r.key] && s[r.key] === 'custom' ? HEX_OF[r.key] : undefined)
  for (const r of rows) {
    ring.push(`row:${r.key}`)
    const hex = hexOf(r)
    if (hex) ring.push(hex)
  }
  if (tab.id === 'beating') ring.push('beatNow', 'reset') // the buttons sit with beating
  const focusedRow = rows.find(r => v.focus === `row:${r.key}` || v.focus === hexOf(r))
  const isOwn = (r: Row) => v.own[r.key] !== undefined
  const owned = Object.keys(v.own).length
  const sessionNow = focusedRow?.key === 'interval' && v.sessionMinutes !== null ? v.sessionMinutes : null
  const help = v.focus === 'session' ? SESSION_HELP
    : v.focus === 'folder' ? (v.editsFolder
      ? `Menu changes save for ${v.path} only. Rows marked · this folder are set here; the rest follow all folders. Enter: back to all folders.`
      : `Menu changes save for all folders.${owned ? ` Rows marked here: show what ${v.path} sets for itself.` : ''} Enter: save them for ${v.path} only.`)
    : sessionNow !== null ? `${sessionNow}m for this session only; otherwise ${shown(focusedRow!, s.interval, s)}. r drops it.`
    : v.focus === 'reset' && v.editsFolder ? `Drops ${v.path}'s own settings, so each follows all folders; press twice.`
    : focusedRow?.help ?? BUTTON_HELP[v.focus] ?? ''
  // r takes the focused setting back: this session's own interval first; in this folder's settings,
  // one of its own back to all folders'; in all folders', a setting to its default, its custom value
  // kept in its list
  const back = !focusedRow ? undefined
    : sessionNow !== null ? { label: `back to ${shown(focusedRow, s.interval, s)}`, run: act.dropSession }
    : v.editsFolder ? (isOwn(focusedRow) ? { label: `back to ${shown(focusedRow, v.allFolders[focusedRow.key], s)} (all folders)`, run: () => act.resetRow(focusedRow.key) } : undefined)
    : s[focusedRow.key] !== DEFAULTS[focusedRow.key] ? { label: `back to ${shown(focusedRow, DEFAULTS[focusedRow.key], s)}`, run: () => act.resetRow(focusedRow.key) }
    : undefined
  const keys = `1-${TABS.length}`
  // a row's value, and where it comes from when not the settings on show: this session, or this folder
  const valueOf = (r: Row) => {
    if (r.key === 'interval' && v.sessionMinutes !== null) return `${v.sessionMinutes}m · this session`
    const mark = !isOwn(r) ? '' : v.editsFolder ? ' · this folder' : ` · here: ${shown(r, v.own[r.key]!, s)}`
    return shown(r, s[r.key], s) + (r.key === 'interval' ? intervalTail(s, v) : '') + mark
  }

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
      {tab.id === 'beating' && (
        <Button plain key="session" onPress={() => (act.at('session'), act.toggleSession())}>{line('This session', v.isOn ? 'on' : 'off')}</Button>
      )}
      <Button plain dimColor={!v.editsFolder} key="folder" onPress={() => (act.at('folder'), act.toggleFolder())}>
        {line('Settings for', v.editsFolder ? `this folder · ${v.path}` : 'all folders')}
      </Button>
      {rows.map(r => (
        <Box flexDirection="column">
          <Button
            plain
            key={`row:${r.key}`}
            onPress={() => (isFlip(r) ? (act.at(`row:${r.key}`), act.set({ [r.key]: r.values[r.values.indexOf(s[r.key]) === 0 ? 1 : 0] })) : act.open(r.key))}
          >
            {line(r.label, valueOf(r), isFlip(r) ? '' : ' ›')}
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
      {(tab.id === 'beating' || back) && (
        <Box gap={1}>
          {tab.id === 'beating' && <Button key="beatNow" onPress={() => (act.at('beatNow'), act.beatNow())}>Beat now</Button>}
          {tab.id === 'beating' && (
            <Button key="reset" onPress={() => (act.at('reset'), act.reset())}>
              {v.editsFolder ? (v.isResetArmed ? 'Press again to reset this folder' : 'Reset folder') : v.isResetArmed ? 'Press again to reset all' : 'Reset all'}
            </Button>
          )}
          {back && (
            <Button plain dimColor hotkey="r" key="resetRow" onPress={() => back.run()}>
              {back.label}
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
