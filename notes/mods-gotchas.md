# Mods: gotchas

Things about mods, the engine and the test kit that took time to work out. These held on Claude Code 2.1.294.

## The engine

- **Tool text is fixed for the session.** Edits hot-reload the module, so the new `tool.call` handler runs right away. The description and schema the model sees stay as the tools were first registered, even across `/reload-plugins`. To see new tool text, start a new session (`claude --plugin-dir .`).
- **The input schema isn't enforced.** A model call with `intervalMinutes: 90`, over the schema's `maximum: 55`, still reached our handler. Validate everything yourself; that's what `parseSet` is for.
- **A plugin tool skips the permission path.** `classic.PreToolUse` and `tool.check` sit beneath `tool.call`'s `next`, and a plugin answering its own tool never calls `next`. The test "the tools answer without the permission path beneath them" shows this against a live deny-everything hook.
- **The countdown already starts from the last turn.** `schedule()` waits the interval minus the time since the cache was last read (`s.lastWarm`, set at `turn.complete` and after each beat), so `/cachebeat on` a minute after a turn says 49m. It's easy to think it counts from the command.
- **`/cachebeat` is registered `immediate: true`,** so it answers even while a turn runs, and its `command.run` hook mustn't assume the turn's state.

## The prompt cache

- **How Claude Code picks the main conversation's cache lifetime** (code.claude.com/docs/en/prompt-caching, "Which TTL each request gets" and "Choose the TTL yourself"). The first match wins:
  1. `FORCE_PROMPT_CACHING_5M=1`.
  2. `CLAUDE_CODE_PROMPT_CACHE_TTL`.
  3. The `promptCacheTtl` setting.
  4. `ENABLE_PROMPT_CACHING_1H=1`.
  5. The default: one hour on a subscription within its plan's usage, five minutes on usage credits, an API key or a cloud provider.

  `cacheTtl()` in `register.tsx` reads each input:
  - the variables through `$.env.get`
  - the setting through `$.settings.read()`, whose `Settings` type is open, so the key is there
  - the subscription through `$.session.usage().rateLimits`, which the types call "empty off a subscription". A window at 100% or more means usage credits.
- **The docs name gaps the rules can't see:**
  - a custom gateway that drops the one-hour beta header
  - the Claude apps gateway, which has no one-hour TTL
  - Bedrock, which varies by model

  That's why, under `auto`, a beat that finds the cache gone before an hour switches the session to 4-minute beats rather than stopping. The beat that found it gone wrote it afresh.
- **The engine knows the lifetime but doesn't hand it to mods,** except as `cache_ttl` in the `classic.PreModelSwitch` and `classic.PostModelSwitch` inputs.
- **Three different things are called a fork:**
  - The "forks" in the docs' five-minute bucket are forked subagents (`/subtask`, or `/fork` with agent view off). They're subagents that inherit the conversation.
  - `/fork` with agent view on copies the session into a background session.
  - `$.model.fork`, which a beat uses, re-sends the main thread's last request with only its own tail uncached.

  The docs don't say which bucket `$.model.fork` falls in. The user has seen two or more beats chain at 50 minutes on a subscription, so a beat keeps the one-hour entry alive.
- **A beat always goes to the current model.** `$.model.fork`'s doc says the prefix is "billed afresh … after `/model`". After a switch, the old model's cache is out of reach and the new one has none, so "keep warming the old model" can't exist. The option is to wait (the default) or to warm the new model, which costs the same full write the next turn would make.
- **After `/model` or a compaction, the cached prefix a beat would warm is no use to the next turn.** Each model has its own cache, and compaction replaces the history. So beats wait for the next turn: `classic.PostModelSwitch` (setting `onModelSwitch`) and `session.compact` (main thread, not `precompute`, not skipped).

## Timing and events (found live, 0.7.0)

- **`schedule()` used to arm two timers.** It cancelled the old timer, awaited (the 0.7.0 cache-lifetime read made the gap longer), then armed a new one. Two overlapping calls each armed one, and the leaked timer fired through a pause. Seen live as two beats in one minute, and a beat firing after "beats wait". Now a call counter lets only the newest call arm.
- **The test kit's engine has no `ui.close`,** so a test can't press Esc on a pane.
- **The test kit runs dispatches one at a time,** so it can't reproduce that race. The test "commands and turns arriving together" passes with or without the guard. The live rerun is the evidence: no minute with two beats.
- **`/model` raises `classic.PostModelSwitch` before the engine applies the switch** (`send set_model` comes after it in the debug log), and no `turn.complete` follows. So `$.session.model()` inside that hook may still be the old model. That's why the model is checked again when the beat fires.
- **`turn.complete` without `usage` sent no request.** Only a turn with `usage` warms the cache. cachebeat records `$.session.model()` there and compares it when a beat fires, so a model change is caught whatever events arrive.
- **Timers stop while the machine sleeps, and `$.clock.now()` doesn't (found 0.9.2; the timer half is inferred, not probed).**
  - In the claude bundle (2.1.294), `clock.now` answers `Date.now()`, and `clock.sleep`/`after`/`every` all wait through one helper that is a plain `setTimeout` (`every` re-asks one wait per period). The docs say nothing about suspend and the API has no suspend or wake event.
  - That `setTimeout` stops while the machine is suspended is inferred from Bun on Linux timing timers on the monotonic clock. It fits the symptom: after waking, the turn line sat on "next in 1m" for what was left of the wait. Step 0's probe P1 still owes the live check.
  - The cause was `s.nextAt` (wall time) paired with one long timer (monotonic): after a sleep `nextAt - now` is negative, and `fmt()` floors at 1m. The tickers redrew "1m" every second, and `beat()` finally ran at the end of the old wait.
  - So a beat waits in `STEP` (60s) pieces and the wall clock decides when it's due (`armStep`, `wallCheck`). A sleep costs one step, whether P1 holds or not.
  - Only the animation tickers redrew the countdown before. With both animations off it never moved between schedules; the steps redraw it now.
  - A real repeating "next in 1m" still comes from the RETRY loop while the network is down after waking. That one is truthful.
- **A cache that lapsed before a beat reached it is "cold", and waits (0.9.2).** Before, `beat()` stopped cachebeat for `since >= MAX_TTL`, which sleep, long retries and `/cachebeat now` all reach. A 5-minute cache that a 10-minute sleep let lapse used to get a beat that wrote the whole cache afresh and then stopped as "not served". Now a cache past its lifetime is cold when the beat is *late* (`since > idle() + 2 * STEP`) or when the interval is shorter than the lifetime (an on-time beat came before it lapsed). Only an on-time beat on an interval as long as the lifetime or longer keeps the "not served" handling, which the test "a beat on time for an interval past the cache's lifetime" pins.
  - The late mark alone missed a 5-minute cache on `auto`: its interval is 4m, so a beat counted as late only from 6m while the cache was cold from 5m. A retry at 5m (or a 90-second sleep) forked it, wrote it afresh and stopped as "not served" even under `wait`. The interval-shorter-than-lifetime clause covers that.
  - `beat()` reads `cacheTtl()` itself only off `auto` (a config interval or a session's own), because `schedule()` reads it just there. Under `auto` it must not: once a usage limit hits 100% `cacheTtl()` says `5m`, so a warm one-hour cache with an on-time 50m beat would read as late and cold, and the beat would pause before the Stop at usage check could stop it. The lifetime that counts is the one in force when the cache was written, which `schedule()` read.
  - `/cachebeat now` with beating off on a cold cache answers `the cache went cold (…); no beat sent` and pauses or stops nothing.
- **The cold turn line carries no age.** While paused the pulse is `waiting`, so the tickers are stopped and no step timer runs; a moving "cold for 2h" would go stale. The log line carries the age at that moment.
- **A background subagent doesn't stall beats** (item 8, tested live). Beats kept landing every minute while a background subagent ran `sleep 180`, and its finishing turn reset the count as a normal turn.
- **The "beats wait" line after `/compact` lands above the compaction's output,** not at the end of the transcript. The engine places `$.ui.log` lines. This is cosmetic and isn't fixed.
- **`claude --debug` writes `~/.claude/debug/<session>.txt`.** It holds every hook dispatch (`hooks module cachebeat@inline <event> settled …`) and every `$.ui.log` line. Use it to see event order instead of guessing.

## /rewind (found live, 0.8.2)

- **No event marks `/rewind`.** A probe mod that logged `session.append` and `turn.step` saw nothing at the rewind itself, only its own command rows afterwards.
- **`$.session.messages()` shows the rewound conversation at once.** It went from 7 messages to 4 straight after "Restore conversation", before any new message.
- **`$.model.fork` still re-sends the conversation from before the rewind.** It sends the request the main thread last sent:
  - before the rewind, a fork read 51,730 tokens
  - the rewound conversation came to about 44,500
  - a fork after the rewind read 51,728

  Until the next message, beats would keep the wrong conversation warm. cache-warmer, the other cache mod, says the same of itself.
- **A fork adds nothing to `$.session.messages()`:** the count stayed the same across forks. So comparing how the conversation ends (`tailOf()`: its length and a hash of the last three messages) with how the last turn left it detects a rewind without false alarms from beats.
- **How it was tested:** an interactive session in tmux (`tmux new-session -d …`, `send-keys`, `capture-pane`). The rewind picker is `/rewind`, then ↑ to the turn, Enter, then Enter on "Restore conversation". Haiku keeps it cheap. In the live check, beats every 1m stood down after the rewind with "the conversation was rewound" and came back after the next message.
- **`$.session.messages` exists on 2.1.287:** its op table has a runner for it.

## Beats during a turn, and beats that can't reach the cache (0.9.0)

- **Code review of the first 0.9.0 draft found these, all fixed and covered by tests that fail without the fix:**
  - **Tool results land mid-turn,** one row per tool as each finishes. The rewind check counted that growth as a rewind, so it now runs between turns only.
  - **A fork writes the message before its cache mark.** Mid-turn that is the previous answer or tool call, often over 1,000 tokens, so "out of reach" fired on ordinary beats. It's now judged only for an idle beat after a conversation's first turn.
  - **"Stop after idle" counted a long quiet turn from the previous turn's end,** and switched the session off. It now counts from the user's last message (`s.asked`, set at the turn's start).
  - **A failed mid-turn beat was never retried.**
  - **A message sent during an idle beat's flight was ignored** by `turn.start`'s `beating` guard. A fork's own turn is now told apart by its prompt text.
- **Left as is:**
  - **A real 5-minute expiry after a first turn can read as "out of reach".** That happens when the chat is no bigger than the shared system prompt, and it pauses rather than switching `auto` to 4m beats. The cost is no worse than before; 0.8.1 called it "renewed".
  - **`turn.complete` keeps `!beating || (busy && e.turnId === turnId)`.** The stricter `busy ? e.turnId === turnId : !beating` broke tests whose turn ids differ between start and end. Real turns match.
  - **A turn ending while a mid-turn beat is in flight is tested now** (see below), though an earlier note said the kit couldn't do it.
- **A turn ending while a mid-turn beat is on its way: handled** (`compuse`, live, `--debug`).
  - **The setup:** beats every 1m and a 60s job (`scratchpad/rwprobe/work/primesfor.py 60`), so the beat fired right as the tool ended. 4 tries overlapped: the fork finished 0.34–0.36s after `turn.complete`.
  - **The outcome:** `turn.complete` was taken as the turn's end every time, by its `turnId`. `/cachebeat` said "next beat in 1m", and the next idle beat landed 60s later in the one try that waited for it.
  - **Debug-log markers:** a fork's request is `[API REQUEST] … source=hook_prompt`, and its end is `Forked agent [plugin_model_fork] finished`. A tool's span is `[Stall] tool_dispatch_start` to `tool_dispatch_end`.
- **But a beat that starts as a tool ends costs more, and there's no cheap fix.**
  - **The cost:** those overlapped forks sent about 4× the uncached input (324 against 72), wrote 83–1,250 output tokens against 3, and one tried Bash twice and ran 17s past the turn, about two beats' worth.
  - **Why no fix:** the beat's request went out 18ms *before* the tool ended. So "skip if every tool has answered" wouldn't have caught it, and a fork can't be cancelled (`ModelForkRequest` takes only `prompt`).
  - **How rare:** the window is the fork's 1–2s at each interval mark, about 0.07% of quiet stretches at 50m.
- **The turn line's read is capped at what the last request cached.** A fork that tries a tool asks twice, and its usage sums both reads: "91k cached" for a 46k conversation. `s.lastRead` is now `min(got, cached)`.
- **A second code review (`/code-review high` on PR #10) found five more bugs, all fixed and covered by tests that fail without the fix:**
  - **A small chat mid-turn looped:** a 0ms re-arm.
  - **A retry left an orphan timer** when a turn's request had re-armed in the meantime.
  - **"Not served" fired on mid-turn beats** that wrote a big tool result.
  - **Messages added between turns read as /rewind.** `isRewound()` now checks the conversation shrank, or the old ending changed at its old place.
  - **Settings changed mid-turn left the turn's beat on the old interval.**
- **Not changed:**
  - **"The `--resume` line may be drawn over":** disproved live, the line showed at startup.
  - **"Enabling the plugin mid-conversation reads as a resume":** true, and harmless: one pause until the next message, with the wrong reason.
  - **"The rewind check fetches the whole conversation":** `$.session.messages()` has no limit to ask for.
  - **The retry fix is tested now:** the kit *can* run a turn's events while a fork is on its way (see below).
- **An independent check of the fixes (a subagent mutation-testing each one) found 15 fixes no test caught.** Its tests are in the suite now (141 tests).
  - **The trick for "a beat in flight while X happens":** `World.during(n)` runs while beat n's fork stub is awaited, and can call `$.turn.start`, `step`, `$.turn.complete` or `$.session.end`. Make the `model.fork` stub `async`. It works on 2.1.287 too.
  - **It found one bug,** past the 4,096 messages `$.session.messages()` lists: the old ending isn't at its index any more. `isRewound()` gives up there. The stub lists the newest 4,096, as the engine does.
  - **The first-turn count restarts on compaction** (`s.turns = 0`): the compacted conversation's next turn sends it anew.
  - **Still inferred:** a hot reload mid-turn loses `busy`, `stepping`, `turnId`, `cached` and `resent`, which aren't saved. That's dev-only, and the kit keeps module state across a reload, so it can't show it.
- **Idle beats need the same care as mid-turn ones.**
  - **The waste:** after a session's plain-text first turn, an idle beat read 31,772 and wrote 10,661, and the second turn didn't use it. A second idle beat 345s later wrote the same 10,659 again: a fork's own writes seem to last 5 minutes.
  - **The rule since 0.9.0:** a beat that reads less than the last request cached (`cached`), and writes more than `MISSED` (1,000 tokens, far above a beat's own line), makes beats wait for the next turn ("Claude Code cached this conversation anew, out of a beat's reach").
  - **Expired or out of reach:** within 5 minutes of the last cache read, the cache can't have lapsed. So a beat there that writes more than it read is treated as out of reach too, not as "the cache was not served", which would stop cachebeat or switch `auto` to 4m beats. After 5 minutes the two look alike, and the old rule stands.
  - **Status:** inferred from the subagent's measurements, and confirmed live once.

- **`turn.step` fires once per request a turn sends**, with `turnId`, `index` and `messageCount`, and `agentId` for a subagent's. It's a streaming event: the hook is `async function* ($, e, next)`, and `yield* next(e)` returns once the response is complete.
- **A fork runs fine during a turn,** for example while a tool runs. The turn carries on and completes as usual.
- **On 2.1.295, a fork raises no turn events at all:** no `turn.start`, `turn.step` or `turn.complete`, idle or mid-turn. The `beating` guard in `turn.start`/`turn.complete` is a precaution from 0.3.0. On the branch, `turn.complete` also accepts the running turn's own id while a beat is on its way.
- **What a mid-turn fork sends** (read in the 2.1.295 bundle, borne out by the numbers below):
  - `$.model.fork` strips `tool_use` blocks from the trailing assistant message and drops it if nothing is left. A reply that only called a tool leaves the request ending with the user's own message, which the beat's prompt then joins.
  - With `skipCacheWrite`, the fork's cache mark steps back a whole message, so it lands at the end of the previous turn. The `input` count (137 to 2,618) is this turn's message, never cached.
  - It runs with `maxTurns: 2`. A tool attempt is denied, and a second request follows.
- **The beat's prompt has to say the task is under way.** The model sees the user's instruction with no tool call made for it:
  - With "Reply with a single period." it went on with the task and tried a tool. That made a second request (91,726 read in all) and a long reply.
  - With "Do not continue any task or use any tool…" it still tried Bash in 3 of 5 forks in one turn 2, and in 1 more turn 2. Each made two requests: 84,866 read, about 3.7k written, 9,092 input, 1,350 to 1,600 output, and a reply starting "I couldn't run `primes80.py`".
  - With "The request above is already being carried out elsewhere: do not start or continue it, and do not use any tool…" it made one request and replied "." in 5 of 5 forks in the same turn. Mid-turn beats use this one, idle beats the old one.
  - **Small sample.** Every two-request fork seen came in a turn 2, or the first turn after a rewind, and the hold below now skips those. From turn 3 on, the old prompt also made one request each time. If a fork does make two, the turn line still shows both requests' reads summed.
- **The 12k a mid-turn beat wrote is the session's second turn re-rendering its history.** The main thread pays it too:
  - 9 sessions had a plain one-word reply as turn 1. In all of them, turn 2's first request read only 31,772 to 33,045 and wrote 10,657 to 12,416 of what turn 1 had cached again.
  - In the 2 sessions whose turn 1 thought or called tools, it read everything.
  - What changes isn't known, and the `prompt_snapshot` attachments don't show it.
  - A fork made then can't reach turn 2's new entry, which ends after turn 2's message. It writes its own: 32,043 read / 12,413 written at 6s, from a timer. 32,136 / 12,417 at 60s, and 76,509 / 12,843 in two requests at 70s, from `command.run`. Timing and dispatch path make no difference.
  - The turn's next request reads its own entry (44,524, 44,533, 44,622), never the beat's.
  - From turn 3 on, the fork's mark lands on what the last turn cached. At 60s: 44,671 read, 12 written. With the fix: 44,774 read, 12 written, one request.
  - An idle fork right after such a turn 1 pays it too: 31,772 read, 10,661 written. Turn 2 still read only 31,772 after it, so that write went unused.
  - **This is on main as well, and recurs.** A second idle fork 345s later wrote the same 10,659 again. A fork's own write seems to last 5 minutes: in the bundle, `hook_prompt` isn't on the 1h allowlist, which a server flag can change. So until turn 2, an idle beat at the real interval rewrites about 10k each time and keeps only the shared ~32k warm. The same signal, a beat reading less than `cached`, could make beats wait for the next turn.
- **Untested:** a mid-turn beat during turn 1, when `cached` is still 0.
- **So a turn whose request read less than the last one cached gets no mid-turn beat.** Its `turn.step` usage shows it (`resent` in `register.tsx`), and beats wait for the turn's next request or its end. Live: no beat during turn 2's 80s tool, then one at 1m into turn 3's.
- **The test kit raises `turn.step` as `$.turn.step({ turnId, index, model, messageCount })`.** It returns a stream: read it to its end, then `await stream.result`. A test registers a stub generator beneath it, in `setup()`.

## Resuming a conversation (found live, 0.9.0)

- **`claude --resume` and `--continue` start a new process with the conversation already there.**
  - `session.start` fires with `$.session.messages()` holding it, and `read($, saved)` is null.
  - A fork then has nothing to send ("nothing-to-fork") until the next turn.
  - `classic.SessionStart` (source `resume`) fires *before* the session is bound: `$.session.messages()` throws there ("no session is bound in this process").
- **`/resume` within a session raises `session.end` (reason `resume`), then `classic.SessionStart` (source `resume`), and no `session.start`.**
  - Module state carries over from the conversation left behind. Before 0.9.0, a beat due from that conversation would fire, find nothing to fork, and switch beating off: "stopped: nothing to keep warm".
  - Now the `session.end` hook resets to another conversation (as `/clear` does) and pauses. The line is logged from `classic.SessionStart`, `SETTLE` (1s) later: a line logged during either hook is drawn over when the resumed conversation is drawn.
- **`$.state` is keyed to the session id,** so after `/resume` a hot reload (a file save during development) finds nothing saved and starts afresh (off, by default). That's dev-only.
- **The uncached hint:** Claude Code 2.1.295 shows "~68k uncached · /clear to start fresh" in the footer, not a dialog. It's on Pro plans, when the conversation is at least 50,000 tokens and its last reply is over an hour old (`Mqe` in the bundle). Beats must not re-read the conversation before the user's next message, and with the pause they don't.
- **The bundle also has "Compacted while idle, before the prompt cache expired":** an engine mode that compacts an idle conversation. cachebeat sees it as `session.compact` and pauses, as for `/compact`.

## 0.10.0 probes (found live, 2026-11-09)

Step 0 of `plan-0.10.0.md`, P2–P7. Claude Code 2.1.319, `--model haiku`, a Pro plan, a terminal in tmux. "Observed" is what a probe logged or the screen showed; "inferred" is a reading of that. **Pending:** P1 (needs the machine suspended) and P8 (needs 2.1.287, whose install is blocked); nothing here was run on 2.1.287.

How it was done: a scratch mod (hooks on `session.start`, `session.end`, `classic.SessionStart`, `prompt.submit`, a catch-all `command.run`, and a `/probe usage|fork` command) that wrote each event to a file with `$.fs.write`. It lived outside the repo and was loaded with `--plugin-dir`, but cachebeat itself was loaded in the same sessions (the debug log lists `cachebeat@cachebeat` hooks). Its `hooks/register.tsx` has no `prompt.submit` hook, so P5–P7 weren't touched; P4's delta matched the fork's own usage to the last digit, so its beats didn't add to it (beats were off, the default).

- **P2: yes. `$.session.id()` is the same id after `--resume <id>` and after `--continue`.** Observed.
  - `session.end` gave `sessionId`, `resume.id` and `$.session.id()` all equal (4c784efd…). The `--resume` process's `session.start` read that id from `$.session.id()`; so did `--continue`'s, which picked the most recently written conversation.
  - **`/resume` is not so tidy.** `classic.SessionStart` (source `resume`) arrives 12ms after the `session.end`, with `e.session_id` the **resumed** conversation's id, while `$.session.id()` inside that same hook still returns the id of the conversation **left behind**. Every later `prompt.submit` and `command.run` saw the resumed id (checked in a run with no file saved during it: conversations A, `/clear`, B, `/resume` back to A, then 5 events, all A's). So in that hook read `e.session_id`, never `$.session.id()`. When it turns over between the hook and the first prompt wasn't pinned down.
  - `/clear` is the other way: at `classic.SessionStart` (source `clear`), `$.session.id()` is already the new id.
  - `$.session.id()` works inside `classic.SessionStart` on startup, resume and clear (`$.session.messages()` is the call that throws there).
- **P3: `classic.SessionStart` (source `resume`) reaches the mod on `--resume` and `--continue` with every field set, but it does not finish before `session.start` starts: the two hooks run concurrently.** Observed.
  - **The deciding run:** `classic.SessionStart` made to wait 800ms (`await new Promise(r => { $.clock.after(800, () => r(null)) })`; a bare `await $.clock.after(…)` returns at once). `session.start` was entered at 18.135, `classic.SessionStart`'s first statement ran at 18.136, and `session.start` saw the wait not yet over. So even a synchronous stash in `classic.SessionStart` can come after `session.start` began.
  - Why the plain runs misled: each hook's log line is written after its own awaits, so file order said nothing, and the debug log's "settled in N ms" lines, taken as end times, put their starts within about 2ms of each other (`classic.SessionStart` settled at 46.683 after 22.7ms, `session.start` at 46.954 after 295.9ms), so line order in the probe's file was an accident of how many awaits each hook made.
  - **On `/resume` and `/clear` there is no `session.start`,** so `classic.SessionStart` is the only hook there.
  - Source is `resume` for `--continue` as well as `--resume`.
  - Fields seen: `seconds_since_last_response` (81, then 26, then 134 on `/resume`), `context_tokens` (52,448; the footer showed the same number), `prompt_cache_likely_expired: false`, `estimated_cache_write_usd: 0.0105`. `prompt_id` and `model` came on the `/resume` one.
  - **`seconds_since_last_response` counts from the last main-thread response, not from a `$.model.fork`.** A fork 43s before the first resume didn't reset it (81s matched the last turn). Inferred from one case.
  - **`estimated_cache_write_usd` is rounded to 4 decimals.** Two contexts (52,448 and 52,719 tokens) both gave 0.0105. So `usd / context_tokens` is coarse for a small context: 0.00005 of error on a $0.0105 figure is 0.5%, and 5% on a 5k-token chat. Inferred from those two samples.
  - It came to $0.20 per million tokens on Haiku 5.5, which is 2× the input rate (P4's fit has input at $0.10): the 1-hour write rate on a Pro plan, inferred.
  - `$.session.messages()` already holds the conversation at `session.start` (18, then 20 messages).
  - **Not seen:** `prompt_cache_likely_expired: true`. It needs a gap past the TTL, which was not waited out.
- **P4: yes. `$.session.usage().cost.usd` grows by the fork's price, at once.** Observed with one fork on a Haiku session idle for under 2 minutes, `cost.usd` read straight before and after the `await`:
  - before 0.00846389, after 0.009000425: a rise of 0.000536535
  - the fork's `usage`: 26 input, 4 output, 52,381 cache read, 65 cache write
  - that sum fits to the last digit at input $0.10, output $0.50, cache read $0.01 and 5-minute write $0.125 per million (inferred: 4 numbers fitted to 1 total, but each is a clean multiple of the next)
  - **`cost.usd` and `estimated_cache_write_usd` price a write differently** ($0.125 against $0.20 per million, inferred as above). Both are the engine's own figures. A beat priced from the `cost.usd` delta and a re-cache priced from the estimate's rate will be on different write rates: up to 1.6× apart, and only on the written tokens. Not explained.
  - Not checked: a fork on a model other than Haiku, a fork after the cache expired, or the delta of a mid-turn fork.
- **P5: the dropped text stays in the composer, and the reason is drawn as a row.** Observed in the terminal, twice idle and once mid-turn.
  - A `prompt.submit` hook answered `{ drop: 'PROBE-DROPPED: …' }` for `drop-me please`. The screen showed `● Prompt dropped by a hook: PROBE-DROPPED: …` as a transcript row above the prompt, and `❯ drop-me please` still in the composer, ready to send again or edit. Nothing was sent: the text is not in the conversation file.
  - The engine adds the "Prompt dropped by a hook: " prefix. The reason is drawn as given.
  - **Enter on the same text raised `prompt.submit` again** (two events, same text, 27s apart). So drop-then-resend works as the cold guard needs, and `$.ui.ask` isn't needed.
  - **A prompt dropped mid-turn** (typed over a running turn, `turnId` set) showed the reason at the right edge above the composer while the turn ran, and as the same `● Prompt dropped by a hook: …` row afterwards. The text stayed in the composer then too.
  - **`$.ui.log` inside `prompt.submit`:** called before a drop, it drew `● probe: <text>` as a transcript row **just above** the drop row. Called before and after `next(e)` on a prompt typed mid-turn (both calls 1ms apart: `next` resolves at once when the prompt queues), neither line was found in the pane's scrollback, though the debug log has both. So a log in a hook that passes the prompt through can't be relied on to show; use it only with a drop, or use a toast (not tried).
  - **Not checked:** how a very long reason wraps; the desktop app; a dropped prompt with the `bridge` origin.
- **P6: only text the model will read reaches `prompt.submit`.** Observed, all with origin `composer`.

  | Typed | `command.run` | `prompt.submit` |
  | --- | --- | --- |
  | plain text | no | yes |
  | `/probe …` (a plugin's command) | yes | no |
  | `/help`, `/context`, `/clear`, `/resume` | yes | no |
  | `/simplify` (a skill) | yes, first | yes, 20ms later, `text` `"/simplify"` as typed |
  | `!ls` | no | no |

  - `!ls` raised neither event, and ran (the conversation file holds `<bash-input>ls</bash-input>`).
  - `/cachebeat` is a plugin command like `/probe`, so it never reaches the guard.
  - A skill or prompt-type command sends the conversation, so it should be held on a cold cache, and it reaches the hook. Its text is the raw `/simplify`, with no expansion.
  - `command.run` carries `origin` too (`{ kind: 'composer' }` for all of these).
  - **A prompt typed mid-turn** reached the hook with `turnId` set, `origin` `composer` and `wait` false (twice, in the last run, over a turn Haiku was still working on).
  - **Not seen:** any origin but `composer`. Whether dropping a skill's `prompt.submit` undoes its already-run `command.run` is untested.
- **P7: yes. `claude plugin test` raises `prompt.submit` with `origin: { kind: 'composer' }`.** Observed (and `tsc` accepts it).
  - `await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })` from a test: the plugin's hook saw a composer prompt and dropped it (`r.drop` is the reason, and the test's own bottom stub never ran). The same text with `{ kind: 'bridge' }` passed through to the stub with that origin.
  - The test's `$.prompt.submit` takes the event's input whole, unlike a plugin's `$.prompt.submit`, which can't set `origin`, `turnId` or `wait`.
  - **A test that leaves `origin` out gets `e.origin === undefined`:** the kit stamps nothing. A hook that reads `e.origin.kind` is skipped ("undefined is not an object") and the prompt passes, so a guard test that forgets it passes for the wrong reason.
  - Not tried: `turnId` set in a test.
- **Process gotchas** (not about the engine):
  - **Use a private tmux socket (`tmux -L probe …`), never `tmux kill-server`:** that kills every tmux server of every session on the machine, and the auto-mode classifier refused the command.
  - **A new working directory asks "Do you trust this folder?"** before the prompt appears: `Down`, `Enter` accepts.
  - **Overlapping `$.fs.write` calls to one path race:** a slower, earlier write replaced a later, longer one and a log line vanished. Chain the writes.
  - **`claude plugin validate` printed "No digest" when `$` was passed to an arrow function declared inside `register`.** A `function` declared at the top of the file passed.
  - **`--plugin-dir` reloads on a file save** within about 20s, and that re-ran `session.start` in the live session (it saw 18 messages).
  - **A skill under test runs a real turn** (`/simplify` kicked off a multi-step agent run on Haiku, and Escape twice didn't stop it in time): probe with plugin commands where a skill isn't the point.

## Dollars (built in step 2 of 0.10.0)

How `hooks/prices.ts` and the beat's cost came out. "Observed" is a probe's or a test's result; "inferred" is a reading of it.

- **Take prices from the pricing page, not the `claude-api` skill's table.** The page is `https://platform.claude.com/docs/en/about-claude/pricing.md` (checked 2026-11-09; the comment in `prices.ts` says so). The skill's table is cached (2026-10-06) and lists only input and output. Where they differ the page won: the skill says Sonnet 5.5 reads at $0.20, the page says $0.10 (0.05×).
- **Cache reads are not one multiple of input.** 0.1× for most models; 0.025× for Fable 5.1 and Mythos 5.1; 0.05× for Opus 5.5 and Sonnet 5.5. Writes are 1.25× for five minutes and 2× for an hour everywhere. So the table holds the five figures per model, and a multiplier would be wrong for four of the sixteen models.
- **Haiku 5.5 is five times dearer on every token kind for a prompt over 100,000 tokens** (input + read + write). So `writeRate` and `priceOf` take the prompt's size, and a learned rate is keyed by the tier too.
- **Near-identical ids must not collide:** `claude-opus-5-5` ($4) and `claude-opus-5` ($5), `claude-sonnet-5-5` and `claude-sonnet-5` (reads $0.10 and $0.20), `claude-fable-5-1` and `claude-fable-5`, `claude-haiku-5-5` and `claude-haiku-4-5`. The lookup is by exact key, after the `[1m]` suffix and a `-YYYYMMDD` snapshot date come off. A provider's id (`anthropic.claude-…`, Bedrock) matches nothing: the pricing docs say Bedrock and Vertex are partner-operated with prices of their own. Lookups use `Object.hasOwn`, so `constructor` is not a model.
- **Which write rate the re-cache is priced at (decided).** The probe found two engine figures on different write rates: `cost.usd` priced a fork's write at 1.25× input, and the resume estimate at 2× (P3, P4 above). Two readings fit, and neither was tested directly. (a) 5-minute writes bill at 1.25× and 1-hour writes at 2×, a fork's own write is a 5-minute one (`hook_prompt` isn't on the 1-hour allowlist, above), and the main conversation's cache is the 1-hour one on a subscription. (b) The ledger prices every write at 1.25× whatever its lifetime, and the resume estimate prices the 1-hour rate the conversation will be written at. The P4 sample shows how the ledger prices a write, not the lifetime of the fork's request, so it proves neither. The code follows (a).
  - So `recacheUsd` is the conversation's size at the **main conversation's** rate (`s.isCacheShort ? '5m' : ttl`): 2× on an hour, 1.25× on five minutes. That is what the next message pays.
  - A beat's own `priceOf` uses the **5-minute** rate whatever the main lifetime, since it's the fork's write.
  - If (a) is wrong, `recacheUsd` is off by up to 1.6× on an hour's cache. If (b) is the case, `recacheUsd` is fine, but a beat priced from the table that wrote most of the conversation afresh comes out up to 1.6× under the real bill (the table charges it at 1.25×, the API at 2× for an hour's write). An idle beat priced from the ledger's rise follows the ledger either way.
- **The beat's price is the rise of `cost.usd` around the fork, when nothing else could have added to it** (P4: the rise is exact and readable straight after the `await`). Alone means: idle when the beat started (`wasIdle`), still idle after (`!busy`), and no request of the main conversation landed meanwhile (`s.lastWarm` unchanged). Each condition has its own test, since a turn that starts, or one that starts and finishes a request, both put the turn's cost into the same difference. Otherwise the fork's usage is priced from the table (mid-turn, an unknown model, or no `cost`).
  - **A rise of zero or less isn't taken:** a priced response costs something, so zero means the ledger didn't count the fork. It also keeps the older tests, whose `session.usage` stub has a fixed cost, on the table.
  - **`cost` is optional on `SessionUsage`** ("absent where the host keeps no cost ledger"; the CLI always has one). Without it, `priceOf`.
  - **The delta works for a model the table lacks;** `priceOf` doesn't. So an idle beat on a new model still shows its price, and a mid-turn one shows none. A model the table lacks leaves the `· ≈$` part out of the log line altogether.
  - **The delta can't tell a beat from other requests landing in it** (a background subagent, a precompute compaction, another mod's fork, a side query). The three conditions are what can be told, and a sanity bound catches the rest: the rise is taken only while it is at most `RISE_BOUND` (2.5) times the usage priced at list with 1-hour writes, which covers fast mode's 2× and regional pricing's 1.1×. A 40K-token background request landing in a $0.0005 Haiku beat is then refused and the beat is priced from its usage. **The trade-off:** a managed price more than 2.5× list falls back to list, and a landed request small enough to fit under the bound still gets billed to the beat. Where the table has no price for the model, there is nothing to bound against and the rise is taken. That's deliberate (review of step 2): the idle rise is the only dollar figure an unpriced model gets, so hiding it to guard against a rare overlapping request would cost more than it saves, and `≈` already marks it as an estimate.
  - **It sees fast mode and a managed price, `priceOf` doesn't.** Fast mode doubles Opus's price.
- **The engine's own re-cache estimate (`estimated_cache_write_usd`) is used less than the plan said.** `learnRate` takes it only when the table can't know better: `pricing: 'configured'` (a managed `modelPricing`), or `'catalog'` for a model the table lacks. Not for `'catalog'` on a model the table has (that is the list price again, rounded to four decimals), and not for `'default'` (the engine guessing: a guess shown as a price). Not under 20,000 tokens either (the rounding).
  - **Only `classic.PostModelSwitch` teaches a rate.** It carries `cache_ttl`, so the rate is keyed by model, lifetime and tier. Resume's `classic.SessionStart` has `estimated_cache_write_usd` and `context_tokens` but **no `pricing` field** (so `configured` can't be told from list price, which is what the learn rule turns on), **no TTL field**, and the model isn't always set there. It waits for step 4 (resume), which needs a probe of what the engine means there.
  - **Whether the switch's estimate follows `cache_ttl`** (the 1-hour rate when it says `1h`) is inferred from the resume sample, not seen on a switch.
  - The learned rates live in a module variable and are relearned after a reload at the next switch; they aren't stored.
- **Display:** `money()` gives `≈$0.02` from a cent up, four decimals below it (a Haiku beat is about $0.0005), and `<$0.0001` below that. A figure in `state` is rounded to six decimals.
- **No `$` in the turn line, and the plan's "dim line on a subscription" isn't drawn yet:** neither the beat log nor `state` is a page. The Status and CacheTax pages (steps 6 and 7) draw it. The `state` tool's text and the README carry the same words.
- **The test kit:**
  - `expect` has no `toBeCloseTo` (the tests have a `near` helper).
  - `setup()` can be called once per test: a second call throws on `on("clock.*")`.
  - `setup`'s `session.usage` stub now has a `cost` that each fork raises by `forkUsd`, and `noCost` leaves it out.
- **Mutation checks:** each behaviour's test fails with its line broken: the rise taken at zero, each of the three `isAlone` conditions, the delta never taken, the fork's write rate, the lastUsd line, each `learnRate` guard, the ttl and tier in the key, the tier, the `[1m]` and date strips, `hasOwn`, the model rows with a cheaper or dearer read than their neighbour, the formatting (and its seam at $0.00995, where four decimals round up to a cent), the omitted price, the sanity bound from both sides, and learnRate failing closed on a `pricing` it doesn't know.
- **Checked live on Haiku (2026-11-09, 2.1.319, this branch loaded with `--plugin-dir`).** Observed unless marked inferred:
  - **`$.session.model()` returns a resolved id the table prices:** `"claude-haiku-5-5"`, at `session.start` and after a turn. Not an alias or a display name. Opus's id was not read (see below).
  - **A forced beat:** after two turns, `/cachebeat now` logged `♥ cache renewed (47,738 read, 37 written · ≈$0.0005)`. `cost.usd` read 0.00927251 before and 0.009763215 after, a rise of 0.000490705; `state`'s `session.lastBeatUsd` was 0.000491. They match.
  - **`cache.recacheUsd` was 0.009856 for `contextTokens` 49,281:** $0.20 per million, which is 2× Haiku 5.5's input ($0.10) on the session's 1-hour cache (`cacheTtl: "1h"`). That is the rate the plan chose for the main conversation. It's plausible, and agrees with the resume estimate's rate seen in step 0 (P3: $0.20 per million). It does not show whether the API bills a 1-hour write at 2×, only that the two engine figures and the table now agree on it.
  - **The first `/cachebeat now` on a fresh session didn't beat:** `beats wait for your next turn: Claude Code cached this conversation anew, out of a beat's reach` (turn 1 had written the whole 47k-token prompt). After a second turn that read the cache, it did.
  - **Unexplained, observed:** `cost.usd` rose 0.00414252 to 0.00616504 (+0.00202, about five beats' worth) between two `/probe usage` reads with no beat and no turn of mine in between, only `/cachebeat on` and a paused `/cachebeat now`. Something else was priced into the ledger while the session sat idle (inferred: a side request of Claude Code's own; not identified). It did not land inside the beat's window, since that beat's rise matched `lastBeatUsd` exactly, but it is the case the three `isAlone` conditions and `RISE_BOUND` exist for.
  - **Opus: no turn was run.** A one-turn Opus conversation re-caches the ~47k-token prompt (about $0.4 at Opus 5.5's 1-hour write rate, inferred from the table), too much on a plan at 87% of its weekly limit. `/model opus` only opened the dialog `Switch model? … the full history gets re-read`, and the id was not read. cachebeat's reactions on the switch were seen: `beats wait for your next turn: the new model has no cache yet`, then on `/model haiku` `beats go on: back on the model the cache was warmed on`.
  - **`/model <name>` saves the choice as the default for new sessions** ("Set model to … and saved as your default for new sessions"). Switching to Opus and back to Haiku in the probe overwrote the saved default (`"model"` in `~/.claude/settings.json`); `/model sonnet` put the user's `sonnet` back. A probe that switches models should end on the default.
  - **To load a dev copy beside an installed one,** `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false}}'` kept the installed 0.9.2 out: the debug log listed only `cachebeat@inline`.
- **Not verified live:** an Opus fork, a fork on a cold cache, fast mode, the write-rate reading above (whether a 1-hour write is billed at 2×), and that `cost.usd` exists on 2.1.287 (the types make it optional; the tests stub it).

## Surfaces: the desktop app (found live, 0.7.0)

**Status: passable, left open.** The desktop app isn't the maintainer's main surface: cachebeat is built for the terminal. On desktop it works and looks acceptable, but it isn't polished. Line animations keep small gaps, and heart-heavy ones space wide (below). It's left as it is on purpose. Contributions to tighten it are welcome; the `Svg`-grid idea below is the likely route.

- **Loading a dev copy into the desktop app:** set `"CLAUDE_CODE_PLUGIN_DIRS": "<repo path>"` in the `env` block of `~/.claude/settings.json`, then start a new Code-tab session. The app's plugin manager page lists marketplace installs only, so a folder-loaded plugin never shows there. Check with `/cachebeat`, or with `<bundled claude> plugin list`.
- **The desktop app ships its own Claude Code,** at `~/.config/Claude/claude-code/<version>/claude` (2.1.293 at the time). Its logs in `~/.config/Claude/logs/` carry no hook dispatches.
- **`TurnDuration`** (the closing row the status line hangs under) is raised on the terminal only.
- **`PromptHint`'s `tail` is drawn on the terminal only.** The types say "no other surface draws it yet". A `PromptHint` tree drew nothing in the chat area either. So on desktop the hint row carries nothing of ours.
- **`AbovePrompt` (the band above the input) works on desktop.** cachebeat draws the status line there, desktop only (`isStatusOnBand`). The idea follows [desktop-statusline](https://github.com/centminmod/claude-plugins/tree/master/plugins/desktop-statusline), which builds its whole band that way.
- **The band is shared, so compose with `next(e)`; don't replace it.** Until 0.9.0, cachebeat returned only its own line on the desktop band, so another mod drawing there (such as desktop-statusline) lost its content whenever the line showed. karanb192 blocked the awesome-claude-code-mods listing on it (PR #236). The hook now draws `await next(e)` first and the line after it, in both width branches, and the tests require the test kit's `engine` stub to survive. Not yet seen in the desktop app: whether an empty engine band adds a blank row.
- **The band's font is proportional:**
  - A frame whose characters differ in width (`─ ⎼ ⎺ ♥ ⠀`) changes width from frame to frame, and carries the words after it along. So a wide animation is drawn one `Box` per character, centered. That gives a fixed grid, which stopped the dancing.
  - A heart glyph is wider than a cell, so heart slots are wider (`slotWidths`).
  - Line characters are narrower than a cell, so they leave gaps between slots.
  - **`Box` widths appear to be whole cells:** fractional ones (0.6, 1.5) look rounded. That's inferred from screenshots. The test kit accepts them.
  - So line animations keep small gaps, and heart-heavy ones (Converge's burst) space wide. The user judged that acceptable. The exact alternative is drawing frames as an `Svg` grid, at the cost of fixed colors.
- **A space at the start of a `Box`'s text collapses, as in HTML.** A one-cell box was narrower than a ♥ and covered the space after it. So the single beating heart (♥/♡, one width) is drawn as plain text with its line, and a wide animation gets a `marginLeft`/`marginRight` of one cell instead of a space.
- **Colors draw on desktop:** theme keys and hex alike, as seen in the settings pane.
- **The settings pane works on desktop, but its keys are the app's own.** Tab and Shift+Tab move native focus, and a click presses. cachebeat's terminal-only two-level walk (`ui.focus` denials, arrow `ui.scroll`) fought that, so on desktop (`paneSurface`, noted when the pane draws) it passes those events through. A tab opens on press, and Esc leaves a picker or closes. Neither focus nor scroll events say which surface they come from, so the pane's own draw records it.
- **The settings pane's keys on desktop are open too (0.7.0):**
  - *Native to the app, out of a mod's reach:* Tab moves focus down and Shift+Tab up, and focus can leave the pane for the app's other controls.
  - *Works:* the 1–5 tab hotkeys.
  - *Enter was finicky.* The likely cause was cachebeat moving focus itself after every press, which suits the terminal but lands somewhere on desktop the person isn't looking. On desktop it now moves focus only to land somewhere new: the pane opening, or a list of choices opening (`focusOn`'s `isLanding`). Whether that's enough is for the user to judge. If it isn't, the next thing to try is no moves at all on desktop.
  - *Testing:* the test kit has no focus to move, but each try logs `focus <key>: …` at debug, so a test counts the tries from the log.
- **Before 0.7.0, a desktop user saw only `♥ cache renewed (…)` per beat:** the fallback log for "no closing row seen".

## Old versions (found in 0.7.0's CI)

- **On 2.1.287 a `Button` needs a `label` or a single string child.** Newer builds also accept `Text` children ("a chip, a dim part"). For a dim button, use `<Button dimColor>` with a string. The test kit on the current build accepts both, so only CI's 2.1.287 leg catches it.
- **A `Button` with a `hotkey` draws its own `r: ` before its label.** Don't write the key into the label too.
- **On 2.1.287, a function handed `$` must have a name used nowhere else in the file,** not even as a local `const` in another function. The loader refuses the whole module: "the function handed $ "warmed" is declared more than once in this file". That broke 112 of 125 tests on 2.1.287 only (0.9.0's `warmed($)` helper against a `const warmed` message in `beat()`). Newer versions accept it, and only CI's 2.1.287 leg or the local 2.1.287 install catches it.
- **When checking test output in a script, fail on the summary,** with `grep -q "^ 0 fail"`. Filtering with `grep` exits 0 even when tests fail, and that let a broken release branch get pushed once.
- **Every API 0.7.0 added works on 2.1.287:** `$.env.get`, `$.settings.read`, `classic.PostModelSwitch`, `session.compact`, `AbovePrompt`, `Box` `minWidth`, and the kit's `$.classic`. CI's 2.1.287 leg passed, so the floor stays.
- **Testing an old version locally:**
  1. `npm install @anthropic-ai/claude-code@2.1.287` in a scratch folder.
  2. npm blocks its install script until you approve it: `npm install-scripts approve @anthropic-ai/claude-code`.
  3. `./node_modules/.bin/claude plugin test <repo>`.

  Or push and let CI run both legs.

## Types

- **`tool.call` matchers only take known tool names.** With MCP servers connected, the generated `McpToolInputs` lists only those servers' tools, so `{ tool: 'mcp__cachebeat__set' }` fails `tsc`. Declare the plugin's own tools in `types/index.d.ts` under `interface McpToolInputs`; that also types `e.session` and `e.settings`. Pinboard doesn't, and probably fails `tsc` once an MCP server is connected (a guess, not checked).
- **The generated `claude-code-mcp` types don't list the plugin's own tools** (checked once), so the declaration doesn't clash. If it ever does (TS2717), drop ours.
- **The generated types follow the engine that last loaded the plugin.** A session loading it from a checkout rewrites `.claude-plugin/types/` for its own Claude Code, so `tsc` can pass on one machine's checkout and fail on another's, or after the next live run. 2.1.319's types gave every surface `Input`, so `!('Input' in els)` narrowed `els` to `never` and `els.Text` failed (plan-0.10.0.md, step 2b). Check `tsc` on the newest types too, and keep narrowing checks from reaching a value used after them.
- **Keep the fork's result a `const`.** In 0.7.1, `let r: ModelForkResult` assigned inside `try`/`finally` made `tsc` stop narrowing `r.error` after `r.reason === 'aborted' ||`. `const forking = $.model.fork(…)` then `const r = await forking.finally(…)` keeps the narrowing, and the original timing too.

## The test kit (`claude plugin test`)

- **`$.session.root()` has no implementation in the test kit.** Every hook that reaches it is skipped ("no implementation for session.root") until a test stubs it: `on('session.root', () => ({ value: root }) as never)`. `setup()` does this with a root a test can move (`moveTo`). 0.8.0 checked that 2.1.287 implements it: its binary's op table has a `session.root` runner, and the suite passes on 2.1.287.

- **Simulating a sleep (`sleep(ms)` from `setup()`).** `mock.clock` moves time and timers together, so a sleep needs `clock.now` alone to jump.
  - A hook is one per event: a second `on('clock.now', …)` throws "registered twice", before or after `mock.clock(on)`.
  - `on('clock.*', …)` doesn't clash with it, and registered *before* `mock.clock(on)` it sits above the mock's hooks (a plugin's registrations nest, first outermost), so `next(e)` reaches the mock and gives `{ value }`.
  - `setup()` registers that hook for every test. The older tests still passed with it (apart from the three whose expectations changed on purpose).
- **The kit resolves due timers one at a time, each run to the end before the next,** so a leaked second chain of step timers never beats twice at once: the first beat moves `nextAt`, and the second chain finds nothing due. The test "a new schedule while a step is being checked" counts `clock.after` dispatches instead (one chain asks one a minute), and holds a step's `clock.now` open (`holdNow`) so a `schedule()` can run in its `await`. It fails with both of `wallCheck`'s `call !== scheduling` checks removed, and passes with either one alone.
  - The RETRY path takes a call number of its own (`++scheduling`), so a step check parked in an await on an older chain ends after it. Without that the two chains aim at the same `nextAt`, and `beat()` has no `beating` guard. The kit can't show the double beat (the older chain dies at the next beat's `schedule()`), so the test "a retry while a step is being checked" counts the waits armed when the parked check is released: none.
- **`clock.advance` refuses more than 10000 resolved waits** ("an interval shorter than the advance?"). A running 80ms animation ticker reaches that in about 13 minutes of mock time, so advance in the large with the animations off, and start the ticker (`draw($, HINT)`) only for the last second.
- **The ticker redraws the countdown once a second by frame count** (every 13th 80ms frame), so `advance(1000)` is 12 frames and doesn't reach a redraw. Use 2000.
- **Register a test's own hooks before the first `$` call.** `setup()` starts the session, so a test hook goes above `await setup($, on)`. Otherwise it throws "after the test first called $".
- **`$.tool.register` needs a stub beneath it** (`on('tool.register', …)` in `setup`). Nothing answers it otherwise.
- **A `classic.PreToolUse` deny reaches the test's `$.tool.call` as an errored result** (`isError: true`, the reason as `text`), not as `{ deny }`. `{ deny }` is what a plugin's own `$.tool.call` gets.
- **Fake the environment with `mock.env(on, world.env ?? {})`, and stub `settings.read`,** in `setup()`, as the cache lifetime is read through them. `World` has `env`, `settingsFile` and `isSubscription` for that. `mock.env` works on 2.1.287 too. Until 0.7.1 the test hooked `env.get` itself, answering any name, and the directory read that as reading the user's keys (0.7.0's credential hold).
- **`$.session.compact()` in a test needs the transcript passed in:** `$.session.compact({ messages: […] } as never)`. Without it, the event's `messages` isn't a list and every hook on it is skipped. A session supplies it itself.
- **Classic events are raised through `$.classic.<Event>(fields)`,** such as `$.classic.PostModelSwitch(SWITCH)`. Each needs a stub beneath it, like `on('classic.PostModelSwitch', () => ({}))`.
- **A `$` call left running after a test ends rejects the whole file run** ("no hooks module of that name is loaded"). A `void schedule($)` from `stop()` is one such call, so `schedule()` makes its `$` calls only on the path that arms a beat.
- **Tool arguments arrive flat on `e`,** beside the reserved `tool`, `tool_use_id`, `consent` and `agentId`. Read `e.session` and `e.settings`; never validate the whole `e`, or every call fails on the reserved keys.

## Reviews and validation

- **`/code-review ultra` bundles tracked files only.** An untracked new file (`hooks/tools.ts`, before its first commit) shows up as "module does not exist". Commit, or at least `git add`, new files before an ultrareview.
- **Don't pass a `$` call a constant whose value is a cast.** `$.ui.open(PANE_OPEN)` with `const PANE_OPEN = { … } as const` blocked every directory validation from 0.6.0 to 0.7.3 (`MOD_CAPABILITY_USE_NOT_PLAIN`). The directory reads a call's arguments from the source and can't read through `as const`. Write the request in the call, as the official examples do: `$.ui.open({ id: PANE, title: … })`. A constant declared with a type and no cast passed (`$.tool.register(STATE)`, with `STATE: ToolSpec`).
- **The report's location is where a hook first reaches the problem, not the problem's own line.** It named `await openSettings($)` in `command.run` (lines 561, 581, 584, then 582) while the cast was two calls down. Read everything that call reaches, and look for what no earlier hook reaches.
- **0.7.1–0.7.3 chased the wrong causes**, and those rewrites stay because they're harmless: casts, `??` and parentheses around calls, `.finally`, arrow helpers, a returned call, a `switch`, `try` around calls. The `if`s, `.catch`, `return $.a.b()` and the rest all passed. What found the cause: validating a branch (`owner/repo@branch`) before releasing it, and asking which `$` calls only the flagged call reaches.
- **Proving a refactor changes nothing:** run the previous version's test file against the new code, and the new tests against the old code. For a function the kit can't drive (`$.ui.focus` from a plugin has no implementation in the kit), compile the old and new function from git and run both against a fake `$` across every outcome. 0.7.4's `focusOn` matched in 36 of 36 cases.
- **`claude plugin validate` shows a matcher built from a constant as `?`** (`tool=?`, `requestId=?`). A literal resolves (`tool=mcp__cachebeat__set`). The plugin directory reads the source the same way, so its tool matchers are literals.
- **Type-checking without a loaded session (a cloud session):** `npx -p typescript tsc -p .` needs `.claude-plugin/types/`, which the engine lays only when a session loads the plugin. Instead, point a scratch tsconfig (the options are in the header of the types file) at the `plugin-authoring` skill's `types/claude-code.d.ts`, plus `hooks` and `types`. That checks against the running build's API.
- **Running 2.1.287 in a cloud session:** `npm install @anthropic-ai/claude-code@2.1.287` in a scratch folder ran without the install-script approval step, and its `claude plugin test` and `validate` work there.
- **CI already checks the oldest supported version.** It runs on 2.1.287 and latest, so a passing CI run means the API works on 2.1.287. That's how `$.tool.register` was confirmed there.
