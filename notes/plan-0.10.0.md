# 0.10.0: cache state, keep-alive time, resume, cold guard, dollars, CacheTax

Status (2026-11-14): steps 0, 1, 2, 2b, 3 and 3b are built, reviewed and merged into `dev`; the tokens-only step and the request-start fix (the cache counts from when a request was sent; one beat in flight at a time) are merged too (`05294d1`). Step 3c (item 10) is designed and waits on the user's answers, and step 4 is the next to build. The plan was brought in line with the decisions of 2026-11-14 that day: items 2, 4 and 5 changed, and the open dollar question was settled the same day: dollars left everything users and Claude see (the tokens-only step, built on `step-tokens`). The mark **[$?]** stays only in items 5 and 7, for steps 6 and 7 to redo their mock-ups. Step 1 ships alone as **0.9.3** ([PR #13](https://github.com/404Mayank/cachebeat/pull/13), CI green, waiting on the live sleep check alone: the plugin directory is dropped, so nothing waits on its portal). It was planned as 0.9.2, but a cloud session had already released 0.9.2 on 2026-10-13 (the `h` rename), so read "0.9.2" below as 0.9.3. Where to start: notes/handoff.md. The user answered the plan's questions the same day ("Decisions" at the end). Items 5 and 7 (the Status and CacheTax pages) are still **provisional**, but no longer for the screenshots, which arrived ("Decided from it"): they wait on a look pass against the screenshots (item 5, "What steps 6 and 7 wait on").

**Step 0 ran 2026-11-09:** P2–P7 are answered ("0.10.0 probes" in mods-gotchas.md, which says what was observed and what's inferred). P1 and P8 are still pending.

Line numbers are `dev` at `f58a51b` (0.9.1). The mod API is `.claude-plugin/types/claude-code/index.d.ts` (written `index.d.ts:N` below).

## The problem

The user asked for eight things:

1. **Bug:** after the machine wakes from sleep, the turn line stays on "next in 1m".
2. **Resume:** after `--resume`, `--continue` or `/resume`, cachebeat either waits for the next turn or doesn't start at all.
3. **`/cachebeat <time>`** should stop setting the interval, which belongs in settings. It should set how long cachebeat keeps the cache warm, then stop. **Stop after idle**'s text must say how the two interact.
4. **Cold guard:** a message sent to a session whose cache has gone cold is held once. A second send goes through, with a warning saying how long the cache has been cold. There's a setting for this session and one for all sessions. (As first asked. Since 2026-11-14 the guard asks `Send` / `Don't send` instead: item 4.)
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
  - A hook that fails lets the prompt through (`:4093`). The guard fails open by default; keep it that way: no `.catch` on the hook. (The one `try` is around its question, where a rejection is the user dismissing it: item 4.)
- **The `$` time a hook spends doesn't count against its 10s budget** (`:5099`). So a `prompt.submit` hook may await `$.ui.ask` (`:2420`), the engine's own question dialog. That's how the cold guard asks (item 4, since 2026-11-14).
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

Built without dollars. Step 2 added `writeUsdPerToken` and `recacheUsd` to the contract below, and the tokens-only step (2026-11-14) took them out again: `contextTokens` is the re-cache figure.

One pure module, `hooks/cache.ts`, plus one reader in `register.tsx`. Everything that says "warm", "cold", "cold for 2h" or "tokens to re-cache" reads it, in this step and every later one. Nothing else works this out.

```ts
// hooks/cache.ts: no `$`, no imports but types
import type { Ttl } from '../types'

export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

export type CacheFacts = {
  lastWarm: number | null        // wall ms: the main conversation's last request or beat that read or wrote the cache (s.lastWarm)
  ttl: Ttl                       // effective: '5m' when s.isCacheShort, else the ttl cacheTtl() read
  contextTokens: number | null   // what the next request re-sends (chatSize)
}
export type CacheView = {
  state: 'warm' | 'cold' | 'unknown' // unknown: nothing cached yet in this conversation (lastWarm null)
  lastWarm: number | null
  expiresAt: number | null       // lastWarm + TTL_MS[ttl]
  coldFor: number | null         // ms since expiresAt, once now is past it; else null
  ttl: Ttl
  contextTokens: number | null
}

export function viewOf(f: CacheFacts, now: number): CacheView
```

- **Warm or cold is by time,** as Claude Code judges it: warm while `now < lastWarm + TTL_MS[ttl]`. The tool text says "likely". Each beat and turn confirms it through its usage.
- **The reader** is `async function cacheNow($: EngineInterface): Promise<CacheView>` in register.tsx. The name must be used nowhere else in the file (2.1.287's loader). It reads:
  - `const now = await $.clock.now()` and `const size = await chatSize($)` (:315), each as a plain statement
  - `s.lastWarm`, and `s.isCacheShort ? '5m' : ttl` for the TTL
- **It works with beating off.** `markWarm` (:575) runs on every turn request and at `turn.complete`, whether beating is on or not. Keep it that way: don't gate `markWarm` on `s.enabled`. The cold guard (step 5) relies on it.
- **`state` (the tool) gains `cache`,** built in `stateOf` (:658) from `cacheNow($)`:

  ```ts
  cache: { state, ttl, lastReadMinutesAgo, minutesLeft, coldForMinutes, contextTokens }
  ```

  - Minutes are whole numbers (`Math.floor`).
  - `lastReadMinutesAgo` and `minutesLeft` are null with no `lastWarm`. `minutesLeft` is null once cold, and `coldForMinutes` is null while warm.
  - Add one sentence to `STATE`'s description (tools.ts:80–90). The text is static, so it lists names, never values: "`cache` is whether this session's prompt cache is likely still warm, judged by the time since it was last read against its lifetime, as Claude Code judges it: `state` (warm, cold, or unknown before anything is cached), minutes since the last read, minutes left or minutes cold, and the conversation's size in tokens (what the next message sends, and caches again if the cache has gone cold)."

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
  - the cache is past its lifetime (`viewOf(…).state === 'cold'`) and it could have been reached in time: `isLate || idle() < TTL_MS[effective ttl]`, where `isLate` is `since > idle() + 2 * STEP` (a suspended or stalled process, or retries).
  - **As built, this is wider than first planned.** The plan counted a late beat only. The code also counts an on-time beat whenever the interval is shorter than the lifetime, since such a beat should have arrived before the cache lapsed. Only an on-time beat on an interval as long as the lifetime or longer finds the cache gone by design, and keeps the "not served" handling. It catches a 5-minute cache that a 10-minute sleep let lapse: without it, the beat writes the whole cache again, then stops as "not served".
  - **`/cachebeat now` with beating off** answers `the cache went cold (…); no beat sent`: there's nothing to pause or stop (as built).
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
- **`hooks/cache.ts` directly:** `viewOf` gives `unknown` with no `lastWarm`; `warm` with `expiresAt` 1ms ahead; `cold` with `coldFor` at the boundary; the 5-minute TTL.
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

- Bump `version` in `.claude-plugin/plugin.json` to `0.9.2`. Then follow notes/README.md, "Releasing, step by step": branch `v0.9.2` off `main`, take the plugin files from `dev`, run the three checks, PR, fast-forward. (The portal validation that stood here went with the directory, 2026-11-14.)
- **The release notes' summary:**
  - The turn line no longer sticks on "next in 1m" after your computer wakes from sleep. Beats catch up within a minute.
  - **Changed default:** a cache that goes cold before a beat reaches it (after sleep, after retries, or `/cachebeat now` on a cold cache) used to switch cachebeat off. Now beats wait and start again on your next message. Set **Cache gone cold** to stop for the old behavior.
  - Claude's `state` tool now reports whether the cache is likely still warm.

**Risk:** a 60s `$.clock.after` is one host dispatch a minute while armed. That's negligible next to the 80ms animation tickers.

### Item 6: dollars (step 2), taken out again (the tokens-only step)

Built in step 2 (2026-11-09), and removed on 2026-11-14: the user said tokens are cachebeat's currency and that dollars are either everywhere or nowhere, and the orchestrator chose nowhere. What step 2 built, and what the tokens-only step kept and removed:

- **Removed:**
  - every dollar figure users and Claude read: `≈$` in the beat log, `state.cache.recacheUsd` and `state.session.lastBeatUsd`, the dollar sentences of `STATE`'s description, and the README's dollar bullet
  - the machinery that only priced things: the session-cost rise around a fork and its bound (`RISE_BOUND`), the rates learned from `classic.PostModelSwitch`'s estimate (`learnRate`, `Learned`), `priceOf`, `writeRate`, `money()`, `CacheFacts.writeUsdPerToken`, `CacheView.recacheUsd` and `Saved.lastUsd`
  - their tests
- **Kept: the price table, as ratios.** `hooks/prices.ts` holds the same per-model rows (the pricing page, checked 2026-11-09) and answers `ratiosOf(model)`: a cache read, a five-minute write and a one-hour write against input (`{ read, write5m, write1h, isListed }`). A model the table lacks gets the common ratios (0.1, 1.25, 2) and `isListed: false`, so CacheTax can say its figure uses them. Haiku 5.5's long-prompt tier multiplies every kind, so no ratio depends on the prompt's size. Nothing in the plugin calls `ratiosOf` yet: the CacheTax page (step 7) weights tokens by it, in input-token equivalents.
- **A saved state from step 2** carries `lastUsd`. `restored()` keeps only the keys `fresh` has, so it loads and loses it; a test pins that.
- **What replaced a dollar figure:** the token count that stood beside it. `♥ cache renewed (184,212 read, 12 written)`; the `cache` paragraph of `STATE` names the conversation's size in tokens.
- **Not touched:** `estimated_cache_write_usd` and `pricing` on `classic.PostModelSwitch` are the engine's inputs, and the hook still receives them. `classic.SessionStart`'s resume estimate is still unread (item 2).

### Item 3: `/cachebeat <time>` keeps the cache warm for that long (step 3)

**Current behavior:**
- `/cachebeat 30` sets a session interval (`s.idle`, register.tsx:827–831) and turns beating on.
- The same shape appears in the tool's `session.intervalMinutes` (tools.ts:108–111, parse :145–148, "turns beating on" :178).
- It also appears in the pane's `· this session` marker on **Beat after idle** (pane.tsx:210–229, `dropSession` register.tsx:1123).
- claude-tools.md records the decision "A session interval turns beating on". This step reverses it; record that there.

**The design** (decided with the user; see "Decisions"):

- **`/cachebeat <duration>`:** on for this session, keeping the cache warm until `now + duration`. Then cachebeat turns itself off for the session. **As built,** the message gives the time of day, not the duration: `kept warm until 4:30 PM, as asked` (with the weekday when that isn't today), or `keep-alive time up (4:30 PM)` when the cache didn't last to the time (paused, cold, no turn). Storing the duration would have needed a second saved field (mods-gotchas.md, "Keep-alive time").
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
  - Arm a step timer to `keepUntil`, and stop with the message above when it's reached. Write that as a branch of `wallCheck` so there's one timer. **As built,** `schedule()` also watches the deadline while beats aren't armed (paused, skipping, covered), or it would pass unseen.
  - While a turn runs at the deadline, stop at the turn's end.
- **Stop after idle** doesn't apply while `keepUntil` is set. The duration is what the user asked for, up to 48h. **Stop at usage** and API errors still stop it.
  - Row help (settings.ts:288) becomes: `Beating stops after this long without a message from you. A session given its own time (/cachebeat 2h) keeps to that instead.`
  - The tool's `ABOUT.stopAfterHours` (tools.ts:14) says the same.
- **What it shows:**
  - The turn line: `♥ cache kept warm ×3 · 184k cached · next in 42m · 1h 52m left`. That's `statusText` in pane.tsx:70, which gets a `left` argument shown when set.
  - Bare `/cachebeat`: `on, every 50m idle · 1h 52m left · 3 beats · next beat in 42m`.
  - The pane's **This session** row: `on · until 4:30 PM`, and `r` drops the limit. **As built:** the time of day, not the time left, since the pane redraws on events and a left time would go stale.
  - Answers: `this session: on until 4:30 PM (2h), every 50m idle · next beat in 49m`. Time of day through `toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`. **Check** that the sandbox has `Intl`; if not, use the relative `2h` alone.
- **`global` / `local <minutes>`** keep setting **Beat after idle**, unchanged (register.tsx:628–655).
- **The tool:**
  - `session.intervalMinutes` becomes `session.keepAliveMinutes` (5–2880, or null to clear). Setting it turns beating on. **As built,** `enabled: false` with it is refused, naming both fields: `schedule()` clears the time whenever the session is off, so the pair would drop the time at once (claude-tools.md, "0.10.0").
  - `state.session` gains `keepAliveUntil` (ISO string or null) and `keepAliveMinutesLeft`. `intervalFrom` loses `session`. **As built,** `keepAliveUntilLocal` too: the same time on the user's clock, which the tool text tells Claude to say.
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
- It turns off at the deadline with the message (`kept warm until …, as asked`, or `keep-alive time up (…)` when the cache didn't last).
- Stop after idle is ignored while a keep-alive is set, and applies again after `/cachebeat on`.
- `/cachebeat 30` refuses with the hint, and nothing changes.
- `/cachebeat 1m` and `/cachebeat 72h` refuse with the range.
- `set` with `keepAliveMinutes` turns on, `null` clears it, and the pair with `enabled: false` is refused.
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
- **The key is computed** (a template literal in a `$` call's argument). The directory's scan was the worry, and the directory is dropped, so there's no portal check and no fallback to a shared `sessions` key. `claude plugin validate` and `plugin test` are the checks, as for every step.

**The flow:**
- **`classic.SessionStart`, `source: 'resume'`:**
  - Stash `{ id: e.session_id, secondsSince, likelyExpired, contextTokens }` in a module variable `resumeHint`. (`estimated_cache_write_usd` isn't kept: see Seeding.)
  - Its fields are optional in the types, and may be absent on 2.1.287 (P8). Absent fields mean the cache state stays `unknown`, and the guard doesn't hold.
- **`--resume` / `--continue`, at `session.start` with messages present:**
  1. Read `` `session:${await $.session.id()}` ``. If there's a record, `s = { ...fresh, enabled, keepUntil, beats }`. Otherwise keep today's `cfg.defaultOn`.
  2. Apply `resumeHint` if its id matches. **P3: the order isn't guaranteed.** On `--resume` and `--continue`, `classic.SessionStart` and `session.start` run concurrently (`session.start` entered first by 1ms in the deciding run, with the other hook slow). So both hooks do the same: `classic.SessionStart` stashes the hint, and calls `seedFromResume` if `session.start` has already finished its restore; `session.start` restores, and applies the hint if it is already stashed. Use one module flag for "restored" and another for "hint stashed", both set synchronously, and guard the apply against running twice. `$.session.id()` equals `e.session_id` here (P2).
  3. Then `pause($, RESUMED, …)` as now.
  - A keep-alive whose deadline has passed comes back off.
- **`/resume`:** the same, from the `classic.SessionStart` hook, which runs after `anotherConversation`. **Use `e.session_id`:** P2 found that `$.session.id()` inside that hook is still the id of the conversation *left behind* (it is the resumed id by the next prompt). Don't use `$.session.id()` for the record key there.
- **Seeding** sets two things, and nothing else:
  - **`s.lastWarm = now − secondsSince × 1000`.** Take `now` when the hook's event arrived, not when the apply runs, if the two can differ. `seconds_since_last_response` counts from the last main-thread response, not from a fork (P3, inferred from one case), which matches what `lastWarm` should be after a restart. Leave `prompt_cache_likely_expired` to the TTL comparison cachebeat already makes (the `true` case wasn't seen).
  - **The conversation's size, until the first response** (a choice made in the 2026-11-14 pass, not in the first plan): a new `Saved` field (`s.resumeTokens`, from `context_tokens`), which `cacheNow` uses while `chatSize` has no figure, and the first turn clears. Without it the cold guard's size check (item 4) has nothing to compare on a resumed session's first message, the case the guard matters most for. **Check in this step (R1):** whether `$.session.usage().context.tokens` already has a figure after `--resume`, before any response. If it does, the field isn't needed.
  - **There is no `source` on the cache state.** An earlier draft of this line had seeding set `source: 'resume'`; `CacheFacts` and `CacheView` have no such field (item 1a, `hooks/cache.ts`), and nothing reads one. Don't add it.
  - **No write rate is learned from the resume hint.** An earlier draft took `estimated_cache_write_usd / context_tokens` as the session's rate. `learnRate` can't take it: resume's `classic.SessionStart` has no `pricing` field (so a managed price can't be told from list price) and no lifetime field, in the 2.1.287 and 2.1.319 declarations alike (mods-gotchas.md, "Dollars"). Dollars are gone (2026-11-14), so the figure is unused.
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
  - With no figure from `$.session.usage()` after a resume, `state.cache.contextTokens` is the hint's `context_tokens`; after the first turn it's the session's own (unless R1 makes the field unnecessary).
- No rate is learned from a resume hint carrying `estimated_cache_write_usd`.
- Store pruning drops a 31-day-old record and keeps a fresh one.
  - Two sessions' records don't overwrite each other.
- **Test both orders** (hint first, restore first) on `--resume`: the kit runs hooks one at a time, so make one `await` something the test holds open, as `holdNow` does for the clock.
- **Raising the resume hook in a test:** `$.classic.SessionStart({ source: 'resume', session_id: 's1', seconds_since_last_response: 7200, … } as never)`. The cast is in the test, not in a `$` call of the plugin, so it's fine.

**README:**
- Rewrite the "A resumed conversation…" bullet (README:261): `A resumed conversation (claude --resume, --continue, or /resume) picks up as you left it: on or off, and any time you gave it. Beats start after your next message, since nothing of it is cached in this session yet, and the turn line says whether the cache is likely still warm.`
- Privacy: settings and **each session's on/off, time left and beat count, by session id, for 30 days**.
- Close the "Still open" `--resume` item in plan-0.8.0.md, with what P2 found: the id is the same after `--resume` and `--continue`.

### Item 4: the cold guard (step 5)

Rewritten 2026-11-14 around "Decided from it": the guard **asks** (`Send` / `Don't send`) instead of dropping the message and waiting for a second send. The first design's arm, its **send again within** window and `coldGuardWindow` are gone. The message speaks in tokens. Choices made in this rewrite that the user hasn't confirmed are marked **provisional**.

**The design:**

- **Three settings** in `BeatSettings` and `DEFAULTS`, on the **Limits** tab after **Cache gone cold**. They work for all folders and this folder through the existing scopes. The tool schema comes from the rows, and `ABOUT` needs an entry for each (`tsc` refuses a missing one).

  ```ts
  { key: 'coldGuard', label: 'Cold guard', values: [true, false], fmt: onOff,
    help: 'Asks before sending a message to a session whose cache has gone cold, and says how many tokens sending it caches again.' },
  { key: 'coldGuardTokens', label: '  chats from', values: [10_000, 20_000, 50_000, 100_000], show: s => s.coldGuard, fmt: v => `${tokens(Number(v))} tokens`,
    help: 'The smallest chat the guard asks about: a smaller one is cheap to cache again.',
    custom: { placeholder: 'e.g. 35k', parse: parseTokens } },
  { key: 'coldGuardUnanswered', label: '  if unanswered', values: ['drop', 2, 5, 10], show: s => s.coldGuard,
    fmt: v => (v === 'drop' ? "don't send" : `send after ${v}m`),
    help: "What happens to a held message when the question isn't answered: it isn't sent, or it's sent after this long.",
    custom: { placeholder: 'e.g. 3m', parse: parseWait } },
  ```

  - **Defaults:** `coldGuard: true`, and `coldGuardTokens: 20_000`, the same as `skipSmallTokens`'s default. Make the shared figure one `const SMALL_CHAT = 20_000` in settings.ts, used by both defaults.
  - **`coldGuardUnanswered` is the user's new setting** ("drop the message, or send it after a timeout"). **Provisional,** all three:
    - **`'drop'` is the default.** A guard that sends by itself after a few minutes guards less.
    - **What `'drop'` does:** the question stays open until it's answered, and the message is never sent unanswered. No timeout applies to it. Whether `'drop'` should also close the question after a while is the user's to say.
    - **A number is minutes, 1–15:** the message is sent when the question has gone that long unanswered. `parseWait` is a new reader beside the others in settings.ts: `reader('minutes', { '': 1, m: 1, min: 1 }, 1, 15, true)`.
  - **Dismissing the question (Esc) never sends,** under either value: the user saw it and declined.
  - **`normalize()`:** today it checks number settings only by type. Add range checks for `coldGuardTokens` and a numeric `coldGuardUnanswered`, through their readers, as `interval` has: a stored `coldGuardUnanswered` of 90 falls back to `'drop'`.
- **A session override:** `s.guard: boolean | null` in `Saved` (null follows the setting), from `/cachebeat guard on|off` and the tool's `session.coldGuard` (`true`/`false`/`null`).
  - The pane's **Cold guard** row shows `on · this session` while the session overrides it, and `r` drops the override. That's the marker pattern step 3 removed from the interval, so reuse its shape.
  - `/clear` keeps it, as `anotherConversation` keeps `enabled`. A resume restores it from the session record (step 4 adds `guard` to the record).
- **The hook:** `on('prompt.submit', async ($, e, next) => …)`. It asks only when **all** of these hold:
  1. The guard applies here: `s.guard ?? cfg.coldGuard`.
  2. The origin is one a person can be asked about: see "Who is asked" below.
  3. `e.turnId === undefined` and `!busy`. Mid-turn, the cache is being read anyway.
  4. **No check on a leading `/` or `!`** (P6): `!` commands and plugin and built-in slash commands (`/cachebeat`, `/clear`, `/resume`, `/help`) never reach `prompt.submit`. A skill or prompt-type command does, with its text as typed (`/simplify`). It sends the conversation, so it is asked about like plain text.
  5. `(await cacheNow($)).state === 'cold'`, read in a statement of its own. `unknown` (a new conversation, or a resume without a hint) never asks.
  6. `contextTokens >= cfg.coldGuardTokens`.
- **The question,** in the engine's own dialog:

  ```ts
  $.ui.ask('The cache has been cold for 2h 14m, so this message caches 184k tokens again. Send it?', ['Send', "Don't send"])
  ```

  - **`Send`** (compared exactly: free text typed under "Other" is not a yes) calls `next(e)`, and logs `sent on a cold cache: cold for 2h 14m, 184k tokens cached again`.
  - **Anything else, and a dismissal** (the call rejects), returns `{ drop: 'cachebeat: not sent. The cache has been cold for 2h 14m, and sending caches 184k tokens again.' }`. P5: the text stays in the composer, and the reason draws as `Prompt dropped by a hook: <reason>`.
  - **Where the log lands** (P5): a `$.ui.log` before a drop draws as a `● cachebeat: …` row just above the drop row. After `next(e)` on a mid-turn prompt, a log wasn't found on screen. This one isn't mid-turn; try the log first in this step, and a toast if it doesn't show.
  - **One question at a time** (a choice made in this rewrite). A module variable holds the open question's promise. A prompt that arrives while it's open waits on the same answer instead of opening a second dialog.
- **It fails open, except at the question** (a choice made in this rewrite; it narrows the earlier rule "no `.catch` that drops"). No `.catch` on the hook: a failure anywhere in it lets the prompt through (`index.d.ts:4093`). The `$.ui.ask` call alone sits in a `try`, because its rejection is how a dismissal arrives.
  - **The cost:** the declarations give one rejection for "dismissed" and for "no one to ask", and no way to tell them apart. Where the dialog can't draw at all, every cold send would be dropped, and only turning the guard off would get a message through. `-p` is covered (its origin, `sdk`, isn't asked). The desktop app isn't checked: G5.
  - **If G5 finds a surface that rejects by itself,** the guard doesn't ask there: it sends, logged and counted, as for an origin that isn't asked.
- **The timeout** (a numeric `coldGuardUnanswered`): race the ask against a promise that a `$.clock.after` callback resolves. Not `$.clock.sleep`: "the hook's budget runs on through it" (2.1.319 declarations), and the hook has 10s.
  - When the timer wins, the hook calls `next(e)` and logs `sent on a cold cache after 5m unanswered: 184k tokens cached again`.
  - **Probe first (G1–G3 below).** `$.ui.ask` takes no timeout, and nothing in the declarations closes its dialog. If the dialog can't be closed once the message has gone, the question becomes our own pane (`$.ui.open` with two buttons, closed with the pane's own close), for both values of the setting.
- **Counting** for step 7: each question asked, and each cold send with its tokens (an answer of `Send`, a timeout, or an origin that isn't asked).
- **The guard runs with beating off.** It's about the cache, not about beats, and `markWarm` runs either way.

**Who is asked.** The hook holds an allowlist, so an origin added by a later Claude Code passes until someone decides about it. (The first design held `composer` only. cache-tax holds more, but it drops and waits for a resend, which needs nobody at a dialog.)

| Origin | Asked? | Why |
| --- | --- | --- |
| `composer` | Yes | The user's Enter at the prompt. |
| `bridge` | **If the live check passes** ("Still open") | The user's own message from a phone or the web. The user wants it held. Whether a remote client can answer a `$.ui.ask` isn't in the declarations. If it can't: not asked, and the README suggests `/cachebeat` before sending from a remote session. |
| `unclassified` | No | The declarations put engine-queued idle notices and delivery receipts under it too, "a non-user source". A question there could wait on nobody. |
| `sdk` | No | `claude -p` and the Agent SDK: `$.ui.ask` rejects in a `-p` run, "no one to ask". |
| `channel`, `slack-ping` | No | A person sent it, but from Slack or Telegram, where the dialog doesn't draw. |
| `task-notification`, `scheduled-trigger`, `peer`, `peer-send-message`, `projects-relay`, `coordinator`, `observer`, `observer-activity`, `auto-continuation`, `plugin` | No | Nobody is at a dialog for these. |

An origin that isn't asked is sent, logged (`sent on a cold cache: …`) and counted as a cold send, so CacheTax still shows what it cost. **Provisional:** `channel`, `slack-ping` and `unclassified` passing. With a numeric **if unanswered** they could be asked safely, since the message goes anyway after the wait; that's a later choice.

**Probes, before the hook is built:**

| # | Question | How |
| --- | --- | --- |
| G1 | When a timer wins the race and the hook returns `next(e)`, what happens to the `$.ui.ask` dialog still open? Can anything close it? | A probe mod asks from `prompt.submit` and sends after 20s. Watch the dialog, then answer it late. |
| G2 | Does a wait on a `$.clock.after` promise count against the hook's 10s while a `$.ui.ask` is in flight? The `$` time a hook spends doesn't count (`index.d.ts:5099`); whether this wait is `$` time is **inferred**. | The same probe, with the wait at 30s. |
| G3 | Can the test kit answer `ui.ask`, and make it reject? | A test hooks `on('ui.ask', …)` with a value, and with a throw. If it can't, the question goes behind a function the tests can replace. |
| G4 | `bridge`: does the question reach a Remote Control client, and can it be answered there? | "Still open", the Remote Control check. |
| G5 | Does `$.ui.ask` draw and wait in the desktop app, or reject at once? Does a rejection say why? | The probe mod in the desktop app; log the rejection's message. |

**Risks:**
- **2.1.287:** P8. Its declarations carry `prompt.submit`, `$.ui.ask` and the origin kinds (generated 2026-11-14), but nothing has run there.

**Function names:** `guardColdSend($, e)` for the hook body, if it's pulled out.

**Tests** (the mid-turn case is real: a composer prompt typed over a running turn arrives with `turnId` set. P7: raise it as `await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })`. The kit stamps no origin, so **every guard test passes one**: left out, `e.origin` is `undefined`, the hook is skipped, and the prompt goes through. A test that expects a send to pass would then pass for the wrong reason. How the question is answered in a test is G3):
- **Asking:**
  - Cold and big: the question names the age and the size in tokens, and no dollars. `Send` lets the prompt through with the log; `Don't send` drops it with the reason; a dismissal drops it.
  - Free text under "Other" drops it.
  - A second prompt while the question is open gets the same answer, and one dialog is opened.
  - Resumed with `seconds_since_last_response` past the TTL (step 4): the first message is asked about.
- **Unanswered:**
  - `coldGuardUnanswered: 'drop'`: nothing is sent however long the clock advances.
  - `coldGuardUnanswered: 5`: sent at 5m with the unanswered log, and not before.
  - An answer before the timeout wins, and the timer does nothing after.
- **Not asking:**
  - Warm.
  - `unknown`.
  - Under `coldGuardTokens`.
  - Each origin in the table's "No" rows: sent, logged and counted. `bridge` follows what G4 found.
  - Mid-turn (`turnId` set). (Live, a prompt typed mid-turn arrives with `turnId` set. No test in the kit has set it: pass it in this step's test.)
- **Scopes:**
  - Guard off for all folders, on for the session: asks. And the reverse.
  - The folder's own `coldGuardUnanswered` applies.
- **Settings:** `normalize` replaces an out-of-range token count or wait.
- **The hook fails open:** with `cacheNow` made to throw, the prompt goes through.

**README:**
- The Limits table rows: `Cold guard | Asks before sending a message to a session whose cache has gone cold, saying how long it's been cold and how many tokens sending it caches again. | on`, then `  chats from | The smallest chat it asks about | 20k tokens`, then `  if unanswered | What happens when the question isn't answered: the message isn't sent, or it's sent after a few minutes | don't send`.
- Under "What it sends": `With Cold guard on, cachebeat asks before sending your message to a session whose cache has gone cold. Messages nobody can be asked about (scheduled tasks, other sessions, claude -p) are sent as usual.`
- `/cachebeat guard on|off` in the Commands table.

### Item 5: bare `/cachebeat` shows a summary (step 6, provisional)

**Current behavior:** one line of text (register.tsx:834–843).

**The design:** Claude Code's `/status`, `/config`, `/usage` and `/stats` are tabs of one dialog. Mirror that: the settings pane gains two read-only tabs, **Status** and **CacheTax**, ahead of the five settings tabs.
- **Their ids are `summary` and `cachetax`** (chosen 2026-11-14). Not `status`: `hooks/settings.ts` already gives that id to the **Turn line** tab, `register.tsx` keys the preview's speed off it, and the pane test asserts `tab:status`. The titles the user sees stay **Status** and **CacheTax**.
- Bare `/cachebeat` opens it on **Status**, `/cachebeat stats` on **CacheTax**, and `/cachebeat settings` on **Beating**, as today.
- The command still answers its one line as `text`, so the transcript keeps a record, and Claude sees it in `-p`, where nothing draws.

**Status** draws from `cacheNow($)` and the session. **[$?]** Tokens only: decided 2026-11-14. The `≈$` figures on the Size and This session rows go; the mock-up below still shows them until step 6 redoes it in tokens.

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

- **Pane mechanics** (pane.tsx `settingsPane`, and the pane's hooks in register.tsx):
  - **`TABS` stays settings-only,** so `rowOf`, `accept` and the tool schema never see the read-only tabs.
  - **A second list, `PAGES`, is what the pane walks** (chosen 2026-11-14): `export const PAGES = [{ id: 'summary', title: 'Status' }, { id: 'cachetax', title: 'CacheTax' }, ...TABS]` in settings.ts, beside `TABS`. Everything that moves between tabs reads it in place of `TABS`:
    - the tab bar's buttons and the hotkey hint in pane.tsx (`TABS.map`, `` `1-${TABS.length}` ``), so the hotkeys become 1–7
    - the `ui.focus` hook's wrap off either end of the tab bar (`TABS.findIndex`, `TABS[0]`, `TABS.at(-1)`)
    - the `ui.scroll` hook's step along the tab bar (the modulo over `TABS.length`)

    Left on `TABS`, the arrows would wrap past the two new tabs and only the hotkeys would reach them.
  - **A read-only tab has no rows:** `settingsPane` draws its page instead of rows (`TABS.find(…) ?? TABS[0]` becomes a lookup in `PAGES`), its ring is empty, and `firstOf` answers `tab:<id>` for it, so Enter on it goes nowhere and the focus stays on the tab bar.
  - The two places that read `.preview` and `.rows` off a tab (`TABS.find(t => t.id === page.tab)?.preview`, `firstOf`) keep working: a read-only page has neither.
- **Desktop:** the same pane draws there, as the settings menu does.
- **Refresh:** the pane's `tickAtom` already redraws on each step timer (step 1). No new clock.

**Tests:**
- Bare `/cachebeat` opens the pane on Status (assert `ui.open` was called, and `pageAtom.tab === 'summary'`) and still answers the line.
- Status shows `cold for` after a skewed sleep.
- `/cachebeat settings` still opens on Beating.
- The tab hotkeys reach all seven, and the arrows walk all seven and wrap from `tab:alerts` to `tab:summary` and back.
- **For whoever edits the pane tests next:** the existing test is named "the settings pane: six tabs, …" and asserts five (`tab:beating` … `tab:alerts`). It becomes seven here; fix the name with it.

**README:** the Commands table: `/cachebeat` opens the status page, `/cachebeat stats` opens CacheTax. A short "Status" paragraph under "What you'll see".

**What steps 6 and 7 wait on** (2026-11-14). The screenshots arrived (`/usage` and `/stats`; "Decided from it" says what's in them), so nothing waits on them any more. Both pages are still provisional, for two things:
- **Tokens only** (decided 2026-11-14, built). Both mock-ups still carry `≈$`: redo them in tokens, and CacheTax's Net in input-token equivalents.
- **A look pass against the screenshots, for the user to approve,** before either page is built. What it has to settle:
  - Status's Cache row against `/usage`'s own line (`… · warm (1h TTL, last activity 32s ago)`)
  - CacheTax's three columns against `/stats`' range switch (`All time · Last 7 days · Last 30 days`)
  - whether CacheTax gets `/stats`' heatmap by day

  No API gives either built-in page's figures, so both pages draw from cachebeat's own counts whatever the look.

### Item 7: CacheTax (step 7, provisional)

**[$?]** Tokens only: decided 2026-11-14. The `usd`, `keptUsd` and `coldUsd` counters and the page's dollar rows go; the Net is in input-token equivalents (tokens weighted by each model's read and write ratios, from `ratiosOf` in `hooks/prices.ts`). The record and the mock-up below still show dollars until step 7 redoes them.

**What's counted.** These are per session, in the same `session:${id}` record as step 4, so concurrent sessions never collide:

```ts
stats: {
  days: { [yyyy-mm-dd]: {
    beats: number; read: number; wrote: number; usd: number // what beats cost
    kept: number; keptUsd: number   // turns that came back to a cache a beat kept warm, and the re-cache they avoided
    cold: number; coldTokens: number; coldUsd: number // turns sent on a cold cache, and what re-caching cost
    held: number                    // sends the cold guard asked about (item 4), whatever the answer: the counter's meaning under a guard that asks, chosen 2026-11-14
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

  A daily row or heatmap (like `/stats`') is for the look pass (item 5, "What steps 6 and 7 wait on").
- **Function names:** `countBeat($, …)`, `countTurn($, …)`, `taxPage($)`.

**Tests:**
- A beat adds to today's `beats` and `usd`.
- A turn after a kept stretch adds `kept`.
- A cold turn adds `cold`.
- A send the guard asks about adds `held`; answered `Send`, or sent unanswered, it adds `cold` too.
- Two sessions' records add up on the page.
- A record older than 30 days is pruned, and isn't counted.
- The page renders with no records (all zeros, no `NaN`).

**README:** **[$?]** (tokens only: decided 2026-11-14, so no dollar figure in it) the Privacy section gains "and, for each session, counts of beats, tokens and cold sends by day, kept on your machine for 30 days to show on the CacheTax page. Nothing of it is sent anywhere." A short CacheTax paragraph under "What you'll see".

### Item 8: the demo GIF (step 8)

Rerecord `assets/demo.tape` with `demo.py` once steps 1–7 have merged and the look is settled. It shows `/cachebeat 2h`, the Status tab, a beat landing, and the cold guard's question. The tape still types `/cachebeat 5`, which step 3 refuses (step 8 below). The recording steps are in the scripts. Only `assets/demo.gif` ships.

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

### Item 10: Claude reads what it needs (step 3c)

Design only, 2026-11-14. Nothing here is built.

**What the user asked:** Claude should be able to check its own context through cachebeat, ask for only the fields it needs instead of the whole state, and have firm rules for when the whole state is required (their examples: the first read, and before a settings change).

**Current behavior:**
- `state` takes no input and answers everything (`stateOf`, `hooks/register.tsx`): `session`, `cache`, all the settings, `folder`, `defaults`.
- Nothing in it says how full the context window is or when it compacts. `cache.contextTokens` is the nearest thing.
- `set` answers `{ changed, session, settings, folder }` and its description sends Claude to `state`'s `folder.own` to learn what a folder overrides.

**What it costs today** (measured 2026-11-14 with a script over `hooks/tools.ts`; tokens are characters ÷ 4, an estimate):

| Piece | Characters | ≈ Tokens | Paid |
| --- | --- | --- | --- |
| `state` description | 3,174 | 790 | once, when ToolSearch loads it |
| `set` description | 2,401 | 600 | once, when loaded |
| `set` schema | 12,496 | 3,100 | once, when loaded |
| of which `folder` repeating every setting's description | 3,290 | 820 | |
| a full `state` answer, pretty-printed (0.10.0's shape, extrapolated from a 0.9.x answer of 1,480) | ≈2,000 | 500 | each call |
| the same, printed compact | ≈1,450 | 360 | each call |

So a narrow read saves about 300 tokens a call, and the `folder` duplication alone costs more than two of those. Both are fixed below. The larger gain of narrow reads is that Claude gets an answer about its context without 30 settings around it.

#### What "its current context" can honestly include

Checked against the declarations Claude Code writes on 2.1.287 (generated in a scratch folder today, 20,006 lines), 2.1.295 (this checkout) and 2.1.319 (`cachebeat-rel`). The types are the same in all three. 2.1.322, the installed version, has written none here.

| What | Source | Reported or inferred |
| --- | --- | --- |
| Tokens in the window | `$.session.usage().context.tokens`: the input side of the last response, "uncached, cache-written and cache-read together" | **Reported.** Absent "until the first response of the live window: a fresh session, or one just compacted". |
| Window size | `context.window` | **Reported.** |
| Fill | `context.percent` (whole, against the model's window) | **Reported.** |
| Where auto-compaction runs | `context.breakdown.autoCompactThreshold`, `isAutoCompactEnabled`, `rawMaxTokens`, with `breakdown: 'summary'` ("estimates locally and sends none"; `chatSize` already makes this call) | **Reported.** That the engine compares the threshold with the same figure as `context.tokens` is **inferred** (C4). |
| What the next request re-sends | `chatSize`: the last response's prompt plus its reply, from `breakdown.apiUsage` | **Reported figures, summed by cachebeat.** |
| Warm or cold, minutes left, minutes cold | `viewOf`: time since the last read against the lifetime | **Inferred**, as the engine's own `/usage` line is (see "Facts from the types"). |
| What a re-cache writes | `cache.contextTokens`, the whole conversation written again | **Inferred**: it assumes a cold cache misses everything. |
| Time since the user's last message | `s.lastReal`, set by cachebeat at each real turn | **Observed by cachebeat.** No engine field outside resume's `seconds_since_last_response`. |
| Compactions | the `session.compact` hook cachebeat already has; its result carries `tokensBefore?` and `tokensAfter?` | **Observed by cachebeat**, since the process started. A resumed session starts from 0. |
| Usage limits | `$.session.usage().rateLimits` | **Reported.** Not in `state` today; the Status page (step 6) shows it. |

Two limits on "its own":
- **Mid-turn, the figures lag.** Claude only ever calls a tool mid-turn. `context.tokens` is the last *finished* response's input, so it misses that response's own output and everything the turn added since. Which response that is when the call runs is **inferred** (C1).
- **A subagent gets the main conversation's figures.** `$.session.usage()` is "the live context window" of the session; nothing in the declarations gives a subagent's loop its own. **Inferred** (C2). The answer says so (`of`, below) rather than leave a subagent to take them for its own.

#### The read API

One tool, as now, with one optional input.

```ts
inputSchema: object({
  only: {
    type: 'array', items: { enum: ['context', 'cache', 'session', 'settings'] },
    description: 'The sections to read. Leave out for all of them.',
  },
}),
```

- **Sections, not fields.** Four names. The schema lists them and the hook checks them (below): the engine doesn't enforce a plugin tool's schema.
  - `context` (≈50 tokens), `cache` (≈35) and `session` (≈85) are small enough that a field filter inside them saves nothing.
  - `settings` is the big one (≈250): the answer's `settings`, `folder`, `allFolders` and `defaults` keys together, since each is read in the light of the others.
  - The sections follow the Status page's rows (item 5): Cache and Size are `cache` and `context`, Beating and This session are `session`.
- **The answer's shape doesn't change:** the same top-level keys as today, less the ones not asked for, plus `context`.
- **Nothing named answers everything.** A session that started before the update holds the old schema and sends `{}`: it gets what it always got. A lazy caller costs tokens, never correctness.
- **A bad `only`** (not a list, or a name that isn't a section) is refused in the hook, in `parseSet`'s style: `nothing read: only takes context, cache, session or settings, not "beats"`. The schema won't stop it: a plugin tool's input schema isn't enforced (mods-gotchas.md, "The engine", found live).
- **The answer is printed compact** (`JSON.stringify(x)`; `json` in register.tsx indents by 2 today). About 30% fewer tokens on every answer, `set`'s too. Claude is the only reader: the transcript row is drawn by us.
- **The transcript line names what was read:** `cachebeat · read context, cache`, and `cachebeat · read the state` for everything.

**The new section:**

```ts
context: {
  tokens: number | null,   // engine: context.tokens
  window: number,          // engine: context.window
  percent: number | null,  // engine: context.percent
  autoCompactAt: number | null, // engine: breakdown.autoCompactThreshold; null while auto-compact is off
  compactions: number,     // cachebeat: main-conversation compactions seen since Claude Code started
  lastCompactionMinutesAgo: number | null,
  lastMessageMinutesAgo: number | null, // cachebeat: since the user's latest message (s.lastReal)
  of?: 'main conversation' // only on a subagent's call
}
```

- `compactions` and its time are two new fields of `Saved`, set in the `session.compact` hook where `isDone` is true, and cleared by `anotherConversation`.
- **`session.cacheTtl` goes;** `cache.ttl` is the same value. `ABOUT.interval` says "state's `cache.ttl`" in its place.
- **Without dollars** (built in the tokens-only step) `cache.recacheUsd` and `session.lastBeatUsd` are gone, and `cache.contextTokens` is the re-cache figure.

#### The boundaries, enforced by the tools

- **A loop's first read is answered whole, whatever it names.** The hook keeps a set of the loops that have had everything (`e.agentId ?? 'main'`). A narrow read from a loop not in it is widened, and the answer says why: `whole: 'your first read in this conversation'`.
  - The set is cleared where Claude's copy is gone: `anotherConversation` (`/clear`, `/resume`), a main-conversation compaction, and where a rewind is noticed. A restart clears it by itself (module memory).
  - Claude can't get this wrong: asking narrow too early costs it nothing and us one whole answer.
- **`set` needs no read first, and never refuses for want of one.** What a read-before-write protects is answered in `set`'s own answer:
  - what changed, and this session after it (as now)
  - where each change applies (as now: `folder.path`)
  - **new, `shadowed`:** the keys the call saved for all folders that this folder has its own of, so they didn't change here. Today the description sends Claude to `state`'s `folder.own` to work that out.
- **Narrow is enough for everything else.** One sentence of prose remains, because no code can know what Claude is about to say: settings can change outside the conversation, so read `settings` again before quoting one.
- **Not built: refusing a write that follows no read.** It adds a round trip to the thing the user asked for, and the read it forces tells Claude nothing `set`'s answer doesn't.

#### The text

**`state`'s description,** whole. Names only, no values: tool text is fixed for the session.

> Reads cachebeat in this session, and this conversation's context: how full the context window is and when it compacts, whether the prompt cache is likely still warm and for how long, what the next message would write to the cache again, this session's beating, and cachebeat's settings.
>
> `only` names the sections to read: `context`, `cache`, `session`, `settings`. Name the ones you need; leave it out for all of them. Your first read in a conversation, and the first after a compaction, is answered whole whatever you name, and `whole` says why. `set` needs no read first: its answer says what changed and where. Settings can change outside this conversation (the menu, another session), so read `settings` again before you quote one.
>
> `context` is the main conversation's, also when a subagent asks (`of` says so then). `tokens`, `window` and `percent` are Claude Code's own figures, the status line's: the input of the last finished response against the model's window. Mid-turn they miss what the turn has added since, and they are null before a conversation's first response and right after a compaction. `autoCompactAt` is the token count at which Claude Code compacts on its own, null when that is off. `compactions` counts the compactions since Claude Code started, with `lastCompactionMinutesAgo`. `lastMessageMinutesAgo` is the time since the user's latest message.
>
> `cache` is whether this session's prompt cache is likely still warm, judged by the time since it was last read against its lifetime, as Claude Code judges it; only the next request confirms it. `state` is warm, cold, or unknown before anything is cached; `ttl` is the lifetime, `1h` or `5m`, worked out on each call; then `lastReadMinutesAgo`, `minutesLeft` or `coldForMinutes`, and `contextTokens`: what the next message writes to the cache again if it is cold, the last request and its reply.
>
> `session`: `nextBeat` is `in 42m` (mid-turn too: counted from the end of the turn's last request), `due now`, `50m after the request on its way`, `after this turn`, `after the next turn` (nothing cached yet), `none needed` (a keep-alive time is set and the cache outlasts it), or null when off or skipping. `intervalMinutes` is the beat interval in effect, read-only: `set` changes it through `settings.interval` or `folder.interval`, and `intervalFrom` says which it follows (`folder`, `all folders`, or `auto`). `keepAliveUntil` (UTC), `keepAliveUntilLocal` (the user's clock: tell the user this one) and `keepAliveMinutesLeft` are set while the session has a keep-alive time. `skipping` says why beats skip this chat. `paused` says why beats wait for the user's next turn; only that turn ends it. A beat re-sends the conversation as last sent, with one line tagged `[cachebeat]`; it reads the cached conversation (`lastBeatReadTokens`) and writes only what wasn't cached (`lastBeatWrittenTokens`), both null before the first beat.
>
> `settings`: the values in effect here, this folder's own over those for all folders. `folder` is this session's folder (`path`) and the settings it has of its own (`own`); `allFolders`, present while it has any, has the settings for all folders; `defaults` has the default of each setting that differs from it.

3,215 characters (counted) against 3,174 today: the same size, with the context section and the read rules added and the dollar sentences gone. The first sentence carries the words a ToolSearch keyword query for context or cache would use.

**`set`,** two changes:

- In the scope paragraph, "A change to `settings` doesn't reach a setting this folder has its own of (`state`'s `folder.own`): tell the user." becomes:

  > A change to `settings` doesn't reach a setting this folder has its own of: the answer lists those under `shadowed`, and you tell the user.

- The last paragraph becomes:

  > Nothing changes if any value is invalid, and the refusal names each one. No `state` read is needed first. Subagents can read `state` but not call this. Returns what changed, this session's state, the changed settings (for all folders, and for this folder with its `path`, which you name to the user), and `shadowed`.

- **`folder`'s fields lose their descriptions.** `settings` and `folder` are built from the same `field(k)`, so each setting is described twice. `folder`'s own description already says "as `settings` takes them". Build its fields from `kinds(k)` plus null, without the text: 3,290 characters less (measured), and the limits stay in the schema.

#### Is a skill warranted now?

No. What claude-tools.md says still holds, and this design gives it one more reason:
- The rules a skill would carry are needed at the moment the tool is loaded, which is when its description arrives. Most of them are now code.
- A skill's listing line would sit in every session of every user, and a second text would have to keep step with the tools.

What a skill *would* add is the one thing this design doesn't: a line always in view. The tools wait behind ToolSearch, so until Claude loads `state` it sees only the name `mcp__cachebeat__state`, and nothing tells it that its context can be read there. Claude will check when asked, not on its own. Cheaper answers than a skill:
- **A README tip** (below): a line for the user's own `CLAUDE.md`. It costs only the users who want it.
- **A static line in the system prompt** (`prompt.compose`) would reach everyone, and being fixed text it wouldn't break the cache as state there would. It's still tokens on every request of every user, for a behavior most didn't ask for. Not proposed.

#### Tests (`hooks/cachebeat.test.tsx`)

- `only: ['context']` after a whole read answers `context` alone; `['cache', 'session']` those two; `['settings']` gives `settings`, `folder`, `defaults`, and `allFolders` only while the folder has its own.
- `{}` answers every section, with the keys it has today plus `context`.
- A first read with `only` is answered whole, with `whole` set; the next narrow read isn't widened.
- After `/clear`, after a main-conversation compaction and after a noticed rewind, a narrow read is whole again. A subagent's compaction (`agentId` set) changes nothing.
- A subagent's first narrow read is whole even after the main loop's; its `context` carries `of: 'main conversation'`, and the main loop's doesn't.
- `context`: the stubbed `tokens`, `window`, `percent` and threshold come through; `tokens` and `percent` are null when the stub has none; `autoCompactAt` is null with auto-compact off; `compactions` goes 0 to 1 on a compaction and back to 0 on `/clear`.
- `only: 'cache'` and `only: ['beats']` are refused, naming the four sections.
- `set` with `settings: { interval: 30 }` while the folder has its own interval: `shadowed` is `['interval']`. Without one: `[]`.
- `set` as a loop's first call goes through, with no read before it.
- The schema: `folder`'s fields carry no `description`, and still refuse a value out of range.
- The transcript row reads `cachebeat · read context, cache`, and `read the state` for everything.
- The answer has no newline.

**Live checks, before building on the inferred points:**

| # | Check | How |
| --- | --- | --- |
| C1 | Which response `context.tokens` reflects when read from a `tool.call` mid-turn | Call `state` mid-turn in a long turn, then compare with `/context` at the turn's end. |
| C2 | A subagent's call gets the main conversation's figures | Have a subagent call `state` and compare with the main loop's. |
| C3 | ToolSearch finds `state` from a query about context | In a fresh session, ask Claude how full its context is, without naming cachebeat. |
| C4 | Auto-compaction runs when `context.tokens` passes `autoCompactAt` | Set a small `CLAUDE_CODE_AUTO_COMPACT_WINDOW` and watch a session cross it. |

#### README (on `main` through the release; users only)

- Features, the "Ask Claude" bullet, gains: "or ask it how full its context is and whether the cache is still warm".
- "What it sends", the "Ask Claude, and it can tell you…" line, gains "how full the context window is and when it will compact".
- A tip under Quick start: `To have Claude watch its own context, add a line to your CLAUDE.md, such as: "Before a long task, read your context with cachebeat's state tool (only: context)."`
- The line on the two tools stays as it is: they still read and change only cachebeat's own state. The context figures are Claude Code's own, read on the machine.

#### Alternatives rejected

- **A `fields` list of leaf names.** Naming about 60 leaves in the schema costs more tokens, once loaded, than narrow reads would save; free-text paths can be mistyped; and the three small sections are already cheaper than one extra call.
- **A separate `context` tool.** A second read tool with its own description, and the first-read rule would need to span both.
- **Nothing named answering a brief state.** It changes what `{}` means for sessions that hold the old schema.
- **Refusing a narrow first read.** A round trip to teach a rule the tool can apply itself.
- **Refusing a write that follows no read,** or `set` answering the whole state. See "The boundaries".
- **Widening a narrow read when the settings changed since the loop last saw them.** It only helps when Claude happens to read something else; it doesn't stop Claude quoting a setting from memory. One sentence of prose covers that case as well.
- **Putting the context in the system prompt or the turn's context.** It changes the cached prefix whenever it moves (claude-tools.md).
- **`isDeferred: false`,** so the descriptions are always in view. It needs 2.1.293, above the floor, and puts ≈4,500 tokens in every session.

#### Open, for the user

1. **"The whole state before a settings change"** is met here by making the read unnecessary (`set`'s answer, with `shadowed`), not by forcing it. If you want it literal, the cheap form is `set` answering the whole state on a loop's first call (≈360 tokens, once); the strict form is a refusal, which I'd not build.
2. **The first read whole even for a pure context check?** It's your rule, and it's one rule. It costs ≈360 tokens once per conversation and per compaction, mostly settings Claude may never need. The alternative is no first-read rule at all, since `set` no longer depends on one.
3. **Should Claude check its context unasked?** Not with the tools deferred. The README tip leaves it to each user's `CLAUDE.md`; a fixed system-prompt line or a skill would reach everyone and cost everyone.
4. **A weighted re-cache figure in `state`?** `cache.contextTokens` is raw tokens. CacheTax's net is in input-token equivalents; `cache.recacheInputTokens` (tokens × the model's write ratio) would match it. Left out until you say the tool should speak that unit.
5. **Usage limits in `state`?** The Status page shows them and `state` doesn't. If wanted, `session.usageLimits` joins in step 6.
6. **Printing answers compact** changes nothing Claude reads but the whitespace. Say if you'd rather keep them indented.

## Steps, in order

Each step is finished, tested and merged into `dev` before the next starts.

**For every step, these bite:**

- **On 2.1.287, a function handed `$` must have a name used nowhere else in the file,** not even as a local `const`. The loader refuses the whole module. Grep for each new name.
- **A function handed `$` is declared at the top of the file,** not as an arrow inside `register`. `claude plugin validate` fails on it, on 2.1.287 and 2.1.322 alike: `$ is passed to "inner", which is not a function declared at the top of this file` (and "No digest").
- **Three older rules were the directory's alone, and no longer bind** (checked 2026-11-14; the directory is dropped):
  - a `$` call given a constant whose value is a cast (`$.ui.open(OPEN)` with `OPEN = {…} as const`)
  - a matcher that isn't a literal (`{ tool: SOME.constant }`, hooks registered in a loop)
  - a `$` call that isn't a plain statement (parentheses, `??`, `!` or a cast around it)

  **The check:** a scratch plugin doing all three (`(await $.session.model()) ?? …`, `$.store.set('k', X)` with `X` cast, `((await $.store.get('k')) as …)?.a`, `(await $.clock.now())!`, `{ command: NAME }`, `{ tool: TOOL.a }`, `on` in a `for` loop) passes `claude plugin validate`, and its test under `claude plugin test` runs the command hook and dispatches through the member-matcher and loop hooks, on 2.1.287 and on 2.1.322. Validate lists every `$` call and hook. It prints a matcher it can't resolve as `?` (an object's member, an imported constant; a top-level `const` string and a loop's values do resolve), and that fails nothing: `validate --strict` passes the release branch with `ui.focus{requestId=?}`. **Not checked:** a live session. The kit and validate load the module as a session does; that a session treats these the same is inferred.
  - `h` and `Fragment` as names in a `.tsx` file weren't in this probe. That rule is the directory's alone on older evidence: 0.9.0 shipped `let h` and `tsc`, `plugin validate` and `plugin test` all passed it (mods-gotchas.md, "Reviews and validation").
  - 2.1.322's validate prints `gating hook without .catch` for a hook that can answer without `next`. It's information: `--strict` passes the release branch with eight of them.
  - **Existing code keeps the old shape;** nothing needs rewriting. New code may use whichever reads best (a choice made in this pass, not the user's: say if the old shape should stay the house style). Literal matchers are still worth it where they're free: `validate`'s listing then names the tool.
- **Run the checks, and fail on the summary:**

  ```sh
  out=$(claude plugin test . 2>&1); echo "$out" | tail -5; grep -q "^ 0 fail" <<<"$out"
  npx -p typescript tsc -p .
  ```

  `claude plugin validate --strict .` only on a release branch (it flags `CLAUDE.md` on `dev`).
- **Tool text is fixed for the session.** To see a changed description, start a new session.
- **Store writes read the store fresh first** (`changeSettings`, `saveOwn`).
- **Plugin files and notes go in separate commits.** Record what took time in `notes/mods-gotchas.md` as you go.
- **Nothing is validated in the directory's portal any more** (dropped 2026-11-14). `validate --strict` on the release branch is the last check.
- **Each step keeps CI's 2.1.287 leg green.** A new API that fails there either moves the floor (README badge :12, which CI's matrix reads, and Requirements :31) or gets dropped. Ask the user before moving the floor.

### Step 0: the live checks (P1–P8)

- **Delivers:** a notes section, "0.10.0 probes", in `notes/mods-gotchas.md` with each answer, and this plan updated where an answer changes a design.
- **Depends on:** nothing.
- **Bundles:** checks only, no shipped code.
- **How:** a scratch probe mod outside the repo (`claude --plugin-dir <probe>`), driven in tmux as mods-gotchas.md "/rewind" describes. P1 needs the user to suspend the machine.
- **Why first:** P5 can change the cold guard's whole shape, P2 and P3 the resume design, and P4 the dollar source.
- **Status:** P2–P7 done 2026-11-09. None changed the shape of a design at the time (P5 kept drop-and-resend, P4 kept the `cost.usd` delta, P3 kept the plan's two-order resume), but each changed a detail: see items 2, 4 and 6. The guard has since become a question (item 4, 2026-11-14); P5 still says what a drop looks like, which the `Don't send` answer uses. P1 and P8 are pending.

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

- **Delivered, then removed (2026-11-14, the tokens-only step):** `hooks/prices.ts`, the rate override from engine estimates, `recacheUsd`, the `≈$` beat log, `state.session.lastBeatUsd`, and the README cost paragraph. What stays is `ratiosOf` in `hooks/prices.ts` (item 6).
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

- **Built 2026-11-14** on `step3b-midturn`. The probe's answers are in mods-gotchas.md, "0.10.0 probes", "A command typed mid-turn": the reply is drawn only when the turn ends, a toast and a `$.ui.log` both draw at once, and the engine does draw `PromptHint` while working. The acknowledgement is a toast of the reply's text, only while a turn runs.
- **Delivers:** the probe's answers in `notes/mods-gotchas.md`, the heart shown mid-turn whenever cachebeat is on, following the beat state (decided), then the chosen acknowledgement, with tests and the README line.
- **Also delivers:** the desktop band's line kept through a turn (decided). The terminal turn line is unchanged.
- **Depends on:** step 3, which settles the command's words.
- **Bundles:** item 9 alone. It's small, and it doesn't wait on later steps.

### Step 3c: Claude reads what it needs (item 10)

- **Delivers:** `state`'s `only` and `context`, the first-read rule, `shadowed` in `set`'s answer, `folder`'s schema without the repeated descriptions, compact answers, the rewritten `state` description, tests, the README lines, and claude-tools.md.
- **Depends on:**
  - step 1 (`cacheNow`), and nothing later
  - nothing on dollars: the tokens-only step took the dollar sentences out of the description
  - open questions 1 and 2 of item 10
- **Not on the floor:** every call it makes (`$.session.usage({ breakdown: 'summary' })`, the `session.compact` hook, `e.agentId` on `tool.call`) is already used on 2.1.287, and the fields it reads are in 2.1.287's declarations. No floor move.
- **Why here and not with Status (step 6):** it needs nothing from steps 4–6. Those steps add their fields to its sections as they go (`session.coldGuard`, the resume seed in `cache`), and step 9's sweep checks them.
- **Bundles:** item 10 alone. Tool text is fixed for the session, so check the new description in a fresh one.

### Step 4: resume (item 2)

- **Delivers:** per-session store records, restore, seeding from the resume hint (the last read's time, and the size until the first response), the new resume line, README and Privacy.
- **Depends on:** step 3 (`keepUntil`), step 1 (cache state), and P8 (P2 and P3 are answered). No portal check: the directory is dropped.
- **Checks in the step:** R1 (item 2, Seeding).

### Step 5: the cold guard (item 4)

- **Delivers:** the probes G1–G5 first; then the `coldGuard`, `coldGuardTokens` and `coldGuardUnanswered` settings, the session override, the `prompt.submit` hook and its question, the origin allowlist, the timeout, the logs, the tool fields, and the README rows and line.
- **Depends on:** step 1 (state), step 4 (a resumed session's first message is the case that matters most), P8 (P5–P7 are answered), and the user's word on what's marked provisional in item 4. Not on step 2: the question speaks in tokens.

### Step 6: the Status page (item 5, provisional)

- **Delivers:** the pane's Status tab, and bare `/cachebeat` opening it.
- **Depends on:** steps 1–5 (everything it shows), and the look pass (item 5, "What steps 6 and 7 wait on"). The screenshots arrived.

### Step 7: CacheTax (item 7, provisional)

- **Delivers:** the counters in the session record, the CacheTax tab, `/cachebeat stats`, and README and Privacy.
- **Depends on:** step 2 (`ratiosOf`, for the Net), step 4 (the record), step 5 (asked and cold sends), step 6 (the tabbed pane), and the look pass. The screenshots arrived.
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
- **What it is:** bump `version`, do a full README pass (Features list, Commands table, Privacy), run `validate --strict` on the release branch, PR, and release notes. No portal validation: the directory is dropped.
- **Release notes** call out:
  - the reversed `/cachebeat <minutes>` (with "use `/cachebeat global 30` or the menu for the interval")
  - the cold guard, on by default: it asks before a cold send, and how to turn it off
  - that resumed sessions now keep on/off
- **Process:** notes/README.md, "Releasing, step by step".

## Alternatives considered

- **Sleep: detect a wake by comparing `performance.now()` (monotonic) with `$.clock.now()`,** and name it ("the computer slept"). It's more precise in wording, but `performance` isn't a `$` call, so the test kit can't fake it. Step timers fix the behavior without knowing why the time jumped.
- **Sleep: re-check from `refreshLine`.** It runs only while an animation ticks, and calling `schedule()` from it recurses through `refreshLine`.
- **A moving "cold for 2h 14m" in the turn line.** Nothing redraws the line while beats wait, so it would need a timer of its own for a cosmetic age. Status shows it live instead.
- **Dollars: `cost.usd` deltas only.** They can't price "re-cache avoided" or a cold send ahead of time, and a mid-turn beat's delta includes the turn. They were the idle-beat source in step 2, and went with the dollars (2026-11-14).
- **Keep-alive counted from the last message** (a per-session Stop after idle) instead of a fixed deadline. "1h 52m left" would reset on every message, and "keep alive for 2h, then go" reads as a deadline. The user chose the deadline.
- **A cold guard that drops the message and lets a second send through:** at any time until the cache is warm again (the first proposal), then within a window (**send again within**, the design until 2026-11-14). The user chose a question instead: one keypress, no resend, no window setting.
- **The cold guard's question in our own pane (`$.ui.open`)** instead of the engine's dialog. More to build and to get right on each surface. It's the fallback if G1 finds the engine's dialog can't be closed (item 4).
- **One shared `sessions` or `stats` store key.** Open sessions writing it lose each other's updates, even reading fresh first. It was the fallback had the directory flagged computed keys; with the directory dropped it isn't needed.
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
- **The cold guard** (as first decided on 2026-11-09, and changed on 2026-11-14; item 4 is the current design):
  - It's on by default.
  - Cold means the time since the last cache read is past the cache's lifetime (1h or 5m, as cachebeat reads it).
  - **It asks** (`Send` / `Don't send`). ~~A second send goes through only within **send again within**.~~ The window, its 2–5 minute default and its 1–15 minute custom range went with the resend (2026-11-14).
  - **chats from** (default 20k tokens, the same as Skip small chats) is the smallest chat it asks about.
  - **Remote Control messages are held too,** if the live check shows the question works there (the user, 2026-11-14; "Still open"). ~~Remote Control messages aren't held.~~
  - **If unanswered** (`coldGuardUnanswered`) says what an unanswered question does: don't send, or send after a timeout (the user, 2026-11-14). Its default, what "don't send" does over time, and its range are provisional (item 4).
  - It speaks in tokens, with no dollar floor.
- **Warm status:** nothing live exists to read. The plan says "likely warm" and shows the time left.
- **Dollars: none** (the user, 2026-11-14: tokens are the currency, and dollars are everywhere or nowhere; built in the tokens-only step):
  - no `≈$`, no `usd` field and no dollar wording in anything a user or Claude reads: the beat log, the turn line, the pane, the commands' answers, the tools, the README
  - the price table stays in `hooks/prices.ts` as `ratiosOf(model)`, for CacheTax's Net in input-token equivalents
- **CacheTax:** a tab beside Status in the `/cachebeat` page, opened by `/cachebeat stats`, kept 30 days.
- **Step 1 ships early,** as 0.9.3 (0.9.2 was taken).

## From cache-tax

[karanb192/cache-tax](https://github.com/karanb192/cache-tax) (MIT, 2.4.2, read 2026-11-14) is the mod the CacheTax page is named after. It warms on a window you arm (`/keepwarm 90m`, 50-minute pings) and asks before a cold send. What was proposed to the user from it; what they decided is under "Decided from it":

- **Ask, don't drop.** Its guard opens `$.ui.ask` with `Send anyway ($4.01)` and `Don't send`, and falls back to drop-once-then-resend only when the question is dismissed or nobody can answer (`-p`). One keypress instead of a resend, and no window setting. **Decided: item 4 now asks.** It may also be the answer for Remote Control, if a remote client can answer an ask (G4).
- **Who gets guarded.** It holds every origin a person may have sent (`bridge`, `sdk`, `channel`, `slack-ping`, `unclassified`) and lets through, with the price logged, the ones nobody could resend: `task-notification`, `scheduled-trigger`, `peer`, `peer-send-message`, `projects-relay`, `coordinator`, `observer`, `observer-activity`. Item 4 now asks about `composer`, and `bridge` if the live check passes; its table says what each other origin gets, and why it differs from this list (a question needs someone at the dialog; a drop-and-resend doesn't).
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

### Decided from it (the user, 2026-11-14)

Folded into item 4, and the directory and screenshot lines through the plan, on 2026-11-14.

- **The guard asks** (`Send` / `Don't send`) instead of dropping and waiting for a resend. So the window setting and the drop-then-resend bookkeeping go.
- **The guard talks in tokens,** not dollars, and so does the rest of 0.10.0: tokens are cachebeat's currency. No dollar floor: `coldGuardTokens` stays the only floor. Step 2's dollars were removed the same day (Decisions).
- **A new setting says what an unanswered question does:** drop the message, or send it after a timeout. `$.ui.ask` takes no timeout and only "rejects when dismissed, and in a `-p` run". Racing it against `$.clock.after` would send the message, but nothing in the declarations closes the dialog left open. Probe that first; if it can't be closed, the question has to be our own pane (`$.ui.open`), which we can close.
- **The README carries an Important note** above Features that `/cachebeat <time>` changed in 0.10.0 (added 2026-11-14). Say the same on top of the 0.10.0 release notes. Take the note out a release or two later.
- **No detection of other cache warmers.** A README line instead: don't run another keep-warm plugin beside cachebeat; two sets of beats and two guards behave unpredictably.
- **Claude Code's own resume estimate** is the classic `SessionStart` input on `resume`/`fork`: `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, `estimated_cache_write_usd` (declarations :11642–11664). That's the data, in tokens and dollars; no percent-of-limit figure exists, and no event for the "resume or start new" dialog itself was found. Item 2 (step 4) already reads these. That the dialog is drawn from the same fields is inferred.
- **The user's screenshots arrived** (`/usage` and `/stats`). `/usage` has a line `Prompt cache (main): 22 requests · 94% of input tokens from cache · no misses · warm (1h TTL, last activity 32s ago)`: Claude Code's own wording for what the Status tab shows. `/stats` is a heatmap by day over a row of totals, with `All time · Last 7 days · Last 30 days` as a range switch. No API for either's figures was found in the declarations.

## Still open

- **Built (2026-11-14, `step-request-start`, not yet merged): the cache counts from when a request was sent.** `s.lastWarm` is stamped with the clock read before `next(e)` in `turn.step` (once the answer carries usage) and before a beat's fork. A beat returns while another is on its way (the review found two forks at once after a long last answer). `turn.complete` stamps only a turn none of whose requests were seen, at the turn's start. The stamp never moves back. What each write and reader does, and the cases, are in mods-gotchas.md, "The lifetime counts from a request's start". It's in 0.9.2 and on the 0.9.3 branch too. The plugin commit touches only what the fix needs, so it can be carried there.
  - **Open, for the user:**
    - Wording: an answer that outlives the cache now ends with `beats wait for your next turn: the cache went cold (6m since it was last read)`, the same as any cold cache. It's true, but doesn't say the long answer was why. With **Cache gone cold** set to stop, the same answer switches cachebeat off.
    - "Idle": **Beat after idle**'s help ("How long you're idle before a beat"), `ABOUT.interval` ("Minutes idle before a beat") and the README's settings row now overstate the idle time by the last answer's length. Left as they are; the README's Good to know says the countdown runs from when a request was sent.
    - A turn cachebeat didn't see (loaded mid-turn) counts from its start. Past the lifetime, it reads cold though it's likely warm. On the one-hour cache that falls into `schedule()`'s silent `since >= MAX_TTL` wait, the same as `/cachebeat on` long after a turn, and never reaches the cold rule's message.
    - The beat due when a long request ends fires at once, mid-turn, while that request's tool starts. If the tool is quick, the turn's next request would have read the cache anyway.
- **The cold guard's provisional points** (item 4), for the user: the default of **if unanswered** (`drop`); whether `drop` should also close the question after a while; the 1–15 minute range; and `channel`, `slack-ping` and `unclassified` messages passing unasked.
- **Item 10's six questions** ("Open, for the user" there).
- **The look pass for Status and CacheTax** against the screenshots (item 5, "What steps 6 and 7 wait on"). The screenshots themselves arrived.
- **Holding a Remote Control message,** pending a live check in step 5. The user wants `bridge` prompts held like the composer's. What the docs say (the 2.1.319 declarations and code.claude.com/docs/en/plugins/mods/events, read 2026-11-14): `origin.kind === 'bridge'` is "the user's message through the Remote Control bridge (a phone or web client)"; `{ drop: reason }` is allowed for any origin and "the text is shown to the user as the reason". Nothing says where a remote client shows that reason, or whether the phone keeps the text to send again. `$.ui.ask` "rejects when dismissed, and in a `-p` run"; whether a remote client can answer one is not stated either. The check (G4 in item 4), now that the guard asks: from a phone, send to a cold session over `coldGuardTokens`, and note whether the question shows there, whether it can be answered there, and what `Don't send` leaves on the phone. If the question never reaches the phone, skip `bridge` and put a README line suggesting `/cachebeat` before sending from a remote session (check first that `/cachebeat` answers over Remote Control).
- **P1 and P8,** pending: P1 needs the machine suspended. P2–P7 are answered. Also not checked in step 0: a live `prompt_cache_likely_expired: true`, any origin but `composer`, and the desktop app.
  - **P8 is narrower than it was.** The declarations 2.1.287 writes (generated 2026-11-14 from the local 2.1.287 binary) carry `prompt.submit`, `$.ui.ask`, `$.session.id`, the origin kinds, and resume's four fields. All are optional in the types and nothing has *run* there: each step's tests on CI's 2.1.287 leg answer the rest.
- **The plugin directory is dropped** (2026-11-14: verified organizations only). The lines that required a portal check or cited the directory as a risk were removed or rewritten the same day (items 1, 2 and 4, steps 4 and 9, the per-step rules).
- **The session's cost rose with nothing running** (step 2's live check: `cost.usd` rose by +0.00202 while the session sat idle, with no beat and no turn). Unexplained. Nothing in cachebeat reads `cost.usd` since the dollars were removed, so it no longer affects any figure. The user's call (2026-11-14): leave it unless testing shows it again.
- ~~**`beat()` needs a `beating` guard.**~~ Fixed with the request-start fix: `beat()` returns while one is on its way, which also stops a manual `/cachebeat now` from sending a second fork beside a scheduled one (mods-gotchas.md, "The lifetime counts from a request's start").
