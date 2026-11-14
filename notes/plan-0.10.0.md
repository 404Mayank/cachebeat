# 0.10.0: cache state, keep-alive time, resume, cold guard, dollars, CacheTax

Status (2026-11-09, end of day): steps 0, 1, 2, 2b and 3 are built, reviewed and merged into `dev`; step 3b is next. Step 1 ships alone as **0.9.3** ([PR #13](https://github.com/404Mayank/cachebeat/pull/13), CI green, waiting on the portal check and the live sleep check). It was planned as 0.9.2, but a cloud session had already released 0.9.2 on 2026-10-13 (the `h` rename), so read "0.9.2" below as 0.9.3. Where to start: notes/handoff.md. The user answered the plan's questions the same day ("Decisions" at the end). Items 5 and 7 (the summary and CacheTax pages) are **provisional** until the user re-sends the reference screenshots: their content is settled here, their look isn't.

**Step 0 ran 2026-11-09:** P2–P7 are answered ("0.10.0 probes" in mods-gotchas.md, which says what was observed and what's inferred). P1 and P8 are still pending.

Line numbers are `dev` at `f58a51b` (0.9.1). The mod API is `.claude-plugin/types/claude-code/index.d.ts` (written `index.d.ts:N` below).

## The problem

The user asked for eight things:

1. **Bug:** after the machine wakes from sleep, the turn line stays on "next in 1m".
2. **Resume:** after `--resume`, `--continue` or `/resume`, cachebeat either waits for the next turn or doesn't start at all.
3. **`/cachebeat <time>`** should stop setting the interval, which belongs in settings. It should set how long cachebeat keeps the cache warm, then stop. **Stop after idle**'s text must say how the two interact.
4. **Cold guard:** a message sent to a session whose cache has gone cold is held once. A second send goes through, with a warning saying how long the cache has been cold. There's a setting for this session and one for all sessions.
5. **Bare `/cachebeat`** shows a summary, like `/usage`: warm or cold, TTL, last active, and so on.
6. **Dollar figures** in cachebeat.
7. **A CacheTax page,** like `/stats`: what beats cost, what they saved, cold sends.
8. **Redo the demo GIF,** last.

## What's definitive and what's inferred

Read this before any step. An implementer must not treat an inferred point as fact.

### Facts from the types

- **No live "is the cache warm" source exists.**
  - `$.session.usage()` gives the context fill, rate limits and `cost.usd` (`index.d.ts:11704`). `session.measure` pushes the same figures (`:4405`, `:11088`).
  - `prompt_cache_warm` and `cache_ttl` exist only in `classic.PreModelSwitch` and `classic.PostModelSwitch` (`:7824`, `:7910`).
  - `prompt_cache_likely_expired` and `seconds_since_last_response` exist only in `classic.SessionStart` for resume or fork (`:11650`).
  - The engine's own words are "likely" and "seconds … exceeds the TTL". Its judgment is the same time-against-TTL inference cachebeat makes.
  - **The answer to the user's question:** `/usage` and the uncached footer hint work from the age of the last response too. Neither cachebeat nor Claude Code knows warmth live. The only definitive signal comes after a request: its `cache_read_input_tokens` against `cache_creation_input_tokens`. cachebeat already records that for every turn request (`turn.step`, register.tsx:944) and every beat (:505).
  - The server can also evict early, so "warm" stays a likelihood even within the TTL.
- **The engine prices a re-cache only at a model switch or a resume.**
  - `estimated_cache_write_usd`, `context_tokens`, and `pricing` (`configured` / `catalog` / `default`) come with `classic.Pre/PostModelSwitch` (`:7820–7833`) and with resume `classic.SessionStart` (`:11656–11664`).
  - `ModelUsage` and `TurnUsage` carry token counts only (`:6423`, `:13656`). `ModelForkResult` carries no dollars (`:6363`).
  - `SessionCost.usd` is the session's running total, "summed over every priced API response" (`:10984`).
- **`prompt.submit` can refuse a prompt.** A hook answers `{ drop: reason }` without calling `next` (`:9104`). "The text is shown to the user as the reason."
  - `origin` is **always present** on the input (`:9095`): `composer` is the user's Enter at the terminal, `bridge` is Remote Control, and `plugin` is a plugin's `$.prompt.submit` (`:8865–8985`). It's absent only on the *result*, where absent means "the user's own".
  - `turnId` is set when the prompt was typed over a running turn (`:9072`).
  - A hook that fails lets the prompt through (`:4093`). The guard fails open by default; keep it that way: no `.catch` that drops.
- **The `$` time a hook spends doesn't count against its 10s budget** (`:5099`). So a `prompt.submit` hook may await `$.ui.ask` (`:2420`), the engine's own question dialog. That's an alternative to drop-and-resend; see the cold guard's alternatives.
- **`session.end` has `resume.id`,** "what `claude --resume <id>` takes, the ending session's own" (`:11495`). `$.session.id()` is "the transcript file's name" (`:2796`). The classic hook input carries `session_id` (`:827`).
- **`$.state` is host memory.** That's why `read($, saved)` is null after `--resume` (mods-gotchas.md, "Resuming a conversation"). Only `$.store` persists.

### Inferred: check before building on it

Step 0 below checks each one.

| # | Claim | Why it's believed | How to check | Result |
| --- | --- | --- | --- | --- |
| P1 | `$.clock.after` timers stop while the machine sleeps, while `$.clock.now()` jumps ahead | libuv and Bun time timers on the monotonic clock, which excludes suspend on Linux and macOS. The types say nothing about it. | A probe mod logs `$.clock.now()` from a 60s `$.clock.every`. Suspend for 3+ min (`systemctl suspend`, or close the lid), wake, and read the gaps in `~/.claude/debug/<session>.txt`. | **Pending:** needs the machine suspended. |
| P2 | After `--resume` / `--continue`, `$.session.id()` equals the id before exit | `SessionResume.id` is what `--resume` takes | The probe logs `$.session.id()` at `session.start` and `e.sessionId` at `session.end`. Exit, `claude --resume <id>`, compare. Same with `--continue`. | **Yes** for `--resume` and `--continue`. On `/resume`, `$.session.id()` inside `classic.SessionStart` is still the old id: read `e.session_id`. |
| P3 | On `--resume`, `classic.SessionStart` (source `resume`) reaches the mod, before `session.start`, with `seconds_since_last_response` etc. set | mods-gotchas.md says it fires before the session is bound | The probe logs the hook order and the fields. Repeat on 2.1.287 (gotchas: "Testing an old version locally"). | **Fields yes, order no.** `classic.SessionStart` reaches the mod with all four fields, but it runs *concurrently* with `session.start` (entered 1ms after it; the hook was made to wait 800ms and `session.start` didn't). Apply the hint from whichever finishes second. `estimated_cache_write_usd` is rounded to 4 decimals. The `likely_expired: true` case wasn't seen. |
| P4 | `$.session.usage().cost.usd` grows by a fork's price | "every priced API response" | The probe reads `cost.usd` before and after `/cachebeat now` on an idle session. | **Yes.** `cost.usd` rose by exactly the fork's price, at once. But `cost.usd` and the resume estimate imply different write rates. |
| P5 | A dropped prompt's text stays in the composer | Unknown either way | The probe drops every `composer` prompt that starts with `drop-me`. Does the text stay? Where does the reason draw? On desktop too. | **Yes, it stays.** The reason is drawn as a row, `Prompt dropped by a hook: <reason>`. Enter on the same text raises the event again. A `$.ui.log` before a drop draws just above it. |
| P6 | Slash commands, `!` shell commands and prompt-type commands (skills, `/review`) do or don't raise `prompt.submit`, and with which `origin` | Unknown | The probe logs `e.origin.kind` and `e.text` on every `prompt.submit`. Type `/cachebeat`, `!ls`, a skill command and plain text. | Plain text and skills (text as typed) reach it, mid-turn ones with `turnId` set. Plugin and built-in slash commands (`command.run` only) and `!` don't. |
| P7 | The test kit can raise `prompt.submit` with `origin: { kind: 'composer' }` | `$.prompt.submit` from a test may stamp `plugin` | A test calls the event with an origin and checks what a hook sees. If the kit can't do it, the guard's tests need another route. Say so in that step. | **Yes**, with the origin passed in the test's call. Left out, `e.origin` is `undefined`. |
| P8 | `prompt.submit`, `$.session.id`, and the resume fields exist on 2.1.287 | Optional in the types | Run the probe under the 2.1.287 install. Or push a branch and let CI's 2.1.287 leg run the step's tests. | **Pending:** needs 2.1.287. |

## The design

### Item 1 and the shared cache state: step 1, shipped alone as 0.9.2

This section is the whole brief for step 1. Read it with "What's definitive and what's inferred" above and "For every step, these bite" under "Steps, in order". Step 1 ships as **0.9.2** before the rest of 0.10.0 (the user's decision), so it must not depend on anything later: the session interval (`s.idle`) is still there in 0.9.2, and dollars are still `null`.

**Current behavior:**
- `schedule()` arms one `$.clock.after(ms)` for the whole interval (register.tsx:353) and records `s.nextAt = now + ms` in wall time (:352).
- The display sites disagree about a `nextAt` that has passed:
  - `refreshLine` (:215) and `stateOf` (:663) go through `fmt()` (:63), which floors at 1m: "next in 1m", `in 1m`
  - bare `/cachebeat` (:835–843) and `turnOn` (:607–613) take `Math.max(0, …)`, then `when(0)` (:567): "beating now"
- When the late timer finally fires, `beat()` finds `since >= MAX_TTL` and **stops** cachebeat (:458).
- **The countdown has no clock of its own:** only the animation tickers redraw it (:231, :243). With both animations off, it never moves between schedules.

**The cause,** found by reading the code and the bundle:
- `$.clock.now()` is `Date.now()`, confirmed in the bundle. `$.clock.after` is a plain `setTimeout`. That it stops during suspend is P1, inferred from libuv/Bun timing timers on the monotonic clock.
- After waking, `nextAt − now < 0`, and the tickers' `refreshLine` redraws "1m" every second until the timer has run out the rest of its awake wait, up to a whole interval.
- A real repeating "next in 1m" also comes from the RETRY loop (:497–500) while the network is still down after waking. That one is truthful and stays.

#### 1a. The shared cache state

One pure module, `hooks/cache.ts`, plus one reader in `register.tsx`. Everything that says "warm", "cold", "cold for 2h" or "$ to re-cache" reads it, in this step and every later one. Nothing else works this out.

```ts
// hooks/cache.ts: no `$`, no imports but types
import type { Ttl } from '../types'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

export type CacheFacts = {
  lastWarm: number | null        // wall ms: the main conversation's last request or beat that read or wrote the cache (s.lastWarm)
  ttl: Ttl                       // effective: '5m' when s.isCacheShort, else the ttl cacheTtl() read
  contextTokens: number | null   // what the next request re-sends (chatSize)
  writeUsdPerToken: number | null // the re-cache rate; null until step 2 adds prices
}
export type CacheView = {
  state: 'warm' | 'cold' | 'unknown' // unknown: nothing cached yet in this conversation (lastWarm null)
  lastWarm: number | null
  expiresAt: number | null       // lastWarm + TTL_MS[ttl]
  coldFor: number | null         // ms since expiresAt, once now is past it; else null
  ttl: Ttl
  contextTokens: number | null
  recacheUsd: number | null      // contextTokens × writeUsdPerToken, when both are known
}

export function viewOf(f: CacheFacts, now: number): CacheView
```

- **Warm or cold is by time,** as Claude Code judges it: warm while `now < lastWarm + TTL_MS[ttl]`. The tool text says "likely". Each beat and turn confirms it through its usage.
- **The reader** is `async function cacheNow($: EngineInterface): Promise<CacheView>` in register.tsx. The name must be used nowhere else in the file (2.1.287's loader). It reads:
  - `const now = await $.clock.now()` and `const size = await chatSize($)` (:315), each as a plain statement
  - `s.lastWarm`, and `s.isCacheShort ? '5m' : ttl` for the TTL
  - `writeUsdPerToken: null` in this step
- **It works with beating off.** `markWarm` (:575) runs on every turn request and at `turn.complete`, whether beating is on or not. Keep it that way: don't gate `markWarm` on `s.enabled`. The cold guard (step 5) relies on it.
- **`state` (the tool) gains `cache`,** built in `stateOf` (:658) from `cacheNow($)`:

  ```ts
  cache: { state, ttl, lastReadMinutesAgo, minutesLeft, coldForMinutes, contextTokens, recacheUsd }
  ```

  - Minutes are whole numbers (`Math.floor`).
  - `lastReadMinutesAgo` and `minutesLeft` are null with no `lastWarm`. `minutesLeft` is null once cold, and `coldForMinutes` is null while warm.
  - Add one sentence to `STATE`'s description (tools.ts:80–90). The text is static, so it lists names, never values: "`cache` is whether this session's prompt cache is likely still warm, judged by the time since it was last read against its lifetime, as Claude Code judges it: `state` (warm, cold, or unknown before anything is cached), minutes since the last read, minutes left or minutes cold, the conversation's size in tokens, and `recacheUsd`, an estimate of what the next message pays to cache it again (null when unknown)."

#### 1b. Waiting by the wall clock

The wall-clock deadline is the authority, never a timer having fired. That's correct whether P1 holds or not.

- **Wait in steps.** `const STEP = 60_000` beside `RETRY` (:14). `schedule()` stops arming one long timer at :353. In its place it calls `armStep($, call, now)`, where `call` is the `scheduling` value that `schedule()` call took. `armStep` is a plain function: it works out `const wait = Math.min(STEP, Math.max(0, at - now))` first, from `const at = s.nextAt` checked non-null, then arms `timer = $.clock.after(wait, () => void wallCheck($, call))`. Nothing but `wait` and the arrow goes into the `$` call.
- **`async function wallCheck($, call: number)`:**
  1. reads `const now = await $.clock.now()`
  2. if `s.nextAt === null`, returns (a reschedule cleared it)
  3. if `now >= s.nextAt`, returns `scheduledBeat($)`
  4. otherwise `await refreshLine($)` and `armStep($, call, now)`

  Between steps 1 and 4 there's an `await`. If a `schedule()` call ran meanwhile, it armed its own chain, and this one must end there, or two chains run. That's the 0.7.0 two-timer bug (mods-gotchas.md, "Timing and events"). So `wallCheck` returns without acting when `call !== scheduling` after its `await`.
- **The RETRY path** (:497–500) arms first and sets `s.nextAt` after, today. Reverse that: read `now` once, set `s.nextAt = now + RETRY`, then call `armStep($, scheduling, now)` in place of its own `$.clock.after`. `armStep` reads `s.nextAt`, so the other order would arm against the stale deadline. There's then one way to wait.
- **A sleep costs at most one step** past waking: the step's timer has at most 60s of awake time left.
- **Keep the `scheduling` call counter** (:332, :350, :357): only the newest `schedule()` call may arm. `armStep` sets the same `timer` variable that `schedule()` (:333) and the RETRY path cancel. 
- **No recursion:** `wallCheck` calls `refreshLine` and `armStep`, and `schedule()` only through `beat()`. `refreshLine` calls neither.
- `armStep` and `wallCheck` are handed `$`: grep that both names are new in register.tsx.

#### 1c. A cold cache waits, by default

The user decided this, and asked for a setting to choose.

- **When the cache counts as gone cold,** in `beat()`, just after the `stopAfterHours` check (:457), replacing :458:
  - `since >= MAX_TTL`, as today, or
  - the beat is late (`since > idle() + 2 * STEP`: a suspended or stalled process, or retries) and `since >= TTL_MS[effective ttl]`. An on-time beat never counts: a custom interval longer than the TTL keeps today's "not served" handling. This catches a 5-minute cache that a 10-minute sleep let lapse. Without it, the beat writes the whole cache again, then stops as "not served".
- **Then, by the new setting `onCold`:**
  - `'wait'` (the default): `await pause($, COLD, said)` with `said` = `` `the cache went cold (${fmt(since)} since it was last read)` ``, and return `` `beats wait for your next turn: ${said}` ``, as the other pauses in `beat()` do (:473). `const COLD = 'the cache went cold'` sits beside `MODEL_CHANGED` (:381). The log, through `pause`: `beats wait for your next turn: the cache went cold (2h 14m since it was last read)`.
  - `'stop'`: return `stop($, …)` with the reason `the cache went cold (2h 14m since it was last read)`. This replaces today's "over an hour since the cache was last read, so it has expired" (the retry test at cachebeat.test.tsx:530–537 asserts it; see Tests).
- **A late beat whose cache is still inside its TTL beats as usual:** a short sleep still beats in time to help.
- **`stopAfterHours` is checked first** (:457), so a sleep past it still stops cachebeat at the first step after waking. That's unchanged.
- **The cold line.** In `refreshLine` (:206), before the generic `s.paused` branch at :209: when `s.enabled && s.paused === COLD`, the text is `♡ cache went cold · beats start again on your next message`. The next turn's `markWarm` clears `s.paused` (:578), as for every pause.
  - **No age in the line, on purpose:** while paused the pulse is `waiting`, so the tickers are stopped and no step timer runs (`nextAt` is null). Nothing would redraw a moving age, so it would go stale. The log line carries the age at the moment, and the Status page (step 6) shows it live.
- **Where else this is reached, beyond sleep** (the user confirmed one rule for all of them):
  - **Retries running past the cache's lifetime.** Transient errors are retried every minute (:497). Today they end in a stop; with `wait`, they pause.
  - **`/cachebeat now` on a cache that has already gone cold.** `beatNow` (:558) goes into `beat()`, which today *switches cachebeat off*. With `wait`, it answers `beats wait for your next turn: the cache went cold (…)` and stays on.
  - **A stalled process** (a debugger, `SIGSTOP`): the same as sleep.
- **What it doesn't cover:**
  - "**the cache was not served**" (:528–537), where a beat found the cache gone and wrote it again. That's evidence the TTL is shorter than cachebeat thought, and it keeps its own handling (stop, or switch `auto` to 4m).
  - `nothing-to-fork` (:492) stays a stop.

**The Cache gone cold setting**

- **Key:** `onCold: 'wait' | 'stop'`, default `'wait'`, in `BeatSettings` (types/index.d.ts:37–68) and `DEFAULTS` (settings.ts:4).
- **Row:** on the Limits tab, right after **Stop after idle** (settings.ts:287):

  ```ts
  { key: 'onCold', label: 'Cache gone cold', values: ['wait', 'stop'],
    fmt: v => (v === 'wait' ? 'start on your next message' : 'stop'),
    help: 'If the cache goes cold before a beat reaches it, as when your computer sleeps: start beating again on your next message, or stop.' },
  ```

  Two values and no custom, so Enter flips it in place (`isFlip`).
- **Validation:**
  - `accept()` takes it through the row's `values`; nothing to add.
  - In `normalize()` (settings.ts:58), add `if (!['wait', 'stop'].includes(out.onCold)) out.onCold = DEFAULTS.onCold`, as `onModelSwitch` has at :79.
  - `normalizeOwn` uses `accept`, so a folder's own value is checked too.
- **Tool:**
  - The schema comes from the row by itself (`kinds()`, an enum).
  - `ABOUT` (tools.ts:10) is a `Record` over every key, so `tsc` refuses a missing one: `onCold: "If the cache goes cold before a beat reaches it (the computer slept, or retries ran past its lifetime): wait, and beat again after the user's next message, or stop beating."`
  - `state` needs no new field: `settings.onCold` is there, and `session.paused` reads `the cache went cold`. Add that to the `paused` examples in `STATE`'s description (tools.ts:88).

#### 1d. One overdue wording everywhere

Add one pure helper in register.tsx, beside `fmt` (:63). It owns the word "in":

```ts
const untilNext = (ms: number) => (ms <= 0 ? 'due now' : `in ${fmt(ms)}`)
```

Every "next" text goes through it, and no caller writes "in" itself:
- **`statusText`** (pane.tsx:70–77) takes `next` as `untilNext`'s whole result. Its templates become `♡ next beat ${next}` and `· next ${next}`.
  - The settings preview's sample call (pane.tsx:90) passes `'in 42m'` in place of `'42m'`.
  - `refreshLine` (:215) passes `untilNext(at - now)`.
- **`when()`** (:564–567) returns `` `next beat ${untilNext(ms)}` `` for a number. So `ms === 0` reads `next beat due now` where it read `beating now`. Bare `/cachebeat` and `turnOn` both get it through `when()`. Update the test at cachebeat.test.tsx:326.
- **`stateOf`** (:663): `nextBeat: untilNext(s.nextAt - now)`, so `in 42m` as today, or `due now`. Add `due now` to the `nextBeat` values in `STATE`'s description (tools.ts:84).
- **`fmt()` itself is unchanged:** it formats intervals, and `every()` uses it. A past deadline now lasts at most one step.

#### Tests (`hooks/cachebeat.test.tsx`)

- **Simulating suspend.** Add `skew` to `World`, with a setter returned from `setup()` (`sleep: (ms) => (skew += ms)`), and a `clock.now` hook that adds it, so wall time jumps and no timer fires:
  - **Check the hook order first.** A hook registered after `mock.clock(on)` may sit above or below it. If the mock answers `clock.now` without calling `next` above the test's hook, register the skew hook before `mock.clock(on)`.
  - **Check the result shape:** whether `next(e)` beneath gives `{ value }` or a bare number. Pass it on in the same shape.
- **`hooks/cache.ts` directly:** `viewOf` gives `unknown` with no `lastWarm`; `warm` with `expiresAt` 1ms ahead; `cold` with `coldFor` at the boundary; the 5-minute TTL; `recacheUsd` null when either input is null.
- **Sleep, in the engine:**
  - On, 10m after a turn, sleep 2h, `advance(STEP)`. No fork. The line reads `♡ cache went cold · beats start again on your next message`, and the log `beats wait for your next turn: the cache went cold (2h 10m since it was last read)`. `state.session.paused` is `the cache went cold`. `enabled` is still true. `state.cache.state` is `cold`.
  - The same with `settings: { onCold: 'stop' }`: off, with `stopped: the cache went cold (…)`.
  - A 5-minute cache (`env: { FORCE_PROMPT_CACHING_5M: '1' }`), sleep 10m, `advance(STEP)`: cold, no fork. Before the fix, it forked and stopped as "not served".
  - Sleep 20m inside a 1h TTL, starting 45m after the turn (beat due at 50m): within one `STEP` of waking, a beat forks.
  - After the cold pause, a turn starts beats again at the normal interval.
  - `/cachebeat now` 2h after the last turn: with `wait`, it pauses and stays on; with `stop`, it goes off.
  - Transient errors retried past the hour: the existing test at cachebeat.test.tsx:530–537 covers this and asserts the old stop. Under the default it now expects the pause (`the cache went cold` in the last log, still on). Add a copy with `settings: { onCold: 'stop' }` that keeps the old assertion's shape with the new message. The stub is `{ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(0, 0) }` (:522).
  - Sleep past `stopAfterHours`: stops with the existing message, under either value.
- **Wording:**
  - With `nextAt` 30s in the past (skew 30s past a due beat, before the step fires), the line, `state.session.nextBeat` and bare `/cachebeat` all say `due now`.
  - With `heartAnimate: false` and `lineAnimate: false`, the turn line's countdown moves each `STEP` (`next in 50m` → `next in 49m`).
- **The setting:**
  - `normalize()` replaces a bad `onCold` with the default.
  - `set` with `settings: { onCold: 'stop' }` is accepted, and `'never'` is refused naming both values.
  - The menu's Limits tab shows **Cache gone cold**, and Enter flips it.
- **Unchanged:**
  - The existing "commands and turns arriving together" race test still passes with step timers.
  - All the existing tests pass, apart from :326 (`beating now` becomes `next beat due now`) and :530–537 (retries past the hour now pause), which change as said above. Expect both; neither is a regression.
  - The new key needs no other test changes (checked by grep):
    - The tests that list settings compare against `DEFAULTS` (:209, :721, :743), so they take `onCold` by themselves.
    - The Limits-tab tests press rows by key (:197, :627, :712, :1233), not by position.
    - If another test fails on the new row or key, read it before changing the design.
- **Gotcha:** with steps, `clock.advance(IDLE)` resolves about 50 step timers along the way. Tests that count logs or forks are unaffected. Check with `grep -n "clock.after" hooks/cachebeat.test.tsx` that no test counts `clock.after` dispatches.

#### README (on `main` through the release; users only)

- **"When it stops on its own"** (README:246–255): the bullet "the cache is already gone, so there's nothing left to keep warm" covers both :458 and :492. Make it "there's no conversation yet to keep warm" (for :492). Add after the list: `If the cache goes cold before a beat reaches it, as when your computer sleeps, cachebeat waits and starts beating again on your next message. Set **Cache gone cold** to stop to have it turn off instead.`
- **The Limits table** (README:184–188) gets the row, after Stop after idle: `| Cache gone cold | If the cache goes cold before a beat reaches it (say, your computer slept): start beating again on your next message, or stop | start on your next message |`.
- **"What you'll see":** the turn line paragraph (:129) adds that a cold cache reads `♡ cache went cold · beats start again on your next message`.
- **"What it sends"** (:97): "Ask Claude, and it can tell you how much the last beat read and wrote, and whether the cache is likely still warm."

#### Notes (`dev`, a separate commit)

- mods-gotchas.md, "Timing and events": timers stop while the machine sleeps (P1, with what the probe found if step 0 ran it) and `$.clock.now()` doesn't. That's why beats wait in 60s steps against the wall-clock deadline.
- claude-tools.md: `state.cache`, and why it says "likely".

#### Releasing 0.9.2

- Bump `version` in `.claude-plugin/plugin.json` to `0.9.2`. Then follow notes/README.md, "Releasing, step by step": branch `v0.9.2` off `main`, take the plugin files from `dev`, run the three checks, PR, validate the branch in the portal, fast-forward.
- **The release notes' summary:**
  - The turn line no longer sticks on "next in 1m" after your computer wakes from sleep. Beats catch up within a minute.
  - **Changed default:** a cache that goes cold before a beat reaches it (after sleep, after retries, or `/cachebeat now` on a cold cache) used to switch cachebeat off. Now beats wait and start again on your next message. Set **Cache gone cold** to stop for the old behavior.
  - Claude's `state` tool now reports whether the cache is likely still warm.

**Risk:** a 60s `$.clock.after` is one host dispatch a minute while armed. That's negligible next to the 80ms animation tickers.

### Item 6: dollars (step 2)

**What the API offers:** see "Facts". There's no per-request dollar figure. The engine prices a re-cache at a switch or resume, and keeps a session total.

**The design** (P4 held; see mods-gotchas.md "0.10.0 probes").

- **A price table, `hooks/prices.ts` (pure).**
  - Base input $/MTok and output $/MTok per model family, matched on the model id from `TurnUsage.model` or `$.session.model()`.
  - Cache writes are 1.25× input for 5 minutes and 2× for an hour. **Reads are not 0.1× everywhere** (0.025× Fable 5.1 and Mythos 5.1, 0.05× Opus 5.5 and Sonnet 5.5), and Haiku 5.5 costs five times as much past a 100K-token prompt. So the table holds each model's five figures.
  - Fill and check every number from the pricing page (`platform.claude.com/docs/en/about-claude/pricing.md`) at build time, and write the date checked in a comment. The `claude-api` skill's table lacks the cache columns and was wrong on one read rate.
  - An unknown model gives `null`: everything shows tokens only, never a guessed price.
  - `export function priceOf(u: ModelUsage, model: string, ttl: Ttl): number | null`, and `export function writeRate(model: string, ttl: Ttl, promptTokens: number, learned?: Learned): number | null` in $/token. (`promptTokens` was added for Haiku 5.5's tier.)
- **The engine's own figure wins where it knows more than the table** (as built: a managed `modelPricing`, or a model the table lacks; not its list price for a model the table has, and not its guess. See the P4 bullet below for the write-rate difference and the rounding).
  - When `classic.PostModelSwitch` gives `estimated_cache_write_usd` and `context_tokens` of 20,000 or more, keep `rate = usd / context_tokens` for that model, lifetime and tier in a module variable. (Resume's `classic.SessionStart` has no lifetime field, so it waits for step 4.)
  - It reflects a managed `modelPricing` when one is set (`pricing: 'configured'`), which the table can't know.
  - Don't persist it: it's cheap to relearn, and a store write per switch isn't worth it.
- **P4 held: forks enter `cost.usd`,** and the rise was readable straight after the fork's `await` (one Haiku fork: +0.000536535, the fork's exact price). An idle beat's actual cost is the `cost.usd` delta around the fork. Use it for idle beats only: mid-turn, the turn's own requests land in the same delta. Otherwise use `priceOf` on the fork's usage. Either way, `s.lastUsd` is the last beat's cost.
  - **The two engine figures don't share a write rate.** On Haiku, `cost.usd` priced a write at 1.25× input and the resume estimate at 2×. So a beat's dollars (the `cost.usd` delta) and `recacheUsd` (from the estimate's rate) can differ on the written tokens. Decide in step 2 which `recacheUsd` follows, and say which on the page; cost-delta-only is not a fix, since it can't price a cold send ahead of time.
  - **`estimated_cache_write_usd` is rounded to 4 decimals,** so `usd / context_tokens` is coarse below ~20k tokens. Learn the rate only from a context of 20k or more, or keep the table's.
  - Checked on Haiku only, with the cache warm. Check Opus and an expired-cache fork once in step 2.
- **What gets dollars:**
  - `CacheView.recacheUsd`: `contextTokens × writeRate`, for the summary, the cold guard and `state`.
  - The beat log line: `♥ cache renewed (184,212 read, 12 written · ≈$0.02)`.
  - `state.session.lastBeatUsd`.
  - The CacheTax totals (step 7).
  - **Not the turn line:** it's already tight (decided).
- **Wording:** every figure is `≈$0.69`, and the first use on a page says "at API prices".
  - **On a subscription** (`rateLimits.length > 0`), the summary and CacheTax add one dim line: "Your plan doesn't bill per token: these are what the same requests cost on the API, to compare." (Decided.)

**Tests:**
- `priceOf` and `writeRate` for a known model at both TTLs, and `null` for an unknown one.
- A `PostModelSwitch` with `estimated_cache_write_usd` overrides the table's rate for that model, when its `pricing` is `configured` or the table lacks the model (not `catalog` for a model it has, not `default`, not under 20,000 tokens).
- The beat log line carries `≈$`.
- `state.cache.recacheUsd` is null for an unknown model.

**README:** a short paragraph under "What it sends, and what it costs" on how dollar figures are estimated: API list prices, or your organization's configured pricing when Claude Code reports it, and notional on a subscription.

### Item 3: `/cachebeat <time>` keeps the cache warm for that long (step 3)

**Current behavior:**
- `/cachebeat 30` sets a session interval (`s.idle`, register.tsx:827–831) and turns beating on.
- The same shape appears in the tool's `session.intervalMinutes` (tools.ts:108–111, parse :145–148, "turns beating on" :178).
- It also appears in the pane's `· this session` marker on **Beat after idle** (pane.tsx:210–229, `dropSession` register.tsx:1123).
- claude-tools.md records the decision "A session interval turns beating on". This step reverses it; record that there.

**The design** (decided with the user; see "Decisions"):

- **`/cachebeat <duration>`:** on for this session, keeping the cache warm until `now + duration`. Then cachebeat turns itself off for the session: "kept warm for 2h, as asked".
  - The time counts from the command, a fixed deadline. Messages in between don't extend it.
  - **Grammar:** `30m`, `2h`, `1h30m`, `1.5h`, `90min`. A unit is required. Add `parseDuration` in `settings.ts` alongside the other readers. It returns minutes in 5–2880 (48h, the same cap as Stop after idle's custom value).
  - **A bare number** (`/cachebeat 30`) changes nothing and answers: `/cachebeat 30m keeps the cache warm for 30 minutes. The beat interval is in /cachebeat settings, or /cachebeat global 30.` Existing users typed it for the old meaning, and a silent new meaning would be wrong for them.
- **`s.keepUntil: number | null`** (wall ms) replaces `s.idle` in `Saved` (types/index.d.ts:6).
  - `/cachebeat on` clears it (on, no limit). `off` clears it. A new duration replaces it.
  - On reload, `session.start` builds `s` from `{ ...fresh, ...prev }` (register.tsx:771). Drop a leftover `idle` key there: `delete (s as Record<string, unknown>).idle` won't pass review. Instead, pick `Saved`'s keys from `prev` explicitly.
- **The interval is the setting's alone.**
  - `idle()` (:69) loses `s.idle`.
  - `intervalFrom` (:570) loses `'session'`.
  - `changeSettings` loses the session-interval drop (:168).
  - `minutesOf` (:590) stays for `global`/`local <minutes>`.
  - `turnOn` (:597) loses its interval branch, and the pane loses `sessionMinutes`, `sessionNow` and `dropSession`.
- **Scheduling, in `schedule()`:**
  - Don't arm a beat that isn't needed. Skip it when `s.keepUntil !== null && s.lastWarm + TTL_MS[ttl] >= s.keepUntil`: the cache outlives the deadline without it.
  - Arm a step timer to `keepUntil`, and run `stop($, 'kept warm for 2h, as asked')` when it's reached. Write that as a branch of `wallCheck` so there's one timer.
  - While a turn runs at the deadline, stop at the turn's end.
- **Stop after idle** doesn't apply while `keepUntil` is set. The duration is what the user asked for, up to 48h. **Stop at usage** and API errors still stop it.
  - Row help (settings.ts:288) becomes: `Beating stops after this long without a message from you. A session given its own time (/cachebeat 2h) keeps to that instead.`
  - The tool's `ABOUT.stopAfterHours` (tools.ts:14) says the same.
- **What it shows:**
  - The turn line: `♥ cache kept warm ×3 · 184k cached · next in 42m · 1h 52m left`. That's `statusText` in pane.tsx:70, which gets a `left` argument shown when set.
  - Bare `/cachebeat`: `on, every 50m idle · 1h 52m left · 3 beats · next beat in 42m`.
  - The pane's **This session** row: `on · 1h 52m left`, and `r` drops the limit.
  - Answers: `this session: on until 4:30 PM (2h), every 50m idle · next beat in 49m`. Time of day through `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`. **Check** that the sandbox has `Intl`; if not, use the relative `2h` alone.
- **`global` / `local <minutes>`** keep setting **Beat after idle**, unchanged (register.tsx:628–655).
- **The tool:**
  - `session.intervalMinutes` becomes `session.keepAliveMinutes` (5–2880, or null to clear). Setting it turns beating on, unless `enabled: false` comes with it.
  - `state.session` gains `keepAliveUntil` (ISO string or null) and `keepAliveMinutesLeft`. `intervalFrom` loses `session`.
  - `summary()` (tools.ts:193) says `this session on for 2h`.
  - Update `McpToolInputs` (types/index.d.ts:81).
  - Rewrite the description's interval sentences (tools.ts:102, :110).

**Everything this step touches,** so nothing is missed:
- register.tsx: `idle`, `turnOn`, `intervalFrom`, `stateOf`, `answerSet`, `changeSettings`, `anotherConversation` (:583 keeps `idle`; keep `keepUntil` instead), `minutesOf`, `USAGE` (:760), `argumentHint` (:779), `command.run` (:827–832), the pane's `dropSession` and `View.sessionMinutes`
- pane.tsx: :32, :210–229, :252
- tools.ts: :102, :108–111, :145–148, :178, :196
- types/index.d.ts: `Saved.idle`, `McpToolInputs`
- README: Features bullet "turn it on, change the interval" (:25), Quick start (:91), the Commands table (:117), "Where settings apply" (:157, :161), Settings bullet **r** (:146)
- notes/claude-tools.md: the reversed decision, with the reason ("the user found a session interval unintuitive; the interval is a setting")

**Tests** (replace the session-interval tests, which `grep -n "cmd(\$, '[0-9]" hooks/cachebeat.test.tsx` finds):
- `/cachebeat 2h` turns on and says `until`.
- No beat is armed once `lastWarm + TTL >= keepUntil`.
- It turns off at the deadline with the message.
- Stop after idle is ignored while a keep-alive is set, and applies again after `/cachebeat on`.
- `/cachebeat 30` refuses with the hint, and nothing changes.
- `/cachebeat 1m` and `/cachebeat 72h` refuse with the range.
- `set` with `keepAliveMinutes` turns on, and `null` clears it.
- An old `saved` with `idle` reloads without error, and the interval follows the settings.
- `global 30` still sets **Beat after idle**.

### Item 2: resume (step 4)

**Current behavior:**
- `--resume` / `--continue`: `session.start` finds `read($, saved)` null, starts from `cfg.defaultOn`, and pauses with `RESUMED` (register.tsx:769–775). So a session that was on comes back off unless **New sessions start** is on: "doesn't start at all". If it comes back on, it waits for the next turn.
- `/resume`: `session.end` (reason `resume`) calls `anotherConversation` and pauses (:798–805). It keeps the *previous* conversation's on/off and interval, not the resumed one's. The line is logged from `classic.SessionStart`, 1s later (:807–814).

**What can't change:** `$.model.fork` has nothing to send until the resumed conversation's next turn (`nothing-to-fork`, mods-gotchas.md). No beat can run before the user's next message. "Resume cachebeat's behavior" therefore means:

1. **Restore this conversation's own state:** on or off, the keep-alive deadline, and the beat count. The state comes from the session that last held the conversation, not from the defaults or the conversation left behind.
2. **Seed the cache state** from the engine's resume hint, so the summary, the turn line and the cold guard are right before the first message.
3. **Beat after the first turn with no extra pause.** That's already true: the pause ends at the next turn.
4. **Say so,** in place of today's line:
   - warm: `♡ cachebeat resumes after your next message · cache likely warm for 18m more`
   - cold: `♡ cachebeat resumes after your next message · cache cold for 3h`
   - off: no line

**The store record** (one key per session, so open sessions never overwrite each other):
- `$.store` key `` `session:${id}` ``, value `{ v: 1, at, enabled, keepUntil, beats, guard }` (`guard` from step 5 on: the session's cold guard override). `at` is the wall time of the last write.
- Write it in `save()` only when `enabled`, `keepUntil` or `beats` changed since the last write. Track what was last written in a module variable. Step 5 adds `guard` to what's tracked.
- **Never write in `session.end`.** Exits run under a 1.5s bound for the whole chain (`index.d.ts:11045`).
- **Prune** at `session.start`: `$.store.keys()`, drop `session:*` older than 30 days.
- **Risk:** a computed key in a `$` call's argument hasn't been through the directory scan. A template literal isn't a cast, so it should pass. Validate the step's branch in the portal (`404Mayank/cachebeat@<branch>`) before building on it. If it's flagged, fall back to one `sessions` key read fresh before each write, as `saveOwn` does (register.tsx:139), and accept the rare lost update.

**The flow:**
- **`classic.SessionStart`, `source: 'resume'`:**
  - Stash `{ id: e.session_id, secondsSince, likelyExpired, contextTokens, usd }` in a module variable `resumeHint`.
  - Its fields are optional in the types, and may be absent on 2.1.287 (P8). Absent fields mean the cache state stays `unknown`, and the guard doesn't hold.
- **`--resume` / `--continue`, at `session.start` with messages present:**
  1. Read `` `session:${await $.session.id()}` ``. If there's a record, `s = { ...fresh, enabled, keepUntil, beats }`. Otherwise keep today's `cfg.defaultOn`.
  2. Apply `resumeHint` if its id matches. **P3: the order isn't guaranteed.** On `--resume` and `--continue`, `classic.SessionStart` and `session.start` run concurrently (`session.start` entered first by 1ms in the deciding run, with the other hook slow). So both hooks do the same: `classic.SessionStart` stashes the hint, and calls `seedFromResume` if `session.start` has already finished its restore; `session.start` restores, and applies the hint if it is already stashed. Use one module flag for "restored" and another for "hint stashed", both set synchronously, and guard the apply against running twice. `$.session.id()` equals `e.session_id` here (P2).
  3. Then `pause($, RESUMED, …)` as now.
  - A keep-alive whose deadline has passed comes back off.
- **`/resume`:** the same, from the `classic.SessionStart` hook, which runs after `anotherConversation`. **Use `e.session_id`:** P2 found that `$.session.id()` inside that hook is still the id of the conversation *left behind* (it is the resumed id by the next prompt). Don't use `$.session.id()` for the record key there.
- **Seeding:** `s.lastWarm = now − secondsSince × 1000` sets `source: 'resume'`. Take `now` when the hook's event arrived, not when the apply runs, if the two can differ. `seconds_since_last_response` counts from the last main-thread response, not from a fork (P3, inferred from one case), which matches what `lastWarm` should be after a restart. Use `estimated_cache_write_usd / context_tokens` as the session's write rate (step 2's override), mind its 4-decimal rounding, and leave `prompt_cache_likely_expired` to the TTL comparison cachebeat already makes (the `true` case wasn't seen).
- **The `RESUMED` constant's comment** (:383) and the README stay true: no beat re-reads the conversation before the user's next message. The uncached hint is untouched.

**Function names** handed `$`, each new in the file: `restoreConversation($, id)`, `seedFromResume($, hint)`.

**Tests:**
- **The kit has no process restart.** Simulate one: start with `World.chat` non-empty (as the existing test at :1565 does) and a store holding `session:<id>`. Stub `session.id` in `setup()` (`on('session.id', () => ({ value: id }) as never)`; it's not stubbed today).
- **Tests to add:**
  - On with a 2h keep-alive, then resumed: comes back on with the same deadline, paused until the next turn, then beats.
  - Resumed with no record: follows **New sessions start**.
  - Resumed with an expired keep-alive: off.
  - `/resume` to a conversation that was off, from one that was on: off, with no line.
  - The resume hint seeds `state.cache`: `cold` when `secondsSince` is past the TTL, `warm` with minutes left otherwise.
  - Store pruning drops a 31-day-old record and keeps a fresh one.
  - Two sessions' records don't overwrite each other.
- **Test both orders** (hint first, restore first) on `--resume`: the kit runs hooks one at a time, so make one `await` something the test holds open, as `holdNow` does for the clock.
- **Raising the resume hook in a test:** `$.classic.SessionStart({ source: 'resume', session_id: 's1', seconds_since_last_response: 7200, … } as never)`. The cast is in the test, not in a `$` call of the plugin, so it's fine.

**README:**
- Rewrite the "A resumed conversation…" bullet (README:261): `A resumed conversation (claude --resume, --continue, or /resume) picks up as you left it: on or off, and any time you gave it. Beats start after your next message, since nothing of it is cached in this session yet, and the turn line says whether the cache is likely still warm.`
- Privacy: settings and **each session's on/off, time left and beat count, by session id, for 30 days**.
- Close the "Still open" `--resume` item in plan-0.8.0.md, with what P2 found: the id is the same after `--resume` and `--continue`.

### Item 4: the cold guard (step 5)

**The design** (decided with the user; see "Decisions"):

- **Three new settings** in `BeatSettings` and `DEFAULTS`, on the **Limits** tab after **Cache gone cold**. They work for all folders and this folder through the existing scopes. The tool schema comes from the rows, and `ABOUT` needs an entry for each (`tsc` refuses a missing one).

  ```ts
  { key: 'coldGuard', label: 'Cold guard', values: [true, false], fmt: onOff,
    help: "Holds your first message to a session whose cache has gone cold, says what sending it costs, and lets the next one through if you send again soon." },
  { key: 'coldGuardWindow', label: '  send again within', values: [2, 3, 5], show: s => s.coldGuard, fmt: v => `${v}m`,
    help: 'How long after a held message a second send goes through. After that, the next send is held again.',
    custom: { placeholder: 'e.g. 4m', parse: parseWindow } },
  { key: 'coldGuardTokens', label: '  chats from', values: [10_000, 20_000, 50_000, 100_000], show: s => s.coldGuard, fmt: v => `${tokens(Number(v))} tokens`,
    help: 'The smallest chat the guard holds a message for: a smaller one is cheap to cache again.',
    custom: { placeholder: 'e.g. 35k', parse: parseTokens } },
  ```

  - **Defaults:** `coldGuard: true`, `coldGuardWindow: 3`, and `coldGuardTokens: 20_000`, the same as `skipSmallTokens`'s default. Make the shared figure one `const SMALL_CHAT = 20_000` in settings.ts, used by both defaults.
  - **`parseWindow`** is a new reader beside the others (settings.ts:192–196): `reader('minutes', { '': 1, m: 1, min: 1 }, 1, 15, true)`.
  - **`normalize()`:** today it checks number settings only by type. Add range checks for the two numbers, through their readers, as `interval` has at :78: a stored `coldGuardWindow` of 90 falls back to 3.
- **A session override:** `s.guard: boolean | null` in `Saved` (null follows the setting), from `/cachebeat guard on|off` and the tool's `session.coldGuard` (`true`/`false`/`null`).
  - The pane's **Cold guard** row shows `on · this session` while the session overrides it, and `r` drops the override. That's the marker pattern step 3 removed from the interval, so reuse its shape.
  - `/clear` keeps it, as `anotherConversation` keeps `enabled`. A resume restores it from the session record (step 4 adds `guard` to the record).
- **The hook:** `on('prompt.submit', async ($, e, next) => …)`, with no `.catch`, so a failure lets the prompt through. It holds the prompt only when **all** of these hold:
  1. The guard applies here: `s.guard ?? cfg.coldGuard`.
  2. `e.origin.kind === 'composer'`. Not `bridge` (Remote Control: how a held message shows there is unknown), `plugin`, `sdk`, `peer` or a scheduled trigger.
  3. `e.turnId === undefined` and `!busy`. Mid-turn, the cache is being read anyway.
  4. **No check on a leading `/` or `!`** (P6): `!` commands and plugin and built-in slash commands (`/cachebeat`, `/clear`, `/resume`, `/help`) never reach `prompt.submit`. A skill or prompt-type command does, with its text as typed (`/simplify`). It sends the conversation, so it is held like plain text.
  5. `(await cacheNow($)).state === 'cold'`, written as a plain statement first. `unknown` (a new conversation, or a resume without a hint) never holds.
  6. `contextTokens >= cfg.coldGuardTokens`.
  7. The guard isn't armed: see below.
- **The arm** is two module variables: `armedFor` (the `s.lastWarm` it was armed on) and `armedUntil` (wall ms).
  - **First send:** set `armedFor = s.lastWarm` and `armedUntil = now + cfg.coldGuardWindow × MIN`, then return without `next`:

    ```
    { drop: 'cachebeat: the cache has been cold for 2h 14m, so this message caches 184k tokens again (≈$0.69 at API prices). Send again within 3m to go ahead.' }
    ```

    Leave the `(≈$…)` out while `recacheUsd` is null.
  - **A send while armed** (`armedFor === s.lastWarm && now < armedUntil`, any text) calls `next(e)` and warns with `$.ui.log('sent on a cold cache: cold for 2h 14m, 184k tokens cached again')`. **Where a log lands (P5):** a `$.ui.log` before a drop draws as a `● cachebeat: …` row just above the drop row. After `next(e)` on a mid-turn prompt, a log wasn't found on screen, so warn on a send that goes through with a toast (not tried) or try the log first in this step.
  - **A send after the window** is held again, and re-arms.
  - **A turn that warms the cache** changes `s.lastWarm`, so `armedFor` no longer matches. No timer is needed.
- **Counting** for step 7: a held send, and a cold send with its tokens and dollars.
- **The guard runs with beating off.** It's about the cache, not about beats, and `markWarm` runs either way.

**P5 found the dropped text stays in the composer** (the reason draws as a transcript row, `Prompt dropped by a hook: <reason>`, and Enter on the same text raises the event again), so drop-and-resend is the build and the variant below is **not needed**. It stays here for the case where the text were lost (decided with the user):
- Ask `Cache cold for 2h 14m: cache 184k tokens again (≈$0.69)?` with `Send` and `Don't send`.
- `Send` calls `next(e)`. Anything else, a dismissal included (it rejects: use `.catch` on the ask call, then drop), returns the drop.
- There's no arm and no window in that variant, and the window setting isn't added. Record which variant was built in the step's notes.

**Risks:**
- **The directory will likely flag a hook that refuses user prompts** (the policy-hold class of `DENIES_PERMISSION`, notes/directory.md). Put a README line under "What it sends": `With Cold guard on, cachebeat holds back your first message to a session whose cache has gone cold, says what sending it will cost, and lets it through if you send again within a few minutes.` Validate the branch in the portal before merging to `main`.
- **2.1.287:** P8.

**Function names:** `guardColdSend($, e)` for the hook body, if it's pulled out.

**Tests** (the mid-turn case is real: a composer prompt typed over a running turn arrives with `turnId` set. P7: raise it as `await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })`. The kit stamps no origin, so **every guard test passes one**: left out, `e.origin` is `undefined`, the hook is skipped, and the prompt goes through. A test that expects a send to pass would then pass for the wrong reason):
- **Holding:**
  - Cold and big: the first send is dropped, naming the age, the size and `3m`. A second within 3m goes through with the warning.
  - A second send after 3m 1s is held again, and a third within the new window goes through.
  - After a held send, a turn warms the cache, then it goes cold again: the next send holds, since the arm was tied to the old stretch.
  - Resumed with `seconds_since_last_response` past the TTL (step 4): the first message holds.
- **Not holding:**
  - Warm.
  - `unknown`.
  - Under `coldGuardTokens`.
  - `origin` `plugin`, and `bridge`.
  - Mid-turn (`turnId` set). (Live, a prompt typed mid-turn arrives with `turnId` set. No test in the kit has set it: pass it in this step's test.)
- **Scopes:**
  - Guard off for all folders, on for the session: holds. And the reverse.
  - The folder's own `coldGuardWindow` applies.
- **Settings:** `normalize` replaces an out-of-range window or token count.

**README:**
- The Limits table rows: `Cold guard | Holds your first message to a session whose cache has gone cold, and says how long it's been cold and what sending will cost. Send again within the window to go ahead. | on`, then `  send again within | … | 3 minutes`, then `  chats from | … | 20k tokens`.
- The directory line above.
- `/cachebeat guard on|off` in the Commands table.

### Item 5: bare `/cachebeat` shows a summary (step 6, provisional)

**Current behavior:** one line of text (register.tsx:834–843).

**The design:** Claude Code's `/status`, `/config`, `/usage` and `/stats` are tabs of one dialog. Mirror that: the settings pane gains two read-only tabs, **Status** and **CacheTax**, ahead of the five settings tabs.
- Bare `/cachebeat` opens it on **Status**, `/cachebeat stats` on **CacheTax**, and `/cachebeat settings` on **Beating**, as today.
- The command still answers its one line as `text`, so the transcript keeps a record, and Claude sees it in `-p`, where nothing draws.

**Status** draws from `cacheNow($)` and the session:

```
Cache        warm · read 12m ago · about 48m left (1-hour cache)          | cold for 2h 14m
Size         184k tokens · ≈$0.69 to cache again at API prices
Beating      on · every 50m idle (auto) · next in 38m · 1h 52m left
This session 3 beats · 552k read · ≈$0.17
Cold guard   on
Usage        five-hour 42% · stops at 90%
Last message 12m ago
             Warm or cold is judged by time since the cache was last read, as Claude Code judges it; each beat and turn confirms it.
```

- **Pane mechanics** (pane.tsx `settingsPane`, register.tsx :1080–1146): the read-only tabs have no rows, so going into one is a no-op, and the focus ring stays on the tab bar.
  - The 1–5 hotkeys become 1–7.
  - `firstOf` (:751) gets a case for tabs with no rows.
  - `TABS` stays settings-only. Add the two tabs in the pane's own list, so `rowOf`, `accept` and the tool schema never see them.
- **Desktop:** the same pane draws there, as the settings menu does.
- **Refresh:** the pane's `tickAtom` already redraws on each step timer (step 1). No new clock.

**Tests:**
- Bare `/cachebeat` opens the pane on Status (assert `ui.open` was called, and `pageAtom.tab === 'status'`) and still answers the line.
- Status shows `cold for` after a skewed sleep.
- `/cachebeat settings` still opens on Beating.
- The tab hotkeys reach all seven.

**README:** the Commands table: `/cachebeat` opens the status page, `/cachebeat stats` opens CacheTax. A short "Status" paragraph under "What you'll see".

### Item 7: CacheTax (step 7, provisional)

**What's counted.** These are per session, in the same `session:${id}` record as step 4, so concurrent sessions never collide:

```ts
stats: {
  days: { [yyyy-mm-dd]: {
    beats: number; read: number; wrote: number; usd: number // what beats cost
    kept: number; keptUsd: number   // turns that came back to a cache a beat kept warm, and the re-cache they avoided
    cold: number; coldTokens: number; coldUsd: number // turns sent on a cold cache, and what re-caching cost
    held: number                    // sends the cold guard held
  } }
}
```

- **"Saved" is counted when it happens:**
  - A turn after an idle stretch with at least one beat whose first `turn.step` reads the cache (`got + MISSED >= cached`) adds `kept += 1` and `keptUsd += (cached × (writeRate − readRate))`.
  - **Net = `keptUsd − usd`,** and it can be negative. That's the honest number, and why the page is called CacheTax.
- **A cold send** is a turn whose first step wrote more than it read after more than a TTL idle.
- **Writes:** the record is written at most once per beat or turn end, through the same changed-only write as step 4. Retention is the same 30 days, by the record's `at`.
- **The page** (the CacheTax tab) aggregates with `$.store.keys()` and reads every `session:*`. That's a few hundred small JSON values at most. It shows today, 7 days and 30 days, and this session:

```
                Today    7 days   30 days
Beats             12       84       311
Beat cost       ≈$0.21   ≈$1.40   ≈$5.02
Kept warm          4       29       102     turns that came back to a warm cache
Re-cache avoided ≈$2.80  ≈$19.10  ≈$66.40
Net             ≈+$2.59  ≈+$17.70 ≈+$61.38
Cold sends         1        6        20     ≈$0.69 · ≈$4.20 · ≈$13.80 paid to cache again
Held by guard      1        4        11
```

  A daily bar row (like `/stats`' activity row) is a later choice, once the screenshots are back.
- **Function names:** `countBeat($, …)`, `countTurn($, …)`, `taxPage($)`.

**Tests:**
- A beat adds to today's `beats` and `usd`.
- A turn after a kept stretch adds `kept`.
- A cold turn adds `cold`.
- A held send adds `held`.
- Two sessions' records add up on the page.
- A record older than 30 days is pruned, and isn't counted.
- The page renders with no records (all zeros, no `NaN`).

**README:** the Privacy section gains "and, for each session, counts of beats, tokens, estimated dollars and cold sends by day, kept on your machine for 30 days to show on the CacheTax page. Nothing of it is sent anywhere." A short CacheTax paragraph under "What you'll see".

### Item 8: the demo GIF (step 8)

Rerecord `assets/demo.tape` with `demo.py` once steps 1–7 have merged and the look is settled. It shows `/cachebeat 2h`, the Status tab, a beat landing, and the cold guard's held send. The recording steps are in the scripts. Only `assets/demo.gif` ships.

### Item 9: a command typed mid-turn says nothing until the turn ends (step 3b)

**What the user sees:** `/cachebeat on` (or any other `/cachebeat` command) typed while a turn runs gives no sign it was taken.
- It doesn't show as a queued message, and the heart doesn't appear.
- Once the turn ends, the typed command and cachebeat's reply appear in the transcript.
- So it reads as taking effect only on the next turn.

**What the code says:**
- The command is registered with `immediate: true` (`hooks/register.tsx`, `$.command.register` in `session.start`). The types say it then runs at once mid-turn, and "its `{ text }` prints as an idle run's does" (`.claude-plugin/types/claude-code/index.d.ts`, `immediate`).
- `schedule()` hides the heart while a turn runs (`if (busy) p = 'hidden'`), by design.
- **Inferred, not checked:** the state changes at once, and both visible signals wait. The reply is drawn after the turn, and the heart is hidden while it runs.

**The probe (live, first):** type `/cachebeat on` mid-turn, then check:
- Does `command.run` fire before the turn ends? Check the debug log.
- When is its reply text drawn?
- Does a `$.ui.toast`, or a `$.ui.log`, made from `command.run` mid-turn show at once? (P5 found a `$.ui.log` in a pass-through `prompt.submit` didn't show reliably.)
- Does the turn line or the band redraw?

**Options, to weigh once the probe answers:**
- An acknowledgement mid-turn, as a toast or a log line, whichever the probe shows drawn at once.
- A heart in its own "on, starts after this turn" state while a turn runs, instead of hidden.
- Whether `immediate` is honoured at all. If not, decide whether to keep it.

**Decided (the user, 2026-11-09): the prompt heart is never hidden while a turn runs.** Whenever cachebeat is on for the session, the heart marks it, mid-turn included. Off, it stays hidden as now.
- In `schedule()` (`hooks/register.tsx`), `'hidden'` stops being a visibility rule for a turn. That covers `if (busy) p = 'hidden'` after the timer is armed, and the `stepping`, `resent` and first-turn (`busy && s.turns === 0`) cases. `!s.enabled` keeps `'hidden'`.
- **A second hiding, independent of the pulse:** the `PromptHint` render returns the engine's row untouched when `e.props.isWorking`. That check goes too, or the heart stays hidden mid-turn whatever the pulse says.
- **Check in the probe:** whether the engine draws the `PromptHint` row at all while working, and with which props. If it doesn't, the decision needs another place to draw the heart (ask before choosing one).

**Decided (the user, 2026-11-09): during a turn the heart follows the beat state,** as it does between turns: "it beats while a beat is scheduled, and holds still while it waits."
- **Holds still** (`'waiting'`, drawn dim) while a request of the turn is on its way (`stepping`), and while beats wait for the turn's end (`resent`, the conversation's first turn).
- **Beats** (`'armed'`) while a mid-turn countdown runs: a turn gone quiet on a long tool run or a permission prompt.
- Not chosen: holding the heart still for the whole turn. It's simpler, but a mid-turn beat would then land from a heart that isn't beating.

**The turn line and the desktop band have hidings of their own. Decided (the user, 2026-11-09):**
- **The band (desktop) keeps the cachebeat line through a turn.** It's the marker there, since the desktop draws no prompt heart (README). Remove the `e.props.isWorking` skip in the `AbovePrompt` render. The line's heart follows the pulse, as the prompt heart does.
- **The turn line (terminal) stays as it is.** `turn.start` sets `s.row = null`, so the line moves to the new turn when it ends, and a beat mid-turn shows as a log line (README, "The turn line").

**Tests change:**
- New: on, mid-turn (`turn.start`, then `draw($, { ...HINT, props: { ...HINT.props, isWorking: true } })`), the tail carries the heart. With a request on its way it's still (`BEAT[0]`). A turn gone quiet, with its countdown armed, beats (a `BEAT` frame).
- New: off, mid-turn, no heart (the tail is undefined).
- New: on the desktop, mid-turn (`AbovePrompt` with `isWorking: true`), the band still carries the line.
- Existing: no current test pins the heart hidden while busy. `HINT` has `isWorking: false`, and the hint tests draw between turns. They should pass unchanged. Re-run them to check.

**README changes:**
- What you'll see, the paragraph starting "**The prompt heart** sits at the end of the hint line": "It beats while a beat is scheduled, bursts when one lands, and holds still while it waits for your next message." It gains "or while a request of your turn is on its way", and says the heart shows during a turn too.
- The setup line "The prompt heart appears under the prompt, and starts beating once the session has had a turn" still holds.

**Tests:** the command run mid-turn changes the state at once and gives the chosen acknowledgement. An idle run is unchanged.

## Steps, in order

Each step is finished, tested and merged into `dev` before the next starts.

**For every step, these bite:**

- **On 2.1.287, a function handed `$` must have a name used nowhere else in the file,** not even as a local `const`. The loader refuses the whole module. Grep for each new name.
- **Don't pass a `$` call a constant whose value is a cast.** Write the request in the call: `$.ui.open({ id: …, … })`, never `$.ui.open(OPEN)` with `OPEN = {…} as const`.
- **Matchers are literals:** `on('tool.call', { tool: 'mcp__cachebeat__set' }, …)`, never a constant.
- **`$` calls are plain statements:** no parentheses, `??`, `!` or casts around them. `const x = await $.store.get('k')`, then use `x`.
- **Run the checks, and fail on the summary:**

  ```sh
  out=$(claude plugin test . 2>&1); echo "$out" | tail -5; grep -q "^ 0 fail" <<<"$out"
  npx -p typescript tsc -p .
  ```

  `claude plugin validate --strict .` only on a release branch (it flags `CLAUDE.md` on `dev`).
- **Tool text is fixed for the session.** To see a changed description, start a new session.
- **Store writes read the store fresh first** (`changeSettings`, `saveOwn`).
- **Plugin files and notes go in separate commits.** Record what took time in `notes/mods-gotchas.md` as you go.
- **Each step keeps CI's 2.1.287 leg green.** A new API that fails there either moves the floor (README badge :12, which CI's matrix reads, and Requirements :31) or gets dropped. Ask the user before moving the floor.

### Step 0: the live checks (P1–P8)

- **Delivers:** a notes section, "0.10.0 probes", in `notes/mods-gotchas.md` with each answer, and this plan updated where an answer changes a design.
- **Depends on:** nothing.
- **Bundles:** checks only, no shipped code.
- **How:** a scratch probe mod outside the repo (`claude --plugin-dir <probe>`), driven in tmux as mods-gotchas.md "/rewind" describes. P1 needs the user to suspend the machine.
- **Why first:** P5 can change the cold guard's whole shape, P2 and P3 the resume design, and P4 the dollar source.
- **Status:** P2–P7 done 2026-11-09. None changed the shape of a design (P5 kept drop-and-resend, P4 kept the `cost.usd` delta, P3 kept the plan's two-order resume), but each changed a detail: see items 2, 4 and 6. P1 and P8 are pending.

### Step 1: cache state and the sleep fix, released as 0.9.2 (shared piece, item 1)

- **The brief:** "Item 1 and the shared cache state" above, whole: 1a–1d, the tests, the README, the notes, and the release.
- **Delivers:**
  - `hooks/cache.ts`, `cacheNow($)` and `state.cache`
  - step timers (`armStep`, `wallCheck`), the RETRY path included
  - the cold check and the `onCold` setting (row, `normalize`, `ABOUT`)
  - the cold turn line
  - `untilNext` at all four display sites
  - README and notes
  - release 0.9.2
- **Depends on:** nothing. It doesn't wait for step 0: P1 only explains the bug, and the design is right whether it holds or not.
- **Bundles:** the shared piece with item 1, since the fix needs "cold" and the shared piece needs a consumer to test against.

### Step 2: dollars (item 6)

- **Delivers:** `hooks/prices.ts`, the rate override from engine estimates, `recacheUsd`, the `≈$` beat log, `state.session.lastBeatUsd`, and the README cost paragraph.
- **Built 2026-11-09** on `step2-dollars`; what came out differently, and why, is in mods-gotchas.md, "Dollars (built in step 2 of 0.10.0)".
- **Depends on:** step 1 (`CacheView`). P4 is answered (see item 6).
- **Bundles:** item 6 alone.

### Step 2b: `tsc` on the newer generated types (a fix, before step 3)

- **The failure:** on the types Claude Code 2.1.319 generates, `npx -p typescript tsc -p .` fails in the settings pane's render (`hooks/register.tsx`, `if (!('Input' in els)) return <els.Text>…`): "Property 'Text' does not exist on type 'never'".
- **Why:** the newer `Elements` is an interface whose four surfaces (terminal, desktop, mobile, vscode) all carry `Input`; in the older types `mobile` has none. So `!('Input' in els)` narrows `els` to `never`. The check still matters at run time: the types say a surface unknown at compile time can attach its own table.
- **Not caught:** on the older types `dev`'s checkout had, `tsc` is clean, and CI doesn't run `tsc`. The types regenerate whenever a session loads the plugin from a checkout, so the next live run on `dev` breaks `tsc` there.
- **The fix (checked against both type sets in a scratch copy: `tsc` clean on each):** take `Text` before the check, so the narrowing can't reach it:

  ```tsx
  const { Text } = els // every surface has it: taken before the check, which may narrow `els` to never
  if (!('Input' in els)) return <Text>Open cachebeat's settings in the terminal.</Text>
  ```

- **Then:** run the step checks.
- **CI type-checks on both legs, the floor and latest (the user, 2026-11-09, reversing the earlier latest-only decision).** The `Type-check` step in `.github/workflows/ci.yml` runs on every leg, and the floor comes from the README badge, so code using an API newer than the floor fails CI. It was clean against 2.1.287's declarations locally. How it gets the types without a key is in mods-gotchas.md, "Types". It ships to `main` with the next release branch.
- **Bundles:** this fix, plus its mods-gotchas line ("Types").

### Step 3: the keep-alive time (item 3, with Stop after idle's text)

- **Delivers:** everything in item 3's touch list.
- **Built 2026-11-09** on `step3-keepalive`; what came out differently, and why, is in mods-gotchas.md, "Keep-alive time (built in step 3 of 0.10.0)".
- **Depends on:** step 1 (`wallCheck` carries the deadline).
- **Bundles:** item 3 with the **Stop after idle** wording, since they define each other.
- **Riskiest step for regressions:** it removes the session interval across four files.

### Step 3b: a command typed mid-turn answers at once (item 9)

- **Delivers:** the probe's answers in `notes/mods-gotchas.md`, the heart shown mid-turn whenever cachebeat is on, following the beat state (decided), then the chosen acknowledgement, with tests and the README line.
- **Also delivers:** the desktop band's line kept through a turn (decided). The terminal turn line is unchanged.
- **Depends on:** step 3, which settles the command's words.
- **Bundles:** item 9 alone. It's small, and it doesn't wait on later steps.

### Step 4: resume (item 2)

- **Delivers:** per-session store records, restore, seeding from the resume hint, the new resume line, README and Privacy.
- **Depends on:** step 3 (`keepUntil`), step 1 (cache state), P8 (P2 and P3 are answered), and the portal check on computed store keys.

### Step 5: the cold guard (item 4)

- **Delivers:** the `coldGuard`, `coldGuardWindow` and `coldGuardTokens` settings, the session override, the `prompt.submit` hook, the arm and its window, the warning, the tool fields, and the README rows and directory line.
- **Depends on:** step 1 (state), step 2 (the `≈$` in the message), step 4 (a resumed session's first message is the case that matters most), and P8 (P5–P7 are answered).

### Step 6: the Status page (item 5, provisional)

- **Delivers:** the pane's Status tab, and bare `/cachebeat` opening it.
- **Depends on:** steps 1–5 (everything it shows) and the screenshots.

### Step 7: CacheTax (item 7, provisional)

- **Delivers:** the counters in the session record, the CacheTax tab, `/cachebeat stats`, and README and Privacy.
- **Depends on:** step 2 (dollars), step 4 (the record), step 5 (held and cold sends), step 6 (the tabbed pane), and the screenshots.
- **Bundles:** collection with display, since neither is testable without the other.

### Step 8: the demo GIF (item 8)

- **Depends on:** steps 1–7.
- **`assets/demo.tape:31` types `/cachebeat 5`,** which step 3 refuses (a bare number needs a unit). The tape needs `/cachebeat global 5`, or whatever shows that interval now.

### Step 9: release 0.10.0

- **First, a sweep of the whole release.** Each step updated its own pieces; this cross-checks them together. Everything 0.10.0 adds must reach:
  - the agent's tools (`hooks/tools.ts`, `mcp__cachebeat__state` and `set`): every new setting settable through `set`, every new `state` field in the output and described, the schema and descriptions agreeing with the code
  - the README: Commands, the Settings tables, What it sends, Privacy, Good to know
  - the notes
  - and no stale wording anywhere: "expired" (it's "cold"), the per-session interval, `/cachebeat <minutes>`
  - `tsc` clean on the types the newest Claude Code generates, not only on the checkout's (see step 2b)
- **What it is:** bump `version`, do a full README pass (Features list, Commands table, Privacy), validate the release branch in the portal (the cold guard and computed store keys are new to the scan), PR, and release notes.
- **Release notes** call out:
  - the reversed `/cachebeat <minutes>` (with "use `/cachebeat global 30` or the menu for the interval")
  - the cold guard, on by default, and how to turn it off
  - that resumed sessions now keep on/off
- **Process:** notes/README.md, "Releasing, step by step".

## Alternatives considered

- **Sleep: detect a wake by comparing `performance.now()` (monotonic) with `$.clock.now()`,** and name it ("the computer slept"). It's more precise in wording, but `performance` isn't a `$` call, so the test kit can't fake it. Step timers fix the behavior without knowing why the time jumped.
- **Sleep: re-check from `refreshLine`.** It runs only while an animation ticks, and calling `schedule()` from it recurses through `refreshLine`.
- **A moving "cold for 2h 14m" in the turn line.** Nothing redraws the line while beats wait, so it would need a timer of its own for a cosmetic age. Status shows it live instead.
- **Dollars: `cost.usd` deltas only.** They can't price "re-cache avoided" or a cold send ahead of time, and a mid-turn beat's delta includes the turn. They're kept as the idle-beat source if P4 holds.
- **Keep-alive counted from the last message** (a per-session Stop after idle) instead of a fixed deadline. "1h 52m left" would reset on every message, and "keep alive for 2h, then go" reads as a deadline. The user chose the deadline.
- **A cold guard second send allowed at any time until the cache is warm again** (the first proposal). The user chose a window: a send long after the warning is as unconsidered as the first.
- **The cold guard as a confirm dialog (`$.ui.ask`).** It's kinder if dropped text is lost (P5), but it's not what the user asked for. It's the fallback.
- **One shared `sessions` or `stats` store key.** Open sessions writing it lose each other's updates, even reading fresh first. It's the fallback only if the portal flags computed keys.
- **Separate panes for Status and CacheTax.** They would duplicate the pane's focus, desktop and Esc handling, which took 0.7.x to get right.
- **"Expired" for the cold state.** "Cold" is shorter, pairs with "warm", and names the guard. The user chose "cold" for all visible text.

## Decisions

The user's answers to the questions this plan first asked, 2026-11-09:

- **A cache gone cold waits by default.** **Cache gone cold** (`onCold`: start on your next message, or stop) chooses. One rule covers sleep, retries past the cache's lifetime, and `/cachebeat now` on a cold cache. It ships in 0.9.2.
- **"Cold" in all visible text,** never "expired".
- **`/cachebeat 2h` is a fixed deadline:**
  - it beats until 2h after the command, then turns this session off
  - Stop after idle doesn't apply meanwhile
  - a unit is required, 5m–48h; a bare `/cachebeat 30` changes nothing and explains why
  - the per-session interval is removed everywhere
  - `global` / `local <minutes>` keep setting **Beat after idle**
- **The cold guard:**
  - It's on by default.
  - Cold means the time since the last cache read is past the cache's lifetime (1h or 5m, as cachebeat reads it).
  - A second send goes through only within **send again within** (default 3m, a setting; the user put it at 2–5 minutes). After it, the next send is held again. **Recommended, not confirmed:** the custom value's range of 1–15 minutes.
  - **chats from** (default 20k tokens, the same as Skip small chats) is the smallest chat it holds for.
  - Remote Control messages aren't held. **Recommended, not confirmed:** the user's answer didn't cover it.
  - If P5 shows a held message's text is lost, it asks in a Send / Don't send dialog instead.
- **Warm status:** nothing live exists to read. The plan says "likely warm" and shows the time left.
- **Dollars:**
  - `≈$` at API prices everywhere, with one dim line on Status and CacheTax on a subscription
  - none in the turn line
- **CacheTax:** a tab beside Status in the `/cachebeat` page, opened by `/cachebeat stats`, kept 30 days.
- **Step 1 ships early,** as 0.9.3 (0.9.2 was taken).

## From cache-tax

[karanb192/cache-tax](https://github.com/karanb192/cache-tax) (MIT, 2.4.2, read 2026-11-14) is the mod the CacheTax page is named after. It warms on a window you arm (`/keepwarm 90m`, 50-minute pings) and asks before a cold send. Proposed to the user, none decided yet:

- **Ask, don't drop.** Its guard opens `$.ui.ask` with `Send anyway ($4.01)` and `Don't send`, and falls back to drop-once-then-resend only when the question is dismissed or nobody can answer (`-p`). One keypress instead of a resend, and no window setting. Item 4 kept this as the unused variant because P5 found the dropped text stays in the composer. It may also be the answer for Remote Control, if a remote client can answer an ask.
- **Who gets guarded.** It holds every origin a person may have sent (`bridge`, `sdk`, `channel`, `slack-ping`, `unclassified`) and lets through, with the price logged, the ones nobody could resend: `task-notification`, `scheduled-trigger`, `peer`, `peer-send-message`, `projects-relay`, `coordinator`, `observer`, `observer-activity`. Item 4 holds `composer` only.
- **A dollar floor** (`guard refuse 5`): hold only when the re-cache costs $5 or more. Ours is a token floor (`coldGuardTokens`). Dollars track what the user cares about across models, but need a price row.
- **The message compares:** "re-writes up to 200,502 tokens = $4.01 (a warm turn would have cost $0.05)". "Up to", because after a resume the engine's context figure includes the last response's output.
- **A resend from a new process goes through:** after a hold it stores the last response's time under the session id, so `claude -p` (one process per turn) isn't held forever.
- **`guard test`:** asks once on the next prompt as if the cache were cold, so a user can see the guard without waiting an hour.
- **A break-even figure** on its card: how many pings one re-cache pays for (80 on Fable 5.1). A natural line for our CacheTax page.
- **Both installed:** it checks `$.command.list` at session start for its hook version and says so once. We should check for `keepwarm`/`cache-tax` the same way: with both mods on, a session gets two sets of beats and two guards.
- **Team and Enterprise:** a managed plugin seated above a mod swallows the classic events and compaction. It falls back to `session.end` for `/clear` and to a message-count drop for compaction. Worth a check of what cachebeat relies on.
- **`$.cacheTax.status()`** for other mods' status bands. We could offer `$.cachebeat.state()`.
- **README sections:** "What it can reach" (the hooks and `$` calls, from the validator's scan) and "Prove it on your own session".

What cachebeat already has that it lacks: on by default with no arming, settings by folder and a pane, the heart, beats during long turns, the 5-minute cache, usage-limit stops, tools for Claude, and (planned) stats that last past the session: its cold-write tally is in memory.

## Still open

- **The plugin directory is dropped** (2026-11-14: verified organizations only). Every "validate in the portal" and "the directory will flag" line above is void: computed `$.store` keys, the cold guard's README line "for the directory", and step 9's portal check need no validation. Keep the README line about the guard anyway: it tells users what the guard does.
- **Holding a Remote Control message,** pending a live check in step 5. The user wants `bridge` prompts held like the composer's. What the docs say (the 2.1.319 declarations and code.claude.com/docs/en/plugins/mods/events, read 2026-11-14): `origin.kind === 'bridge'` is "the user's message through the Remote Control bridge (a phone or web client)"; `{ drop: reason }` is allowed for any origin and "the text is shown to the user as the reason". Nothing says where a remote client shows that reason, or whether the phone keeps the text to send again. `$.ui.ask` "rejects when dismissed, and in a `-p` run"; whether a remote client can answer one is not stated either. The check: from a phone, send to a cold session over `coldGuardTokens`, and note what the phone shows and whether a second send goes through. If the reason never reaches the phone, skip `bridge` and put a README line suggesting `/cachebeat` before sending from a remote session (check first that `/cachebeat` answers over Remote Control).

- **The screenshots** for the Status and CacheTax pages. Both designs here are provisional until they come.
- **P1 and P8,** pending: P1 needs the machine suspended, P8 needs Claude Code 2.1.287. P2–P7 are answered. Also not checked in step 0: a live `prompt_cache_likely_expired: true`, any origin but `composer`, and the desktop app.
- **The session's cost rose with nothing running.** In step 2's live check, `cost.usd` rose by +0.00202 while the session sat idle, with no beat and no turn. It's unexplained. It fell outside a beat's window, so no beat's figure took it in. A request like that landing inside the window is what the rise bound (`RISE_BOUND`) is for: on a Haiku beat (about $0.0005) the bound rejects it and the beat is priced from its usage; on an Opus beat (about $0.02) it passes as about 10% more. On a model the table lacks, the rise has no bound.
- **`beat()` needs a `beating` guard** (a later step). A manual `/cachebeat now` during a scheduled fork sends two forks: `beat()` and `beatNow` check neither `beating` nor the other. It predates step 2 (found in step 2's review); nothing fixes it yet.
