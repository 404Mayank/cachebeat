# Handoff: 0.10.0 is built and waits on the user to ship (2026-11-23)

> Temporary handoff for the next agent: what's in progress and how to continue. Not project documentation. Delete it when 0.10.0 ships, or rewrite it at the next wrap-up.

**Start here.** The next agent raises the "For the user" list below with the user before anything else.
- [plan-0.10.0.md](plan-0.10.0.md) holds the design and every decision.
- [mods-gotchas.md](mods-gotchas.md) holds what took time to find out.
- [README.md](README.md) covers branches and releases.

**Why it stopped:** on 2026-11-23 the user asked the orchestrator (`cachebeat-cf`) to finish everything that didn't need them, write this file, and have `clear` close every session. Nothing is half done: no worktree, no session mid-task, and no unmerged branch except the release branch.

## Where things are

| | State |
| --- | --- |
| `main` / `origin/main` | 0.9.3 (`740ae82`), released 2026-11-23. |
| `v0.10.0` | The release branch, pushed, [PR #14](https://github.com/404Mayank/cachebeat/pull/14). It holds only the plugin files and the new GIF, taken from `dev` at `dbfeb15`, plus `version` 0.10.0. **Not merged: shipping is the user's call.** |
| `dev` | Pushed and clean. 0.10.0's steps 0–9 are all merged: tokens only, request start, retry, compat, midturn, 3c, 4 (resume), the race fix, 5 (the cold guard), 6 (Status), 7 (Stats), 8 (the GIF) and 9 (the README). `version` is 0.10.0. 326/0 on all four engines. |
| `long-turn`, `v0.8.2`, `worktree-agent-…` | Older branches, not from this work. Leave them. |

## For the user: decisions taken, and what to raise (keep this list current)

The next agent raises these with the user before anything else. The user said on 2026-11-23: build everything up to the release, but **don't ship**; and the orchestrator decides as it understands, recording here what the user should know, look at, or weigh in on.

- **Ship 0.10.0?** It's the user's call. Everything up to it is done:
  - [PR #14](https://github.com/404Mayank/cachebeat/pull/14) (`v0.10.0` into `main`) is open, with CI on it.
  - The release branch passes 326/0 and `validate --strict` on 2.1.287, 2.1.322, 2.1.329 and 2.1.330.

  To ship, follow notes/README.md, "Releasing, step by step", from step 5:
  1. Fast-forward `main` (`git push origin v0.10.0:main`). CI then tags and releases.
  2. Put the draft below on top of the release notes (`gh release edit v0.10.0`).
  3. Merge `main` into `dev`.
  4. Delete the local `v0.10.0` branch.
  5. Delete this file, or rewrite it.
- **The Status and Stats mock-ups** (plan items 5 and 7, redrawn in tokens on 2026-11-23) were approved by the orchestrator, which took the recommended option on all eight choices under "What steps 6 and 7 wait on":
  1. the Cache row in `/usage`'s form
  2. the weighted size kept
  3. the Usage row hidden when no limits are reported
  4. the last beat's figures on Status
  5. columns, not a range switch
  6. a This session column
  7. a one-row strip of beats by day
  8. "kept warm" counting only a turn after the cache would have lapsed without beats

  The user may want to tweak any of them. The mock-ups are in the plan.
- **Step 4 changed one behaviour (accepted by the orchestrator and the reviewer):** `/resume` into a conversation with no record follows **New sessions start**. Before, it kept the on/off of the conversation left behind. When that turns beating off, a line says so.
- **Owed live check (step 4):** that a resumed conversation's first turn reads a cache that beats kept warm. It needs a wait of over an hour. Both the resume line's "likely warm" and Claude Code's own `prompt_cache_likely_expired` assume it does.
- **The beat race** (a timer beat and `/cachebeat now` both sending) is fixed on `dev` (2026-11-23) and ships with 0.10.0. 0.9.3 still has it; it's rare and costs one extra beat. No 0.9.4 was cut for it.
- **Decision changed from the user's answer (2026-11-23): "don't send" now closes the question after 5 minutes.** A live check showed Claude Code runs one prompt at a time, so an open cold question holds every queued message, peer messages from the fleet included, until it's answered. With "stays open" as chosen, that could stall the fleet for hours. Under the default "don't send", the question now closes after 5m unanswered and the message is dropped; it stays in the composer, nothing is sent. The README says that other incoming messages wait while a question is open. The alternatives were: keep it open and only document it, make a timed send the default, or close it when another message is queued (no API for that). Ask the user whether 5m is right.
- **Owed live checks for the guard, which need the user's devices:**
  - **G4:** does the question reach a Remote Control client, and can it be answered there? Until then, `bridge` messages pass unasked.
  - **G5:** does `$.ui.ask` draw in the desktop app? Two outcomes would matter. If it rejects at once, every cold send there drops until the guard is turned off. If its ask doesn't go through the AskUserQuestion `tool.call`, the 5m close can't close it, and queued messages wait until it's answered.
  - **P6:** does dropping a skill's prompt undo its `command.run`?
- **After `/model`, the cold guard reads the cache as warm** (step 5 review), though the new model's cache is empty. The first message after a switch re-caches the whole conversation without asking. Left as is: `state` judges it the same way, and the user just chose the switch. Say if the guard should ask there too.
- **The demo GIF (step 8): the orchestrator took the storyboard's recommendations** (plan, item 8):
  - the cold question first
  - stop at the second beat
  - Status alone, no flick to Stats
  - the animation-picker scene dropped
  - takes recorded with `--model sonnet`
  - the old demo session as the source, refreshed

  **Look at the GIF before shipping** (`assets/demo.gif`, 26.6s, on `dev` and the release branch). It becomes public once it's on `main`.
  - It opens on the guard's question, with a hidden `/cachebeat` line above it. That hides the "Remote Control disconnected" notice, which would otherwise be in frame.
  - Status shows four rows (Cache, Beating, Size, Cold guard), so no usage percentage appears.
  - A Claude Code spinner tip shows for about 2s during the answer.
- **The GIF shows two things the old one didn't:** `← 2 agents` in the footer, and "1 agent type / 1 skill available" under the first message. Both are probably from this machine's setup rather than the plugin (inferred). The orchestrator kept them, because the fleet can't be closed for the take. Look at them in the GIF before shipping.
- **Leftover fork session files from the GIF work** are under ~/.claude/projects/-home-zyrus-Desktop-Projects/, all .jsonl from 2026-11-23:
  - 12:31–12:43: `5fae1024-…`, `6d96bcd6-…`, `6bae1637-…`, `eae6b2e8-…`, `896b9994-…`
  - 14:55–15:16 (previews and the final take, `adfad2a7-…`): `ad2bd4af-…`, `9fa1d4c3-…`, `9b494cdf-…`, `b9c9936f-…`, `7d30cd56-…`, `d3c854dc-…`, `3c65696e-…`, `d3894c45-…`, `adfad2a7-…` They were left in place; delete them if you like. The demo source `adb66a7d-…` was refreshed with one Sonnet turn at 12:51 ("ok, thanks").
- **Your Remote Control session disconnected: "Trusted devices now required — run /remote-control to start a new session".** It showed while the demo source was being refreshed, 2026-11-23 12:51. It's an account change, not cachebeat's. It is now in the demo source's transcript, so the GIF's opening screenful may show it. The final take kept it out of frame.
- **Unverified on a real surface (step 6):** Status draws before the pane's `Input` check, so a surface without Input still shows it. It assumes such a surface has `Button`, and nothing at hand could check it. The desktop app hasn't been looked at for Status either.
- **Step 7 decisions:**
  - The "Prompt heart" tab is renamed **Heart**, so seven tabs fit 76 cells. The settings keep their full names.
  - A cold send is counted whether or not the guard asked, but the "sent on a cold cache" line is logged only where the guard logs it today. With the guard off it counts silently.
  - A full plugin store costs only records and Stats; beating goes on.
- **Live checks left probe `session:<id>` records in the real plugin store** (steps 4 and 7). They are pruned 30 days after their last write.
- **Fable 5.2 and Mythos 5.2 have rows in hooks/prices.ts** (step 7): input $8, cache read $0.20, 5m write $10, 1h write $16 per million tokens. Checked against the claude-api skill's model table, citing https://platform.claude.com/docs/en/about-claude/pricing. Mythos 5.2 is for verified organizations only, priced the same.
- **Step 9's README sweep (`step-readme`, 2026-11-23)** checked the README against the code:
  - Features gained the cold guard (on from the start, even with beating off) and the Status and Stats pages.
  - Privacy now lists everything the conversation record keeps. It had missed the time the cache was last read, and the turns kept warm and guard questions in the day counts.
  - Good to know gained "don't run another keep-warm plugin beside cachebeat".
  - The GIF has its new alt text.
  - "Beat after idle" was left as it is, because the Good to know bullet on the request start reads true against the code.
  - No shipped text was wrong. Every field `state` returns (`sessionOf`, `cacheOf`, `contextOf`, `whole`) is described in `STATE`, and every field described is returned.
- **A wording mismatch, seen in the GIF:** with a keep-alive time that the cache outlasts, bare `/cachebeat` says `no more beats needed`, while Status's Beating row says `no beat needed`. It's small; one wording could be picked in 0.10.1.
- **The tsc check:** every engine's type-check ran through `validate --strict`. `tsc -p .` ran against the main checkout's types.

## 0.10.0 release notes (draft)

Drafted on 2026-11-23 in step 9; nothing is published. This is the top section. The rest of the notes follow the usual pattern (notes/README.md, "Releasing, step by step"). Each line was checked against `git diff main -- README.md` and the code at `c279dde`.

> [!IMPORTANT]
> **`/cachebeat <time>` changed.** It now sets how long to keep the cache warm, and it needs a unit: `/cachebeat 2h` keeps the cache warm for two hours, then turns this session off. It used to set the beat interval in minutes (`/cachebeat 30`). A bare number now changes nothing and says so. The interval is a setting: **Beat after idle** in `/cachebeat settings`, or `/cachebeat global 30`.

**Changed**

- **The cold guard is on by default.** Before your message goes to a session whose cache has gone cold, cachebeat asks first. It says how long the cache has been cold and how many tokens sending the message caches again. It asks in chats of 20k tokens or more, whether beating is on or not. A question left unanswered doesn't send the message, and it closes after 5 minutes. To turn the guard off, run `/cachebeat guard off` for one session, or set **Cold guard** under Limits in `/cachebeat settings`. Messages from Remote Control, other sessions, scheduled tasks and `claude -p` are sent without asking.
- **A resumed conversation keeps its on or off,** and any keep-alive time, for 30 days from its last change. A conversation with no record starts as **New sessions start** says, and that now includes `/resume`, which used to keep the on or off of the conversation you left.
- **Bare `/cachebeat` opens the new Status page.** It still answers with its line, which now ends with whether the cache is warm or cold.
- **The "Prompt heart" tab is now "Heart".** Its settings are the same.
- **The prompt heart shows during a turn too.** It holds still while a request of the turn is on its way.

**New**

- **Keep-alive time:** `/cachebeat 2h`, `45m` or `1h30m` (5 minutes to 48 hours) keeps the cache warm for that long, then turns the session off. Your messages don't extend it, and the turn line shows the time left.
- **The Status page** (`/cachebeat`) shows the cache as it stands: warm or cold, its size, the next beat, the cold guard and your usage limits.
- **The Stats page** (`/cachebeat stats`) shows, for today, 7 days, 30 days and this session:
  - what beats cost
  - what they saved
  - the net, in input tokens
  - cold sends
- **Claude can read its context:** ask it how full the context window is, when it will compact, and whether the cache is still warm.
- **A command typed while Claude is working** answers at once in a toast.

## Findings worth knowing before you touch anything

All are recorded in full in mods-gotchas.md or the plan; this is the index.

- **The cache's lifetime counts from a request's start.** Anthropic's docs say so, and one trial with a control confirmed it on the forced five-minute cache (mods-gotchas, "The lifetime counts from a request's start": the table, and how to script such a trial with `claude -p`). Not checked: the one-hour cache, an interactive session.
- **A command typed mid-turn runs at once, but its reply is drawn only when the turn ends** (3 of 3 runs, 2.1.322), against what the declarations say. A `$.ui.toast` and a `$.ui.log` from `command.run` both draw at once. The engine draws `PromptHint` while working, with props `{ isDraft, isWorking, hint }`. (mods-gotchas, "A command typed mid-turn")
- **2.1.287 runs locally without approving npm's install script:** `npm install @anthropic-ai/claude-code@2.1.287` in a scratch folder, then run `node_modules/@anthropic-ai/claude-code-linux-x64/claude plugin test <a copy of the repo>` (`git archive HEAD | tar -x -C <scratch>`). Run every step's suite there before merging. (mods-gotchas, "Old versions")
- **Which coding rules still bind** (plan, "For every step, these bite", revised after a probe on 2.1.287 and 2.1.322 under `plugin validate` and `plugin test`; none of it ran in a live session):
  - Still binding: a function handed `$` is declared at the top of the file, and on 2.1.287 its name is used nowhere else in the file.
  - Directory-only, no longer binding: cast constants in `$` calls, non-literal matchers, non-plain `$` calls, and naming something `h` or `Fragment`. New code may use these shapes; existing code isn't rewritten.
- **Two hooks on one event with the same matcher are accepted on 2.1.287** (the test kit; a live load wasn't tried). Step 3b registers `command.run` twice.
- **Known and accepted, from the request-start review:**
  - A turn whose requests cachebeat didn't see (a reload mid-turn) that ran longer than the cache's lifetime is stamped at its start (`now - e.durationMs`) and read as cold. On the five-minute cache with **Cache gone cold** set to stop, that switches cachebeat off. A later fix could let `turn.step` adopt a main-loop step seen while `!busy && !beating`.
  - A last request answered with `usage: null` stamps nothing: `lastWarm` stays at the previous request, the safe side. Left on purpose.
  - **Fixed in `step-race` (2026-11-23): `beat()` claims `beatClaimed` at entry,** before its first await, and lets go at the fork's answer (before the answered branches schedule, as the retry fix needs) or at any earlier exit, a throw included (try/finally). Found 2026-11-23 porting to 0.9.3: `beat()` checked `if (beating)` before several awaits (`$.session.usage`, `isRewound`, `$.session.model`, the clock) but set `beating` only after them, so a timer beat and a `/cachebeat now` entering together both forked. On 0.9.3 too: the fix isn't carried there. `beating` itself is unchanged, since `turn.complete`, `turn.start` and the settings changes read it as "a fork is on its way"; see mods-gotchas, "A beat's claim".
- **cache-tax** ([karanb192/cache-tax](https://github.com/karanb192/cache-tax), MIT, read at 2.4.2) is a mod the Stats page draws ideas from; the page is not named after it (the user, 2026-11-23). What it does that cachebeat could borrow, and what was taken, is in the plan, "From cache-tax" and "Decided from it". Credit it in the README only if what's taken is substantial (the user).
- **The idle cost rise** (+$0.002 with nothing running, step 2's live check) touches no figure now. Leave it unless testing shows it again (the user).

## How the work is run

The user's preferences are in the orchestrator's memory (`agent-fleet`, `one-change-at-a-time`, `no-plugin-directory`, `dev-branch-notes`, `readme-user-facing`).

- **The main session orchestrates and decides.** The user said "you are orchestrating so take decisions as per your understanding". It records each decision, and anything the user should see, in "For the user" above. It doesn't ship without the user.
- **The fleet is peer sessions** named `cachebeat<Model><Effort><NN>`, spawned by the `clear` session with `--model` and `--effort` on the command line, and reached with SendMessage. `clear` also clears, renames, retunes, closes and reports context fill and account usage.
  - **Effort by job** (the user's experience):
    - high: reviews and planning
    - medium: coding
    - low: work with a clear path
    - xhigh: only when stuck
  - **Model by job:**
    - Opus medium: the harder builds
    - Sonnet high: builds with a detailed plan, and grunt work such as GIF timing
    - Opus high: reviews, design and storyboards
  - **One-offs** use a fresh subagent or a self-fork, which cache for 5m. **Sessions** are for work whose context carries forward, at 1h.
- **Context:** clear a session once its work is merged and in the notes. Clear a cold-cache session rather than re-reading it, and keep a warm one while its context is still needed. About 300k tokens is the user's rough mark.
- **Usage:** watch the 5-hour window through `clear`. On 2026-11-23 the work paused at 87% and resumed after the reset, using a one-shot cron.
- **Each step:**
  1. Build in its own worktree (`git worktree add ../cachebeat-<step> -b step-<name> dev`, then copy `.claude-plugin/types` in).
  2. Every change gets a test that fails without it, and builders mutation-check.
  3. Run check.sh on a fresh clone. It runs the tests and `validate --strict` on 2.1.287, 2.1.322, 2.1.329 and 2.1.330; the binaries live in a session scratchpad, and mods-gotchas "Old versions" says how to get them.
  4. Run `tsc`.
  5. Have it reviewed: findings ranked, with file:line, a sequence of events and a fix.
  6. Fix, re-review by diff range, then merge `--no-ff`.
- **Commits:** plugin files and notes go in separate commits, with no attribution lines. Name them `cachebeat 0.10.0 (<step>): …` and `dev notes: …`.

## Fleet at close (2026-11-23)

`clear` closed every session at the end, `cachebeat-cf` and itself included. A new fleet is spawned fresh through a new `clear` session. The names used were `cachebeatOpusHigh01`, `cachebeatOpusMedium01` (once `cachebeatOpusXhigh01`), `cachebeatSonnetHigh01` and `cachebeatSonnetHigh02`. ListAgents also shows old offline Remote Control rows with the same names, so use the refs.

## Traps

- **Two installed copies of cachebeat, and `--settings` must name both** (found 2026-11-23, step 5). The account also has a synced copy (`~/.claude/plugins/synced/…/cachebeat`, loaded as `cachebeat@synced`), so `"cachebeat@cachebeat": false` alone leaves it running. In a probe that loads no copy of ours, pass `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false}}'`, and check the debug log for "hooks module cachebeat@". A `--plugin-dir` copy shadows both. The G1–G3 probe ran with the synced copy loaded; its probe hooks weren't affected.
- **Retuning a session with `/effort` also saves that effort as the user's default for its model** (`modelSettings` in ~/.claude/settings.json). Found 2026-11-23, when `claude-opus-5-5` was saved as medium. Spawn sessions with `--effort` on the command line, and tell the user when a retune changes their default.
- **Chain a merge's follow-ups only after it succeeds.** On 2026-11-14 a `git merge` that conflicted in the plan was followed in the same command by tests, a push, and a worktree removal, which all ran. Nothing was lost (the branch still held the commits), but the suite's result was for the wrong tree. Merge first, look, then run the rest.
- **Two sessions editing the same notes file conflict at merge.** The orchestrator and a builder both edited the plan's "Still open". While a builder's branch is open, leave the files it was told to edit, or expect to resolve by hand.
- **Loading the plugin from a folder regenerates its `.claude-plugin/types`** for the engine that loaded it. Never `--plugin-dir` a step's worktree: probe from a scratch copy.
- **A live check must not touch user settings.** No `/model`, no `/effort`. To keep the installed cachebeat out of a test session: `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false}}'`.
- **A beat right after a conversation's first turn pauses** ("out of a beat's reach"). Every live test needs two turns before it means anything.
- **`claude -p` waits 3 seconds for stdin** unless given `< /dev/null`, and its `--output-format json` is an array: the entry with `type: "result"` holds `usage`.
- **Check `origin/main` and `origin/dev` before cutting a release.** Cloud sessions release and push notes too; a version number was nearly reused.
- **The release branch takes plugin files from a specific commit when `dev` holds later work:** branch from that commit, merge `origin/main` into it, then `git checkout <it> -- .claude-plugin hooks types README.md LICENSE .github` on the release branch.
- **`tsc -p .` in a fresh worktree has no `.claude-plugin/types`** (it's git-ignored and written only when Claude Code loads the plugin). Found 2026-11-23, step 9. Without those types, `tsconfig.json`'s `extends` finds nothing, so `tsc` falls back to its defaults: it fails, and it writes a `.js` beside every hook. Copy the types from the main checkout first (`cp -r ../cachebeat/.claude-plugin/types .claude-plugin/`), and never `--plugin-dir` the worktree.
- **`claude plugin validate --strict .` fails on `dev`** for `CLAUDE.md` at the plugin root. Expected: run it on the release branch.

## Docs to update when things land

- notes/README.md, "How 0.7.0 went out, as a pattern": a line for 0.10.0 when it ships.
- mods-gotchas.md, "0.10.0 probes": add G4, G5 and P6 when they're run.
- plan-0.10.0.md: its status line when 0.10.0 ships.
- This file: delete it when 0.10.0 ships.
