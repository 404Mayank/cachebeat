// How dear a cached token is next to an input token, per model: one pure place, for weighing tokens by their price.
// Nothing here is shown to a user. No `$`. An id this table doesn't have gets the common ratios, flagged.

// $ per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing, checked 2026-11-09. Only the
// ratios leave this file. Cache writes are 1.25× input for five minutes and 2× for an hour everywhere. Reads are not
// one multiple: 0.1×, except Fable 5.1 and Mythos 5.1 (0.025×) and Opus 5.5 and Sonnet 5.5 (0.05×). Haiku 5.5 costs
// five times as much on every kind past a 100,000-token prompt, which leaves every ratio as it is.
type Rates = { input: number; output: number; read: number }

const TABLE: Record<string, Rates> = {
  'claude-fable-5-1': { input: 10, output: 50, read: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, read: 0.25 },
  'claude-fable-5': { input: 10, output: 50, read: 1 },
  'claude-mythos-5': { input: 10, output: 50, read: 1 },
  'claude-opus-5-5': { input: 4, output: 20, read: 0.2 },
  'claude-opus-5': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, read: 0.5 },
  'claude-opus-4-5': { input: 5, output: 25, read: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, read: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, read: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, read: 0.3 },
  'claude-sonnet-4-5': { input: 3, output: 15, read: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, read: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, read: 0.1 },
}

const WRITE_5M = 1.25
const WRITE_1H = 2
const READ = 0.1 // the common ratio, for a model this table lacks

/**
 * The table's key for a model id: Claude Code's `[1m]` suffix and a snapshot date come off, nothing else. An id
 * with a provider's prefix (`anthropic.claude-…` on Bedrock) isn't first-party pricing, so it matches nothing.
 */
const keyOf = (model: string) => model.toLowerCase().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')

const find = (model: string): Rates | undefined => (Object.hasOwn(TABLE, keyOf(model)) ? TABLE[keyOf(model)] : undefined)

/** What a cached token costs next to an input token: a read, a five-minute write and a one-hour write. */
export type Ratios = { read: number; write5m: number; write1h: number; isListed: boolean }

/**
 * The model's cache ratios to its input price. A model the table lacks gets the common ones (reads 0.1, writes 1.25
 * and 2) and `isListed` false, so whoever weighs tokens by them can say they are not the model's own.
 */
export function ratiosOf(model: string): Ratios {
  const t = find(model)
  if (!t) return { read: READ, write5m: WRITE_5M, write1h: WRITE_1H, isListed: false }
  return { read: Math.round((t.read / t.input) * 1e6) / 1e6, write5m: WRITE_5M, write1h: WRITE_1H, isListed: true }
}
