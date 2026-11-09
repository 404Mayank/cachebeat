// What a request costs at Anthropic's API list prices: one pure place, so nothing else prices tokens. No `$`.
// Every figure the plugin shows from it is an estimate ("≈$"): a subscription isn't billed per token, a managed
// `modelPricing` can differ, and fast mode doubles Opus. An id this table doesn't have gives null, never a guess.
import type { ModelUsage } from 'claude-code'
import type { Ttl } from '../types'

// $ per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing, checked 2026-11-09.
// Cache writes are 1.25× input for five minutes and 2× for an hour everywhere. Reads are not one multiple: 0.1×,
// except Fable 5.1 and Mythos 5.1 (0.025×) and Opus 5.5 and Sonnet 5.5 (0.05×).
type Rates = { input: number; output: number; read: number; write5m: number; write1h: number }
type Tiered = Rates & { long?: { over: number; factor: number } } // a prompt past `over` tokens costs `factor`× on every kind

const base = (input: number, output: number, read: number): Tiered => ({ input, output, read, write5m: input * 1.25, write1h: input * 2 })

const TABLE: Record<string, Tiered> = {
  'claude-fable-5-1': base(10, 50, 0.25),
  'claude-mythos-5-1': base(10, 50, 0.25),
  'claude-fable-5': base(10, 50, 1),
  'claude-mythos-5': base(10, 50, 1),
  'claude-opus-5-5': base(4, 20, 0.2),
  'claude-opus-5': base(5, 25, 0.5),
  'claude-opus-4-8': base(5, 25, 0.5),
  'claude-opus-4-7': base(5, 25, 0.5),
  'claude-opus-4-6': base(5, 25, 0.5),
  'claude-opus-4-5': base(5, 25, 0.5),
  'claude-sonnet-5-5': base(2, 10, 0.1),
  'claude-sonnet-5': base(2, 10, 0.2),
  'claude-sonnet-4-6': base(3, 15, 0.3),
  'claude-sonnet-4-5': base(3, 15, 0.3),
  'claude-haiku-5-5': { ...base(0.1, 0.5, 0.01), long: { over: 100_000, factor: 5 } },
  'claude-haiku-4-5': base(1, 5, 0.1),
}

/**
 * The table's key for a model id: Claude Code's `[1m]` suffix and a snapshot date come off, nothing else. An id
 * with a provider's prefix (`anthropic.claude-…` on Bedrock) isn't first-party pricing, so it matches nothing.
 */
const keyOf = (model: string) => model.toLowerCase().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')

const find = (model: string): Tiered | undefined => (Object.hasOwn(TABLE, keyOf(model)) ? TABLE[keyOf(model)] : undefined)

const rates = (model: string, promptTokens: number): Rates | null => {
  const t = find(model)
  if (!t) return null
  const f = t.long && promptTokens > t.long.over ? t.long.factor : 1
  return { input: t.input * f, output: t.output * f, read: t.read * f, write5m: t.write5m * f, write1h: t.write1h * f }
}

/** Whether the table has this model. */
export const isPriced = (model: string) => find(model) !== undefined

const PER = 1_000_000

/**
 * What a request cost, in dollars; null for a model not in the table. `ttl` prices the tokens it wrote to the
 * cache: a beat's fork writes at the five-minute rate (inferred from `cost.usd`, which fit to the last digit),
 * whatever the main conversation's lifetime.
 */
export function priceOf(u: ModelUsage, model: string, ttl: Ttl): number | null {
  const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
  const r = rates(model, prompt)
  if (!r) return null
  return (u.input_tokens * r.input + u.output_tokens * r.output + u.cache_read_input_tokens * r.read
    + u.cache_creation_input_tokens * (ttl === '1h' ? r.write1h : r.write5m)) / PER
}

/** What the engine's own estimates taught: a rate in $ per token, by `rateKey`. */
export type Learned = Map<string, number>

/** A model's rate is its own at each lifetime, and Haiku 5.5's at each side of its 100K-token tier. */
export function rateKey(model: string, ttl: Ttl, promptTokens: number) {
  const t = find(model)
  return `${keyOf(model)}|${ttl}|${t?.long && promptTokens > t.long.over ? 'long' : 'std'}`
}

/**
 * The cost per token of writing a conversation of `promptTokens` to the cache at `ttl`: what the engine said when
 * it priced a re-cache of this model (`learned`), else the table's; null when neither knows it.
 */
export function writeRate(model: string, ttl: Ttl, promptTokens: number, learned?: Learned): number | null {
  const taught = learned?.get(rateKey(model, ttl, promptTokens))
  if (taught !== undefined) return taught
  const r = rates(model, promptTokens)
  return r ? (ttl === '1h' ? r.write1h : r.write5m) / PER : null
}

/** An estimate under this is rounded to four decimals by the engine: too coarse to give a rate. */
export const MIN_LEARN_TOKENS = 20_000

export type Estimate = {
  model: string; ttl: Ttl; tokens: number; usd: number
  pricing: 'configured' | 'catalog' | 'default' // the engine's: a managed price, list price, or a guess for a model it doesn't know
}

/**
 * Takes the rate out of the engine's estimate of a re-cache, when it knows what the table can't: a managed
 * `modelPricing` ('configured'), or a model the table lacks. The engine's 'catalog' figure for a model the table has
 * is the list price again (and one rounded to four decimals); 'default' is a guess. Returns whether it learned.
 */
export function learnRate(learned: Learned, e: Estimate): boolean {
  if (e.tokens < MIN_LEARN_TOKENS || !(e.usd > 0) || e.pricing === 'default') return false
  if (e.pricing === 'catalog' && isPriced(e.model)) return false
  learned.set(rateKey(e.model, e.ttl, e.tokens), e.usd / e.tokens)
  return true
}

/** A dollar figure for the log: `≈$0.02`, `≈$0.0005` below a cent, `<$0.0001` below that. */
export function money(usd: number) {
  if (usd < 0.0001) return '<$0.0001'
  return `≈$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`
}
