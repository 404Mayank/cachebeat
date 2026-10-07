import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { VARIANTS, cells, loopIndex, previewFrame, variant } from './animations'
import { PANE } from './pane'
import { DEADLINE, IDLE, RETRY, fmt } from './register'
import { DEFAULTS, normalize, spans } from './settings'

const M = 60_000
const TICK = 80 // a frame at normal speed
const { loop: BEAT, blast: BLAST } = variant('classic')
const turn = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
const usage = (read: number, wrote: number) => ({
  input_tokens: 5, output_tokens: 1, cache_read_input_tokens: read, cache_creation_input_tokens: wrote,
})
const ok = { isAnswered: true, text: '.', usage: usage(90_000, 0) }

type World = { fork?: unknown[]; percentUsed?: number; contextTokens?: number; settings?: Partial<typeof DEFAULTS> }

const setup = async ($: Engine, on: On, world: World = {}) => {
  const clock = mock.clock(on)
  const store = new Map<string, unknown>(world.settings ? [['settings', { ...DEFAULTS, ...world.settings }]] : [])
  on('store.get', (_$, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_$, e) => (store.set(e.key, JSON.parse(JSON.stringify(e.value))), { value: undefined }) as never)
  const forks: number[] = []
  const logs: string[] = []
  const toasts: string[] = []
  const replies = world.fork ?? []
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.log', (_$, e) => (logs.push(e.text), { value: undefined }) as never)
  on('ui.toast', (_$, e) => (toasts.push(e.text), { value: undefined }) as never)
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: world.contextTokens, window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: world.percentUsed ?? 10 }],
    },
  }) as never)
  on('model.fork', () => {
    forks.push(clock.now())
    return { value: replies[forks.length - 1] ?? replies.at(-1) ?? ok } as never
  })
  const tails: (string | undefined)[] = []
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    tails.push(e.props.tail)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  on('ui.focus', () => ({})) // the engine's ring; a move the test raises lands
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return { clock, forks, logs, toasts, tails, store }
}

const cmd = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'cachebeat', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text

const HINT = {
  plugin: 'cachebeat', surface: 'terminal', component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '← for agents' },
} as const
const row = (requestId: string) => ({
  plugin: 'cachebeat', surface: 'terminal', component: 'TurnDuration', requestId,
  props: { word: 'Brewed', durationMs: 2000 },
} as const)
const SETTINGS_PANE = {
  plugin: 'cachebeat', surface: 'terminal', component: 'Pane', requestId: PANE,
  props: {
    title: 'cachebeat', isFocused: true, bodyColumns: 80, placement: 'inline',
    scroll: { offset: 0, bodyRows: 40 }, view: {},
  },
} as const

/** The texts drawn for a mounted site, then unmounted. */
const draw = async ($: Engine, site: Parameters<Engine['ui']['mount']>[0]) => {
  const ui = await $.ui.mount(site)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  return texts
}
const stored = (store: Map<string, unknown>) => normalize(store.get('settings'))

test('fmt counts down by the minute, in hours past one', () => {
  expect([fmt(49.2 * M), fmt(10_000), fmt(60 * M), fmt(125 * M)]).toEqual(['50m', '1m', '1h', '2h 5m'])
})

test('every frame of a variant is as wide as the rest of it', () => {
  expect(VARIANTS.length).toBe(19)
  for (const x of VARIANTS) {
    const widths = new Set([...x.loop, ...x.blast].map(cells))
    expect([x.id, widths.size]).toEqual([x.id, 1])
  }
})

test('lub-dub plays the loop twice, then rests as long as one pass', () => {
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(t => loopIndex(3, t, 'lubdub'))).toEqual([0, 1, 2, 0, 1, 2, 0, 0, 0])
  expect([0, 1, 2, 3].map(t => loopIndex(3, t, 'linear'))).toEqual([0, 1, 2, 0])
})

test('the preview plays five loops, then the blast', () => {
  const x = variant('classic')
  expect(previewFrame(x, 5 * x.loop.length - 1, 'linear')).toBe(x.loop.at(-1))
  expect(previewFrame(x, 5 * x.loop.length, 'linear')).toBe(x.blast[0])
  expect(previewFrame(x, 5 * x.loop.length + x.blast.length, 'linear')).toBe(x.loop[0])
})

test('settings from an older store fall back to the defaults one by one', () => {
  expect(normalize({ interval: 5, variant: 'gone', speed: 3, extra: 1, statusLine: 'inline' })).toEqual({ ...DEFAULTS, interval: 5 })
  expect(normalize(undefined)).toEqual(DEFAULTS)
})

test('flow sweeps a highlight across the text; flash lights it on a full heart', () => {
  const s = { ...DEFAULTS, color: 'claude', effect: 'flow' as const }
  expect(spans('abcdefgh', s, 5, false)).toEqual([
    { text: 'a', color: 'claude', dim: false },
    { text: 'bcd', color: 'claudeShimmer', dim: false },
    { text: 'efgh', color: 'claude', dim: false },
  ])
  const flash = { ...s, effect: 'flash' as const }
  expect(spans('x', flash, 0, true)).toEqual([{ text: 'x', color: 'claudeShimmer', dim: false }])
  expect(spans('x', flash, 0, false)).toEqual([{ text: 'x', color: 'claude', dim: false }])
  expect(spans('x', { ...flash, color: 'custom', customColor: '#000000' }, 0, true)).toEqual([{ text: 'x', color: '#737373', dim: false }])
})

test('off by default: no beats', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.complete(turn)
  await clock.advance(IDLE * 3)
  expect(forks.length).toBe(0)
})

test('commands answer for the state they find', async ($: Engine, on: On) => {
  await setup($, on)
  expect(await cmd($, 'off')).toBe('already off')
  expect(await cmd($, 'on')).toBe('on, every 50m idle · starts after your next turn')
  expect(await cmd($, 'on')).toBe('already on, every 50m idle · starts after your next turn')
  expect(await cmd($, '5')).toBe('interval 50m → 5m · starts after your next turn')
  expect(await cmd($, 'on 5')).toBe('already on, every 5m idle · starts after your next turn')
  expect(await cmd($, 'off')).toBe('off')
  expect(await cmd($, 'bogus')).toBe('usage: /cachebeat [on|off|<minutes>|now|global on|off|settings]')
})

test('a global default on starts a new session beating', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { defaultOn: true, interval: 5 } })
  await $.turn.complete(turn)
  await clock.advance(5 * M)
  expect(forks).toEqual([5 * M])
})

test('global on sets the default and turns this session on; global off the reverse', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  expect(await cmd($, 'global')).toBe('new sessions start off · usage: /cachebeat [on|off|<minutes>|now|global on|off|settings]')
  expect(await cmd($, 'global on')).toBe('new sessions start on · this session: on, every 50m idle · starts after your next turn')
  expect(stored(store).defaultOn).toBe(true)
  expect(await cmd($, 'global off')).toBe('new sessions start off · this session: off')
  expect(stored(store).defaultOn).toBe(false)
})

test('an interval set for the session leaves the global one; set globally, it changes it', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, '7')
  expect(stored(store).interval).toBe(50)
  await cmd($, 'off')
  store.set('settings', { ...DEFAULTS, intervalScope: 'global' })
  await $.turn.complete(turn) // picks up the store
  expect(await cmd($, '9')).toBe('on, every 9m idle · next beat in 9m')
  expect(stored(store).interval).toBe(9)
})

test('on mid-idle beats at lastTurn + IDLE, then every IDLE', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect(await cmd($, 'on')).toBe('on, every 50m idle · next beat in 40m')
  await clock.advance(40 * M)
  expect(forks).toEqual([IDLE])
  await clock.advance(IDLE)
  expect(forks.length).toBe(2)
  expect(await cmd($, '')).toBe('on, every 50m idle · 2 beats · next beat in 50m')
})

test('now beats at once and reschedules from it', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await cmd($, '5')
  expect(await cmd($, 'now')).toBe('nothing to keep warm until this session has a turn')
  expect(await cmd($, '')).toContain('on, every 5m idle')
  await $.turn.complete(turn)
  await clock.advance(2 * M)
  expect(await cmd($, 'now')).toBe('♥ cache renewed (90,000 read, 0 written)')
  await clock.advance(5 * M)
  expect(forks).toEqual([2 * M, 7 * M])
})

test('a new interval reschedules from the last cache read', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.complete(turn)
  await cmd($, '3')
  await clock.advance(3 * M) // beat 1 at 3
  expect(await cmd($, '4')).toBe('interval 3m → 4m · next beat in 4m')
  await clock.advance(4 * M)
  expect(forks).toEqual([3 * M, 7 * M])
})

test('turned on within the hour after a turn but past the interval, it beats at once', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect(await cmd($, '3')).toBe('on, every 3m idle · beating now')
  await clock.settle()
  expect(forks).toEqual([10 * M])
})

test('off, a new turn and a subagent turn each keep it from beating', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await cmd($, 'off')
  await clock.advance(IDLE * 2)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await clock.advance(IDLE * 2)
  await $.turn.complete({ ...turn, agentId: 'sub' })
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
})

test('the beat line sits under the last turn\'s closing row, counts beats and down to the next', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on)
  await cmd($, '3')
  await $.turn.complete(turn)
  expect(await draw($, row('r1'))).toEqual(['engine']) // no beat yet
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×1 · next in 3m'])
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×2 · next in 3m'])
  expect(logs).toEqual([]) // the row carries it, no log lines

  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete(turn)
  expect(await draw($, row('r2'))).toEqual(['engine'])
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×2']) // frozen
})

test('the beat line goes after a blank line, or nowhere; with the tokens kept', async ($: Engine, on: On) => {
  const { clock, store } = await setup($, on, { settings: { statusLine: 'spaced', showTokens: true } })
  await cmd($, '3')
  await $.turn.complete(turn)
  await draw($, row('r1'))
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×1 · 90k cached · next in 3m'])
  const ui = await $.ui.mount(row('r1'))
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props?.marginTop === 1 && b.text?.includes('kept warm'))).toBe(true)
  await ui.unmount()

  store.set('settings', { ...DEFAULTS, statusLine: 'off' })
  await $.turn.start({ text: 'hi', turnId: 't3' })
  await $.turn.complete(turn)
  expect(await draw($, row('r1'))).toEqual(['engine'])
})

test('with no closing row seen, a beat logs a line instead', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on)
  await cmd($, '3')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs).toEqual(['♥ cache renewed (90,000 read, 0 written)'])
})

test('a beat can toast', async ($: Engine, on: On) => {
  const { clock, toasts } = await setup($, on, { settings: { onBeat: 'toast' } })
  await cmd($, '3')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(toasts).toEqual(['♥ cache kept warm · 90k read'])
})

test('stops when the fork was not served from cache', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { fork: [{ ...ok, usage: usage(0, 90_000) }] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE * 3)
  expect(forks.length).toBe(1)
  expect(logs.at(-1)).toContain('stopped: the cache was not served')
  expect(await cmd($, '')).toBe('off')
})

test('stops at the deadline after the last real turn', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(DEADLINE + IDLE * 2)
  expect(forks.length).toBe(Math.ceil(DEADLINE / IDLE) - 1)
  expect(logs.at(-1)).toBe('stopped: 8h since your last turn')
})

test('the deadline is a setting, and a stop can toast', async ($: Engine, on: On) => {
  const { clock, forks, logs, toasts } = await setup($, on, { settings: { stopAfterHours: 1, onStop: 'toast' } })
  await cmd($, '20')
  await $.turn.complete(turn)
  await clock.advance(2 * 60 * M)
  expect(forks).toEqual([20 * M, 40 * M])
  expect(logs.filter(l => l.startsWith('stopped'))).toEqual([])
  expect(toasts).toEqual(['cachebeat stopped: 1h since your last turn'])
})

test('stops without forking once a usage limit is used up', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { percentUsed: 100 })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE)
  expect(forks.length).toBe(0)
  expect(logs.at(-1)).toBe('stopped: five-hour usage limit reached')
})

test('stops at the usage threshold set', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { percentUsed: 92, settings: { stopAtUsage: 90 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE)
  expect(forks.length).toBe(0)
  expect(logs.at(-1)).toBe('stopped: five-hour usage at 92%, past 90%')
})

test('skips a small context and stays on for the next turn', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { contextTokens: 8_000, settings: { skipSmall: true } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
  expect(logs).toEqual(['skipped: the context is 8k tokens, under 20k'])
  expect(await cmd($, '')).toBe('on, every 50m idle · 0 beats · starts after your next turn')
})

test('stops on a rate limit', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage: usage(0, 0) }
  const { clock, logs } = await setup($, on, { fork: [err] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE)
  expect(logs.at(-1)).toBe('stopped: rate limited')
})

test('retries a transient error a minute later', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks } = await setup($, on, { fork: [err, ok] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE + RETRY)
  expect(forks).toEqual([IDLE, IDLE + RETRY])
})

test('gives up retrying once the cache must have expired', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks, logs } = await setup($, on, { fork: [err] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(2 * IDLE)
  expect(forks.length).toBe(10) // minutes 50..59; at 60 the cache is gone, so no fork
  expect(logs.at(-1)).toContain('so it has expired')
})

test('the heart rides the hint row as its dim tail: still while waiting, beating once armed', async ($: Engine, on: On) => {
  const { clock, tails } = await setup($, on)
  await draw($, HINT)
  expect(tails.at(-1)).toBeUndefined()
  await cmd($, 'on')
  await draw($, HINT)
  expect(tails.at(-1)).toBe(`${BEAT[0]} ×0`)
  await $.turn.complete(turn)
  await clock.advance(5 * TICK)
  await draw($, HINT)
  expect(BEAT.map(f => `${f} ×0`)).toContain(tails.at(-1))
})

test('a beat plays the blast in place of the heartbeat', async ($: Engine, on: On) => {
  const { clock, tails } = await setup($, on)
  await cmd($, '3')
  await $.turn.complete(turn)
  await clock.advance(3 * M + 3 * TICK + TICK / 2)
  await draw($, HINT)
  expect(BLAST.map(f => `${f} ×1`)).toContain(tails.at(-1))
  await clock.advance(2000)
  await draw($, HINT)
  expect(BEAT.map(f => `${f} ×1`)).toContain(tails.at(-1))
})

test('the variant picks the frames; the count can hide; still when not animated', async ($: Engine, on: On) => {
  const { clock, tails, store } = await setup($, on, { settings: { variant: 'ecg', showCount: false } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * TICK)
  await draw($, HINT)
  expect(variant('ecg').loop).toContain(tails.at(-1))
  store.set('settings', { ...DEFAULTS, variant: 'ecg', animate: false })
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete(turn)
  await clock.advance(7 * TICK)
  await draw($, HINT)
  expect(tails.at(-1)).toBe(`${variant('ecg').loop[0]} ×0`)
})

test('a preset is drawn as hex, lit a lighter shade', () => {
  expect(spans('x', { ...DEFAULTS, color: 'red', effect: 'flash' }, 0, true)).toEqual([{ text: 'x', color: '#f1a09c', dim: false }])
})

test('on its own line the heart takes the color', async ($: Engine, on: On) => {
  await setup($, on, { settings: { heartPlacement: 'line', color: 'claude' } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  const ui = await $.ui.mount(HINT)
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  expect(texts[0]?.text).toBe('engine')
  expect(BEAT).toContain(texts[1]?.text)
  expect(texts[1]?.props).toMatchObject({ color: 'claude' })
  expect(texts[2]?.text).toBe(' ×0')
})

const buttons = async (ui: { findAll: (q: { type: string }) => Promise<{ key?: string }[]> }, prefix: string) =>
  (await ui.findAll({ type: 'Button' })).map(b => b.key ?? '').filter(k => k.startsWith(prefix))

test('the settings pane: tabs, toggles in place, pickers for the rest', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  expect(await cmd($, 'settings')).toBe('settings opened')
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect(await buttons(ui, 'tab:')).toEqual(['tab:beating', 'tab:heart', 'tab:look', 'tab:status', 'tab:alerts'])

  await ui.press({ key: 'row:defaultOn' }) // two values: toggles
  expect(stored(store).defaultOn).toBe(true)
  expect(await ui.find({ key: 'row:skipSmallTokens' })).toBeUndefined() // shows only once skipping
  await ui.press({ key: 'row:skipSmall' })
  expect(await ui.find({ key: 'row:skipSmallTokens' })).toBeDefined()

  await ui.press({ key: 'row:interval' }) // more: a picker
  expect(await buttons(ui, 'opt:')).toHaveLength(13)
  await ui.press({ key: 'opt:3' })
  expect(stored(store).interval).toBe(5)
  expect(await ui.find({ key: 'row:interval' })).toBeDefined() // back on the tab

  await ui.press({ key: 'session' })
  expect(await cmd($, '')).toContain('on, every 5m idle')

  await ui.press({ key: 'tab:beating' }) // Enter on the open tab moves on to the next
  expect(await ui.find({ key: 'row:variant' })).toBeDefined()
  await ui.press({ key: 'row:variant' })
  expect(await buttons(ui, 'opt:')).toHaveLength(19)
  await ui.press({ key: 'opt:13' })
  expect(stored(store).variant).toBe('orbit')
  await ui.unmount()
})

test('the focused option of a picker shows in the preview before it is picked', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'tab:look' })
  await ui.press({ key: 'row:color' })
  await $.ui.focus({ component: 'Pane', requestId: PANE, element: 'opt:2', origin: { kind: 'person' } }) // permission
  const line = (await ui.findAll({ type: 'Text' })).find(t => t.text?.includes('cache kept warm'))
  expect(line?.props).toMatchObject({ color: 'permission' })
  expect(stored(store).color).toBe('dim')
  await ui.unmount()
})

test('settings changes keep another session\'s; reset asks twice', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'row:defaultOn' })
  store.set('settings', { ...stored(store), interval: 10 }) // another session's change
  await ui.press({ key: 'row:stopAtUsage' })
  await ui.press({ key: 'opt:4' })
  expect(stored(store)).toMatchObject({ interval: 10, stopAtUsage: 90, defaultOn: true })
  await ui.press({ key: 'reset' })
  expect(stored(store).interval).toBe(10)
  expect((await ui.find({ key: 'reset' }))?.text).toBe('Press again to reset')
  await ui.press({ key: 'reset' })
  expect(stored(store)).toEqual(DEFAULTS)
  await ui.unmount()
})
