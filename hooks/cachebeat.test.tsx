import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Saved } from '../types'
import { VARIANTS, cells, loopIndex, previewFrame, slotText, slotWidths, variant } from './animations'
import { PANE, cut } from './pane'
import { TTL_MS, viewOf } from './cache'
import { isPriced, learnRate, money, priceOf, writeRate } from './prices'
import type { Learned } from './prices'
import { DEADLINE, IDLE, RETRY, STEP, clockText, fmt, restored } from './register'
import { DEFAULTS, EPISODE, SESSION_HELP, accept, glyphs, lookOf, minutesText, mixedMode, normalize, parseDuration, parseFrameMs, parseHours, parseMinutes, parsePercent, parseTokens, spans } from './settings'
import { SET, STATE } from './tools'

/** The tools as the model calls them: `mcp__<plugin>__<name>`, spelled out as register.tsx's matchers are. */
const TOOL = { state: 'mcp__cachebeat__state', set: 'mcp__cachebeat__set' } as const

const M = 60_000
const TICK = 80 // a frame at normal speed
const { loop: BEAT, blast: BLAST } = variant('classic')
const usage = (read: number, wrote: number) => ({
  input_tokens: 5, output_tokens: 1, cache_read_input_tokens: read, cache_creation_input_tokens: wrote,
})
const OPUS = 'claude-opus-5-5'
const HOME = '/home/me/code/api' // the session's folder
const OTHER = '/home/me/code/web'
// a turn that sent its requests on Opus; one without usage sent none
const turn = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', usage: { ...usage(90_000, 0), model: OPUS } } as const
const ok = { isAnswered: true, text: '.', usage: usage(90_000, 0) }

type World = {
  fork?: unknown[]; percentUsed?: number; contextTokens?: number; lastUsage?: unknown; forkUsd?: number; noCost?: boolean; settings?: Partial<typeof DEFAULTS>
  env?: Record<string, string>; settingsFile?: Record<string, unknown>; isSubscription?: boolean
  folders?: Record<string, unknown> // the store's folders, by path
  chat?: ReturnType<typeof said>[] // the conversation as the session starts: one there means a resumed session
  during?: (n: number) => Promise<void> // runs while beat n (from 1) is on its way: turn events can arrive meanwhile
}

const setup = async ($: Engine, on: On, world: World = {}) => {
  // wall time the machine slept through: the time the plugin reads jumps, and no timer fires, as when the computer suspends.
  // Registered before mock.clock's hooks, which sit beneath it, and as `clock.*`: a second `clock.now` would be a repeat
  let skew = 0
  let held: Promise<void> | null = null // the next `clock.now` answers once this resolves: a step's check left waiting
  let afters = 0 // the waits asked for since the start: one chain of steps asks one a minute
  on('clock.*', async (_$, e, next) => {
    if (next.event === 'clock.after') afters++
    const r = await next(e)
    if (next.event === 'clock.now' && held) {
      const until = held
      held = null
      await until
    }
    return (next.event === 'clock.now' ? { value: (r as { value: number }).value + skew } : r) as never
  })
  const clock = mock.clock(on)
  const store = new Map<string, unknown>(world.settings ? [['settings', { ...DEFAULTS, ...world.settings }]] : [])
  if (world.folders) store.set('folders', world.folders)
  on('store.get', (_$, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_$, e) => (store.set(e.key, JSON.parse(JSON.stringify(e.value))), { value: undefined }) as never)
  const forks: number[] = []
  const logs: string[] = []
  const toasts: string[] = []
  const replies = world.fork ?? []
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  // one request of a turn: it read the cache (as `reads` says, else all 90k), then called a tool
  const reads: ReturnType<typeof usage>[] = []
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: { ...(reads.shift() ?? usage(90_000, 0)), model: OPUS } } as never
  })
  on('ui.log', (_$, e) => (logs.push(e.text), { value: undefined }) as never)
  on('ui.toast', (_$, e) => (toasts.push(e.text), { value: undefined }) as never)
  let spent = 0 // the session's cost so far, which each fork raises by `forkUsd`
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      ...(world.noCost ? {} : { cost: { usd: spent } }),
      context: { tokens: world.contextTokens, window: 200_000, ...(world.lastUsage ? { breakdown: { apiUsage: world.lastUsage } } : {}) },
      rateLimits: world.isSubscription === false ? [] : [{ kind: 'five_hour', percentUsed: world.percentUsed ?? 10 }],
    },
  }) as never)
  let model: string = OPUS
  on('session.model', () => ({ value: model }) as never)
  let root = HOME
  on('session.root', () => ({ value: root }) as never)
  // the conversation as a turn leaves it; /rewind takes it back, and a turn adds to it
  let chat = world.chat ?? [] // a new session's: empty
  on('session.messages', () => ({ value: chat.slice(-4096) }) as never) // the engine lists the newest 4096
  mock.env(on, world.env ?? {})
  on('settings.read', () => ({ value: world.settingsFile ?? {} }) as never)
  const prompts: string[] = []
  on('model.fork', async (_$, e) => {
    prompts.push(e.prompt)
    forks.push(clock.now())
    if (world.during) await world.during(forks.length)
    spent += world.forkUsd ?? 0
    return { value: replies[forks.length - 1] ?? replies.at(-1) ?? ok } as never
  })
  const tails: (string | undefined)[] = []
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    tails.push(e.props.tail)
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as never)
  const specs: unknown[] = []
  on('tool.register', (_$, e) => (specs.push(e), { value: { tool: e.name === 'state' ? 'mcp__cachebeat__state' : 'mcp__cachebeat__set' } }) as never)
  on('ui.focus', () => ({})) // the engine's ring; a move the test raises lands
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('classic.PostModelSwitch', () => ({}))
  on('classic.SessionStart', () => ({}))
  on('session.compact', () => ({ messages: [said('user', 'summary')] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return {
    clock, forks, prompts, logs, spend: (usd: number) => (spent += usd), toasts, tails, store, specs, reads, sleep: (ms: number) => (skew += ms), holdNow: (until: Promise<void>) => (held = until), afters: () => afters, switchTo: (m: string) => (model = m), moveTo: (r: string) => (root = r),
    rewind: (n: number) => (chat = chat.slice(0, -n)), talk: (text: string) => (chat = [...chat, said('user', text), said('assistant', 'ok')]),
    add: (role: 'user' | 'assistant', text: string) => (chat = [...chat, said(role, text)]),
  }
}

const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] })

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

test('lub-dub plays the loop twice, then rests as long as one pass; an endless loop slows, never stops', () => {
  const heart = { id: 'h', name: 'h', loop: ['a', 'b', 'c'], blast: [], isEndless: false }
  const line = { ...heart, isEndless: true }
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => loopIndex(heart, t, 'lubdub'))).toEqual([0, 1, 2, 0, 1, 2, 0, 0, 0, 0])
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(t => loopIndex(line, t, 'lubdub'))).toEqual([0, 1, 2, 0, 1, 2, 0, 0, 1, 1, 2, 2, 0])
  expect([0, 1, 2, 3].map(t => loopIndex(heart, t, 'linear'))).toEqual([0, 1, 2, 0])
  expect(VARIANTS.filter(x => x.isEndless).map(x => x.id)).toEqual(['ecg', 'beam', 'dash', 'sine', 'orbit', 'garland', 'bounce'])
})

test('the preview plays five loops, then the blast', () => {
  const x = variant('classic')
  expect(previewFrame(x, 5 * x.loop.length - 1, 'linear')).toBe(x.loop.at(-1))
  expect(previewFrame(x, 5 * x.loop.length, 'linear')).toBe(x.blast[0])
  expect(previewFrame(x, 5 * x.loop.length + x.blast.length, 'linear')).toBe(x.loop[0])
})

test('custom values read their units and keep to their ranges', () => {
  expect(['35k', '0.5m', '40,000', ' 2K ', '500', '1.5m', 'lots'].map(parseTokens)).toEqual([35_000, 500_000, 40_000, 2_000, undefined, undefined, undefined])
  expect(['35', '12m', '56', '0'].map(parseMinutes)).toEqual([35, 12, undefined, undefined])
  expect(['10', '90m', '1.5h', '49', '0.25'].map(parseHours)).toEqual([10, 1.5, 1.5, undefined, undefined])
  expect(['85', '85%', '101', '5'].map(parsePercent)).toEqual([85, 85, undefined, undefined])
  expect(['65', '65ms', '10', '600'].map(parseFrameMs)).toEqual([65, 65, undefined, undefined])
})

test('custom numbers through the pane: an interval, a frame time', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'row:interval' })
  await ui.input({ key: 'custom', text: '90' }) // out of range: the footer says why, nothing changes
  expect(await ui.find({ type: 'Text', text: 'Beat after idle takes 1–55 minutes, not "90"' })).toBeDefined()
  expect(stored(store).interval).toBe('auto')
  await ui.input({ key: 'custom', text: '35' })
  expect(stored(store).interval).toBe(35)
  expect(await cmd($, 'on')).toBe('this session: on, every 35m idle · starts after your next turn')
  await ui.press({ key: 'tab:heart' })
  await ui.press({ key: 'row:heartSpeed' })
  await ui.input({ key: 'custom', text: '65ms' })
  expect(stored(store).heartSpeed).toBe(65)
  expect((await ui.find({ key: 'row:heartSpeed' }))?.text).toContain('65ms a frame')
  await ui.unmount()
})

test('smaller than takes a custom count', async ($: Engine, on: On) => {
  const { store } = await setup($, on, { settings: { skipSmall: true } })
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'tab:limits' })
  await ui.press({ key: 'row:skipSmallTokens' })
  await ui.input({ key: 'custom', text: 'lots' })
  expect(stored(store).skipSmallTokens).toBe(20_000)
  await ui.input({ key: 'custom', text: '35k' })
  expect(stored(store).skipSmallTokens).toBe(35_000)
  expect((await ui.find({ key: 'row:skipSmallTokens' }))?.text).toContain('35k tokens')
  await ui.unmount()
})

test('settings from an older store fall back to the defaults one by one', () => {
  expect(normalize({ interval: 5, variant: 'gone', speed: 3, extra: 1, statusLine: 'inline' })).toEqual({ ...DEFAULTS, interval: 5 })
  expect(normalize(undefined)).toEqual(DEFAULTS)
})

test('flow sweeps a highlight across the text; flash lights it on a full heart', () => {
  const s = { ...lookOf(DEFAULTS, 'line'), color: 'claude', effect: 'flow' as const }
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

test('mixed holds a mode for an episode, never repeats one, and plays all three', () => {
  const modes = Array.from({ length: 30 }, (_, n) => mixedMode(n * EPISODE))
  expect(new Set(modes)).toEqual(new Set(['flash', 'flow', 'both']))
  modes.slice(1).forEach((m, n) => expect(m).not.toBe(modes[n]))
  expect(mixedMode(EPISODE + 1)).toBe(mixedMode(2 * EPISODE - 1))
})

test('both flashes and flows at once: lit, the sweep dips to the resting tone', () => {
  const s = { ...lookOf(DEFAULTS, 'line'), color: 'claude', effect: 'mixed' as const }
  const start = Array.from({ length: 30 }, (_, n) => n * EPISODE).find(k => mixedMode(k) === 'both')!
  const t = start + ((5 - (start % 14)) + 14) % 14 // the sweep centred on 'c', as at tick 5 in an 8-glyph text
  expect(spans('abcdefgh', s, t, true)).toEqual([
    { text: 'a', color: 'claudeShimmer', dim: false },
    { text: 'bcd', color: 'claude', dim: false },
    { text: 'efgh', color: 'claudeShimmer', dim: false },
  ])
})

test('off by default: no beats', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.complete(turn)
  await clock.advance(IDLE * 3)
  expect(forks.length).toBe(0)
})

test('commands answer for the state they find', async ($: Engine, on: On) => {
  await setup($, on)
  expect(await cmd($, 'off')).toBe('this session: already off')
  expect(await cmd($, 'on')).toBe('this session: on, every 50m idle · starts after your next turn')
  expect(await cmd($, 'on')).toBe('this session: already on, every 50m idle · starts after your next turn')
  expect(await cmd($, 'off')).toBe('this session: off')
  expect(await cmd($, 'bogus')).toBe('usage: /cachebeat [on|off|<time, like 2h>|now|settings] · global [on|off|<minutes>] · local [on|off|<minutes>|reset]')
})

test('a global default on starts a new session beating', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { defaultOn: true, interval: 5 } })
  await $.turn.complete(turn)
  await clock.advance(5 * M)
  expect(forks).toEqual([5 * M])
})

test('global on sets the default and turns this session on; global off the reverse', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  expect(await cmd($, 'global')).toBe('all folders: New sessions start off, Beat after idle auto · usage: /cachebeat global on|off|<minutes>')
  expect(await cmd($, 'global on')).toBe('all folders: new sessions start on · this session: now on, every 50m idle')
  expect(stored(store).defaultOn).toBe(true)
  expect(await cmd($, 'global off')).toBe('all folders: new sessions start off · this session: now off')
  expect(stored(store).defaultOn).toBe(false)
})

test('global minutes set the interval for all folders, which this session follows', async ($: Engine, on: On) => {
  const { store } = await setup($, on, { settings: { intervalScope: 'global' } as never }) // 0.7's "the default" is gone
  await cmd($, 'on')
  expect(stored(store).interval).toBe('auto')
  await $.turn.complete(turn)
  expect(await cmd($, 'global 9')).toBe('all folders: every 9m idle · this session: on')
  expect(stored(store).interval).toBe(9)
  expect(await cmd($, '')).toBe('on, every 9m idle · 0 beats · next beat in 9m')
  expect(store.get('settings')).toEqual({ interval: 9 })
})

test('on mid-idle beats at lastTurn + IDLE, then every IDLE', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect(await cmd($, 'on')).toBe('this session: on, every 50m idle · next beat in 40m')
  await clock.advance(40 * M)
  expect(forks).toEqual([IDLE])
  await clock.advance(IDLE)
  expect(forks.length).toBe(2)
  expect(await cmd($, '')).toBe('on, every 50m idle · 2 beats · next beat in 50m')
})

test('now beats at once and reschedules from it', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 5 } })
  await cmd($, 'on')
  expect(await cmd($, 'now')).toBe('nothing to keep warm until this session has a turn')
  expect(await cmd($, '')).toContain('on, every 5m idle')
  await $.turn.complete(turn)
  await clock.advance(2 * M)
  expect(await cmd($, 'now')).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
  await clock.advance(5 * M)
  expect(forks).toEqual([2 * M, 7 * M])
})

test('a new interval reschedules from the last cache read', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await $.turn.complete(turn)
  await cmd($, 'on')
  await clock.advance(3 * M) // beat 1 at 3
  await cmd($, 'global 4')
  expect(await cmd($, '')).toBe('on, every 4m idle · 1 beat · next beat in 4m')
  await clock.advance(4 * M)
  expect(forks).toEqual([3 * M, 7 * M])
})

test('turned on within the hour after a turn but past the interval, it beats at once', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect(await cmd($, 'on')).toBe('this session: on, every 3m idle · next beat due now')
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

test('one status line, under the latest turn: counts the session\'s beats and down to the next', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3, statusHeart: 'off', showTokens: false } }) // a still heart, no tokens: the countdown is what's checked
  await cmd($, 'on')
  await $.turn.complete(turn)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ next beat in 3m']) // no beat yet
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×1 · next in 3m'])
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×2 · next in 3m'])
  expect(logs).toEqual([]) // the row carries it, no log lines

  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete(turn)
  expect(await draw($, row('r2'))).toEqual(['engine', '♥ cache kept warm ×2 · next in 3m']) // moved, still counting
  expect(await draw($, row('r1'))).toEqual(['engine'])
})

test('the beat line goes after a blank line, or nowhere; with the tokens kept', async ($: Engine, on: On) => {
  const { clock, store } = await setup($, on, { settings: { interval: 3, statusLine: 'spaced', showTokens: true } })
  await cmd($, 'on')
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

test('a /clear starts the count afresh, still on at the same interval', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(await cmd($, '')).toBe('on, every 3m idle · 1 beat · next beat in 3m')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(await cmd($, '')).toBe('on, every 3m idle · 0 beats · starts after your next turn')
  await clock.advance(10 * M)
  expect(forks).toHaveLength(1) // nothing to fork until the new conversation has a turn
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(forks).toHaveLength(2)
})

test('with no closing row seen, a beat logs a line instead', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs).toEqual(['♥ cache renewed (90,000 read, 0 written · ≈$0.02)'])
})

test('a beat can log and toast both, closing row or not', async ($: Engine, on: On) => {
  const { clock, logs, toasts } = await setup($, on, { settings: { interval: 3, onBeat: 'both' } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await draw($, row('r1'))
  await clock.advance(3 * M)
  expect(logs).toEqual(['♥ cache renewed (90,000 read, 0 written · ≈$0.02)'])
  expect(toasts).toEqual(['♥ cache kept warm · 90k read'])
})

test('a stop can log and toast both', async ($: Engine, on: On) => {
  const { clock, logs, toasts } = await setup($, on, { percentUsed: 100, settings: { onStop: 'both', stopAtUsage: 100 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE)
  expect(logs).toEqual(['stopped: five-hour usage limit reached'])
  expect(toasts).toEqual(['cachebeat stopped: five-hour usage limit reached'])
})

test('a beat can toast', async ($: Engine, on: On) => {
  const { clock, toasts } = await setup($, on, { settings: { interval: 3, onBeat: 'toast' } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(toasts).toEqual(['♥ cache kept warm · 90k read'])
})

test('at a fixed interval, stops when the fork was not served from cache', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { fork: [{ ...ok, usage: usage(0, 90_000) }], settings: { interval: 50 } })
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
  expect(logs.at(-1)).toBe('stopped: 8h since your last message')
})

test('the deadline is a setting, and a stop can toast', async ($: Engine, on: On) => {
  const { clock, forks, logs, toasts } = await setup($, on, { settings: { interval: 20, stopAfterHours: 1, onStop: 'toast' } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(2 * 60 * M)
  expect(forks).toEqual([20 * M, 40 * M])
  expect(logs.filter(l => l.startsWith('stopped'))).toEqual([])
  expect(toasts).toEqual(['cachebeat stopped: 1h since your last message'])
})

test('stops without forking once a usage limit is used up', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { percentUsed: 100, settings: { stopAtUsage: 100 } })
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

test('under the minimum context it says beats will skip, once, and arms when a turn grows it', async ($: Engine, on: On) => {
  const world = { contextTokens: 8_000, settings: { skipSmall: true, interval: 3 } }
  const { clock, forks, logs } = await setup($, on, world)
  await $.turn.complete(turn)
  expect(await cmd($, 'on')).toBe('this session: on, every 3m idle · beats skip: this chat is 8k tokens, under your 20k minimum')
  expect(logs).toEqual(['beats will skip: this chat is 8k tokens, under your 20k minimum'])
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete(turn)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ beats skip · this chat is 8k tokens, under your 20k minimum'])
  expect(logs).toHaveLength(1) // said once, not every turn
  await clock.advance(10 * M)
  expect(forks).toEqual([])

  world.contextTokens = 30_000
  await $.turn.start({ text: 'more', turnId: 't3' })
  await $.turn.complete(turn)
  expect(await draw($, row('r2'))).toEqual(['engine', '♡ next beat in 3m'])
  expect(await draw($, row('r1'))).toEqual(['engine'])
  await clock.advance(3 * M)
  expect(forks).toHaveLength(1)
})

test('the chat\'s size counts the last reply, which a beat reads too', async ($: Engine, on: On) => {
  // the window counts the last prompt: 45k; with its 6k answer the chat is 51k, over a 50k minimum
  const reply = (output: number) => ({ input_tokens: 1_000, output_tokens: output, cache_read_input_tokens: 44_000, cache_creation_input_tokens: 0 })
  const world = { contextTokens: 45_000, lastUsage: reply(6_000), settings: { skipSmall: true, skipSmallTokens: 50_000 } }
  const { logs } = await setup($, on, world)
  await $.turn.complete(turn)
  expect(await cmd($, 'on')).toBe('this session: on, every 50m idle · next beat in 50m')
  world.lastUsage = reply(4_000) // 49k
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete(turn)
  expect(logs).toEqual(['beats will skip: this chat is 49k tokens, under your 50k minimum'])
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
  expect(logs.at(-1)).toBe('beats wait for your next turn: the cache went cold (1h since it was last read)')
  expect((await stateNow($)).session).toMatchObject({ enabled: true, paused: 'the cache went cold' })
})

test('with Cache gone cold set to stop, retrying past the hour switches it off', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks, logs } = await setup($, on, { fork: [err], settings: { onCold: 'stop' } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(2 * IDLE)
  expect(forks.length).toBe(10)
  expect(logs.at(-1)).toBe('stopped: the cache went cold (1h since it was last read)')
  expect((await stateNow($)).session.enabled).toBe(false)
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
  const { clock, tails } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
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
  store.set('settings', { ...DEFAULTS, variant: 'ecg', heartAnimate: false })
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete(turn)
  await clock.advance(7 * TICK)
  await draw($, HINT)
  expect(tails.at(-1)).toBe(`${variant('ecg').loop[0]} ×0`)
})

test('a preset is drawn as hex, lit a lighter shade', () => {
  expect(spans('x', { ...lookOf(DEFAULTS, 'line'), color: 'red', effect: 'flash' }, 0, true)).toEqual([{ text: 'x', color: '#f1a09c', dim: false }])
})

test('on its own line the heart takes the color', async ($: Engine, on: On) => {
  await setup($, on, { settings: { heartPlacement: 'line', heartColor: 'claude' } })
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

test('the settings pane: six tabs, two choices flip in place, more open a list, help for what\'s focused', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  expect(await cmd($, 'settings')).toBe('settings opened')
  expect(await cmd($, 'config')).toBe('settings opened') // unlisted, for the hand that types it
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect(await buttons(ui, 'tab:')).toEqual(['tab:beating', 'tab:limits', 'tab:heart', 'tab:status', 'tab:alerts'])
  expect([(await ui.find({ key: 'beatNow' }))?.text, (await ui.find({ key: 'reset' }))?.text]).toEqual(['Beat now', 'Reset all'])
  expect((await ui.find({ key: 'folder' }))?.text).toBe('Settings for          all folders')

  await ui.press({ key: 'row:defaultOn' }) // two values: flips
  expect(stored(store).defaultOn).toBe(true)
  await move($, 'row:defaultOn') // the kit moves no focus on a press: the person's arrows do
  expect(await ui.find({ type: 'Text', text: /^Whether new sessions start beating/ })).toBeDefined() // the focused row's help
  await ui.press({ key: 'row:onModelSwitch' }) // two named choices flip too
  expect(stored(store).onModelSwitch).toBe('warm')
  expect(await buttons(ui, 'opt:')).toHaveLength(0)

  await ui.press({ key: 'row:interval' }) // more: a list, its help above it
  expect(await buttons(ui, 'opt:')).toHaveLength(6)
  expect(await ui.find({ type: 'Text', text: /^How long you're idle before a beat/ })).toBeDefined()
  await ui.press({ key: 'opt:1' })
  expect(stored(store).interval).toBe(4)
  expect(await ui.find({ key: 'row:interval' })).toBeDefined() // back on the tab

  await ui.press({ key: 'session' })
  expect(await cmd($, '')).toContain('on, every 4m idle')

  await ui.press({ key: 'tab:limits' })
  expect(await ui.find({ key: 'row:skipSmallTokens' })).toBeUndefined() // shows only once skipping
  await ui.press({ key: 'row:skipSmall' })
  expect(await ui.find({ key: 'row:skipSmallTokens' })).toBeDefined()
  expect(await ui.find({ key: 'beatNow' })).toBeUndefined()

  await ui.press({ key: 'tab:heart' })
  await ui.press({ key: 'row:variant' })
  expect(await buttons(ui, 'opt:')).toHaveLength(19)
  await ui.press({ key: 'opt:13' })
  expect(stored(store).variant).toBe('orbit')

  await ui.press({ key: 'row:heartTiming' }) // lub-dub, the default, flips to linear
  expect(stored(store).heartTiming).toBe('linear')
  await move($, 'row:heartTiming')
  expect(await ui.find({ type: 'Text', text: /^lub-dub beats twice, then rests/ })).toBeDefined()
  expect(await ui.find({ key: 'row:heartColor' })).toBe(undefined) // on the hint line the heart is dim: no color to pick
  expect(await ui.find({ key: 'folder' })).toBeDefined() // on every tab

  await ui.press({ key: 'tab:alerts' })
  expect(await ui.find({ key: 'reset' })).toBe(undefined)
  await ui.unmount()
})

const move = ($: Engine, element: string) => $.ui.focus({ component: 'Pane', requestId: PANE, element, origin: { kind: 'person' } })

test('on the tab bar the arrows switch tabs, and do not go down into one', async ($: Engine, on: On) => {
  await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect(await move($, 'tab:heart')).toEqual({})
  expect(await ui.find({ key: 'row:variant' })).toBeDefined() // the page follows
  expect((await move($, 'row:variant')).deny).toBeDefined() // Enter goes in, not ↓
  await move($, 'tab:alerts')
  expect(await move($, 'row:onBeat')).toEqual({}) // off the last tab: round to the first
  expect(await ui.find({ key: 'session' })).toBeDefined()
  await ui.unmount()
})

test('in a tab\'s settings the arrows do not climb out to the tab bar', async ($: Engine, on: On) => {
  await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect(await move($, 'row:interval')).toEqual({})
  expect((await move($, 'tab:alerts')).deny).toBeDefined() // Esc does
  expect(await move($, 'row:defaultOn')).toEqual({})
  await ui.unmount()
})

test('the focused option of a picker shows in the preview before it is picked', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'tab:status' })
  await ui.press({ key: 'row:lineColor' })
  await $.ui.focus({ component: 'Pane', requestId: PANE, element: 'opt:2', origin: { kind: 'person' } }) // permission
  const line = (await ui.findAll({ type: 'Text' })).find(t => t.text?.includes('cache kept warm'))
  expect(line?.props).toMatchObject({ color: 'permission' })
  expect(stored(store).lineColor).toBe('claude')
  await ui.unmount()
})

test('the store keeps only what differs from the defaults', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'global on')
  expect(store.get('settings')).toEqual({ defaultOn: true })
})

test('by default the beat line keeps a blank line from the turn row', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await draw($, row('r1'))
  await clock.advance(3 * M)
  const ui = await $.ui.mount(row('r1'))
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props?.marginTop === 1 && b.text?.includes('kept warm'))).toBe(true)
  await ui.unmount()
})

test('settings changes keep another session\'s; reset asks twice', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'row:defaultOn' })
  store.set('settings', { ...stored(store), interval: 10 }) // another session's change
  await ui.press({ key: 'tab:limits' })
  await ui.press({ key: 'row:stopAtUsage' })
  await ui.press({ key: 'opt:0' })
  expect(stored(store)).toMatchObject({ interval: 10, stopAtUsage: 80, defaultOn: true })
  await ui.press({ key: 'tab:beating' })
  await ui.press({ key: 'reset' })
  expect(stored(store).interval).toBe(10)
  expect((await ui.find({ key: 'reset' }))?.text).toBe('Press again to reset all')
  await ui.press({ key: 'reset' })
  expect(stored(store)).toEqual(DEFAULTS)
  await ui.unmount()
})

type Args = Record<string, unknown>
const call = ($: Engine, name: keyof typeof TOOL, args: Args = {}) =>
  $.tool.call({ tool: name === 'state' ? 'mcp__cachebeat__state' : 'mcp__cachebeat__set', ...args } as never)
const stateNow = async ($: Engine, args: Args = {}) => JSON.parse((await call($, 'state', args)).result as string)
const FRESH = { enabled: false, intervalMinutes: 50, intervalFrom: 'auto', keepAliveUntil: null, keepAliveMinutesLeft: null, cacheTtl: '1h', beats: 0, lastBeatReadTokens: null, lastBeatWrittenTokens: null, lastBeatUsd: null, nextBeat: null, skipping: null, paused: null }
const FRESH_CACHE = { state: 'unknown', ttl: '1h', lastReadMinutesAgo: null, minutesLeft: null, coldForMinutes: null, contextTokens: null, recacheUsd: null }
const props = (x: unknown) => (x as { properties: Record<string, unknown> }).properties
const toolRow = (component: 'ToolUse' | 'ToolResult', tool: string, input: unknown) => ({
  plugin: 'cachebeat', surface: 'terminal', component, requestId: 'u1',
  props: component === 'ToolUse'
    ? { tool_use_id: 'u1', tool, input, isRunning: false, isErrored: false, isInterrupted: false }
    : { tool_use_id: 'u1', tool, output: '{}', isErrored: false },
}) as never

test('both tools register, every setting in the schema with the pane\'s ranges', async ($: Engine, on: On) => {
  const { specs } = await setup($, on)
  expect(specs).toEqual([STATE, SET])
  expect([STATE.name, SET.name]).toEqual(['state', 'set']) // the names TOOL spells out
  const settings = props(props(SET.inputSchema).settings)
  expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULTS).sort())
  expect((settings.interval as Args).anyOf).toEqual([{ enum: ['auto'] }, { type: 'number', minimum: parseMinutes.min, maximum: parseMinutes.max }, { type: 'null' }])
  expect((settings.heartSpeed as Args).anyOf).toEqual([{ enum: ['slow', 'normal', 'fast'] }, { type: 'number', minimum: 20, maximum: 500 }, { type: 'null' }])
})

test('state on a fresh session: off, at the default interval, the settings as they are', async ($: Engine, on: On) => {
  await setup($, on)
  expect(await stateNow($)).toEqual({ session: FRESH, cache: FRESH_CACHE, settings: DEFAULTS, folder: { path: HOME, own: {} }, defaults: {} })
  await call($, 'set', { settings: { interval: 30, showTokens: false } })
  expect((await stateNow($)).defaults).toEqual({ interval: 'auto', showTokens: true })
})

const set = async ($: Engine, args: Args) => JSON.parse((await call($, 'set', args)).result as string)

test('a keep-alive time turns beating on and leaves the interval; null drops it', async ($: Engine, on: On) => {
  const { store, clock } = await setup($, on)
  const until = new Date(clock.now() + 120 * M).toISOString()
  expect(await set($, { session: { keepAliveMinutes: 120 } })).toEqual({
    changed: ['session.enabled', 'session.keepAliveMinutes'],
    session: { ...FRESH, enabled: true, keepAliveUntil: until, keepAliveMinutesLeft: 120, nextBeat: 'after the next turn' }, settings: {},
  })
  expect(stored(store).interval).toBe('auto')
  expect(await set($, { session: { keepAliveMinutes: null } })).toEqual({
    changed: ['session.keepAliveMinutes'], session: { ...FRESH, enabled: true, nextBeat: 'after the next turn' }, settings: {},
  })
  expect((await set($, { session: { keepAliveMinutes: null } })).changed).toEqual([]) // none to drop
})

test('turning off through the tool drops the keep-alive time with it', async ($: Engine, on: On) => {
  await setup($, on)
  await set($, { session: { keepAliveMinutes: 120 } })
  const off = await set($, { session: { enabled: false } })
  expect([off.changed, off.session.keepAliveUntil, off.session.keepAliveMinutesLeft]).toEqual([['session.enabled'], null, null])
})

test('set answers with what changed and those settings alone; null resets a setting', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  expect(await set($, { settings: { skipSmall: true, skipSmallTokens: 35_000, interval: 'auto' } })).toEqual({
    changed: ['settings.skipSmall', 'settings.skipSmallTokens'], session: FRESH, settings: { skipSmall: true, skipSmallTokens: 35_000 },
  })
  expect(await set($, { settings: { skipSmallTokens: null, heartHex: null } })).toEqual({
    changed: ['settings.skipSmallTokens'], session: FRESH, settings: { skipSmallTokens: 20_000 },
  })
  expect(stored(store)).toEqual({ ...DEFAULTS, skipSmall: true })
  // a session that follows the default moves with it, but the call changed the default alone
  expect(await set($, { settings: { interval: 30 } })).toEqual({
    changed: ['settings.interval'], session: { ...FRESH, intervalMinutes: 30, intervalFrom: 'all folders' }, settings: { interval: 30 },
  })
})

test('a default interval is saved, and a session that follows it beats at it', async ($: Engine, on: On) => {
  const { clock, forks, store } = await setup($, on)
  await call($, 'set', { session: { enabled: true }, settings: { interval: 30 } })
  expect(stored(store).interval).toBe(30)
  await $.turn.complete(turn)
  await clock.advance(30 * M)
  expect(forks).toEqual([30 * M])
})

test('settings take the pane\'s values: named or custom, with units', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await call($, 'set', { settings: { skipSmall: true, skipSmallTokens: 35_000, lineSpeed: 65 } })
  expect([stored(store).skipSmall, stored(store).skipSmallTokens, stored(store).lineSpeed]).toEqual([true, 35_000, 65])
  await call($, 'set', { settings: { lineSpeed: 'fast', skipSmall: false } })
  expect([stored(store).lineSpeed, stored(store).skipSmall]).toEqual(['fast', false])
  expect([accept('skipSmallTokens', '35k'), accept('skipSmall', false), accept('heartHex', '#AABBCC')]).toEqual([35_000, false, '#aabbcc'])
  expect([accept('lineHex', 'red'), accept('interval', 56), accept('heartTiming', 3), accept('nope', 1)]).toEqual([undefined, undefined, undefined, undefined])
})

test('a call with any bad value is refused whole, saying what each takes', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  const deny = async (args: Args) => (await call($, 'set', args)).deny
  expect(await deny({ session: { keepAliveMinutes: 4 } })).toBe('nothing changed: session.keepAliveMinutes takes 5–2880 minutes or null, not 4')
  expect(await deny({ session: { keepAliveMinutes: 2881 } })).toBe('nothing changed: session.keepAliveMinutes takes 5–2880 minutes or null, not 2881')
  expect(await deny({ session: { keepAliveMinutes: 30, enabled: false } }))
    .toBe('nothing changed: session.keepAliveMinutes keeps this session beating for that long, so it can\'t come with enabled: false')
  // a session still holding the schema from before the interval became a setting
  expect(await deny({ session: { intervalMinutes: 20 } }))
    .toBe('nothing changed: session has no intervalMinutes: the beat interval is settings.interval (or folder.interval), and session.keepAliveMinutes keeps the cache warm for that long')
  expect(await deny({ settings: { variant: 'nope' } })).toStartWith('nothing changed: settings.variant takes classic, pulse,')
  expect(await deny({ settings: { skipSmallTokens: 5 } })).toBe('nothing changed: settings.skipSmallTokens takes 1000–1000000 tokens or null, not 5')
  expect(await deny({ settings: { bogus: 1 }, session: 'on' })).toBe('nothing changed: session is an object, not "on"; settings has no bogus')
  expect(await deny({ session: { keepAliveMinutes: 20 }, settings: { interval: 30, stopAtUsage: 5, heartTiming: 'fast' } }))
    .toBe('nothing changed: settings.stopAtUsage takes 10–100 percent or null, not 5; settings.heartTiming takes lubdub, linear, or null, not "fast"')
  expect(store.has('settings')).toBe(false)
  expect((await stateNow($)).session).toEqual(FRESH)
})

test('turned on mid-turn, it says so, and beats an interval after the turn ends', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  const r = JSON.parse((await call($, 'set', { session: { enabled: true } })).result as string)
  expect(r.session.nextBeat).toBe('50m after the request on its way') // the turn's first request
  await $.turn.complete(turn)
  expect((await stateNow($)).session.nextBeat).toBe('in 50m')
  await clock.advance(IDLE)
  expect(forks).toEqual([IDLE])
})

test('turned off with a settings change too, the beat already set does not come', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await call($, 'set', { session: { enabled: true } })
  await $.turn.complete(turn)
  await call($, 'set', { session: { enabled: false }, settings: { skipSmall: false } })
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
})

test('the tools answer without the permission path beneath them', async ($: Engine, on: On) => {
  on('classic.PreToolUse', () => ({ deny: 'no' }))
  await setup($, on)
  const bash = await $.tool.call({ tool: 'Bash', command: 'ls' }) // the hook is live for other tools
  expect([bash.isError, bash.text]).toEqual([true, 'no'])
  expect((await stateNow($)).session).toEqual(FRESH)
})

test('a subagent can read, never change', async ($: Engine, on: On) => {
  await setup($, on)
  expect((await call($, 'set', { agentId: 'sub', session: { enabled: true } })).deny).toBe('Only the main conversation changes cachebeat.')
  expect((await stateNow($, { agentId: 'sub' })).session).toEqual(FRESH)
})

test('a call is one dim line in the transcript, its answer not drawn', async ($: Engine, on: On) => {
  await setup($, on)
  const change = { session: { enabled: true, keepAliveMinutes: 120 }, settings: { interval: 30, heartPlacement: 'line' } }
  expect(await draw($, toolRow('ToolUse', TOOL.set, change))).toEqual(['cachebeat · this session on for 2h · all folders: Beat after idle 30m, Prompt heart placement own line'])
  expect(await draw($, toolRow('ToolUse', TOOL.set, { session: { keepAliveMinutes: null } }))).toEqual(['cachebeat · this session without a time limit'])
  expect(await draw($, toolRow('ToolUse', TOOL.state, {}))).toEqual(['cachebeat · read the state'])
  expect(await draw($, toolRow('ToolResult', TOOL.set, change))).toEqual([''])
  expect(await draw($, toolRow('ToolResult', TOOL.state, {}))).toEqual([''])
})

// the cache's lifetime, by Claude Code's own order (code.claude.com/docs/en/prompt-caching)
const TTL_CASES: [string, World, string, number][] = [
  ['a subscription within its usage', {}, '1h', 50],
  ['no subscription: an API key or a cloud provider', { isSubscription: false }, '5m', 4],
  ['a subscription on usage credits', { percentUsed: 100, settings: { stopAtUsage: 100 } }, '5m', 4],
  ['FORCE_PROMPT_CACHING_5M, over every other choice', { env: { FORCE_PROMPT_CACHING_5M: '1', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' } }, '5m', 4],
  ['CLAUDE_CODE_PROMPT_CACHE_TTL, over the setting', { env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' }, settingsFile: { promptCacheTtl: '1h' } }, '5m', 4],
  ['the promptCacheTtl setting, off a subscription', { isSubscription: false, settingsFile: { promptCacheTtl: '1h' } }, '1h', 50],
  ['the setting, over ENABLE_PROMPT_CACHING_1H', { env: { ENABLE_PROMPT_CACHING_1H: '1' }, settingsFile: { promptCacheTtl: '5m' } }, '5m', 4],
  ['ENABLE_PROMPT_CACHING_1H, off a subscription', { isSubscription: false, env: { ENABLE_PROMPT_CACHING_1H: 'true' } }, '1h', 50],
  ['a value Claude Code ignores', { isSubscription: false, env: { CLAUDE_CODE_PROMPT_CACHE_TTL: '2h' }, settingsFile: { promptCacheTtl: 'long' } }, '5m', 4],
]
for (const [name, world, ttl, minutes] of TTL_CASES) {
  test(`auto reads the cache's lifetime: ${name}`, async ($: Engine, on: On) => {
    await setup($, on, world)
    const { session } = await stateNow($)
    expect([session.cacheTtl, session.intervalMinutes]).toEqual([ttl, minutes])
  })
}

test('auto beats at 4m on a five-minute cache', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { isSubscription: false })
  expect(await cmd($, 'on')).toBe('this session: on, every 4m idle · starts after your next turn')
  await $.turn.complete(turn)
  expect(await cmd($, '')).toBe('on, every 4m idle · 0 beats · next beat in 4m')
  await clock.advance(8 * M)
  expect(forks).toEqual([4 * M, 8 * M])
})

test('under auto, a cache gone before the hour beats every 4m from there, and stops if that misses too', async ($: Engine, on: On) => {
  const miss = { ...ok, usage: usage(0, 90_000) }
  const { clock, forks, logs } = await setup($, on, { fork: [miss, ok, miss] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE)
  expect(logs.at(-1)).toBe("the cache was not served (0 read, 90,000 written): this session's cache lasts 5 minutes, so beats come every 4m")
  expect(await cmd($, '')).toBe('on, every 4m idle · 0 beats · next beat in 4m')
  expect((await stateNow($)).session.cacheTtl).toBe('5m')
  await clock.advance(8 * M)
  expect(forks).toEqual([IDLE, IDLE + 4 * M, IDLE + 8 * M])
  expect(logs.at(-1)).toContain('stopped: the cache was not served')
})

const SWITCH = {
  from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5', requested_model: 'sonnet', source: 'command', context_tokens: 90_000,
  prompt_cache_warm: true, cache_ttl: '1h', estimated_cache_write_usd: 0.5, pricing: 'catalog',
} as const

test('after /model, beats wait for the next turn', async ($: Engine, on: On) => {
  const { clock, forks, logs, switchTo } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  switchTo('claude-sonnet-5-5')
  await $.classic.PostModelSwitch(SWITCH)
  expect(logs.at(-1)).toBe('beats wait for your next turn: the new model has no cache yet')
  expect((await stateNow($)).session).toMatchObject({ nextBeat: 'after the next turn', paused: 'the model changed' })
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
  await $.turn.complete(turn)
  expect((await stateNow($)).session.paused).toBe(null)
  await clock.advance(IDLE)
  expect(forks.length).toBe(1)
})

test('after /model set to warm, the next beat writes the new model\'s cache and keeps it from there', async ($: Engine, on: On) => {
  const { clock, forks, logs, switchTo } = await setup($, on, {
    settings: { onModelSwitch: 'warm' }, fork: [{ ...ok, usage: usage(0, 90_000) }, ok],
  })
  await cmd($, 'on')
  await $.turn.complete(turn)
  switchTo('claude-sonnet-5-5')
  await $.classic.PostModelSwitch(SWITCH)
  expect(logs.at(-1)).toBe("the next beat writes the new model's cache")
  await clock.advance(IDLE)
  expect(logs.at(-1)).toBe("♥ warmed the new model's cache (90,000 written · ≈$0.23)")
  expect(await cmd($, '')).toBe('on, every 50m idle · 0 beats · next beat in 50m')
  await clock.advance(IDLE)
  expect(forks).toEqual([IDLE, 2 * IDLE])
  expect(await cmd($, '')).toBe('on, every 50m idle · 1 beat · next beat in 50m')
})

test('a model changed with no event in between is caught when the beat comes: it waits, never forks', async ($: Engine, on: On) => {
  const { clock, forks, switchTo } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  switchTo('claude-sonnet-5-5')
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
  expect((await stateNow($)).session).toMatchObject({ paused: 'the model changed', nextBeat: 'after the next turn' })
})

test('a turn that sent no request warms nothing', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await cmd($, 'on')
  const { usage: _, ...noRequest } = turn
  await $.turn.complete(noRequest)
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
})

test('commands and turns arriving together leave one beat armed', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await Promise.all([cmd($, 'global 5'), $.turn.complete(turn), cmd($, 'global 5'), call($, 'state')])
  await clock.advance(5 * M)
  expect(forks).toEqual([5 * M])
  await clock.advance(5 * M)
  expect(forks).toEqual([5 * M, 10 * M])
})

test('after a compaction between turns, beats wait for the next turn', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.session.compact({ messages: [said('user', 'hi'), said('assistant', 'ok')] } as never) // the transcript, which a session supplies
  expect(logs.at(-1)).toBe('beats wait for your next turn: compaction replaced the conversation')
  expect((await stateNow($)).session.paused).toBe('compaction replaced the conversation')
  await clock.advance(IDLE * 2)
  expect(forks.length).toBe(0)
})

const BAND = (surface: 'terminal' | 'desktop') => ({
  plugin: 'cachebeat', surface, component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}) as never

test('on the desktop the band above the prompt carries the status line, and a beat logs no line', async ($: Engine, on: On) => {
  const { clock, logs, tails } = await setup($, on, { settings: { heartAnimate: false, lineAnimate: false, showTokens: false } })
  const band = async () => (await draw($, BAND('desktop'))).filter(t => t !== 'engine').join('').replace('\u00a0', ' ') // the space after the heart can't collapse
  expect(await draw($, BAND('terminal'))).toEqual(['engine']) // the terminal has the hint row and the status line
  await cmd($, 'on')
  await $.turn.complete(turn)
  // what's drawn beneath (here the engine; on a desktop, perhaps another mod's band) stays, the line after it
  expect(await draw($, BAND('desktop'))).toEqual(['engine', '♡ next beat in 50m']) // one glyph: one run of text, its space kept
  await draw($, { ...HINT, surface: 'desktop' } as never)
  expect(tails.at(-1)).toBe(undefined) // the desktop draws no tail: nothing is added there
  await clock.advance(IDLE)
  expect(logs.some(l => l.startsWith('♥ cache renewed'))).toBe(false)
  expect(await band()).toBe('♥ cache kept warm ×1 · next in 50m')
  await $.classic.PostModelSwitch(SWITCH)
  expect(await band()).toBe('♥ cache kept warm ×1 · waits for your next turn')
})

test('the status line\'s heart beats as one glyph by default, and its setting takes any animation or none', async ($: Engine, on: On) => {
  const { clock } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await draw($, HINT) // the hint row starts the heart's clock
  const lead = async () => (await draw($, row('r1'))).filter(t => t !== 'engine').join('')
  const seen = new Set<string>()
  for (let i = 0; i < BEAT.length; i++) {
    seen.add((await lead()).split(' ')[0]!)
    await clock.advance(TICK)
  }
  expect(seen).toEqual(new Set(['♡', '♥'])) // one glyph, never wider
  expect(normalize({ statusHeart: 'nope' }).statusHeart).toBe('beat')
  // a wide animation on the desktop takes a cell per character, as the terminal's grid has it, with a
  // cell's margin before the words
  await set($, { settings: { statusHeart: 'classic' } })
  const [beneath, ...texts] = await draw($, BAND('desktop'))
  expect(beneath).toBe('engine') // what's drawn beneath stays with a wide animation too
  expect(texts.length).toBe(6) // Classic's five cells, then the words
  expect(texts.slice(0, 5).every(t => glyphs(t).length === 1)).toBe(true)
  expect(texts[5]).toBe('next beat in 50m') // a cell's margin before it, not a space
  expect(normalize({ statusHeart: 'ecg' }).statusHeart).toBe('ecg')
})

test('Claude sets what 0.7.0 added: auto, and what /model does', async ($: Engine, on: On) => {
  const { store } = await setup($, on, { settings: { interval: 30 } })
  expect(await set($, { settings: { interval: 'auto', onModelSwitch: 'warm' } })).toMatchObject({
    changed: ['settings.interval', 'settings.onModelSwitch'], session: { intervalMinutes: 50, cacheTtl: '1h' },
  })
  expect([stored(store).interval, stored(store).onModelSwitch]).toEqual(['auto', 'warm'])
  expect((await call($, 'set', { settings: { onModelSwitch: 'later' } })).deny)
    .toBe('nothing changed: settings.onModelSwitch takes wait, warm, or null, not "later"')
  expect((await call($, 'set', { settings: { interval: 0 } })).deny).toBe('nothing changed: settings.interval takes auto, 1–55 minutes, or null, not 0')
  expect((await stateNow($)).session.intervalFrom).toBe('auto')
  await set($, { settings: { interval: 30 } })
  expect((await stateNow($)).session.intervalFrom).toBe('all folders')
})

test('on a proportional font a heart\'s slot is half again a cell, and line characters overlap into one line', () => {
  expect(slotWidths(variant('wave'))).toEqual([1.5, 1.5, 1.5, 1.5, 1.5])
  expect(slotWidths(variant('charge')).slice(0, 4)).toEqual([1.5, 0.6, 0.6, 1.5]) // its blast's hearts sit among the lines
  expect([slotText('━', 1.5), slotText('━', 0.6), slotText('♥', 1.5)]).toEqual(['━━━', '━', '♥']) // a line spans its slot
  expect(slotWidths(variant('beam')).slice(0, 5)).toEqual([0.6, 0.6, 0.6, 0.6, 0.6]) // lines alone: they touch
  expect(slotWidths(variant('classic'))[0]).toBe(1.5)
  expect(slotWidths(variant('ecg'))[1]).toBe(0.6) // a line character
  expect(slotWidths(variant('ecg')).at(-1)).toBe(1.5) // the heart at its end
  for (const x of VARIANTS) expect(slotWidths(x).length).toBe(cells(x.loop[0]!))
})

test('on the desktop the pane leaves the keys to the app: Tab goes anywhere, and a tab opens when pressed', async ($: Engine, on: On) => {
  const { logs } = await setup($, on)
  // where cachebeat itself tries to put the focus: the kit has none to move, so each try logs why
  const moved = () => logs.filter(l => l.startsWith('focus ')).map(l => l.split(':')[0]!.slice(6))
  await cmd($, 'settings')
  const ui = await $.ui.mount({ ...SETTINGS_PANE, surface: 'desktop' } as never)
  expect(await move($, 'tab:heart')).toEqual({})
  expect(await ui.find({ key: 'row:variant' })).toBe(undefined) // focus alone doesn't open the tab
  expect(await move($, 'row:interval')).toEqual({}) // Tab crosses from the tabs into the settings
  const before = moved().length // the pane opening landed it on the tabs
  await ui.press({ key: 'tab:heart' })
  expect(await ui.find({ key: 'row:variant' })).toBeDefined()
  expect(moved().slice(before)).toEqual([]) // the focus stays where the person put it
  await ui.press({ key: 'row:variant' }) // a list of choices opens: the focus lands in it
  expect(moved().slice(before)).toEqual(['opt'])
  await ui.press({ key: 'opt:1' }) // picked: back on the tab, the focus left alone
  expect(moved().slice(before)).toEqual(['opt'])
  expect(await ui.find({ key: 'row:variant' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === 'tab moves · enter or a click changes · 1-5 tabs · esc closes')).toBe(true)
  await ui.unmount()
})

test('switched to another model and back while idle, beats go on from the cache still warm', async ($: Engine, on: On) => {
  const { clock, forks, logs, switchTo } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  switchTo('claude-sonnet-5-5')
  await $.classic.PostModelSwitch(SWITCH)
  await clock.advance(2000)
  expect((await stateNow($)).session.paused).toBe('the model changed')
  switchTo(OPUS)
  await $.classic.PostModelSwitch({ ...SWITCH, from_model: 'claude-sonnet-5-5', to_model: OPUS })
  await clock.advance(2000)
  expect(logs.at(-1)).toBe('beats go on: back on the model the cache was warmed on')
  expect((await stateNow($)).session.paused).toBe(null)
  await clock.advance(IDLE)
  expect(forks).toEqual([IDLE]) // counted from the turn, which warmed it
})

test('a beat by hand works while beating is off, after a turn', async ($: Engine, on: On) => {
  const { forks } = await setup($, on)
  await $.turn.complete(turn)
  expect(await cmd($, 'now')).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
  expect(forks.length).toBe(1)
  expect(await cmd($, '')).toBe('off') // and it stays off
})

test('a refusal in the footer goes once the person moves on', async ($: Engine, on: On) => {
  await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'row:interval' })
  await ui.input({ key: 'custom', text: '90' })
  const refusal = { type: 'Text', text: 'Beat after idle takes 1–55 minutes, not "90"' } as const
  expect(await ui.find(refusal)).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find(refusal)).toBe(undefined)
  await ui.unmount()
})

test('settings saved before the parts had their own look carry over to both, a part\'s own kept', () => {
  const old = { color: 'red', customColor: '#112233', effect: 'flow', animate: false, speed: 65, timing: 'linear', lineColor: 'cyan' }
  const s = normalize(old)
  expect([s.heartColor, s.heartHex, s.heartEffect, s.heartAnimate, s.heartSpeed, s.heartTiming]).toEqual(['red', '#112233', 'flow', false, 65, 'linear'])
  expect([s.lineColor, s.lineHex, s.lineEffect, s.lineAnimate, s.lineSpeed, s.lineTiming]).toEqual(['cyan', '#112233', 'flow', false, 65, 'linear'])
  expect('color' in s).toBe(false)
})

test('the prompt heart and the turn line each take their own color', async ($: Engine, on: On) => {
  await setup($, on, { settings: { heartPlacement: 'line', heartColor: 'claude', lineColor: 'red', heartAnimate: false, lineAnimate: false } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  const ui = await $.ui.mount(row('r1'))
  expect((await ui.findAll({ type: 'Text' })).find(t => t.text?.includes('next beat'))?.props).toMatchObject({ color: '#e5534b' })
  await ui.unmount()
  const hint = await $.ui.mount(HINT)
  expect((await hint.findAll({ type: 'Text' })).find(t => t.props?.color)?.props).toMatchObject({ color: 'claude' })
  await hint.unmount()
})

test('r takes the focused setting back to its default; a custom value stays in its list', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'row:interval' })
  await ui.input({ key: 'custom', text: '35' })
  expect(stored(store).interval).toBe(35)
  await move($, 'row:interval')
  expect((await ui.find({ key: 'resetRow' }))?.text).toBe('back to auto') // the hotkey draws its own 'r: '
  await ui.press({ key: 'resetRow' })
  expect(stored(store).interval).toBe('auto')
  expect(await ui.find({ key: 'resetRow' })).toBe(undefined) // at its default: nothing to reset
  await ui.press({ key: 'row:interval' })
  expect((await ui.find({ key: 'custom' }))?.props).toMatchObject({ value: '35m' }) // kept, one Enter from back
  await ui.input({ key: 'custom', text: '35m' })
  expect(stored(store).interval).toBe(35)
  await ui.unmount()
})

const USAGE = 'usage: /cachebeat [on|off|<time, like 2h>|now|settings] · global [on|off|<minutes>] · local [on|off|<minutes>|reset]'

test('a folder\'s own settings win over all folders\', for starting on and the interval', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { folders: { [HOME]: { defaultOn: true, interval: 5 } } })
  expect(await cmd($, '')).toBe('on, every 5m idle (this folder\'s) · 0 beats · starts after your next turn')
  expect((await stateNow($)).session.intervalFrom).toBe('folder')
  await $.turn.complete(turn)
  await clock.advance(5 * M)
  expect(forks).toEqual([5 * M])
  expect(await cmd($, 'local 7')).toBe(`this folder (${HOME}): every 7m idle · this session: on`)
  expect(await cmd($, '')).toBe('on, every 7m idle (this folder\'s) · 1 beat · next beat in 7m')
})

test('another folder\'s settings don\'t apply', async ($: Engine, on: On) => {
  await setup($, on, { folders: { [OTHER]: { defaultOn: true } } })
  expect(await cmd($, '')).toBe('off')
})

test('moved to another folder, a session takes its settings at the next turn, and stays on', async ($: Engine, on: On) => {
  const { moveTo } = await setup($, on, { folders: { [OTHER]: { interval: 5, defaultOn: false } } })
  await cmd($, 'on')
  moveTo(OTHER)
  await $.turn.complete(turn)
  expect(await cmd($, '')).toBe('on, every 5m idle (this folder\'s) · 0 beats · next beat in 5m')
})

test('another session\'s change to the interval moves the next beat at once', async ($: Engine, on: On) => {
  const { clock, forks, store } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  store.set('folders', { [HOME]: { interval: 5 } })
  expect((await stateNow($)).session.nextBeat).toBe('in 5m') // read when Claude asks, between turns
  await clock.advance(5 * M)
  expect(forks).toEqual([5 * M])
})

test('local and global commands save for this folder or all folders, and apply here too', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  store.set('folders', { [OTHER]: { interval: 9 } }) // another session's
  expect(await cmd($, 'local')).toBe(`this folder (${HOME}): follows all folders · usage: /cachebeat local on|off|<minutes>|reset`)
  expect(await cmd($, 'local on')).toBe(`this folder (${HOME}): new sessions start on · this session: now on, every 50m idle`)
  expect(stored(store).defaultOn).toBe(false)
  expect(await cmd($, 'local 45')).toBe(`this folder (${HOME}): every 45m idle · this session: on`)
  expect(store.get('folders')).toEqual({ [OTHER]: { interval: 9 }, [HOME]: { defaultOn: true, interval: 45 } })
  expect(await cmd($, 'local')).toBe(`this folder (${HOME}): New sessions start on, Beat after idle 45m · usage: /cachebeat local on|off|<minutes>|reset`)
  expect(await cmd($, 'global 30')).toBe('all folders: every 30m idle · this folder keeps 45m · this session: on, every 45m idle')
  expect(stored(store).interval).toBe(30)
  expect(await cmd($, 'local off')).toBe(`this folder (${HOME}): new sessions start off · this session: now off`)
  expect(await cmd($, 'local reset')).toBe(`this folder (${HOME}) follows all folders again · this session: off`)
  expect(store.get('folders')).toEqual({ [OTHER]: { interval: 9 } })
})

test('a long folder path is cut from the left, whole folders kept', async ($: Engine, on: On) => {
  const { moveTo } = await setup($, on)
  moveTo('/home/me/work/clients/acme/services/billing-api')
  await $.turn.complete(turn)
  expect(await cmd($, 'local')).toStartWith('this folder (…/services/billing-api): follows all folders')
})

test('Settings for picks where menu changes save; this folder\'s own are marked, and r or Reset folder drop them', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect(await buttons(ui, '')).toContain('folder')
  expect((await ui.find({ key: 'folder' }))?.props).toMatchObject({ dimColor: true }) // all folders, the usual: out of the way
  await ui.press({ key: 'folder' })
  expect((await ui.find({ key: 'folder' }))?.text).toBe(`Settings for          this folder · ${HOME}`)
  await ui.press({ key: 'row:defaultOn' }) // saved for this folder alone
  await ui.press({ key: 'row:onModelSwitch' })
  expect(store.has('settings')).toBe(false)
  expect(store.get('folders')).toEqual({ [HOME]: { defaultOn: true, onModelSwitch: 'warm' } })
  expect((await ui.find({ key: 'row:defaultOn' }))?.text).toBe('New sessions start    on · this folder')
  expect((await ui.find({ key: 'row:interval' }))?.text).toBe('Beat after idle       auto · 50m now ›') // follows all folders: unmarked

  await ui.press({ key: 'folder' }) // all folders' settings, editable without turning this folder's off
  expect((await ui.find({ key: 'row:defaultOn' }))?.text).toBe('New sessions start    off · here: on')
  await ui.press({ key: 'row:onModelSwitch' })
  expect(stored(store).onModelSwitch).toBe('warm')
  expect(store.get('folders')).toEqual({ [HOME]: { defaultOn: true, onModelSwitch: 'warm' } }) // this folder's untouched

  store.set('settings', { stopAtUsage: 80 }) // another session changes all folders: it reaches what this folder didn't set
  await $.turn.complete(turn)
  await ui.press({ key: 'folder' })
  await ui.press({ key: 'tab:limits' })
  expect((await ui.find({ key: 'row:stopAtUsage' }))?.text).toBe('Stop at usage         80% ›')
  await ui.press({ key: 'tab:beating' })

  await move($, 'row:defaultOn')
  expect((await ui.find({ key: 'resetRow' }))?.text).toBe('back to off (all folders)')
  await ui.press({ key: 'resetRow' })
  expect(store.get('folders')).toEqual({ [HOME]: { onModelSwitch: 'warm' } })
  await move($, 'row:interval')
  expect(await ui.find({ key: 'resetRow' })).toBe(undefined) // nothing of its own to drop

  expect((await ui.find({ key: 'reset' }))?.text).toBe('Reset folder')
  await ui.press({ key: 'reset' })
  await ui.press({ key: 'reset' })
  expect(store.get('folders')).toEqual({})
  expect(stored(store).stopAtUsage).toBe(80) // all folders' untouched
  await ui.unmount()
})

test('the menu opens on this folder\'s settings when it has its own; This session sits above the switch', async ($: Engine, on: On) => {
  await setup($, on, { folders: { [HOME]: { interval: 5 } } })
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect((await ui.find({ key: 'folder' }))?.text).toBe(`Settings for          this folder · ${HOME}`)
  const order = await buttons(ui, '')
  expect(order.indexOf('session')).toBeLessThan(order.indexOf('folder'))
  expect((await ui.find({ key: 'row:interval' }))?.text).toBe('Beat after idle       5m · this folder ›')
  await ui.unmount()
})

test('a keep-alive time shows on the session row, r drops it, and picking an interval keeps it', async ($: Engine, on: On) => {
  const { clock } = await setup($, on)
  await cmd($, '2h')
  const until = clockText(clock.now() + 120 * M, clock.now())
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  expect((await ui.find({ key: 'session' }))?.text).toBe(`${'This session'.padEnd(22)}on · until ${until}`)
  expect(until).toMatch(/^(\w{3} )?\d{1,2}:\d{2}/)
  await move($, 'session')
  expect(await ui.find({ type: 'Text', text: `${SESSION_HELP} It keeps the cache warm until ${until}, then turns off. r drops that time.` })).toBeDefined()
  expect((await ui.find({ key: 'resetRow' }))?.text).toBe('drop the time limit')
  await ui.press({ key: 'row:interval' })
  await ui.press({ key: 'opt:3' }) // 30m for all folders: a setting, which leaves this session's time alone
  expect(await cmd($, '')).toBe('on, every 30m idle · 2h left · 0 beats · starts after your next turn')
  await move($, 'session')
  await ui.press({ key: 'resetRow' })
  expect(await cmd($, '')).toBe('on, every 30m idle · 0 beats · starts after your next turn')
  expect((await ui.find({ key: 'session' }))?.text).toBe(`${'This session'.padEnd(22)}on`)
  expect(await ui.find({ key: 'resetRow' })).toBeUndefined()
  await ui.unmount()
})

test('Claude sets this folder\'s own settings, names it, drops one, and drops them all', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  let r = await set($, { folder: { interval: 20, defaultOn: true } })
  expect(r.changed).toEqual(['folder.interval', 'folder.defaultOn'])
  expect(r.folder).toEqual({ path: HOME, interval: 20, defaultOn: true }) // the path, for Claude to name it
  expect(r.session.intervalFrom).toBe('folder')
  let state = await stateNow($)
  expect(state.folder).toEqual({ path: HOME, own: { interval: 20, defaultOn: true } })
  expect([state.settings.interval, state.allFolders.interval]).toEqual([20, 'auto'])
  r = await set($, { folder: { interval: null } })
  expect([r.changed, r.folder]).toEqual([['folder.interval'], { path: HOME, interval: null }])
  expect(r.session.intervalFrom).toBe('auto')
  r = await set($, { folder: null })
  expect(r.changed).toEqual(['folder.defaultOn'])
  state = await stateNow($)
  expect([state.folder.own, state.allFolders]).toEqual([{}, undefined])
  expect(store.get('folders')).toEqual({})
  expect((await call($, 'set', { folder: { interval: 90 }, settings: { showTokens: false } })).deny)
    .toBe('nothing changed: folder.interval takes auto, 1–55 minutes, or null, not 90')
  expect((await call($, 'set', { folder: 'here' })).deny).toBe('nothing changed: folder is an object or null, not "here"')
  expect(store.has('settings')).toBe(false)
  expect(await draw($, toolRow('ToolUse', TOOL.set, { folder: { interval: 20, defaultOn: null } })))
    .toEqual([`cachebeat · this folder (${HOME}): Beat after idle 20m, New sessions start as all folders`])
  expect(await draw($, toolRow('ToolUse', TOOL.set, { folder: null }))).toEqual([`cachebeat · this folder (${HOME}) follows all folders again`])
})

test('a hand-edited folder entry keeps only what the menu would take', async ($: Engine, on: On) => {
  await setup($, on, { folders: { [HOME]: { interval: 90, defaultOn: 'yes', stopAtUsage: 80, bogus: 1 } } })
  expect((await stateNow($)).folder.own).toEqual({ stopAtUsage: 80 })
})

test('a path is cut at its own separator, on Windows too', () => {
  expect(cut('C:\\Users\\me\\work\\clients\\acme\\api', 20)).toBe('…\\clients\\acme\\api')
  expect(cut('/home/me/code/api', 30)).toBe('/home/me/code/api')
  expect(cut('/x/a-very-long-folder-name-indeed', 12)).toBe('…name-indeed')
})

test('a /clear keeps this session on, with its keep-alive time; Reset all puts the interval back with the rest', async ($: Engine, on: On) => {
  const { store } = await setup($, on, { settings: { interval: 7 } })
  await cmd($, '3h')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect(await cmd($, '')).toBe('on, every 7m idle · 3h left · 0 beats · starts after your next turn')
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'reset' })
  await ui.press({ key: 'reset' })
  expect(store.get('settings')).toEqual({})
  expect(await cmd($, '')).toBe('on, every 50m idle · 3h left · 0 beats · starts after your next turn')
  await ui.unmount()
})

test('a beat is tagged, so a request log tells it from the user\'s messages', async ($: Engine, on: On) => {
  const { clock, prompts } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(prompts).toEqual(['[cachebeat] Automated prompt cache keep-alive, not a message from the user. Do not continue any task or use any tool. Reply with a single period and nothing else.'])
})

test('after /rewind, beats wait for the next turn instead of warming the conversation as it was', async ($: Engine, on: On) => {
  const { clock, forks, logs, rewind, talk } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  talk('long question')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M]) // beats keep warm what the turn sent
  rewind(2) // /rewind to before the last question: no event says so
  await clock.advance(3 * M)
  expect(forks).toHaveLength(1) // the beat would re-send the conversation from before the rewind
  expect(logs).toContain('beats wait for your next turn: the conversation was rewound')
  talk('another question')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(forks).toHaveLength(2) // the next turn sends the rewound conversation, and beats follow it
})

/** One request of a turn, sent and answered. */
const step = async ($: Engine, turnId: string, index: number) => {
  const stream = $.turn.step({ turnId, index, model: OPUS, messageCount: 5 })
  for await (const _ of stream) { /* the stub streams nothing */ }
  return stream.result
}

test('a turn gone quiet for the interval gets a beat, counted from its last request, and still ends as itself', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'run the tests', turnId: 't2' })
  await clock.advance(1 * M)
  await step($, 't2', 0) // a request at 1m, then a tool that runs on
  await clock.advance(2 * M)
  expect(forks).toEqual([]) // 3m since the last turn, 2m since the request
  await clock.advance(1 * M)
  expect(forks).toEqual([4 * M]) // 3m of quiet within the turn: a beat
  expect(await cmd($, 'now')).toBe('a turn is running; the beat waits for it to end') // by hand, still none mid-turn
  await clock.advance(3 * M)
  expect(forks).toEqual([4 * M, 7 * M]) // and on, while it stays quiet
  await clock.advance(1 * M)
  await step($, 't2', 1) // the tool ends, the next request goes out at 8m
  await $.turn.complete({ ...turn, turnId: 't2' })
  expect(await cmd($, '')).toBe('on, every 3m idle · 2 beats · next beat in 3m')
  expect(await cmd($, 'now')).not.toBe('a turn is running; the beat waits for it to end') // the turn is over
})

test('a mid-turn beat says the task is under way', async ($: Engine, on: On) => {
  const { clock, prompts } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'run the tests', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(prompts).toEqual(['[cachebeat] Automated prompt cache keep-alive, not a message from the user. The request above is already being carried out elsewhere: do not start or continue it, and do not use any tool. Reply with a single period and nothing else.'])
})

test('a turn whose request sent the conversation anew gets no beat until its next request', async ($: Engine, on: On) => {
  const { clock, forks, reads } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  reads.push(usage(30_000, 14_000)) // the session's first request: 44k cached
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await $.turn.start({ text: 'run the tests', turnId: 't2' })
  reads.push(usage(32_000, 12_500)) // read 32k of the 44k: the rest written again, through this turn's message
  await step($, 't2', 0)
  await clock.advance(10 * M)
  expect(forks).toEqual([]) // a beat would write the 12k again, where this turn's next request can't use it
  reads.push(usage(44_500, 300)) // the tool ends: this request read all the last one cached
  await step($, 't2', 1)
  await clock.advance(3 * M)
  expect(forks).toEqual([13 * M]) // the next quiet stretch gets its beat
  await $.turn.complete({ ...turn, turnId: 't2' })
})

test('a request reading a few tokens short of what the last one cached still gets its beat mid-turn', async ($: Engine, on: On) => {
  const { clock, forks, reads } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  reads.push(usage(44_923, 66)) // 44,989 cached
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await $.turn.start({ text: 'run the tests', turnId: 't2' })
  reads.push(usage(44_964, 94)) // 25 short, as seen live: the same conversation, not sent anew
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  await $.turn.complete({ ...turn, turnId: 't2' })
})

test('a turn whose requests keep coming needs no beat', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'refactor', turnId: 't2' })
  for (let i = 0; i < 5; i++) {
    await clock.advance(2 * M)
    await step($, 't2', i)
  }
  await $.turn.complete({ ...turn, turnId: 't2' })
  expect(forks).toEqual([])
})

test('a beat that can\'t reach what the last request cached waits for the next turn, instead of writing it every time', async ($: Engine, on: On) => {
  // the turn's request read 90k; a beat reads 32k and writes 12k: the conversation was cached anew, out of its reach
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(32_000, 12_000) }] })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await step($, 't2', 0)
  await $.turn.complete({ ...turn, turnId: 't2' })
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  expect(logs).toContain('beats wait for your next turn: Claude Code cached this conversation anew, out of a beat\'s reach')
  await clock.advance(9 * M)
  expect(forks).toHaveLength(1) // no beat writing the same again
  expect(await cmd($, '')).toBe('on, every 3m idle · 0 beats · starts after your next turn')
})

test('soon after a request, a beat writing more than it read missed the cache\'s place, not the cache: it waits, never stops', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(30_000, 60_000) }] })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await step($, 't2', 0)
  await $.turn.complete({ ...turn, turnId: 't2' })
  await clock.advance(3 * M)
  expect(forks).toHaveLength(1)
  expect(logs.some(l => l.startsWith('stopped'))).toBe(false)
  expect(await cmd($, '')).toStartWith('on, every 3m idle')
})

// what code review found in 0.9.0's first draft, each of these failing on it

test('stop after idle counts from the user\'s last message, not the last turn\'s end', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 50, stopAfterHours: 1 } })
  await cmd($, 'on')
  await $.turn.complete(turn) // 0m
  await clock.advance(40 * M)
  await $.turn.start({ text: 'run the long build', turnId: 't2' }) // the user's message at 40m
  await step($, 't2', 0) // its request, then a long tool
  await clock.advance(50 * M) // 90m: 50m since the message
  expect(forks).toEqual([90 * M])
  expect(logs.some(l => l.startsWith('stopped'))).toBe(false)
})

test('a tool\'s result landing mid-turn is not a rewind', async ($: Engine, on: On) => {
  const { clock, forks, logs, add } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'two tools', turnId: 't2' })
  add('user', 'two tools')
  add('assistant', '') // two tool calls
  await step($, 't2', 0)
  await clock.advance(1 * M)
  add('user', '') // the first tool's result, while the second still runs
  await clock.advance(2 * M)
  expect(forks).toEqual([3 * M]) // 3m after the request
  expect(logs.some(l => l.includes('rewound'))).toBe(false)
})

test('a beat writing a long answer before its cache mark is renewing, not out of reach: mid-turn, or after later turns', async ($: Engine, on: On) => {
  const { clock, forks, logs, reads } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(88_000, 1_500) }] })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  reads.push(usage(80_000, 8_000)) // 88k cached
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await clock.advance(3 * M) // after the first turn, idle: reads all, writes the long answer
  await $.turn.start({ text: 'build', turnId: 't2' })
  reads.push(usage(88_000, 2_000))
  await step($, 't2', 0)
  await clock.advance(3 * M) // mid-turn: the same
  expect(forks).toEqual([3 * M, 6 * M])
  expect(logs.some(l => l.includes('out of a beat'))).toBe(false)
})

test('a mid-turn beat that fails for a moment is tried again a minute later', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks } = await setup($, on, { settings: { interval: 3 }, fork: [err, ok] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(await cmd($, '')).toContain('next beat in 1m') // the retry, counted down
  await clock.advance(1 * M)
  expect(forks).toEqual([3 * M, 4 * M])
  expect(await cmd($, '')).toBe('on, every 3m idle · 1 beat · next beat in 3m')
})

test('a conversation\'s first turn gets no mid-turn beat: its next request may cache it anew', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.start({ text: 'build', turnId: 't1' })
  await step($, 't1', 0)
  await clock.advance(9 * M)
  expect(forks).toEqual([])
  await $.turn.complete({ ...turn, turnId: 't1' })
  await clock.advance(3 * M)
  expect(forks).toEqual([12 * M]) // after it, beats as ever
})

test('a beat whose fork asked twice shows what the conversation\'s cache holds, not both reads', async ($: Engine, on: On) => {
  const { clock, reads } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(91_000, 0) }] })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  reads.push(usage(40_000, 6_000)) // 46k cached
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await step($, 't2', 0)
  await $.turn.complete({ ...turn, turnId: 't2' })
  await draw($, row('r1'))
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×1 · 90k cached · next in 3m']) // the turn's 90k, not 91k
})

test('a resumed conversation (--resume, --continue) waits for the next turn, and says so', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { defaultOn: true }, chat: [said('user', 'hi'), said('assistant', 'ok')] })
  expect(logs).toContain('beats wait for your next turn: this conversation was resumed')
  expect((await stateNow($)).session.paused).toBe('this conversation was resumed')
  await clock.advance(IDLE * 2)
  expect(forks).toEqual([]) // a beat would re-read the uncached conversation before the user chose to
  await $.turn.complete(turn)
  await clock.advance(IDLE)
  expect(forks).toEqual([IDLE * 3])
})

test('/resume within a session waits for the next turn, and never switches beating off', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 3 }, fork: [ok, { isAnswered: false, reason: 'nothing-to-fork', usage: usage(0, 0) }, ok] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(1 * M)
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  expect(logs.some(l => l.includes('resumed'))).toBe(false) // it would land in the conversation left behind
  await $.classic.SessionStart({ source: 'resume' } as never) // the resumed conversation in place
  await clock.advance(1000) // and drawn
  expect(logs).toContain('beats wait for your next turn: this conversation was resumed')
  await clock.advance(9 * M)
  expect(forks).toEqual([]) // the beat set before the /resume does not come
  expect(await cmd($, '')).toBe('on, every 3m idle · 0 beats · starts after your next turn')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(forks).toEqual([13 * M + 1000])
})

// what code review found in 0.9.0's second draft, each of these failing on it

test('mid-turn, a chat under the minimum waits for the turn to grow it, rather than trying again at once', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 3, skipSmall: true }, contextTokens: 8_000 })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(9 * M)
  expect(forks).toEqual([])
  expect(logs.filter(l => l.startsWith('beats will skip'))).toHaveLength(1)
  expect((await stateNow($)).session.nextBeat).toBe(null) // waiting for the turn, no timer re-armed
})

test('a mid-turn beat writing a big tool result past its cache mark is no sign the cache lapsed', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(15_000, 40_000) }] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'read the big file', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  expect(logs.some(l => l.startsWith('stopped') || l.includes('not served'))).toBe(false)
  expect(await cmd($, '')).toStartWith('on, every 3m idle')
})

test('a message added between turns (a ! command\'s output) is not a rewind', async ($: Engine, on: On) => {
  const { clock, forks, logs, talk, add } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  talk('question')
  await $.turn.complete(turn)
  add('user', '<bash-stdout>README.md</bash-stdout>')
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  expect(logs.some(l => l.includes('rewound'))).toBe(false)
})

test('an interval saved mid-turn moves the turn\'s beat', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(1 * M)
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'row:interval' })
  await ui.press({ key: 'opt:1' }) // 4m for all folders, in the menu: this session follows it from now
  await clock.advance(3 * M)
  expect(forks).toEqual([4 * M]) // 4m after the turn's request, not the 3m it had
  await ui.unmount()
})

// what an independent check of 0.9.0's fixes added: each of these failing without its fix

test('a ! command\'s output pushing the conversation past the 4096 listed is not a rewind', async ($: Engine, on: On) => {
  const many = Array.from({ length: 4093 }, (_, i) => said(i % 2 ? 'assistant' : 'user', `m${i}`))
  const { clock, forks, logs, add, talk } = await setup($, on, { settings: { interval: 3 }, chat: many })
  await cmd($, 'on')
  talk('q') // 4095 messages as the turn ends
  await $.turn.complete(turn)
  add('user', '! ls'); add('user', '<bash-stdout>README.md</bash-stdout>') // 4097: the newest 4096 listed
  await clock.advance(3 * M)
  expect(logs.filter(l => l.includes('rewound'))).toEqual([])
  expect(forks).toEqual([3 * M])
})

test('an idle beat after a later turn, writing a long answer, renews rather than pausing', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(88_000, 1_500) }] })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await $.turn.start({ text: 'again', turnId: 't2' })
  await step($, 't2', 0) // 90k cached
  await $.turn.complete({ ...turn, turnId: 't2' })
  await clock.advance(6 * M)
  expect(logs.filter(l => l.includes('out of a beat'))).toEqual([])
  expect(forks).toEqual([3 * M, 6 * M])
})

test('an interval another session saves, picked up mid-turn, moves the turn\'s beat', async ($: Engine, on: On) => {
  const { clock, forks, store } = await setup($, on, { settings: { interval: 3 }, })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(1 * M)
  store.set('settings', { ...DEFAULTS, interval: 5 }) // another session saves 5m for all folders
  await stateNow($) // the model reads the state mid-turn: the settings are synced
  await clock.advance(3 * M)
  expect(forks).toEqual([]) // not at the old 3m
  await clock.advance(1 * M)
  expect(forks).toEqual([5 * M])
})

test('/resume within a session leaves beats paused, as the state says', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(1 * M)
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  expect((await stateNow($)).session.paused).toBe('this conversation was resumed')
})

test('the /resume line waits for the resumed conversation to be drawn', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  await $.classic.SessionStart({ source: 'resume' } as never)
  expect(logs.some(l => l.includes('resumed'))).toBe(false)
  await clock.advance(1000)
  expect(logs).toContain('beats wait for your next turn: this conversation was resumed')
})

test('a hot reload mid-conversation is not a resume', async ($: Engine, on: On) => {
  const { clock, forks, logs, talk } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  talk('q')
  await $.turn.complete(turn)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true }) // a reload
  await clock.advance(3 * M)
  expect(logs.some(l => l.includes('resumed'))).toBe(false)
  expect(forks).toEqual([3 * M])
})

test('a turn interrupted before any request: the count goes on from the last warm request', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(1 * M)
  await $.turn.start({ text: 'oops', turnId: 't2' })
  await $.turn.complete({ ...turn, turnId: 't2', isAborted: true, usage: undefined } as never)
  await clock.advance(2 * M)
  expect(forks).toEqual([3 * M])
})

test('a message sent while an idle beat is on its way starts a turn', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 }, during: async n => { if (n === 1) await $.turn.start({ text: 'hi', turnId: 't2' }) } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  expect(await cmd($, 'now')).toBe('a turn is running; the beat waits for it to end')
})

test('the running turn ending while its mid-turn beat is on its way ends it', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 }, during: async n => { if (n === 1) await $.turn.complete({ ...turn, turnId: 't2' }) } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  expect(await cmd($, 'now')).not.toBe('a turn is running; the beat waits for it to end') // the turn is over
})

test('a failed beat is not retried when a request warmed the cache meanwhile', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks } = await setup($, on, { settings: { interval: 3 }, fork: [err, ok], during: async n => {
    if (n === 1) { await $.turn.start({ text: 'build', turnId: 't2' }); await step($, 't2', 0) }
  } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M) // the beat fails; the turn's request warmed the cache at 3m
  await clock.advance(2 * M + 59_000)
  expect(forks).toEqual([3 * M]) // no retry at 4m
  await clock.advance(1000)
  expect(forks).toEqual([3 * M, 6 * M]) // 3m after the request
})

test('a retry cancels the timer it replaces', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks } = await setup($, on, { settings: { interval: 3 }, fork: [err, ok], during: async n => {
    if (n === 1) { await $.turn.start({ text: 'oops', turnId: 't2' }); await $.turn.complete({ ...turn, turnId: 't2', usage: undefined } as never) }
  } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M) // fails; a turn interrupted before any request re-armed meanwhile
  await clock.advance(1 * M)
  expect(forks).toEqual([3 * M, 4 * M]) // the retry alone
})

test('out of reach is judged on the cache as it was when the beat started', async ($: Engine, on: On) => {
  const { clock, logs, reads } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(32_000, 12_000) }], during: async n => {
    if (n === 1) { await $.turn.start({ text: 'more', turnId: 't2' }); reads.push(usage(32_000, 12_000)); await step($, 't2', 0) }
  } })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await clock.advance(3 * M)
  expect(logs).toContain('beats wait for your next turn: Claude Code cached this conversation anew, out of a beat\'s reach')
})

test('/resume starts another conversation: its count and its first-turn hold from zero', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  expect(await cmd($, '')).toBe('on, every 3m idle · 0 beats · starts after your next turn')
  await $.turn.start({ text: 'build', turnId: 't2' }) // the resumed conversation's first turn here
  await step($, 't2', 0)
  await clock.advance(9 * M)
  expect(forks).toEqual([3 * M]) // no mid-turn beat in it
})

test('an idle beat after the first turn reading a few tokens short, writing a long answer, renews', async ($: Engine, on: On) => {
  const { clock, forks, logs, reads } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(44_964, 1_200) }] })
  await cmd($, 'on')
  await $.turn.start({ text: 'hi', turnId: 't1' })
  reads.push(usage(44_923, 66)) // 44,989 cached
  await step($, 't1', 0)
  await $.turn.complete({ ...turn, turnId: 't1' })
  await clock.advance(6 * M)
  expect(logs.filter(l => l.includes('out of a beat'))).toEqual([])
  expect(forks).toEqual([3 * M, 6 * M])
})

/** The line a mid-turn beat sends, which a fork's own turn would carry on an engine that raises one. */
const ASK_MID = '[cachebeat] Automated prompt cache keep-alive, not a message from the user. The request above is already being carried out elsewhere: do not start or continue it, and do not use any tool. Reply with a single period and nothing else.'
test('a mid-turn fork raising its own turn events neither starts nor ends a turn', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 }, during: async n => {
    if (n === 1) { await $.turn.start({ text: ASK_MID, turnId: 'f1' }); await $.turn.complete({ ...turn, turnId: 'f1' }) }
  } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M])
  expect(await cmd($, 'now')).toBe('a turn is running; the beat waits for it to end') // t2 still runs
  await clock.advance(3 * M)
  expect(forks).toEqual([3 * M, 6 * M]) // and its quiet stretch still beats
})

test('after a compaction, the conversation\'s next turn counts as its first: no mid-turn beat in it', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { settings: { interval: 3 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.complete(turn) // two turns in
  await $.session.compact({ messages: [said('user', 'summary')] } as never)
  await $.turn.start({ text: 'build', turnId: 't3' })
  await step($, 't3', 0)
  await clock.advance(9 * M)
  expect(forks).toEqual([])
})

test('state says what the last beat read and wrote', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 }, fork: [{ isAnswered: true, text: '.', usage: usage(44_783, 12) }] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect((await stateNow($)).session).toMatchObject({ lastBeatReadTokens: 44_783, lastBeatWrittenTokens: 12 })
})


// ---- the cache as one view, and the wall clock as the authority on when a beat is due ----

test('viewOf: unknown before anything is cached, warm to the last millisecond, then cold for as long as it has been', () => {
  const f = { lastWarm: 1000, ttl: '1h', contextTokens: 90_000, writeUsdPerToken: 0.5 } as const
  expect(viewOf({ ...f, lastWarm: null }, 5)).toMatchObject({ state: 'unknown', lastWarm: null, expiresAt: null, coldFor: null })
  expect(viewOf(f, 1000 + TTL_MS['1h'] - 1)).toMatchObject({ state: 'warm', expiresAt: 1000 + TTL_MS['1h'], coldFor: null })
  expect(viewOf(f, 1000 + TTL_MS['1h'])).toMatchObject({ state: 'cold', coldFor: 0 })
  expect(viewOf(f, 1000 + TTL_MS['1h'] + 7)).toMatchObject({ state: 'cold', coldFor: 7 })
  expect(viewOf({ ...f, ttl: '5m' }, 1000 + 5 * M - 1).state).toBe('warm')
  expect(viewOf({ ...f, ttl: '5m' }, 1000 + 5 * M)).toMatchObject({ state: 'cold', ttl: '5m', coldFor: 0 })
  expect(viewOf(f, 1000).recacheUsd).toBe(45_000)
  expect(viewOf({ ...f, contextTokens: null }, 1000).recacheUsd).toBeNull()
  expect(viewOf({ ...f, writeUsdPerToken: null }, 1000).recacheUsd).toBeNull()
})

test('state says whether the cache is warm, with beating off too: unknown, warm, then cold', async ($: Engine, on: On) => {
  const { clock, sleep } = await setup($, on, { contextTokens: 120_000 })
  expect((await stateNow($)).cache).toEqual({ ...FRESH_CACHE, contextTokens: 120_000, recacheUsd: 0.96 })
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect((await stateNow($)).cache).toEqual({ state: 'warm', ttl: '1h', lastReadMinutesAgo: 10, minutesLeft: 50, coldForMinutes: null, contextTokens: 120_000, recacheUsd: 0.96 })
  sleep(80 * M) // 90m since the last read
  expect((await stateNow($)).cache).toEqual({ state: 'cold', ttl: '1h', lastReadMinutesAgo: 90, minutesLeft: null, coldForMinutes: 30, contextTokens: 120_000, recacheUsd: 0.96 })
})

test('state judges a cache found short by its five minutes', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.turn.complete(turn)
  await clock.advance(6 * M)
  expect((await stateNow($)).cache).toMatchObject({ state: 'cold', ttl: '5m', lastReadMinutesAgo: 6, coldForMinutes: 1 })
})

/** On, one turn done, `after` minutes awake, then the computer sleeps for `slept` and a step passes. */
const sleepThrough = async ($: Engine, on: On, world: World, after: number, slept: number) => {
  const t = await setup($, on, { ...world, settings: { statusHeart: 'off', showTokens: false, ...world.settings } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await t.clock.advance(after * M)
  t.sleep(slept * M)
  await t.clock.advance(STEP)
  return t
}

test('after a sleep past the hour, the cache has gone cold: no beat, the line and the log say so, it stays on', async ($: Engine, on: On) => {
  const { forks, logs } = await sleepThrough($, on, {}, 10, 120)
  expect(forks).toEqual([])
  expect(logs).toEqual(['beats wait for your next turn: the cache went cold (2h 11m since it was last read)'])
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ cache went cold · beats start again on your next message'])
  const state = await stateNow($)
  expect(state.session).toMatchObject({ enabled: true, paused: 'the cache went cold' })
  expect(state.cache).toMatchObject({ state: 'cold', lastReadMinutesAgo: 131, coldForMinutes: 71 })
})

test('with Cache gone cold set to stop, a sleep past the hour switches it off', async ($: Engine, on: On) => {
  const { forks, logs } = await sleepThrough($, on, { settings: { onCold: 'stop' } }, 10, 120)
  expect(forks).toEqual([])
  expect(logs).toEqual(['stopped: the cache went cold (2h 11m since it was last read)'])
  expect((await stateNow($)).session).toMatchObject({ enabled: false, paused: null })
})

test('a five-minute cache that a sleep let lapse is cold, not written afresh by a beat', async ($: Engine, on: On) => {
  const { forks, logs } = await sleepThrough($, on, { env: { FORCE_PROMPT_CACHING_5M: '1' } }, 1, 10)
  expect(forks).toEqual([])
  expect(logs).toEqual(['beats wait for your next turn: the cache went cold (12m since it was last read)'])
})

test('a beat on time for an interval past the cache\'s lifetime still finds the cache not served', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { interval: 10 }, env: { FORCE_PROMPT_CACHING_5M: '1' }, fork: [{ ...ok, usage: usage(0, 90_000) }] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect(forks).toEqual([10 * M])
  expect(logs.at(-1)).toBe('stopped: the cache was not served (0 read, 90,000 written)')
})

test('a sleep that leaves the cache warm still beats, within a step of waking', async ($: Engine, on: On) => {
  const { forks, logs } = await sleepThrough($, on, {}, 45, 10) // the beat was due at 50m; it is 56m since the turn
  expect(forks.length).toBe(1)
  expect(logs.some(l => l.includes('cold'))).toBe(false)
})

test('after the cache went cold, the next turn starts beating again at the usual interval', async ($: Engine, on: On) => {
  const { clock, forks } = await sleepThrough($, on, {}, 10, 120)
  const at = clock.now()
  await $.turn.start({ text: 'back', turnId: 't2' })
  await $.turn.complete({ ...turn, turnId: 't2' })
  expect((await stateNow($)).session).toMatchObject({ enabled: true, paused: null })
  await clock.advance(IDLE)
  expect(forks).toEqual([at + IDLE])
})

test('/cachebeat now on a cache that went cold waits for the next turn and stays on', async ($: Engine, on: On) => {
  const waits = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  waits.sleep(2 * 60 * M)
  expect(await cmd($, 'now')).toBe('beats wait for your next turn: the cache went cold (2h since it was last read)')
  expect(waits.forks).toEqual([])
  expect((await stateNow($)).session.enabled).toBe(true)
})

test('/cachebeat now on a cache that went cold, with the setting on stop, switches it off', async ($: Engine, on: On) => {
  const { forks, sleep } = await setup($, on, { settings: { onCold: 'stop' } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  sleep(2 * 60 * M)
  expect(await cmd($, 'now')).toBe('stopped: the cache went cold (2h since it was last read)')
  expect(forks).toEqual([])
  expect((await stateNow($)).session.enabled).toBe(false)
})

for (const onCold of ['wait', 'stop'] as const) {
  test(`a sleep past the idle deadline stops it with Cache gone cold on ${onCold}`, async ($: Engine, on: On) => {
    const { forks, logs } = await sleepThrough($, on, { settings: { stopAfterHours: 1, onCold } }, 10, 120)
    expect(forks).toEqual([])
    expect(logs).toEqual(['stopped: 1h since your last message'])
  })
}

test('a deadline that has passed reads "due now" on the line, in state and in /cachebeat', async ($: Engine, on: On) => {
  const { clock, sleep } = await setup($, on, { settings: { statusHeart: 'off', showTokens: false } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(49 * M)
  sleep(90_000) // 30s past the beat's time, with the step that would beat it still a minute off
  await draw($, HINT) // the heart starts its clock, which redraws the line each second
  await clock.advance(2000)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ next beat due now'])
  expect((await stateNow($)).session.nextBeat).toBe('due now')
  expect(await cmd($, '')).toBe('on, every 50m idle · 0 beats · next beat due now')
})

test('with both animations off, the countdown still moves, a step at a time', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { heartAnimate: false, lineAnimate: false, statusHeart: 'off', showTokens: false } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ next beat in 50m'])
  await clock.advance(STEP)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ next beat in 49m'])
  await clock.advance(10 * STEP)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ next beat in 39m'])
})

test('Cache gone cold: a bad stored value falls back, the tool takes both, and the menu flips it', async ($: Engine, on: On) => {
  expect([normalize({ onCold: 'never' }).onCold, normalize({ onCold: 'stop' }).onCold, normalize({}).onCold]).toEqual(['wait', 'stop', 'wait'])
  const { store } = await setup($, on)
  expect(await set($, { settings: { onCold: 'stop' } })).toMatchObject({ changed: ['settings.onCold'] })
  expect(stored(store).onCold).toBe('stop')
  expect((await call($, 'set', { settings: { onCold: 'never' } })).deny).toBe('nothing changed: settings.onCold takes wait, stop, or null, not "never"')
  await set($, { settings: { onCold: null } })
  await cmd($, 'settings')
  const ui = await $.ui.mount(SETTINGS_PANE)
  await ui.press({ key: 'tab:limits' })
  expect((await ui.find({ key: 'row:onCold' }))?.text).toMatch(/^Cache gone cold +start on your next message$/)
  await ui.press({ key: 'row:onCold' })
  expect(stored(store).onCold).toBe('stop')
  expect((await ui.find({ key: 'row:onCold' }))?.text).toContain('stop')
  await ui.unmount()
})

test('a new schedule while a step is being checked leaves one chain of steps, not two', async ($: Engine, on: On) => {
  const { clock, forks, holdNow, afters } = await setup($, on)
  await cmd($, 'on')
  await $.turn.complete(turn)
  let release!: () => void
  holdNow(new Promise<void>(r => (release = r)))
  await clock.advance(STEP) // the step's check starts, and waits on the time
  await cmd($, 'global 5') // a new interval arms its own chain meanwhile
  release()
  await clock.settle()
  const before = afters()
  await clock.advance(3 * STEP)
  expect(afters() - before).toBe(3) // a second chain would ask two a minute, and beat twice at once on a real clock
  await clock.advance(5 * M)
  expect(forks.length).toBe(1)
})

test('a five-minute cache that a retry carried past its lifetime is cold, not written afresh and stopped', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  const { clock, forks, logs } = await setup($, on, { env: { FORCE_PROMPT_CACHING_5M: '1' }, fork: [err, { ...ok, usage: usage(0, 90_000) }] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(10 * M)
  expect(forks).toEqual([4 * M]) // the retry at 5m finds the cache gone: no second fork
  expect(logs).toEqual(['beats wait for your next turn: the cache went cold (5m since it was last read)'])
  expect((await stateNow($)).session).toMatchObject({ enabled: true, paused: 'the cache went cold' })
})

test('a five-minute cache a short sleep let lapse, short of the late mark, is cold too', async ($: Engine, on: On) => {
  const { forks, logs } = await sleepThrough($, on, { env: { FORCE_PROMPT_CACHING_5M: '1' } }, 3, 1.5) // 5m30s since the turn; late only from 6m
  expect(forks).toEqual([])
  expect(logs).toEqual(['beats wait for your next turn: the cache went cold (6m since it was last read)'])
})

test('a custom interval on a five-minute cache: a sleep leaves it cold, with the age said', async ($: Engine, on: On) => {
  const t = await setup($, on, { env: { FORCE_PROMPT_CACHING_5M: '1' }, settings: { interval: 10 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await t.clock.advance(9 * M)
  t.sleep(10 * M)
  await t.clock.advance(STEP)
  expect(t.forks).toEqual([])
  expect(t.logs).toEqual(['beats wait for your next turn: the cache went cold (20m since it was last read)'])
})

test('/cachebeat now with beating off on a cache that went cold says so, and pauses nothing', async ($: Engine, on: On) => {
  const { forks, logs, sleep } = await setup($, on)
  await $.turn.complete(turn)
  sleep(2 * 60 * M)
  expect(await cmd($, 'now')).toBe('the cache went cold (2h since it was last read); no beat sent')
  expect(forks).toEqual([])
  expect(logs).toEqual([])
  expect((await stateNow($)).session).toMatchObject({ enabled: false, paused: null })
})

test('a retry while a step is being checked leaves one chain of steps, not two', async ($: Engine, on: On) => {
  const err = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }
  let t!: Awaited<ReturnType<typeof setup>>
  let release!: () => void
  const world: World = {
    fork: [err, ok],
    settings: { interval: 5 },
    during: async n => { // beat 1 is on its way: a new interval arms a chain, whose first check waits on the time
      if (n !== 1) return
      await cmd($, 'global 3')
      t.holdNow(new Promise<void>(r => (release = r)))
      await t.clock.settle()
    },
  }
  t = await setup($, on, world)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await t.clock.advance(5 * M) // beat 1 fails; its retry arms the chain the parked check must not run beside
  const before = t.afters()
  release()
  await t.clock.settle()
  expect(t.afters() - before).toBe(0) // the parked check ends; running on, it would arm a second chain beside the retry's
  await t.clock.advance(STEP)
  expect(t.forks.length).toBe(2) // the retry's beat, one minute on
})

test('usage crossing into credits before an on-time beat stops it for the limit, not as a cold cache', async ($: Engine, on: On) => {
  const world: World = { percentUsed: 10, settings: { stopAtUsage: 100 } }
  const { clock, forks, logs } = await setup($, on, world)
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(49 * M)
  world.percentUsed = 100 // usage credits from here: a five-minute cache for new requests, the one-hour cache written is still warm
  await clock.advance(2 * M)
  expect(forks).toEqual([])
  expect(logs).toEqual(['stopped: five-hour usage limit reached'])
  expect((await stateNow($)).session.enabled).toBe(false)
})


// ---- dollars: what a request cost at API list prices, and what re-caching would ----

const HAIKU = 'claude-haiku-5-5'
/** `x` is `y` to `digits` decimals: the kit's expect has no toBeCloseTo. */
const near = (x: number | null, y: number, digits: number) => expect(x !== null && Math.abs(x - y) < 10 ** -digits).toBe(true)
const tokens = (input: number, output: number, read: number, wrote: number) => ({
  input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: wrote,
})

test('priceOf: the fork the probe priced to the last digit, at its five-minute write rate', () => {
  // Haiku 5.5, read from cost.usd around one fork: 26 in, 4 out, 52,381 read, 65 written = +$0.000536535
  near(priceOf(tokens(26, 4, 52_381, 65), HAIKU, '5m'), 0.000536535, 9)
  near(priceOf(tokens(26, 4, 52_381, 65), HAIKU, '1h'), 0.000536535 + 65 * 0.075 / 1e6, 9) // an hour's write is 2× input
})

test('prices: each model has its own reads, and near-identical ids do not collide', () => {
  const read = (m: string) => Math.round(priceOf(tokens(0, 0, 100_000, 0), m, '5m')! * 1e7) / 1e6 // $ per MTok, at the base tier
  expect([read('claude-fable-5-1'), read('claude-fable-5'), read('claude-mythos-5-1')]).toEqual([0.25, 1, 0.25])
  expect([read('claude-opus-5-5'), read('claude-opus-5'), read('claude-opus-4-8')]).toEqual([0.2, 0.5, 0.5])
  expect([read('claude-sonnet-5-5'), read('claude-sonnet-5'), read('claude-sonnet-4-6')]).toEqual([0.1, 0.2, 0.3])
  expect([read('claude-haiku-5-5'), read('claude-haiku-4-5')]).toEqual([0.01, 0.1])
  const input = (m: string) => priceOf(tokens(1_000_000, 0, 0, 0), m, '5m')
  expect([input('claude-opus-5-5'), input('claude-opus-5'), input('claude-sonnet-5-5'), input('claude-haiku-4-5')]).toEqual([4, 5, 2, 1])
})

test('prices: a model id is matched as Claude Code writes it; anything else is unpriced, never guessed', () => {
  const p = (m: string) => priceOf(tokens(1_000_000, 0, 0, 0), m, '5m')
  expect(p('claude-opus-5-5[1m]')).toBe(4) // the 1M-context suffix
  expect(p('claude-haiku-4-5-20251001')).toBe(1) // a snapshot date
  expect(p('anthropic.claude-opus-5-5')).toBeNull() // a provider's id: its pricing is its own
  expect(p('claude-future-9')).toBeNull()
  expect(p('constructor')).toBeNull()
  expect(isPriced('claude-opus-5-5')).toBe(true)
  expect(isPriced('toString')).toBe(false)
  expect(writeRate('claude-future-9', '1h', 90_000)).toBeNull()
})

test('writeRate: 1.25× input for five minutes, 2× for an hour, and Haiku 5.5 five times that past 100K tokens', () => {
  near(writeRate(OPUS, '5m', 50_000), 5 / 1e6, 12)
  near(writeRate(OPUS, '1h', 50_000), 8 / 1e6, 12)
  near(writeRate(HAIKU, '1h', 100_000), 0.2 / 1e6, 12)
  near(writeRate(HAIKU, '1h', 100_001), 1 / 1e6, 12)
  near(priceOf(tokens(0, 0, 150_000, 0), HAIKU, '5m'), 150_000 * 0.05 / 1e6, 12)
  near(priceOf(tokens(10, 1000, 0, 0), HAIKU, '5m'), (10 * 0.1 + 1000 * 0.5) / 1e6, 12) // a short prompt keeps the base
})

test('learnRate: the engine\'s figure counts where the table cannot know it, and not where it would only repeat it', () => {
  const est = { model: OPUS, ttl: '1h', tokens: 100_000, usd: 0.4, pricing: 'configured' } as const
  const learn = (e: Parameters<typeof learnRate>[1]) => {
    const l: Learned = new Map()
    return { learned: learnRate(l, e), rate: writeRate(e.model, e.ttl, e.tokens, l) }
  }
  expect(learn(est)).toEqual({ learned: true, rate: 4e-6 }) // a managed price
  expect(learn({ ...est, pricing: 'catalog' })).toEqual({ learned: false, rate: 8e-6 }) // the list price again: the table's
  expect(learn({ ...est, model: 'claude-future-9', pricing: 'catalog' })).toEqual({ learned: true, rate: 4e-6 }) // a model the table lacks
  expect(learn({ ...est, model: 'claude-future-9', pricing: 'default' })).toEqual({ learned: false, rate: null }) // the engine's guess
  expect(learn({ ...est, tokens: 19_999 })).toMatchObject({ learned: false }) // four decimals of rounding is too coarse
  expect(learn({ ...est, pricing: undefined } as never)).toMatchObject({ learned: false }) // a kind it doesn't know fails closed
  expect(learn({ ...est, model: 'claude-future-9', pricing: 'estimated' } as never)).toMatchObject({ learned: false })
  expect(learn({ ...est, usd: 0 })).toMatchObject({ learned: false })
  const l: Learned = new Map()
  learnRate(l, est)
  near(writeRate(OPUS, '5m', 100_000, l), 5 / 1e6, 12) // learned at an hour's rate: not the five-minute one
  near(writeRate('claude-opus-5', '1h', 100_000, l), 10 / 1e6, 12) // nor another model's
  learnRate(l, { model: HAIKU, ttl: '1h', tokens: 150_000, usd: 1, pricing: 'configured' })
  near(writeRate(HAIKU, '1h', 150_000, l), 1 / 150_000, 12)
  near(writeRate(HAIKU, '1h', 90_000, l), 0.2 / 1e6, 12) // the other side of the tier
})

test('money: cents above a cent, four decimals below it, and a floor', () => {
  expect(money(0.018)).toBe('≈$0.02')
  expect(money(12.345)).toBe('≈$12.35')
  expect(money(0.01)).toBe('≈$0.01')
  expect(money(0.000536)).toBe('≈$0.0005')
  expect(money(0.0042)).toBe('≈$0.0042')
  expect(money(0.00004)).toBe('<$0.0001')
  expect(money(0.00994)).toBe('≈$0.0099') // the seam: four decimals would have rounded this up to a cent
  expect(money(0.00996)).toBe('≈$0.01')
})

test('an idle beat costs what the session\'s cost rose by, as the log and the state say', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, forkUsd: 0.00123 }) // list price for this fork would be ≈$0.02
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.0012)')
  expect((await stateNow($)).session.lastBeatUsd).toBe(0.00123)
})

test('a beat in a running turn is priced from its usage: the turn\'s own requests are in the same difference', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, forkUsd: 5 })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
  near((await stateNow($)).session.lastBeatUsd, 0.01804, 6)
})

test('a priced beat\'s own writes are at the five-minute rate, though the conversation\'s cache lasts an hour', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 }, fork: [{ ...ok, usage: usage(89_000, 1_000) }] })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  near((await stateNow($)).session.lastBeatUsd, 0.02284, 6) // 1,000 written at $5/MTok, not the hour's $8
})

test('a rise no usage could cost is other requests\' and not the beat\'s: the usage is priced', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, forkUsd: 5 }) // a background request landed in the same difference
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
})

test('a rise just under the bound is taken: fast mode doubles the list price', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 }, forkUsd: 0.045 }) // the usage's list price is $0.01804: 2.49 times
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect((await stateNow($)).session.lastBeatUsd).toBe(0.045)
})

test('a rise just over the bound is not', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 }, forkUsd: 0.046 }) // 2.55 times
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect((await stateNow($)).session.lastBeatUsd).toBe(0.01804)
})

test('a turn that begins while an idle beat is on its way leaves the difference to the turn, so the usage is priced', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, forkUsd: 5, during: async n => { if (n === 1) await $.turn.start({ text: 'hi', turnId: 't2' }) } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
})

test('a mid-turn beat is priced from its usage even when the turn ends meanwhile without a request', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, forkUsd: 5, during: async n => {
    if (n === 1) await $.turn.complete({ ...turn, turnId: 't2', usage: undefined } as never) // ends: busy again false, the cache not warmed
  } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
})

test('a turn that begins and ends its request while an idle beat is on its way is not in the beat\'s price either', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, forkUsd: 5, during: async n => {
    if (n === 1) { await $.turn.start({ text: 'hi', turnId: 't2' }); await step($, 't2', 0); await $.turn.complete({ ...turn, turnId: 't2' }) }
  } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toContain('≈$0.02)')
})

test('a session cost the engine does not report, or one that did not move, leaves the beat priced from its usage', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { settings: { interval: 3 }, noCost: true, forkUsd: 5 })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.02)')
})

test('on a model the table does not have, an idle beat still shows the cost it measured', async ($: Engine, on: On) => {
  const { clock, logs, switchTo } = await setup($, on, { settings: { interval: 3 }, forkUsd: 0.5 })
  switchTo('claude-future-9')
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written · ≈$0.50)')
})

test('on a model the table does not have, a beat the cost cannot price shows no price', async ($: Engine, on: On) => {
  const { clock, logs, switchTo } = await setup($, on, { settings: { interval: 3 } })
  switchTo('claude-future-9')
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  expect(logs.at(-1)).toBe('♥ cache renewed (90,000 read, 0 written)')
  expect((await stateNow($)).session.lastBeatUsd).toBeNull()
})

test('a beat that wrote its cache afresh still records its cost: the expensive ones', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on, { fork: [{ ...ok, usage: usage(0, 90_000) }], settings: { interval: 50 } })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(IDLE * 3)
  expect(logs.at(-1)).toContain('stopped: the cache was not served')
  near((await stateNow($)).session.lastBeatUsd, 0.45 + 0.00002 + 0.00002, 5) // 90,000 written at 1.25× of $4
})

test('the last beat\'s cost is kept across a reload', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3 }, forkUsd: 0.002 })
  await cmd($, 'on')
  await $.turn.complete(turn)
  await clock.advance(3 * M)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await stateNow($)).session.lastBeatUsd).toBe(0.002)
})

test('state prices a re-cache at an hour\'s write rate while the cache lasts an hour', async ($: Engine, on: On) => {
  await setup($, on, { contextTokens: 120_000 })
  expect((await stateNow($)).cache.recacheUsd).toBe(0.96) // 120,000 × $8/MTok
})

test('state prices a re-cache at the five-minute write rate for a five-minute cache', async ($: Engine, on: On) => {
  await setup($, on, { contextTokens: 120_000, env: { FORCE_PROMPT_CACHING_5M: '1' } })
  expect((await stateNow($)).cache.recacheUsd).toBe(0.6) // × $5/MTok
})

test('state has no re-cache price for a model the table lacks', async ($: Engine, on: On) => {
  const { switchTo } = await setup($, on, { contextTokens: 120_000 })
  switchTo('claude-future-9')
  expect((await stateNow($)).cache.recacheUsd).toBeNull()
})

test('the engine\'s estimate on a model switch gives the re-cache rate only where it knows more than the table', async ($: Engine, on: On) => {
  const { switchTo } = await setup($, on, { contextTokens: 120_000 })
  const recache = async () => (await stateNow($)).cache.recacheUsd
  const sw = (x: object) => $.classic.PostModelSwitch({ ...SWITCH, to_model: OPUS, cache_ttl: '1h', context_tokens: 100_000, estimated_cache_write_usd: 0.4, ...x } as never)
  await sw({ pricing: 'catalog' })
  await sw({ pricing: 'default' })
  await sw({ pricing: 'configured', context_tokens: 10_000, estimated_cache_write_usd: 0.04 })
  await sw({ pricing: 'configured', cache_ttl: '5m' })
  expect(await recache()).toBe(0.96) // none of these counts for the one-hour rate
  await sw({ pricing: 'configured' })
  expect(await recache()).toBe(0.48) // a managed $4/MTok write
  switchTo('claude-future-9')
  await sw({ to_model: 'claude-future-9', pricing: 'catalog', estimated_cache_write_usd: 0.5 })
  expect(await recache()).toBe(0.6) // 120,000 × the engine's $5/MTok: a model the table lacks
})


// ---- the keep-alive time: /cachebeat 2h keeps the cache warm that long, then turns this session off ----

const H = 60 * M

test('a keep-alive time reads a unit, in hours and minutes, within 5 minutes to 48 hours', () => {
  expect(['30m', '2h', '1h30m', '1h 30m', '1.5h', '90min', '0.5h', '5m', '48h', ' 2H ', '2 hours', '45 minutes'].map(parseDuration))
    .toEqual([30, 120, 90, 90, 90, 90, 30, 5, 2880, 120, 120, 45])
  // no unit (the old meaning of a bare number), nothing, a stray unit, out of range
  expect(['30', '1.5', '', 'h', '2x', '1h30', '4m', '49h', '2881m', '1m'].map(parseDuration)).toEqual(Array(10).fill(undefined))
  expect([5, 59, 60, 90, 125, 2880].map(minutesText)).toEqual(['5m', '59m', '1h', '1h 30m', '2h 5m', '48h'])
})

test('/cachebeat 2h turns this session on until then, from the command', async ($: Engine, on: On) => {
  const { clock } = await setup($, on)
  const until = clockText(clock.now() + 2 * H, clock.now())
  expect(await cmd($, '2h')).toBe(`this session: on until ${until} (2h), every 50m idle · starts after your next turn`)
  expect(await cmd($, '')).toBe('on, every 50m idle · 2h left · 0 beats · starts after your next turn')
  await $.turn.complete(turn)
  await clock.advance(30 * M)
  expect(await cmd($, '')).toBe('on, every 50m idle · 1h 30m left · 0 beats · next beat in 20m') // counted from the command, not the turn
  expect((await stateNow($)).session).toMatchObject({ enabled: true, keepAliveMinutesLeft: 90, keepAliveUntil: new Date(2 * H).toISOString() })
})

test('a keep-alive time can be typed with a space, or after on', async ($: Engine, on: On) => {
  await setup($, on)
  expect(await cmd($, '1h 30m')).toStartWith('this session: on until ')
  expect((await stateNow($)).session.keepAliveMinutesLeft).toBe(90)
  expect(await cmd($, 'on 45m')).toStartWith('this session: on until ') // replaces the time
  expect((await stateNow($)).session.keepAliveMinutesLeft).toBe(45)
})

test('a bare number changes nothing and says what it means now', async ($: Engine, on: On) => {
  const { store } = await setup($, on)
  const said = 'nothing changed: a time needs its unit now. /cachebeat 2h keeps the cache warm for 2 hours, then turns off. The beat interval is a setting: /cachebeat global 30, or /cachebeat settings.'
  expect(await cmd($, '30')).toBe(said)
  expect(await cmd($, '')).toBe('off')
  await cmd($, '2h')
  expect(await cmd($, '30')).toBe(said)
  expect((await stateNow($)).session.keepAliveMinutesLeft).toBe(120) // the time stays
  expect(store.has('settings')).toBe(false)
})

test('a time out of range, or without sense, is refused with what it takes', async ($: Engine, on: On) => {
  await setup($, on)
  const takes = (said: string) => `nothing changed: /cachebeat takes a time from 5m to 48h with its unit, like 30m, 2h or 1h30m, not "${said}".`
  expect(await cmd($, '1m')).toBe(takes('1m'))
  expect(await cmd($, '72h')).toBe(takes('72h'))
  expect(await cmd($, '2x')).toBe(takes('2x'))
  expect(await cmd($, '1.5')).toBe(takes('1.5'))
  expect(await cmd($, '')).toBe('off')
})

test('beats keep the cache warm until the time is up, then this session turns off, as asked', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on)
  await $.turn.complete(turn)
  await cmd($, '2h')
  await clock.advance(2 * H - 1)
  expect(forks).toEqual([50 * M, 100 * M]) // the cache at 100m lasts to 160m: the beat that would follow is not needed
  expect((await stateNow($)).session).toMatchObject({ enabled: true, nextBeat: 'none needed' })
  expect(await cmd($, '')).toBe('on, every 50m idle · 1m left · 2 beats · no more beats needed')
  await clock.advance(1)
  expect(logs.filter(l => l.startsWith('stopped'))).toEqual([`stopped: kept warm until ${clockText(2 * H, 2 * H)}, as asked`])
  expect(await cmd($, '')).toBe('off')
  const state = await stateNow($)
  expect([state.session.enabled, state.session.keepAliveUntil, state.session.nextBeat]).toEqual([false, null, null])
  await clock.advance(3 * H)
  expect(forks.length).toBe(2)
})

test('no beat is armed when the cache outlives the time without one', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on)
  await $.turn.complete(turn)
  expect(await cmd($, '55m')).toEndWith('every 50m idle · no more beats needed') // the hour's cache read now lasts past 55m
  await clock.advance(54 * M)
  expect(forks).toEqual([])
  await clock.advance(1 * M)
  expect(forks).toEqual([])
  expect(logs).toHaveLength(1)
  expect((await stateNow($)).session.enabled).toBe(false)
})

test('a keep-alive time past what the cache lasts gets the beats it needs, a five-minute cache every four minutes', async ($: Engine, on: On) => {
  const { clock, forks } = await setup($, on, { env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.turn.complete(turn)
  await cmd($, '12m')
  await clock.advance(12 * M)
  expect(forks).toEqual([4 * M, 8 * M]) // 8m's beat keeps it to 13m, past the 12m asked for
})

test('Stop after idle does not apply while a keep-alive time is set, and does again after on', async ($: Engine, on: On) => {
  const { clock, forks, logs } = await setup($, on, { settings: { stopAfterHours: 1 } })
  await $.turn.complete(turn)
  await cmd($, '5h')
  await clock.advance(2 * H)
  expect(forks.length).toBe(2) // 2h since the last message, past the hour it stops at
  expect((await stateNow($)).session.enabled).toBe(true)
  expect(await cmd($, 'on')).toStartWith('this session: on with no time limit, every 50m idle · next beat in ')
  expect((await stateNow($)).session.keepAliveUntil).toBeNull()
  await clock.advance(1 * H)
  expect(logs.at(-1)).toBe('stopped: 1h since your last message')
})

test('on and off drop the keep-alive time', async ($: Engine, on: On) => {
  await setup($, on)
  await cmd($, '2h')
  expect(await cmd($, 'on')).toBe('this session: on with no time limit, every 50m idle · starts after your next turn')
  expect(await cmd($, '')).toBe('on, every 50m idle · 0 beats · starts after your next turn')
  await cmd($, '2h')
  expect(await cmd($, 'off')).toBe('this session: off')
  expect(await cmd($, 'on')).toBe('this session: on, every 50m idle · starts after your next turn') // no time left from before
})

test('the same time typed again moves the deadline from now', async ($: Engine, on: On) => {
  const { clock } = await setup($, on)
  await cmd($, '2h')
  await clock.advance(30 * M)
  await cmd($, '2h')
  expect((await stateNow($)).session.keepAliveMinutesLeft).toBe(120)
})

test('the time is up even while beats wait for a turn', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on)
  await cmd($, '30m') // no turn yet: nothing cached, so beats wait for one
  await clock.advance(29 * M)
  expect((await stateNow($)).session.enabled).toBe(true)
  await clock.advance(1 * M)
  expect(logs).toEqual([`stopped: kept warm until ${clockText(30 * M, 30 * M)}, as asked`])
  expect((await stateNow($)).session.enabled).toBe(false)
})

test('a turn running when the time is up ends it at its own end', async ($: Engine, on: On) => {
  const { clock, logs } = await setup($, on)
  await $.turn.complete(turn)
  await cmd($, '10m')
  await clock.advance(8 * M)
  await $.turn.start({ text: 'build', turnId: 't2' })
  await step($, 't2', 0)
  await clock.advance(5 * M) // 13m: the 10m is past, the turn goes on
  expect((await stateNow($)).session.enabled).toBe(true)
  expect(logs).toEqual([])
  await $.turn.complete({ ...turn, turnId: 't2' })
  expect((await stateNow($)).session.enabled).toBe(false)
  expect(logs).toEqual([`stopped: kept warm until ${clockText(10 * M, 13 * M)}, as asked`])
})

test('a sleep past the time ends it at the first step after waking', async ($: Engine, on: On) => {
  const { clock, sleep, logs, forks } = await setup($, on)
  await $.turn.complete(turn)
  await cmd($, '2h')
  await clock.advance(10 * M)
  sleep(4 * H)
  await clock.advance(STEP)
  expect(forks).toEqual([])
  expect(logs).toHaveLength(1)
  expect(logs[0]).toStartWith('stopped: kept warm until ')
  expect((await stateNow($)).session.enabled).toBe(false)
})

test('the turn line and the status show the time left, moving with the countdown', async ($: Engine, on: On) => {
  const { clock } = await setup($, on, { settings: { interval: 3, statusHeart: 'off' } })
  await cmd($, '2h')
  await $.turn.complete(turn)
  expect(await draw($, row('r1'))).toEqual(['engine', '♡ next beat in 3m · 2h left'])
  await clock.advance(3 * M)
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×1 · 90k cached · next in 3m · 1h 57m left'])
  await set($, { settings: { showCountdown: false } }) // the countdown row hides both
  expect(await draw($, row('r1'))).toEqual(['engine', '♥ cache kept warm ×1 · 90k cached'])
})

test('an interval saved or a /clear leaves the keep-alive time as it was', async ($: Engine, on: On) => {
  const { clock } = await setup($, on)
  await cmd($, '2h')
  await clock.advance(10 * M)
  await cmd($, 'global 9')
  expect((await stateNow($)).session.keepAliveMinutesLeft).toBe(110)
  await set($, { settings: { interval: 20 }, folder: { interval: 25 } })
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  expect((await stateNow($)).session).toMatchObject({ enabled: true, keepAliveMinutesLeft: 110, intervalMinutes: 25 })
})

test('a reload keeps the keep-alive time', async ($: Engine, on: On) => {
  await setup($, on)
  await cmd($, '2h')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await stateNow($)).session).toMatchObject({ enabled: true, keepAliveMinutesLeft: 120 })
})

// the kit's test hooks cannot write $.state, so this tests the reading of a saved state itself
test('a saved state from before the interval became a setting loses its per-session interval and keeps the rest', () => {
  const old = { enabled: true, idle: 7 * M, lastReal: null, lastWarm: 0, beats: 2 } as unknown as Saved // 0.9's: a session with its own 7-minute interval
  const now = restored(old)
  expect('idle' in now).toBe(false)
  expect(now).toMatchObject({ enabled: true, keepUntil: null, lastWarm: 0, beats: 2, paused: null }) // a key it lacks takes its fresh value
  expect(restored({ ...now, keepUntil: 5 * H }).keepUntil).toBe(5 * H)
})
