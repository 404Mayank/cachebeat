# 0.10.0: cache state, keep-alive time, resume, cold guard, dollars, CacheTax

Status: planned 2026-11-09, nothing built. Items 5 and 7 (the summary and CacheTax pages) are **provisional** until the user re-sends the reference screenshots: their content is settled here, their look isn't.

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

| # | Claim | Why it's believed | How to check |
| --- | --- | --- | --- |
| P1 | `$.clock.after` timers stop while the machine sleeps, while `$.clock.now()` jumps ahead | libuv and Bun time timers on the monotonic clock, which excludes suspend on Linux and macOS. The types say nothing about it. | A probe mod logs `$.clock.now()` from a 60s `$.clock.every`. Suspend for 3+ min (`systemctl suspend`, or close the lid), wake, and read the gaps in `~/.claude/debug/<session>.txt`. |
| P2 | After `--resume` / `--continue`, `$.session.id()` equals the id before exit | `SessionResume.id` is what `--resume` takes | The probe logs `$.session.id()` at `session.start` and `e.sessionId` at `session.end`. Exit, `claude --resume <id>`, compare. Same with `--continue`. |
| P3 | On `--resume`, `classic.SessionStart` (source `resume`) reaches the mod, before `session.start`, with `seconds_since_last_response` etc. set | mods-gotchas.md says it fires before the session is bound | The probe logs the hook order and the fields. Repeat on 2.1.287 (gotchas: "Testing an old version locally"). |
| P4 | `$.session.usage().cost.usd` grows by a fork's price | "every priced API response" | The probe reads `cost.usd` before and after `/cachebeat now` on an idle session. |
| P5 | A dropped prompt's text stays in the composer | Unknown either way | The probe drops every `composer` prompt that starts with `drop-me`. Does the text stay? Where does the reason draw? On desktop too. |
| P6 | Slash commands, `!` shell commands and prompt-type commands (skills, `/review`) do or don't raise `prompt.submit`, and with which `origin` | Unknown | The probe logs `e.origin.kind` and `e.text` on every `prompt.submit`. Type `/cachebeat`, `!ls`, a skill command and plain text. |
| P7 | The test kit can raise `prompt.submit` with `origin: { kind: 'composer' }` | `$.prompt.submit` from a test may stamp `plugin` | A test calls the event with an origin and checks what a hook sees. If the kit can't do it, the guard's tests need another route. Say so in that step. |
| P8 | `prompt.submit`, `$.session.id`, and the resume fields exist on 2.1.287 | Optional in the types | Run the probe under the 2.1.287 install. Or push a branch and let CI's 2.1.287 leg run the step's tests. |

## The design

### The shared cache state (built in step 1, read by items 1, 4, 5, 6 and 7)

One pure module, `hooks/cache.ts`, plus one reader in `register.tsx`. Everything that says "warm", "cold", "cold for 2h" or "$ to re-cache" reads it. Nothing else works this out.

```ts
// hooks/cache.ts
export type CacheFacts = {
  lastWarm: number | null       // wall ms: the last request of the main conversation that read or wrote the cache (s.lastWarm)
  source: 'request' | 'beat' | 'resume' | null // what set lastWarm
  ttl: Ttl                      // effective: '5m' when s.isCacheShort, else the read ttl
  contextTokens: number | null  // what the next request re-sends (chatSize)
  usdPerMTokWrite: number | null // the re-cache rate for this model and ttl (step 2; null until then)
}
export type CacheView = {
  state: 'warm' | 'cold' | 'unknown' // unknown: nothing cached yet in this conversation, and no resume hint
  lastWarm: number | null
  expiresAt: number | null       // lastWarm + ttl
  coldSince: number | null       // expiresAt, once now is past it
  ttl: Ttl
  contextTokens: number | null
  recacheUsd: number | null      // contextTokens × rate: what the next message pays to write it again (step 2)
}
export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
export function viewOf(f: CacheFacts, now: number): CacheView
```

- **`viewOf` is pure:** no `$`, tested directly. The `register.tsx` reader that gathers the facts is `async function cacheNow($)`, named once in the file, for the 2.1.287 loader. It reads `$.clock.now()`, `chatSize($)` and the module's `ttl` / `s`.
- **Warm or cold is by time,** as Claude Code judges it: `now < lastWarm + TTL_MS[ttl]`. The README and the tool text say "likely", and that each beat and turn confirms it.
- **It works with beating off.** `markWarm` (register.tsx:575) runs on every turn request and at `turn.complete`, whether beating is on or not. So the cold guard and the summary work in sessions where cachebeat doesn't beat. Keep it that way: don't gate `markWarm` on `s.enabled`.
- **A resume seeds it** (step 4): `lastWarm = now − seconds_since_last_response × 1000`, `source: 'resume'`.
- **`state` (the tool) gains a `cache` object** with the view's fields, `lastWarm` and `coldSince` as ages in minutes. The tool *text* is static (claude-tools.md), so the description lists the fields and the values go in results.

### Item 1: the sleep bug (step 1)

**Current behavior:**
- `schedule()` arms one `$.clock.after(ms)` for the whole interval (register.tsx:353) and records `s.nextAt = now + ms` in wall time (:352).
- If P1 holds, a sleep stops the timer while `now()` jumps. After waking, `nextAt` is in the past, and the timer still owes what was left of its wait.
- Three display sites clamp a past `nextAt`:
  - `refreshLine` (:215): `fmt()` (:63) floors at 1m, giving "next in 1m"
  - `stateOf` (:663): `in 1m`
  - bare `/cachebeat` (:838–843) and `turnOn` (:608–611): `Math.max(0, …)`, then `when(0)`, giving "beating now"
- When the late timer finally fires, `beat()` finds `since >= MAX_TTL` and **stops** cachebeat (:458).
- **The countdown has no clock of its own:** only the animation tickers redraw it (:231, :243). With both animations off, it never moves between schedules. That's a pre-existing gap the fix closes as a side effect.

**The cause,** found by reading the code and the bundle:
- `$.clock.now()` is `Date.now()`, confirmed in the bundle. `$.clock.after` is a plain `setTimeout`: P1 is the inferred part.
- After waking, `at − now < 0`, and the tickers' `refreshLine` redraws "1m" every second until the timer has run out the rest of its awake wait.
- A real repeating "next in 1m" also comes from the RETRY loop (:497–500) while the network is down after waking. That one is truthful and stays.

**The design:** the wall-clock deadline is the authority, never a timer having fired. That's correct whether P1 holds or not.

- **Wait in steps.** `schedule()` stops arming one long timer. It calls `armStep($)`, which waits `min(STEP, s.nextAt − now)` with `STEP = 60_000`.
  - Each step calls `async function wallCheck($)`:
    - reads `now`
    - if `now >= s.nextAt`, runs `scheduledBeat($)`
    - otherwise calls `refreshLine($)` and arms the next step
  - The RETRY path (:497–500) sets `s.nextAt = now + RETRY` and calls `armStep($)` too, so there's one way to wait.
  - A sleep then costs at most one step past waking.
  - Keep the `scheduling` call counter (:332, :350, :357): only the newest `schedule()` call may arm. `armStep` writes the same `timer` variable `schedule()` and the RETRY path cancel.
  - `wallCheck` never calls `schedule()` except through `beat()`, so `refreshLine` → `schedule` → `refreshLine` can't recurse.
- **An expired cache waits by default (the user's decision), and a new setting chooses** (see "The **When the cache expired** setting" below).
  - In `beat()`, before the fork, the cache counts as **expired** when either:
    - `since >= MAX_TTL`, today's check at :458, or
    - the beat is late (`since > idle() + 2 * STEP`, which only a suspended or stalled process causes) and `since >= TTL_MS[effective ttl]`. This catches a 5-minute cache that a 10-minute sleep let lapse. Without it, the beat would write the whole cache again and then stop as "not served".
  - Expired with `cfg.onExpired === 'wait'`: `pause($, EXPIRED, …)` with `const EXPIRED = 'the cache expired'`. The log: `beats wait for your next turn: the cache expired (2h 14m since it was last read)`.
  - Expired with `'stop'`: `stop($, …)`, as now, with today's message.
  - A late beat whose cache is still inside the TTL beats as usual: a short sleep still beats in time to help.
- **The expired line.** `refreshLine` gets a branch for `s.enabled && s.paused === EXPIRED`: `♡ cache expired 2h 14m ago · beats start again on your next message`. It reads `cacheNow($)`, so the age moves each step.
- **One overdue wording everywhere.** Add one pure helper in register.tsx; it owns the word "in":

  ```ts
  const untilNext = (ms: number) => (ms <= 0 ? 'due now' : `in ${fmt(ms)}`)
  ```

  Every "next" text goes through it, and no caller writes "in" itself:
  - `statusText` (pane.tsx:70–77) takes `next` as `untilNext`'s whole result. Its templates become `♡ next beat ${next}` and `· next ${next}`.
    - The settings preview's sample call (pane.tsx:90) passes `'in 42m'` in place of `'42m'`.
    - `refreshLine` (:215) passes `untilNext(at - now)`.
  - `when()` (:564–567) returns `` `next beat ${untilNext(ms)}` `` for a number, so `ms === 0` reads `next beat due now`. Today it's `beating now`. Bare `/cachebeat` (:836–843) and `turnOn` (:608–611) both get it through `when()`.
  - `stateOf` (:663): `nextBeat: untilNext(s.nextAt - now)`, so `in 42m` as today, or `due now`. Add `due now` to the `nextBeat` values listed in the `state` description (tools.ts:84).

  `fmt()` itself is unchanged: it formats intervals, and `every()` uses it. A past deadline lasts at most one step.
- **`stopAfterHours` is checked in `beat()`** (:457), before the expiry check. A long sleep past it still stops cachebeat at the first step after waking. That's unchanged and correct.

**The When the cache expired setting**

- **Key:** `onExpired: 'wait' | 'stop'`, default `'wait'`. It's in `BeatSettings` (types/index.d.ts) and `DEFAULTS` (settings.ts:4).
- **Row:** on the Limits tab, right after **Stop after idle** (settings.ts:287):

  ```ts
  { key: 'onExpired', label: 'Cache expired', values: ['wait', 'stop'],
    fmt: v => (v === 'wait' ? 'start on your next message' : 'stop'),
    help: 'If the cache expires before a beat reaches it, as when your computer sleeps: wait and start beating again on your next message, or stop.' },
  ```

- **Validation:**
  - `accept()` takes it through the row's `values`, with nothing to add.
  - In `normalize()`, add `if (!['wait', 'stop'].includes(out.onExpired)) out.onExpired = DEFAULTS.onExpired`, as `onModelSwitch` has at :79.
- **Tool:**
  - The schema comes from the row by itself (`kinds()`, an enum).
  - `ABOUT.onExpired` (tools.ts:10, a `Record` over every key, so `tsc` refuses a missing one): `'If the cache expires before a beat reaches it (the computer slept, or retries ran past its lifetime): wait, and beat again after the user\'s next message, or stop beating.'`
  - `state` needs no new field: `settings.onExpired` is there, and `session.paused` reads `the cache expired`.
  - Add `the cache expired` to `state`'s `paused` examples (tools.ts:88).
- **Where else `since >= MAX_TTL` is reached, beyond sleep,** since the setting applies there too:
  - **Retries running past the hour.** Transient errors retried every minute (:497) until the cache lapses. Today they stop; with `wait`, they pause.
  - **`/cachebeat now` on a cache that has already expired.** `beatNow` (:558) goes into `beat()`, which today *switches cachebeat off*. With `wait`, it says the cache expired and beats start again after the next message. That's better for a command the user typed.
  - **A stalled process** (a debugger, `SIGSTOP`): the same as sleep.
- **What it doesn't cover:**
  - "**the cache was not served**" (:528–537), where a beat found the cache gone and wrote it again. That's evidence the TTL is shorter than cachebeat thought, not an expiry, and it keeps its own handling (stop, or switch `auto` to 4m).
  - `nothing-to-fork` (:492) stays a stop.
- **It changes documented behavior.** README "When it stops on its own" lists "the cache is already gone, so there's nothing left to keep warm". That bullet covers both :458 and :492.
  - Split it: keep "there's nothing to keep warm (no conversation to send)" for :492.
  - Add under the list: `If the cache expires before a beat reaches it, as when your computer sleeps, beats wait and start again on your next message. Set **Cache expired** to stop to have it turn off instead.`
  - The Limits table gets the row: `Cache expired | If the cache expires before a beat reaches it (say, your computer slept): wait and start again on your next message, or stop | start on your next message`.
  - **Release notes:** a changed default. An expired cache used to switch cachebeat off; now it waits for your next message.

**Tests** (`hooks/cachebeat.test.tsx`):
- **Simulating suspend.** Add `skew` to `World`, and a `clock.now` hook in `setup()` that adds it: `on('clock.now', async ($, e, next) => { const r = await next(e); return { value: r.value + skew } })`. **Check the hook order first.** If `mock.clock` answers `clock.now` without calling `next` above the test's hook, register the skew hook before `mock.clock(on)`. Moving `skew` forward without `clock.advance` is a sleep: wall time jumps, and no timer fires.
- **The hook's result shape:** check whether the kit's `clock.now` resolves `{ value }` or a bare number beneath a hook (sonnetcache1 flagged it). Read what `next(e)` gives and pass it on in the same shape.
- **Tests to add:**
  - On, 10m after a turn, sleep 2h, `advance(STEP)`. No fork. The line reads `cache expired 2h … ago`. `state.session.paused` is `the cache expired`. `enabled` is still true.
  - The same with `onExpired: 'stop'`: off, with today's message.
  - A 5-minute cache (`env: { FORCE_PROMPT_CACHING_5M: '1' }`), sleep 10m: expired, with no fork. Before the fix, it forked and stopped as "not served".
  - Sleep 20m inside a 1h TTL with the beat due at 50m (sleep at 45m). Within one step of waking, a beat forks.
  - After the expired pause, a turn resumes beats at the normal interval.
  - `/cachebeat now` 2h after the last turn: with `wait`, it pauses and stays on; with `stop`, it goes off.
  - Transient errors retried past the hour: `wait` pauses and `stop` stops.
  - Sleep past `stopAfterHours`: stops with the existing message, under either value.
  - Overdue wording: with `nextAt` in the past (skewed by 30s), the line, `state.session.nextBeat` and bare `/cachebeat` all say `due now`.
  - With both animations off, the countdown moves each `STEP` (the line text changes from `next in 50m` to `next in 49m`).
  - `normalize()` replaces a bad `onExpired` with the default, and the menu's custom-free row flips in place (`isFlip`).
  - The existing "commands and turns arriving together" race test still passes with step timers.
- **Gotcha:** with steps, `clock.advance(IDLE)` resolves about 50 step timers. Tests that count logs or forks are unaffected. A test that counts `clock.after` dispatches would need updating (none does today; check with `grep -n "clock.after" hooks/cachebeat.test.tsx`).

**README:** nothing new under Features. "When it stops on its own" and the Limits table change as "The **When the cache expired** setting" says.

**Risk:** `$.clock.after` at 60s steps is one host dispatch a minute while armed. That's negligible next to the 80ms animation tickers.

### Item 6: dollars (step 2)

**What the API offers:** see "Facts". There's no per-request dollar figure. The engine prices a re-cache at a switch or resume, and keeps a session total.

**The design** depends on P4.

- **A price table, `hooks/prices.ts` (pure).**
  - Base input $/MTok and output $/MTok per model family, matched on the model id from `TurnUsage.model` or `$.session.model()`.
  - Cache rates as multipliers of input: read 0.1×, 5-minute write 1.25×, 1-hour write 2×.
  - Fill and check every number from the `claude-api` skill at build time (it has current pricing), and write the date checked in a comment.
  - An unknown model gives `null`: everything shows tokens only, never a guessed price.
  - `export function priceOf(u: ModelUsage, model: string, ttl: Ttl): number | null`, and `export function writeRate(model: string, ttl: Ttl): number | null` in $/token.
- **The engine's own figure wins when it has one.**
  - When `classic.PostModelSwitch` or resume `classic.SessionStart` gives `estimated_cache_write_usd` and `context_tokens > 0`, keep `rate = usd / context_tokens` for that model in a module variable for the session.
  - It reflects a managed `modelPricing` when one is set (`pricing: 'configured'`), which the table can't know.
  - Don't persist it: it's cheap to relearn, and a store write per switch isn't worth it.
- **If P4 holds** (forks enter `cost.usd`), an idle beat's actual cost is the `cost.usd` delta around the fork. Use it for idle beats only: mid-turn, the turn's own requests land in the same delta. Otherwise use `priceOf` on the fork's usage. Either way, `s.lastUsd` is the last beat's cost.
- **What gets dollars:**
  - `CacheView.recacheUsd`: `contextTokens × writeRate`, for the summary, the cold guard and `state`.
  - The beat log line: `♥ cache renewed (184,212 read, 12 written · ≈$0.02)`.
  - `state.session.lastBeatUsd`.
  - The CacheTax totals (step 7).
  - **Not the turn line:** it's already tight. Open question Q6.
- **Wording:** every figure is `≈$0.69`, and the first use on a page says "at API prices".
  - **On a subscription** (`rateLimits.length > 0`), the summary and CacheTax add one dim line: "Your plan doesn't bill per token: these are what the same requests cost on the API, to compare." Open question Q5.

**Tests:**
- `priceOf` and `writeRate` for a known model at both TTLs, and `null` for an unknown one.
- A `PostModelSwitch` with `estimated_cache_write_usd` overrides the table's rate for that model.
- The beat log line carries `≈$`.
- `state.cache.recacheUsd` is null for an unknown model.

**README:** a short paragraph under "What it sends, and what it costs" on how dollar figures are estimated: API list prices, or your organization's configured pricing when Claude Code reports it, and notional on a subscription.

### Item 3: `/cachebeat <time>` keeps the cache warm for that long (step 3)

**Current behavior:**
- `/cachebeat 30` sets a session interval (`s.idle`, register.tsx:827–831) and turns beating on.
- The same shape appears in the tool's `session.intervalMinutes` (tools.ts:108–111, parse :145–148, "turns beating on" :178).
- It also appears in the pane's `· this session` marker on **Beat after idle** (pane.tsx:210–229, `dropSession` register.tsx:1123).
- claude-tools.md records the decision "A session interval turns beating on". This step reverses it; record that there.

**The design** (open question Q2 has the alternatives):

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
- `$.store` key `` `session:${id}` ``, value `{ v: 1, at, enabled, keepUntil, beats }`. `at` is the wall time of the last write.
- Write it in `save()` only when `enabled`, `keepUntil` or `beats` changed since the last write. Track the last written triple in a module variable.
- **Never write in `session.end`.** Exits run under a 1.5s bound for the whole chain (`index.d.ts:11045`).
- **Prune** at `session.start`: `$.store.keys()`, drop `session:*` older than 30 days.
- **Risk:** a computed key in a `$` call's argument hasn't been through the directory scan. A template literal isn't a cast, so it should pass. Validate the step's branch in the portal (`404Mayank/cachebeat@<branch>`) before building on it. If it's flagged, fall back to one `sessions` key read fresh before each write, as `saveOwn` does (register.tsx:139), and accept the rare lost update.

**The flow:**
- **`classic.SessionStart`, `source: 'resume'`:**
  - Stash `{ id: e.session_id, secondsSince, likelyExpired, contextTokens, usd }` in a module variable `resumeHint`.
  - Its fields are optional in the types, and may be absent on 2.1.287 (P8). Absent fields mean the cache state stays `unknown`, and the guard doesn't hold.
- **`--resume` / `--continue`, at `session.start` with messages present:**
  1. Read `` `session:${await $.session.id()}` ``. If there's a record, `s = { ...fresh, enabled, keepUntil, beats }`. Otherwise keep today's `cfg.defaultOn`.
  2. Apply `resumeHint` if its id matches. P3 decides whether it's there yet. If `classic.SessionStart` comes *after* `session.start`, apply it there instead, with the same function.
  3. Then `pause($, RESUMED, …)` as now.
  - A keep-alive whose deadline has passed comes back off.
- **`/resume`:** the same, from the `classic.SessionStart` hook, which runs after `anotherConversation`. Use `e.session_id`: `$.session.id()` may not be bound yet there.
- **Seeding:** `s.lastWarm = now − secondsSince × 1000` sets `source: 'resume'`. Use `estimated_cache_write_usd / context_tokens` as the session's write rate (step 2's override).
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
- **Raising the resume hook in a test:** `$.classic.SessionStart({ source: 'resume', session_id: 's1', seconds_since_last_response: 7200, … } as never)`. The cast is in the test, not in a `$` call of the plugin, so it's fine.

**README:**
- Rewrite the "A resumed conversation…" bullet (README:261): `A resumed conversation (claude --resume, --continue, or /resume) picks up as you left it: on or off, and any time you gave it. Beats start after your next message, since nothing of it is cached in this session yet, and the turn line says whether the cache is likely still warm.`
- Privacy: settings and **each session's on/off, time left and beat count, by session id, for 30 days**.
- Close the "Still open" `--resume` item in plan-0.8.0.md, with what P2 found.

### Item 4: the cold guard (step 5)

**The design** (open question Q3 has the defaults):

- **Setting:** a new `BeatSettings` key `coldGuard: boolean` on the **Limits** tab, for all folders and this folder through the existing scopes. A session override `s.guard: boolean | null` (null follows the setting) comes from `/cachebeat guard on|off` and the tool's `session.coldGuard`.
  - The pane's **Cold guard** row shows `on · this session` when the session overrides it, and `r` drops the override. That's the same pattern the session interval marker used before step 3 removed it.
- **The hook:** `on('prompt.submit', async ($, e, next) => …)`, with no `.catch`, so a failure lets the prompt through. It holds the prompt only when **all** of these hold:
  1. The guard applies here (`s.guard ?? cfg.coldGuard`).
  2. `e.origin.kind === 'composer'`. Not `plugin`, `sdk`, `peer` or a scheduled trigger: none of those is someone who can send again. `bridge` is open question Q3.
  3. `e.turnId === undefined` and `!busy`. Mid-turn, the cache is being read anyway.
  4. P6 decides whether slash and `!` commands reach this hook at all. If they do, skip text starting with `/` or `!`. If they don't, add no check: no handling for a case that can't happen.
  5. `cacheNow($).state === 'cold'`. `unknown` (a new conversation, or a resume without a hint) never holds.
  6. `contextTokens >= COLD_MIN`, 20,000. Smaller re-caches are cheap.
  7. The guard isn't armed for this cold stretch.
- **The first send** returns, without `next`: `{ drop: 'cachebeat: the cache has been cold for 2h 14m, so this message re-caches 184k tokens (≈$0.69 at API prices). Send again to go ahead.' }`. It sets `coldArmed = s.lastWarm`, a module variable, so the arm is tied to this cold stretch.
- **The second send** (any text, any time while `coldArmed === s.lastWarm`) calls `next(e)` and warns: `$.ui.log('sent on a cold cache: cold for 2h 14m, about 184k tokens written again')`. P5's check also shows where a log during `prompt.submit` lands. If it lands badly, use a toast.
- **Any turn that warms the cache** (`markWarm`) changes `s.lastWarm`, which disarms it. No timer.
- **Counting** for step 7: a held send, and a cold send, with its tokens and dollars.

**If P5 shows the dropped text is lost,** holding a typed message is unacceptable. Use `$.ui.ask` in the hook instead: `Cache cold for 2h 14m: re-cache 184k tokens (≈$0.69)?` with `Send` and `Don't send`. `Send` calls `next(e)`, anything else drops. One extra keypress, and nothing is lost. Ask the user before switching (Q3).

**Risks:**
- **The directory will likely flag a hook that refuses user prompts** (the policy-hold class of `DENIES_PERMISSION`, notes/directory.md). Plan a README line under "What it sends": `With Cold guard on, cachebeat holds back your first message to a session whose cache has gone cold, says what sending it will cost, and lets the next one through.` Validate the branch in the portal before merging to `main`.
- **2.1.287:** P8.
- **The guard runs with beating off** (see the shared state). That's by design: the guard is about the cache, not about beats.

**Function names:** `guardColdSend($, e)` for the hook body, if it's pulled out.

**Tests** (P7 decides how the event is raised):
- Cold and big: the first send is dropped with the age and size, the second goes through with the warning.
- Warm: goes through.
- `unknown`: goes through.
- Under `COLD_MIN`: goes through.
- `origin` `plugin`: goes through.
- Mid-turn (`turnId` set): goes through.
- Guard off globally, on for the session: holds. And the reverse.
- After a held send, a turn warms the cache, then it goes cold again: holds again (the arm was tied to the old stretch).
- Resumed with `seconds_since_last_response` past the TTL: holds the first message.

**README:** the Limits table row `Cold guard | Holds your first message to a session whose cache has gone cold, and tells you how long it's been cold and what sending will cost. Send again to go ahead. | <default from Q3>`, plus the directory line above, plus `/cachebeat guard on|off` in the Commands table.

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
- **Writes:** the record is written at most once per beat or turn end, through the same changed-only write as step 4. Retention is the same 30 days, by the record's `at`. Open question Q7.
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
- **Each step keeps CI's 2.1.287 leg green.** A new API that fails there either moves the floor (README badge :12 and Requirements :31, CI matrix `.github/workflows/ci.yml:20`) or gets dropped. Ask the user before moving the floor.

### Step 0: the live checks (P1–P8)

- **Delivers:** a notes section, "0.10.0 probes", in `notes/mods-gotchas.md` with each answer, and this plan updated where an answer changes a design.
- **Depends on:** nothing.
- **Bundles:** checks only, no shipped code.
- **How:** a scratch probe mod outside the repo (`claude --plugin-dir <probe>`), driven in tmux as mods-gotchas.md "/rewind" describes. P1 needs the user to suspend the machine.
- **Why first:** P5 can change the cold guard's whole shape, P2 and P3 the resume design, and P4 the dollar source.

### Step 1: cache state and the sleep fix (shared piece, item 1)

- **Delivers:**
  - `hooks/cache.ts`, `cacheNow($)` and `state.cache`
  - step timers (`armStep`, `wallCheck`), the RETRY path included
  - the expiry check and the `onExpired` setting (row, `normalize`, `ABOUT`)
  - the expired turn line
  - `untilNext` at all four display sites
  - README "When it stops on its own" and the Limits row
- **Depends on:** step 0's P1 for the explanation only. The design is right either way.
- **Bundles:** the shared piece with item 1, since the fix needs "cold for" and the shared piece needs a consumer to test against.
- **Release:** this can ship alone as **0.9.2**, a bug fix. Open question Q8.

### Step 2: dollars (item 6)

- **Delivers:** `hooks/prices.ts`, the rate override from engine estimates, `recacheUsd`, the `≈$` beat log, `state.session.lastBeatUsd`, and the README cost paragraph.
- **Depends on:** step 1 (`CacheView`) and P4.
- **Bundles:** item 6 alone.

### Step 3: the keep-alive time (item 3, with Stop after idle's text)

- **Delivers:** everything in item 3's touch list.
- **Depends on:** step 1 (`wallCheck` carries the deadline).
- **Bundles:** item 3 with the **Stop after idle** wording, since they define each other.
- **Riskiest step for regressions:** it removes the session interval across four files.

### Step 4: resume (item 2)

- **Delivers:** per-session store records, restore, seeding from the resume hint, the new resume line, README and Privacy.
- **Depends on:** step 3 (`keepUntil`), step 1 (cache state), P2, P3, P8, and the portal check on computed store keys.

### Step 5: the cold guard (item 4)

- **Delivers:** the `coldGuard` setting and session override, the `prompt.submit` hook, the arm, the warning, the tool fields, and the README rows and directory line.
- **Depends on:** step 1 (state), step 2 (the `≈$` in the message), step 4 (a resumed session's first message is the case that matters most), and P5–P7.

### Step 6: the Status page (item 5, provisional)

- **Delivers:** the pane's Status tab, and bare `/cachebeat` opening it.
- **Depends on:** steps 1–5 (everything it shows) and the screenshots.

### Step 7: CacheTax (item 7, provisional)

- **Delivers:** the counters in the session record, the CacheTax tab, `/cachebeat stats`, and README and Privacy.
- **Depends on:** step 2 (dollars), step 4 (the record), step 5 (held and cold sends), step 6 (the tabbed pane), and the screenshots.
- **Bundles:** collection with display, since neither is testable without the other.

### Step 8: the demo GIF (item 8)

- **Depends on:** steps 1–7.

### Step 9: release 0.10.0

- **What it is:** bump `version`, do a full README pass (Features list, Commands table, Privacy), validate the release branch in the portal (the cold guard and computed store keys are new to the scan), PR, and release notes.
- **Release notes** call out:
  - the reversed `/cachebeat <minutes>` (with "use `/cachebeat global 30` or the menu for the interval")
  - an expired cache now waits for your next message instead of switching cachebeat off (**Cache expired**)
  - the cold guard's default
  - that resumed sessions now keep on/off
- **Process:** notes/README.md, "Releasing, step by step".

## Alternatives considered

- **Sleep: detect a wake by comparing `performance.now()` (monotonic) with `$.clock.now()`,** and name it ("the computer slept"). It's more precise in wording, but `performance` isn't a `$` call, so the test kit can't fake it. Step timers fix the behavior without knowing why the time jumped.
- **Sleep: re-check from `refreshLine`.** It runs only while an animation ticks, and calling `schedule()` from it recurses through `refreshLine`.
- **Dollars: `cost.usd` deltas only.** They can't price "re-cache avoided" or a cold send ahead of time, and a mid-turn beat's delta includes the turn. They're kept as the idle-beat source if P4 holds.
- **Keep-alive counted from the last message** (a per-session Stop after idle) instead of a fixed deadline. It's more useful for someone who comes back and keeps working, but "1h 52m left" would reset on every message, and "keep alive for 2h, then go" reads as a deadline. It's Q2's alternative.
- **The cold guard as a confirm dialog (`$.ui.ask`).** It's kinder if dropped text is lost (P5), but it's not what the user asked for. It's the fallback.
- **One shared `sessions` or `stats` store key.** Open sessions writing it lose each other's updates, even reading fresh first. It's the fallback only if the portal flags computed keys.
- **Separate panes for Status and CacheTax.** They would duplicate the pane's focus, desktop and Esc handling, which took 0.7.x to get right.

## Open questions for the user

Each has a recommended answer.

- **Q1. Decided by the user:** an expired cache waits by default, and **Cache expired** (`onExpired`) can be set to stop. One thing left to confirm: the setting also covers `/cachebeat now` on an expired cache and retries that run past the hour, not only sleep. **Recommended: yes**, one rule for one condition.
- **Q2. What does `/cachebeat 2h` mean, and what happens to the interval commands?**
  - **Recommended:**
    - It's a fixed deadline: warm until 2h from now, then off. Stop after idle doesn't apply meanwhile.
    - A unit is required (`30m`, `2h`, `1h30m`), from 5m to 48h.
    - A bare `/cachebeat 30` changes nothing and explains the change.
    - The per-session interval goes away entirely (the command, the tool, the menu marker).
    - `global` / `local <minutes>` keep setting **Beat after idle**.
  - **Alternative:** "2h of idle", counted from your last message, like a per-session Stop after idle.
- **Q3. Cold guard defaults.**
  - **On by default:**
    - **Recommended: on** for all folders. It's the case cachebeat exists for, and the held message says how to turn it off.
    - Off is the conservative choice for the directory review and for existing users.
  - **"Cold":**
    - **Recommended:** time since the last cache read is past the cache's lifetime (1h or 5m, as cachebeat reads it).
    - Only for chats of 20k tokens or more.
  - **The second send:**
    - **Recommended:** any message, any time, until the cache is warm again. No timer.
  - **Remote Control (phone) messages:**
    - **Recommended: not held** until checked, since we don't know how the reason shows there.
  - **If a held message's text is lost** from the prompt (to be checked):
    - **Recommended:** ask instead, in a Send / Don't send dialog.
- **Q4. Warm status from `/usage`.**
  - **The answer:** there's nothing live to read. Claude Code infers it from time since the last response, as cachebeat does. The only proof comes after a request, which cachebeat already records.
  - **Recommended:** say "likely warm" and show the time left. No change is needed beyond the wording.
- **Q5. Dollars on a subscription.**
  - **Recommended:** show them as `≈$` at API prices everywhere, with one dim line on the Status and CacheTax pages saying your plan doesn't bill per token.
  - The alternative is hiding dollars on a subscription and showing tokens only.
- **Q6. Dollars in the turn line?**
  - **Recommended: no.** It's long already. Dollars go in the beat log line, Status, CacheTax and Claude's `state`.
- **Q7. CacheTax: where, and how long kept?**
  - **Recommended:** a tab beside Status in the `/cachebeat` page (`/cachebeat stats` opens it), kept 30 days.
  - The alternative is a text answer from `/cachebeat stats` with no page.
- **Q8. Ship the sleep fix early as 0.9.2?**
  - **Recommended: yes.** It's a bug users hit now, and it's independent of the rest.
- **Q9. The screenshots** for the Status and CacheTax pages. Both designs here are provisional until they come.
- **Q10. One word for one condition: "expired" or "cold"?** This plan shows users one state (time since the last cache read is past its lifetime) under two words:
  - "cache expired 2h ago" on the turn line, with **Cache expired** as the setting
  - "cold for 2h 14m" in the guard's message and on Status, with **Cold guard** as the setting

  Both words came from the user. 0.8.0 set out to fix "five names for two scopes", so this should be settled before step 1.
  - **Recommended: "cold" in all visible text.** It's shorter, pairs with "warm", and the guard is already named for it. The setting becomes **Cache gone cold** (`onCold`), and the turn line reads `♡ cache cold for 2h 14m · beats start again on your next message`.
  - "Expired" stays only in the README's explanation of why ("the cache's lifetime ran out").

## Still open

- **The look of Status and CacheTax,** pending the screenshots.
- **P1–P8,** pending step 0.
- **Whether computed `$.store` keys pass the directory scan,** pending a branch validation in step 4.
