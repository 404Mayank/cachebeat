// The Stats page's counts and rows: pure, no `$`. Figures are in input-token equivalents: tokens weighed by the model's cache ratios.
import type { Day, Days, Ttl } from '../types'
import { ratiosOf } from './prices'
import { tokens } from './settings'

export const DAYS = 30 // a day older than this is dropped

export const emptyDay = (): Day => ({ beats: 0, read: 0, wrote: 0, beatCost: 0, kept: 0, avoided: 0, cold: 0, coldTokens: 0, held: 0, common: false })

const two = (n: number) => `${n}`.padStart(2, '0')

/** The local calendar day of a wall time: 2026-11-23. */
export const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

/** Days from `now` back: index 0 is today. Stepped by calendar day, so a daylight-saving change doesn't skip or repeat one. */
export const dayAgo = (now: number, n: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return dayKey(d.getTime())
}

/** `days` with `add` summed into the day of `now`; the days past 30 are dropped. Never mutates. */
export function addTo(days: Days, now: number, add: Partial<Omit<Day, 'common'>> & { common?: boolean }): Days {
  const keep = new Set(Array.from({ length: DAYS }, (_, i) => dayAgo(now, i)))
  const out: Days = {}
  for (const [k, day] of Object.entries(days)) if (keep.has(k)) out[k] = day
  const key = dayKey(now)
  const day = { ...(out[key] ?? emptyDay()) }
  for (const [k, v] of Object.entries(add)) {
    if (k === 'common') day.common = day.common || v === true
    else (day as Record<string, number | boolean>)[k] = (day[k as keyof Day] as number) + (v as number)
  }
  out[key] = day
  return out
}

/** The model's weights for a cache of this lifetime: a read, a write, and whether they are the model's own. */
export function weighOf(model: string, ttl: Ttl) {
  const r = ratiosOf(model)
  return { read: r.read, write: ttl === '1h' ? r.write1h : r.write5m, isListed: r.isListed }
}

/** What a beat adds: the tokens it read and wrote, and their weight. */
export function beatAdd(model: string, ttl: Ttl, read: number, wrote: number, isBeat: boolean) {
  const w = weighOf(model, ttl)
  return { beats: isBeat ? 1 : 0, read, wrote, beatCost: Math.round(read * w.read + wrote * w.write), common: !w.isListed }
}

/** What a turn that came back to a cache only beats kept warm adds: it read what it would otherwise have written. */
export function keptAdd(model: string, ttl: Ttl, read: number) {
  const w = weighOf(model, ttl)
  return { kept: 1, avoided: Math.round(read * (w.write - w.read)), common: !w.isListed }
}

/** A stored `stats` value as days: the numbers it holds, and nothing it can't use. */
export function daysOf(x: unknown): Days {
  if (typeof x !== 'object' || x === null) return {}
  const out: Days = {}
  for (const [k, v] of Object.entries(x)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof v !== 'object' || v === null) continue
    const day = emptyDay()
    for (const f of Object.keys(day) as (keyof Day)[]) {
      const n = (v as Record<string, unknown>)[f]
      if (f === 'common') day.common = n === true
      else if (typeof n === 'number' && Number.isFinite(n)) (day as Record<string, number | boolean>)[f] = n
    }
    out[k] = day
  }
  return out
}

/** The sum of every day of `lists` that falls in `keys`. */
export function sumOf(lists: readonly Days[], keys: ReadonlySet<string>): Day {
  const total = emptyDay()
  for (const days of lists) {
    for (const [k, day] of Object.entries(days)) {
      if (!keys.has(k)) continue
      for (const f of Object.keys(total) as (keyof Day)[]) {
        if (f === 'common') total.common = total.common || day.common
        else (total as Record<string, number | boolean>)[f] = (total[f] as number) + (day[f] as number)
      }
    }
  }
  return total
}

/** The last `n` days' keys, today first. */
export const lastDays = (now: number, n: number) => new Set(Array.from({ length: n }, (_, i) => dayAgo(now, i)))

/** What the page draws: four spans, and the beats of each of the last 30 days, oldest first. */
export type StatsFacts = {
  today: Day
  week: Day
  month: Day
  session: Day // everything this conversation has counted, in its kept days
  strip: number[]
}

/** `others` are the other sessions' days (recorded), `mine` this conversation's (live). */
export function factsFrom(others: readonly Days[], mine: Days, now: number): StatsFacts {
  const all = [...others, mine]
  const span = (n: number) => sumOf(all, lastDays(now, n))
  const strip = Array.from({ length: DAYS }, (_, i) => sumOf(all, new Set([dayAgo(now, DAYS - 1 - i)])).beats)
  return { today: span(1), week: span(7), month: span(DAYS), session: sumOf([mine], new Set(Object.keys(mine))), strip }
}

export const net = (d: Day) => d.avoided - d.beatCost

/** +1.2M, −30k, 0: a minus sign, not a hyphen. */
export const signed = (n: number) => {
  const r = Math.round(n)
  return r === 0 ? '0' : `${r > 0 ? '+' : '−'}${tokens(Math.abs(r))}`
}

const BLOCKS = '▁▂▃▄▅▆▇█'
/** One cell a day: nothing is a dot, the busiest day the tallest block. */
export const stripOf = (beats: readonly number[]) => {
  const top = Math.max(0, ...beats)
  return beats.map(n => (n <= 0 ? '·' : BLOCKS[Math.min(BLOCKS.length - 1, Math.ceil((n / top) * BLOCKS.length) - 1)]!)).join('')
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The 30 days in a line, for /cachebeat stats where no page draws. */
export const statsText = (f: StatsFacts) =>
  `30 days: ${plural(f.month.beats, 'beat')} cost ${tokens(Math.round(f.month.beatCost))}, ${plural(f.month.kept, 'turn')} kept warm avoided ${tokens(Math.round(f.month.avoided))}, net ${signed(net(f.month))} input tokens · this session ${signed(net(f.session))}`

const LABEL = 23
const COL = 13
const cell = (text: string) => text.padStart(COL)
const both = (n: number, figure: string) => (n === 0 ? '0' : `${n} · ${figure}`)

/** The page's lines, each its own row: the spans as columns, in the order of use. The note says so when a figure used the common rates. */
export function statsLines(f: StatsFacts): { header: string; rows: string[]; strip: string; note: string } {
  const spans = [f.today, f.week, f.month, f.session]
  const row = (label: string, of: (d: Day) => string) => `${label.padEnd(LABEL)}${spans.map(d => cell(of(d))).join('')}`
  const common = f.month.common || f.session.common
  return {
    header: `${''.padEnd(LABEL)}${['Today', '7 days', '30 days', 'This session'].map(cell).join('')}`,
    rows: [
      row('Beats · cost', d => both(d.beats, tokens(Math.round(d.beatCost)))),
      row('Kept warm · avoided', d => both(d.kept, tokens(Math.round(d.avoided)))),
      row('Net', d => signed(net(d))),
      row('Cold sends · re-cached', d => both(d.cold, tokens(d.coldTokens))),
      row('Guard asked', d => `${d.held}`),
    ],
    strip: `${'Beats by day'.padEnd(LABEL)}${stripOf(f.strip)} 30 days ago → today`,
    note: common ? 'A model missing from the price table was weighed at the common rates.' : "Input-token equivalents: each request weighed by its model's cache rates.",
  }
}

