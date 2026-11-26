# Handoff: 0.10.0 shipped; what's still owed (2026-11-26)

> Temporary handoff for the next agent: what's open and how the work is run. Not project documentation. Rewrite it at the next wrap-up, and delete it once the open items are done or moved.

**Start here.** Raise the "Open, for the user" list with the user before anything else.
- [plan-0.10.0.md](plan-0.10.0.md) holds 0.10.0's design and every decision; [plan-demo-gif.md](plan-demo-gif.md) the demo GIF's.
- [mods-gotchas.md](mods-gotchas.md) holds what took time to find out.
- [README.md](README.md) covers branches and releases.

## Where things are

| | State |
| --- | --- |
| `main` / `origin/main` | 0.10.0, shipped 2026-11-26 ([PR #14](https://github.com/404Mayank/cachebeat/pull/14)); CI tags and releases it. |
| `dev` / `origin/dev` | `main` merged back in; the plugin files match `main`. |
| `long-turn`, `v0.8.2`, `worktree-agent-…` | Older branches, not from this work. Leave them. |

## Open, for the user

- **Owed live checks, which need the user's devices:**
  - **G4:** does the cold guard's question reach a Remote Control client, and can it be answered there? Until then, `bridge` messages pass unasked.
  - **G5:** does `$.ui.ask` draw in the desktop app? If it rejects at once, every cold send there drops until the guard is turned off. If its ask doesn't go through the AskUserQuestion `tool.call`, the 5m close can't close it, and queued messages wait until it's answered.
  - **P6:** does dropping a skill's prompt undo its `command.run`?
  - **Resume (step 4):** that a resumed conversation's first turn reads a cache that beats kept warm. It needs a wait of over an hour. The resume line's "likely warm" and Claude Code's own `prompt_cache_likely_expired` both assume it does.
- **Is 5 minutes right for closing an unanswered cold question?** Decided 2026-11-23 against the user's first answer ("stays open"): an open question holds every queued message, peer messages included, so it could stall the fleet for hours. Unanswered, the message isn't sent and stays in the composer. The alternatives were: keep it open and only document it, make a timed send the default, or close it when another message is queued (no API for that).
- **The Status and Stats choices** (plan, item 5, "What steps 6 and 7 wait on") were taken by the orchestrator, except the Size row, which the user changed on 2026-11-25. The user may still want to tweak any of them.
- **A progress bar filling toward the next beat** (in the turn line, recommended; or a row above the prompt; or the hint row) was discussed on 2026-11-26 and deferred by the user.
- **Unverified on a real surface (step 6):** Status draws before the pane's `Input` check, so a surface without Input still shows it, assuming it has `Button`. The desktop app hasn't been looked at for Status.
- **Leftover session files from the GIF and the live tests** may be deleted by the user. They're in the ProgLang project folder (`3c20ee7b-…`, the GIF's source, plus `9bc732df-…`, `21c495ec-…`, `5579f610-…`, `b626a422-…`), and under `clear`'s scratch test folder (`631776a3-…` and the Sonnet test's). Probe `session:<id>` records in the plugin store are pruned 30 days after their last write.

## Findings worth knowing before you touch anything

All are recorded in full in mods-gotchas.md or the plan; this is the index.

- **The cache's lifetime counts from a request's start.** Anthropic's docs say so, and one trial with a control confirmed it on the forced five-minute cache (mods-gotchas, "The lifetime counts from a request's start": the table, and how to script such a trial with `claude -p`). Not checked: the one-hour cache, an interactive session.
- **A command typed mid-turn runs at once, but its reply is drawn only when the turn ends** (3 of 3 runs, 2.1.322), against what the declarations say. A `$.ui.toast` and a `$.ui.log` from `command.run` both draw at once. The engine draws `PromptHint` while working, with props `{ isDraft, isWorking, hint }`. (mods-gotchas, "A command typed mid-turn")
- **Retired 2026-11-25 (the floor is now the installed version):** 2.1.287 runs locally without approving npm's install script: `npm install @anthropic-ai/claude-code@2.1.287` in a scratch folder, then run `node_modules/@anthropic-ai/claude-code-linux-x64/claude plugin test <a copy of the repo>` (`git archive HEAD | tar -x -C <scratch>`). Run every step's suite there before merging. (mods-gotchas, "Old versions")
- **Which coding rules still bind** (plan, "For every step, these bite", revised after a probe on 2.1.287 and 2.1.322 under `plugin validate` and `plugin test`; none of it ran in a live session):
  - Still binding: a function handed `$` is declared at the top of the file (current `validate` checks it). Retired with the 2.1.287 floor (2026-11-25): its name used nowhere else in the file.
  - Directory-only, no longer binding: cast constants in `$` calls, non-literal matchers, non-plain `$` calls, and naming something `h` or `Fragment`. New code may use these shapes; existing code isn't rewritten.
- **Two hooks on one event with the same matcher are accepted on 2.1.287** (the test kit; a live load wasn't tried). Step 3b registers `command.run` twice.
- **Known and accepted, from the request-start review:**
  - A turn whose requests cachebeat didn't see (a reload mid-turn) that ran longer than the cache's lifetime is stamped at its start (`now - e.durationMs`) and read as cold. On the five-minute cache with **Cache gone cold** set to stop, that switches cachebeat off. A later fix could let `turn.step` adopt a main-loop step seen while `!busy && !beating`.
  - A last request answered with `usage: null` stamps nothing: `lastWarm` stays at the previous request, the safe side. Left on purpose.
  - **Fixed in `step-race` (2026-11-23): `beat()` claims `beatClaimed` at entry,** before its first await, and lets go at the fork's answer (before the answered branches schedule, as the retry fix needs) or at any earlier exit, a throw included (try/finally). Found 2026-11-23 porting to 0.9.3: `beat()` checked `if (beating)` before several awaits (`$.session.usage`, `isRewound`, `$.session.model`, the clock) but set `beating` only after them, so a timer beat and a `/cachebeat now` entering together both forked. On 0.9.3 too: the fix isn't carried there. `beating` itself is unchanged, since `turn.complete`, `turn.start` and the settings changes read it as "a fork is on its way"; see mods-gotchas, "A beat's claim".
- **cache-tax** ([karanb192/cache-tax](https://github.com/karanb192/cache-tax), MIT, read at 2.4.2) is a mod the Stats page draws ideas from; the page is not named after it (the user, 2026-11-23). What it does that cachebeat could borrow, and what was taken, is in the plan, "From cache-tax" and "Decided from it". Credit it in the README only if what's taken is substantial (the user).
- **The README doesn't offer asking Claude whether the cache is warm** (the user, 2026-11-26): asking sends a request that re-caches the conversation, so the answer is always warm. Status and the turn line show it without a request. A live test found Haiku doesn't search for the deferred `state` tool on such a question, while Sonnet does.
- **The idle cost rise** (+$0.002 with nothing running, step 2's live check) touches no figure now. Leave it unless testing shows it again (the user).

## How the work is run

The user's preferences are in the orchestrator's memory (`agent-fleet`, `one-change-at-a-time`, `no-plugin-directory`, `dev-branch-notes`, `readme-user-facing`).

- **The main session orchestrates and decides.** The user said "you are orchestrating so take decisions as per your understanding". It records each decision, and anything the user should see, in "Open, for the user" above. It doesn't ship without the user.
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
  3. Run check.sh on a fresh clone. It runs the tests and `validate --strict` (the release files only) on the installed `claude`. Since 2026-11-25 the floor is the installed version and no old engines are tested (the user); before that, check.sh ran 2.1.287, 2.1.322, 2.1.329 and 2.1.330. It is [check.sh](check.sh) (`notes/check.sh <branch>`, from anywhere in the repo): a fresh clone of the branch, `claude plugin test` failing unless `^ 0 fail`, and `validate --strict` on `.claude-plugin hooks types README.md LICENSE .github` and the marketplace.
  4. Run `tsc`.
  5. Have it reviewed: findings ranked, with file:line, a sequence of events and a fix.
  6. Fix, re-review by diff range, then merge `--no-ff`.
- **Commits:** plugin files and notes go in separate commits, with no attribution lines. Name them `cachebeat 0.10.0 (<step>): …` and `dev notes: …`.

## The fleet

On 2026-11-23 `clear` closed every session. In the 2026-11-25/26 round, `clear` spawned `cachebeatOpusHigh01` (the GIF's director), `cachebeatOpusMedium01` (changes 1–5) and `cachebeatSonnetHigh01` (the GIF's builder). Reviews were fresh Opus subagents. The two builders are closed. The names repeat across rounds, and ListAgents also shows old offline Remote Control rows with the same names, so address sessions by their live refs.

**`clear` can interrupt a busy session:** on 2026-11-26 it sent the GIF builder an Escape while reading its status, which stopped a running render. Ask `clear` to read status lines only, and never send keys to a busy session.

## Traps

- **Two installed copies of cachebeat, and `--settings` must name both** (found 2026-11-23, step 5). The account also has a synced copy (`~/.claude/plugins/synced/…/cachebeat`, loaded as `cachebeat@synced`), so `"cachebeat@cachebeat": false` alone leaves it running. In a probe that loads no copy of ours, pass `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false}}'`, and check the debug log for "hooks module cachebeat@". A `--plugin-dir` copy shadows both. The G1–G3 probe ran with the synced copy loaded; its probe hooks weren't affected.
- **`/model` in any session saves that model as the user's default** (`model` in ~/.claude/settings.json; the notice says so). On 2026-11-26 a live test's `/model sonnet` and `/model haiku` left the user's default on haiku. Launch test sessions with `--model`, and tell the user if a test changes it.
- **Retuning a session with `/effort` also saves that effort as the user's default for its model** (`modelSettings` in ~/.claude/settings.json). Found 2026-11-23, when `claude-opus-5-5` was saved as medium. Spawn sessions with `--effort` on the command line, and tell the user when a retune changes their default.
- **Chain a merge's follow-ups only after it succeeds.** On 2026-11-14 a `git merge` that conflicted in the plan was followed in the same command by tests, a push, and a worktree removal, which all ran. Nothing was lost (the branch still held the commits), but the suite's result was for the wrong tree. Merge first, look, then run the rest.
- **Two sessions editing the same notes file conflict at merge.** The orchestrator and a builder both edited the plan's "Still open". While a builder's branch is open, leave the files it was told to edit, or expect to resolve by hand.
- **Loading the plugin from a folder regenerates its `.claude-plugin/types`** for the engine that loaded it. Never `--plugin-dir` a step's worktree: probe from a scratch copy.
- **A live check must not touch user settings.** No `/model`, no `/effort`, and sandbox cachebeat's store: a mod answering cachebeat's `store.*` ops from memory, loaded before it (as on 2026-11-26), so settings changed in the test never reach the user's store. To keep the installed cachebeat out of a test session: `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false}}'`.
- **A beat right after a conversation's first turn pauses** ("out of a beat's reach"). Every live test needs two turns before it means anything.
- **`claude -p` waits 3 seconds for stdin** unless given `< /dev/null`, and its `--output-format json` is an array: the entry with `type: "result"` holds `usage`.
- **Check `origin/main` and `origin/dev` before cutting a release.** Cloud sessions release and push notes too; a version number was nearly reused.
- **The release branch takes plugin files from a specific commit when `dev` holds later work:** branch from that commit, merge `origin/main` into it, then `git checkout <it> -- .claude-plugin hooks types README.md LICENSE .github` on the release branch.
- **`tsc -p .` in a fresh worktree has no `.claude-plugin/types`** (it's git-ignored and written only when Claude Code loads the plugin). Found 2026-11-23, step 9. Without those types, `tsconfig.json`'s `extends` finds nothing, so `tsc` falls back to its defaults: it fails, and it writes a `.js` beside every hook. Copy the types from the main checkout first (`cp -r ../cachebeat/.claude-plugin/types .claude-plugin/`), and never `--plugin-dir` the worktree.
- **`claude plugin validate --strict .` fails on `dev`** for `CLAUDE.md` at the plugin root. Expected: run it on the release branch.

## Docs to update when things land

- mods-gotchas.md, "0.10.0 probes": add G4, G5 and P6 when they're run.
- notes/README.md, "How 0.7.0 went out, as a pattern": a line for each release.
