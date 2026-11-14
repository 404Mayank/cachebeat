# Handoff: 0.9.3 waits on one test, 0.10.0 is built through the request-start fix (2026-11-14)

> Temporary handoff for the next agent: what's in progress and how to continue. Not project documentation; delete when the work lands.

Start here. The design and every decision are in [plan-0.10.0.md](plan-0.10.0.md); what took time to find out is in [mods-gotchas.md](mods-gotchas.md); branches and releases are in [README.md](README.md). This file says where things stand, what to do next, what the user still has to answer, and how the work is run.

**Why it paused:** the orchestrating session (`cachebeatOrch`) was asked to wrap up after the request-start fix merged. Nothing is half done: no worktree, no unmerged branch, no session mid-task.

## Where things are

| | State |
| --- | --- |
| `main` / `origin/main` | 0.9.2 (`c84ac68`). Local `main` is 8 commits behind `origin/main`: fast-forward it before using it. |
| `v0.9.3` | The 0.9.3 release branch (`efa2be6`, pushed), [PR #13](https://github.com/404Mayank/cachebeat/pull/13), CI green on 2.1.287 and latest. Checked out in the worktree `/home/zyrus/Desktop/Projects/cachebeat-rel`. Waits only on the user's live sleep check, and on one decision: whether the request-start fix goes into it (below). |
| `dev` | `05294d1`, pushed, clean. Steps 0, 1, 2, 2b, 3, 3b of 0.10.0, the tokens-only step and the request-start fix are merged. `version` in `.claude-plugin/plugin.json` still reads 0.9.2; 0.10.0's release step bumps it. |
| Checks on `dev` | Run 2026-11-14 at `05294d1`: `claude plugin test .` 209 pass, 0 fail on 2.1.322 and on the 2.1.287 binary; `tsc` clean. |
| CI on `dev`'s `ci.yml` | Type-checks on both legs; a `floor` job reads the minimum version from the README badge. **It has never run on GitHub**: PR #13 ran `main`'s old file, so the 0.10.0 release PR is its first run. |
| `tmp-093` | Local scratch branch the 0.9.3 release took its files from. Delete after 0.9.3 is out. |
| `long-turn`, `v0.8.2`, `worktree-agent-…` | Older branches, not from this work. Leave them. |
| The plugin directory | Dropped (2026-11-14): it lists verified organizations only. No portal check is a release step, and "the directory will flag it" is not a design risk. [directory.md](directory.md) is kept as a record. |

**What 0.9.3 is:** step 1 alone: beats timed by the wall clock (the sleep fix), the **Cache gone cold** setting, the "due now" wording, and `state.cache`. It was planned as 0.9.2, a number a cloud session had already used, so read "0.9.2" in step 1's commit messages and plan text as 0.9.3.

## Built on 2026-11-14

Each was built in its own worktree, checked on both engine versions, reviewed, and merged with `--no-ff`.

| Step | Merge | What it does | Checked live? |
| --- | --- | --- | --- |
| 3b | `32ec2f8` | The prompt heart shows through a turn while cachebeat is on (still while a request is on its way, beating on a quiet turn's countdown); the desktop band keeps its line through a turn; a `/cachebeat` command typed mid-turn gets a toast with its reply. | The heart and the toast, in a terminal on 2.1.322. The desktop band was not. |
| Tokens only | `bb5ef82` | No dollar figure in anything users or Claude read. `hooks/prices.ts` keeps the table and `ratiosOf(model)` (read, 5m-write and 1h-write ratios to input, `isListed`) for step 7; nothing in the plugin imports it yet. | Tests only. |
| Request start | `05294d1` | `s.lastWarm` is when the last request that touched the cache was **sent**, not when its answer ended. One beat in flight at a time (`beat()` returns while `beating`), which also stops `/cachebeat now` from sending a second fork beside a scheduled one. | Tests only. The rule itself was confirmed live (below). |

Also done: the README's Important note that `/cachebeat <time>` changed in 0.10.0 (above Features; repeat it on top of the 0.10.0 release notes, and take it out a release or two later); item 10 designed; the plan brought in line with the day's decisions.

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
- **cache-tax** ([karanb192/cache-tax](https://github.com/karanb192/cache-tax), MIT, read at 2.4.2) is the mod the CacheTax page is named after. What it does that cachebeat could borrow, and what was taken, is in the plan, "From cache-tax" and "Decided from it". Credit it in the README only if what's taken is substantial (the user).
- **The idle cost rise** (+$0.002 with nothing running, step 2's live check) touches no figure now. Leave it unless testing shows it again (the user).

## What to do next, in order

One step at a time: build, check on both versions, review, fix, merge, then the next. Line numbers are `dev` at `05294d1`; each names its symbol so it can be found after edits.

1. **Ask the user the open questions** (next section). Step 3c and step 5 are designed around recommendations the user hasn't confirmed.
2. **0.9.3**, when the user has run the sleep check (P1):
   - The retest: `claude --plugin-dir /home/zyrus/Desktop/Projects/cachebeat-rel --settings '{"enabledPlugins":{"cachebeat@cachebeat":false}}' --model haiku --debug`; send two messages; `/cachebeat 3`; wait for one beat (`kept warm ×1`); suspend about 10 minutes; wake. Expected: a beat within about a minute (`×2`), the line reading `next in 3m`, not a stuck `next in 1m`. Record the result under "0.10.0 probes" (P1) in mods-gotchas.md from `~/.claude/debug/<session>.txt`.
   - **If the user wants the request-start fix in 0.9.3** (recommended): carry `c67d76a` and `9ec1e50` onto `v0.9.3`. A scratch cherry-pick of `c67d76a` applied its logic cleanly with four small conflicts: two in `hooks/register.tsx` (a comment near `schedule()`, and the `when()` string, both on lines 0.10.0 changed), one in `hooks/tools.ts`, one in the tests. Rerun the three checks on the branch, push it, let CI run on the PR, and have the user run the sleep check on the new branch, so one test covers both.
   - Ship: notes/README.md, "Releasing, step by step", from step 5 (`git push origin v0.9.3:main`, a fast-forward; CI tags and releases). Then `gh release edit v0.9.3` and put on top: "Changed default: a cache gone cold now waits for your next message instead of switching cachebeat off; set Cache gone cold to stop for the old behavior."
   - Merge `main` into `dev`. **It conflicts** in `plugin.json`, `README.md`, `register.tsx`, `pane.tsx`, `tools.ts` and the tests, because the release was cut from step 1 and `dev` rewrote those lines. First `git log dev..origin/main` (it should list only the release commit). Then resolve every plugin file to `dev`'s side (`git checkout --ours -- <files>`), set `plugin.json` to `0.9.3`, rerun the checks, commit.
   - Remove the `cachebeat-rel` worktree and the `tmp-093` and `v0.9.3` local branches. Add a line to notes/README.md, "How 0.7.0 went out, as a pattern": 0.9.3 was step 1 cut from its own merge commit, because `dev` already held later work.
3. **Step 3c: Claude reads what it needs** (plan, item 10; a Sonnet fork can build it). `state` gains `only: ['context'|'cache'|'session'|'settings']`; a new `context` section; a loop's first read is answered whole; `set`'s answer gains `shadowed`; the schema is trimmed and answers print compact. Targets: `STATE` and `SET` in `hooks/tools.ts` (:79, :99), `ABOUT` (:10); `stateOf` in `hooks/register.tsx` (:788); the two `tool.call` hooks (:998, :1000). Live checks C1–C4 in the item come first. The description text in the item was written before the tokens-only step: it already assumes no dollars.
4. **Step 4: resume** (plan, item 2; an Opus fork). Targets: `classic.SessionStart` (:949), `session.start` (:906), `session.end` with `reason: 'resume'` (:940), `restored()` and the `Saved` type in `types/index.d.ts`. No write rate is learned from the resume hint; the hint's `context_tokens` seeds a size for the guard (`s.resumeTokens`, check R1 first). Hook order follows P3.
5. **Step 5: the cold guard** (plan, item 4, rewritten 2026-11-14; an Opus fork, Fable reviews). It asks `Send` / `Don't send` through `$.ui.ask`, speaks tokens, and has a new **if unanswered** setting. Probes G1–G5 come first: G1 (can an open ask be closed when a timeout sends the message? if not, the question becomes our own pane), G4 (does the question reach a Remote Control client and can it be answered there?), G5 (the desktop app). New settings go in `DEFAULTS` (:4), `normalize` (:59) and `TABS` (:285) in `hooks/settings.ts`, with an `ABOUT` entry each.
6. **Step 6: Status**, then **step 7: CacheTax** (plan, items 5 and 7). Tab ids are `summary` and `cachetax`; the Turn line tab keeps `status`. A `PAGES` list (the two read-only tabs, then `TABS`) is what the tab bar, hotkeys and the `ui.focus`/`ui.scroll` wrap walk. Both mock-ups still show `≈$` and are marked `[$?]`: redo them in tokens, CacheTax's net in input-token equivalents through `ratiosOf`. Both wait on a look pass against the user's `/usage` and `/stats` screenshots (described in the plan, "Decided from it") that the user approves. Test 633 in the pane tests is named "six tabs" and asserts five: fix the name when editing there.
7. **Step 8: the GIF.** The tape types `/cachebeat 5`, which step 3 refuses: change it.
8. **Step 9: the sweep and the release.** A full README pass, including a line telling users not to run another keep-warm plugin beside cachebeat (decided: a note, no detection), and whether the README's "Beat after idle" wording needs the request-start caveat. Bump `version`, cut the release branch, PR, ship.

## Open with the user

Asked on 2026-11-14 and not answered unless marked. Each has a recommendation.

**Proceeded on without an explicit answer. Reversible; tell the user plainly.**

- **Dollars removed everywhere.** The user said tokens are cachebeat's currency and that dollars go "everywhere or nowhere", asked what the orchestrator thought (remove), and then said to continue. To reverse: revert the merge `bb5ef82`.
- **Pushing `dev`.** The user said "push dev" once; `dev` was pushed after each merge and notes commit since. Nothing reads `dev`.

**Waiting for an answer.**

1. **Does the request-start fix go into 0.9.3?** Recommended: yes. It's a correctness bug in what the plugin exists to do, it's in the released 0.9.2 too, and 0.9.3 is already the beat-timing release.
2. **Item 10's six questions** (plan, item 10, "Open, for the user"). Recommended: keep the first-read rule; a README tip only for making Claude check its context, no system-prompt line; both a raw and a weighted re-cache figure; usage limits in `state`; compact answers.
3. **The guard's choices** (plan, item 4, marked as choices):
   - An unanswered question drops the message by default, or sends it after 1–15 minutes if set; a dismissal never sends. Should `drop` also close the question after a while?
   - Only terminal messages are asked about, plus Remote Control if G4 passes; `channel`, `slack-ping` and `unclassified` pass unasked, logged and counted as cold sends. cache-tax guards those too.
   - A dialog that can't be shown drops the message (everywhere else the guard fails open).
   - If G4 fails: the guard skips `bridge`, and the README suggests running `/cachebeat` before sending from a remote session (check first that `/cachebeat` answers over Remote Control).
4. **From the request-start fix:**
   - An answer that outlasts the cache ends with the generic "the cache went cold" line, which doesn't say the long answer caused it, and under **Cache gone cold** = stop it switches cachebeat off. Its own wording, or not switching off in that case?
   - "Beat after idle" (its help, `ABOUT.interval`, the README's settings row) now overstates the idle time by the last answer's length. A Good to know bullet was added; is that enough?
   - A beat that falls due as a long request ends fires at once, mid-turn. If the turn's tool is quick, that beat was redundant. Recommended: accept.
5. **From step 3b:** `/cachebeat settings` typed mid-turn toasts "settings opened" beside the pane it opens. Skip the toast there?
6. **The live sleep check (P1)** is the user's to run.

**Settled by the user on 2026-11-14** (in the plan, "Decided from it"): the directory is dropped; the guard asks and speaks tokens; Remote Control messages are held if a live check passes; no detection of other keep-warm plugins, a README note instead; credit cache-tax only for substantial borrowing; the idle cost rise is left alone; the README carries the Important note; the net on CacheTax is in input-token equivalents.

**Other things to know about the user's setup:**

- Their default model and effort were saved as Fable 5.2 and medium by `/model` and `/effort` on 2026-11-14 ("don't worry about default"). A live check must still never type `/model` or `/effort`: pass `--model` and `--settings` on the command line.
- They are on a subscription with usage limits, and paused the fleet once on 2026-11-14 when usage ran high. Ask before starting a costly run.
- Pasted images now arrive. Earlier in the project they didn't.

## How the work is run

The user's preferences are in the orchestrator's memory (`agent-fleet`, `one-change-at-a-time`, `no-plugin-directory`, `dev-branch-notes`, `readme-user-facing`), and repeated here.

- **The main session orchestrates.** It decides what runs, when and who does it, reviews small diffs itself, merges, and keeps these notes current as the work goes (the user asked for docs updates as we go, by the `project-docs` skill).
- **The fleet** is peer sessions named `cachebeat<Model><Effort><NN>`, reached with SendMessage. Run ListAgents first: names change.
  - **Fable** (`cachebeatFableMedium01`): the determining moments. Designs, plan rewrites, and the review of any diff that changes core behaviour. Its request-start review found a bug the builder's nine tests missed.
  - **Opus**: the harder builds (timing, resume, the guard).
  - **Sonnet**: builds with a detailed plan (step 3b, tokens-only).
  - **Haiku**: mechanical work. Unused so far.
  - Anthropic's choosing-a-model guide (read 2026-11-14) says the same in general: Opus for complex agentic coding, Sonnet for everyday coding, Haiku for cheap subagent work, effort as a lever before switching models.
- **Base sessions and forks.** `cachebeatOpusHigh01` (session `f08a778f-3d4b-40f1-ab32-52988cab8f57`) and `cachebeatSonnetHigh02` (`725dac1c-99d6-4a04-805e-e70783f475f1`) are bases: read-only, holding the notes and the source, never given a build. Each build runs in a fork.
  - Ask the `clear` session: "fork `<base>` as `<name>`" (e.g. `cachebeatOpusHigh01-ttl`). It runs `claude --resume <id> --fork-session -n <name> --model … --effort …` in a new window, turns cachebeat on in it, and reports when it's up. It forks only while the base is idle, and showed twice that the base's transcript is byte-identical before and after.
  - After a merge, ask `clear` to "close `<name>`", naming it as a fork. It never closes a base.
  - After each merge, send both bases the merged diff to read (`git diff <old>..<new> -- hooks README.md …`), so later forks start current. Both are current to `05294d1`.
  - **The bases read the plan before it was rewritten on 2026-11-14.** Every brief to a fork names the plan sections to re-read.
  - A base holds about 240–290k tokens, so a fork starts near the user's 300k mark. Worth it for steps that need most of that context; for a small job, a fresh session with a tight brief is cheaper.
  - A fork is cheap only while the base's cache is warm. The bases run cachebeat.
- **Context.** About 300k tokens is where the user thinks about clearing a session, not a rule: a warm session that holds what the next task needs can cost less than a fresh one reading it again, and cost differs by model. Ask `clear` for "fill?" (each session's context fill) and to `/clear` a named session, only while it's idle and only once its work is in the notes.
- **Every brief stands alone:** where to work (the worktree, and what not to touch), what to read, the user's decisions, what to build, what not to do, the checks, how to commit, and what to report. Ask for doubts and "where I was least sure": the reviewer starts there.
- **Each step gets its own worktree:**
  ```sh
  git worktree add ../cachebeat-<step> -b step-<name> dev
  cp -r .claude-plugin/types ../cachebeat-<step>/.claude-plugin/
  ```
  The types are gitignored, and `tsc` needs them. After the merge, remove the worktree and delete the branch.
- **The checks**, by the builder before it reports and by the orchestrator after the merge:
  ```sh
  out=$(claude plugin test . 2>&1); echo "$out" | tail -5; grep -q "^ 0 fail" <<<"$out"
  npx -p typescript tsc -p .
  ```
  and the suite on the 2.1.287 binary against a copy. Each change gets a test that fails without it; builders mutation-check.
- **Reviews:** findings ranked, each with file:line, a concrete sequence of events and a fix, and what was proved (run) apart from what was read. Fixes go back to the builder's fork and are re-reviewed by diff range. Small wording fixes the orchestrator may make itself.
- **Commits:** plugin files and notes separately; no attribution lines; "cachebeat 0.10.0 (<step>): …" and "dev notes: …".

## Fleet state at wrap-up

| Session | State |
| --- | --- |
| `cachebeatOpusHigh01` | Base, idle, sent the diff up to `05294d1`. 292k tokens. |
| `cachebeatSonnetHigh02` | Base, idle, sent the diff up to `05294d1`. 255k tokens. |
| `cachebeatFableMedium01` | Cleared after its review; empty. |
| `cachebeatSonnetHigh01` | Cleared after step 3b; empty. |
| `cachebeatOpusHigh02`, `cachebeatOpusMedium01`/`02`, `cachebeatHaikuHigh01`/`02` | Never used; empty. |
| `clear` | Idle. It closed both forks of the day (`cachebeatSonnetHigh02-tokens`, `cachebeatOpusHigh01-ttl`). |
| `cachebeatOrch` | The orchestrator, at 269k tokens when it wrapped up. |

Figures are `clear`'s report at wrap-up (2026-11-14). Check with ListAgents and "fill?" before relying on this table. The Opus base is close to the 300k mark: weigh rebuilding it (clear it, then have it read the current notes and source afresh, which also drops the pre-rewrite plan it still holds) before the next Opus fork.

## Traps

- **Chain a merge's follow-ups only after it succeeds.** On 2026-11-14 a `git merge` that conflicted in the plan was followed in the same command by tests, a push, and a worktree removal, which all ran. Nothing was lost (the branch still held the commits), but the suite's result was for the wrong tree. Merge first, look, then run the rest.
- **Two sessions editing the same notes file conflict at merge.** The orchestrator and a builder both edited the plan's "Still open". While a builder's branch is open, leave the files it was told to edit, or expect to resolve by hand.
- **Loading the plugin from a folder regenerates its `.claude-plugin/types`** for the engine that loaded it. Never `--plugin-dir` a step's worktree: probe from a scratch copy.
- **A live check must not touch user settings.** No `/model`, no `/effort`. To keep the installed cachebeat out of a test session: `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false}}'`.
- **A beat right after a conversation's first turn pauses** ("out of a beat's reach"). Every live test needs two turns before it means anything.
- **`claude -p` waits 3 seconds for stdin** unless given `< /dev/null`, and its `--output-format json` is an array: the entry with `type: "result"` holds `usage`.
- **Check `origin/main` and `origin/dev` before cutting a release.** Cloud sessions release and push notes too; a version number was nearly reused.
- **The release branch takes plugin files from a specific commit when `dev` holds later work:** branch from that commit, merge `origin/main` into it, then `git checkout <it> -- .claude-plugin hooks types README.md LICENSE .github` on the release branch.
- **`claude plugin validate --strict .` fails on `dev`** for `CLAUDE.md` at the plugin root. Expected: run it on the release branch.

## Docs to update when things land

- notes/README.md, "How 0.7.0 went out, as a pattern": a line for 0.9.3 when it ships.
- mods-gotchas.md, "0.10.0 probes": P1's result; G1–G5 and C1–C4 as each step runs them.
- plan-0.10.0.md: its header status line after each step; items 5 and 7's `[$?]` mock-ups when steps 6 and 7 redo them.
- This file: delete it when 0.10.0 ships, or rewrite it at the next wrap-up.
