// The Status page's rows: pure, from the figures `state` reports. No `$`, no imports but the formatters.
import { minutesText, tokens } from './settings'

/** The figures the page draws: what `state`'s `cache`, `session` and `context` sections and its settings report. */
export type StatusFacts = {
  cache: {
    state: 'warm' | 'cold' | 'unknown'
    ttl: '5m' | '1h'
    lastReadMinutesAgo: number | null
    minutesLeft: number | null
    coldForMinutes: number | null
    contextTokens: number | null
    recacheInputTokens: number | null
  }
  session: {
    enabled: boolean
    intervalMinutes: number
    intervalFrom: string
    keepAliveMinutesLeft: number | null
    beats: number
    lastBeatReadTokens: number | null
    lastBeatWrittenTokens: number | null
    nextBeat: string | null
    skipping: string | null
    paused: string | null
    coldGuard: boolean
    coldGuardFrom: string
    usageLimits: readonly { kind: string; percentUsed: number }[]
  }
  lastMessageMinutesAgo: number | null
  coldGuardTokens: number
  stopAtUsage: number
}

/** A usage window as `stop()` names it in its message: five_hour is five-hour. */
export const usageName = (kind: string) => kind.replace('_', '-')

/** Whole minutes as words; under a minute says so, since the figures are floored. */
const span = (m: number) => (m < 1 ? 'under 1m' : minutesText(m))

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function cacheRow(c: StatusFacts['cache']) {
  const life = `${c.ttl === '1h' ? '1h' : '5m'} TTL`
  if (c.state === 'unknown') return `nothing cached yet (${life})`
  const read = `last read ${span(c.lastReadMinutesAgo ?? 0)} ago`
  if (c.state === 'cold') return `cold for ${span(c.coldForMinutes ?? 0)} (${life}, ${read})`
  return `warm (${life}, ${read}) · ${span(c.minutesLeft ?? 0)} left`
}

function sizeRow(c: StatusFacts['cache']) {
  if (c.contextTokens === null) return 'not counted yet'
  const weighed = c.recacheInputTokens === null ? '' : ` · as ${tokens(c.recacheInputTokens)} input tokens to cache again`
  return `${tokens(c.contextTokens)} tokens${weighed}`
}

function beatingRow(s: StatusFacts['session']) {
  if (!s.enabled) return 'off'
  const source = s.intervalFrom === 'auto' ? ' (auto)' : s.intervalFrom === 'all folders' ? '' : ` (this ${s.intervalFrom}'s)`
  const parts = ['on', `every ${minutesText(s.intervalMinutes)} idle${source}`]
  if (s.skipping) parts.push(`beats skip · ${s.skipping}`)
  else if (s.paused) parts.push(`beats wait for your next message · ${s.paused}`)
  else if (s.nextBeat === 'none needed') parts.push('no beat needed')
  else if (s.nextBeat) parts.push(s.nextBeat.startsWith('in ') ? `next ${s.nextBeat}` : `next beat ${s.nextBeat}`)
  if (s.keepAliveMinutesLeft !== null) parts.push(`${span(s.keepAliveMinutesLeft)} left`)
  return parts.join(' · ')
}

function sessionRow(s: StatusFacts['session']) {
  if (s.beats === 0) return 'no beats yet'
  const last = s.lastBeatReadTokens === null ? '' : ` · the last read ${tokens(s.lastBeatReadTokens)}, wrote ${tokens(s.lastBeatWrittenTokens ?? 0)}`
  return `${plural(s.beats, 'beat')}${last}`
}

function guardRow(f: StatusFacts) {
  const { coldGuard, coldGuardFrom } = f.session
  const own = coldGuardFrom === 'session' ? ' · this session' : ''
  return coldGuard ? `on${own} · asks from ${tokens(f.coldGuardTokens)} tokens` : `off${own}`
}

/** The page's rows, label and value; Usage only where the account reports limits. */
export function statusRows(f: StatusFacts): { label: string; value: string }[] {
  const limits = f.session.usageLimits
  return [
    { label: 'Cache', value: cacheRow(f.cache) },
    { label: 'Size', value: sizeRow(f.cache) },
    { label: 'Beating', value: beatingRow(f.session) },
    { label: 'This session', value: sessionRow(f.session) },
    { label: 'Cold guard', value: guardRow(f) },
    ...(limits.length ? [{ label: 'Usage', value: `${limits.map(l => `${usageName(l.kind)} ${Math.round(l.percentUsed)}%`).join(' · ')} · beats stop at ${f.stopAtUsage}%` }] : []),
    { label: 'Last message', value: f.lastMessageMinutesAgo === null ? 'none yet' : `${span(f.lastMessageMinutesAgo)} ago` },
  ]
}

export const STATUS_NOTE = 'Warm or cold is judged by the time since the cache was last read, as Claude Code judges it; only the next request confirms it.'
