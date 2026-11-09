// The prompt cache as everything that says "warm", "cold" or "to re-cache" reads it: one pure place that
// works it out from the facts, so nothing else does. No `$`, no imports but types.
import type { Ttl } from '../types'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

export type CacheFacts = {
  lastWarm: number | null // wall ms: the main conversation's last request or beat that read or wrote the cache
  ttl: Ttl // effective: '5m' when this session's cache was found short, else the lifetime read from Claude Code's settings
  contextTokens: number | null // what the next request re-sends
  writeUsdPerToken: number | null // the re-cache rate; null while prices are unknown
}

export type CacheView = {
  at: number // the time this view was taken, so what's derived from it (minutes ago, minutes left) agrees with it
  state: 'warm' | 'cold' | 'unknown' // unknown: nothing cached yet in this conversation (lastWarm null)
  lastWarm: number | null
  expiresAt: number | null // lastWarm + the lifetime
  coldFor: number | null // ms since expiresAt, once now is at or past it; else null
  ttl: Ttl
  contextTokens: number | null
  recacheUsd: number | null // contextTokens × writeUsdPerToken, when both are known
}

/** Warm while `now` is before the last read plus the lifetime, as Claude Code judges it; cold from then on. */
export function viewOf(f: CacheFacts, now: number): CacheView {
  const expiresAt = f.lastWarm === null ? null : f.lastWarm + TTL_MS[f.ttl]
  const state = expiresAt === null ? 'unknown' : now < expiresAt ? 'warm' : 'cold'
  return {
    at: now, state, lastWarm: f.lastWarm, expiresAt,
    coldFor: state === 'cold' ? now - expiresAt! : null,
    ttl: f.ttl, contextTokens: f.contextTokens,
    recacheUsd: f.contextTokens !== null && f.writeUsdPerToken !== null ? f.contextTokens * f.writeUsdPerToken : null,
  }
}
