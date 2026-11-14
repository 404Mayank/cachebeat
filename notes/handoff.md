# Handoff: 0.9.3 out for review, 0.10.0 half built (2026-11-09, brought up to date 2026-11-14)

Where the work stands, and what to do next. The design and every decision are in [plan-0.10.0.md](plan-0.10.0.md). This file says where things are, what's waiting, and how the work was run.

## Where things are

| | State |
| --- | --- |
| `main` / `origin/main` | 0.9.2 (`c84ac68`, released 2026-10-13 from a cloud session: the `h` → `hash` rename in `hashOf`). |
| `v0.9.3` | The 0.9.3 release branch (`efa2be6`, pushed), [PR #13](https://github.com/404Mayank/cachebeat/pull/13). CI is green on 2.1.287 and latest. It's checked out in the worktree `/home/zyrus/Desktop/Projects/cachebeat-rel`. |
| `dev` | Steps 0, 1, 2, 2b, 3 and 3b of 0.10.0 merged, `main` and `origin/dev` merged in. 216 tests pass (run 2026-11-14). `dev` was pushed on 2026-11-14 and is a few note commits ahead of `origin/dev` again; pushing it is harmless (nothing reads it), but ask the user first. |
| CI on `dev` | `ci.yml` now type-checks on both legs. A `floor` job reads the minimum version from the README badge and feeds the matrix through `fromJSON`. **None of it has run on GitHub yet.** PR #13 ran `main`'s old `ci.yml`, so the 0.10.0 release PR is the first run. `main`'s ruleset blocks only force-pushes and deletion and requires no named checks, so renamed jobs can't block a merge. |
| `tmp-093` | A local scratch branch: step 1 (`f6b5971`) with `origin/main` merged in, which the release branch took its files from. Delete it after 0.9.3 is out. |
| `long-turn`, `v0.8.2`, `worktree-agent-…` | Older branches, not from this work. Leave them. |

**What 0.9.3 is:** step 1 of the plan alone. It has the sleep fix (beats timed by the wall clock, checked at least once a minute), the **Cache gone cold** setting (default: wait for the next message), the "due now" wording, and `state.cache`. The plan was to ship it as 0.9.2, but that number was already taken, so step 1's commit messages on `dev` still say "0.9.2" and the plugin files of the release say 0.9.3. Dollars and everything later are 0.10.0, and are only on `dev`.

**Since this was written (2026-11-14):**
- Step 3b is built and merged (`32ec2f8`): the heart shows through a turn, and a `/cachebeat` command typed mid-turn gets a toast. Its worktree and branch are gone.
- Item 10 (Claude reads the state by section, and its own context) is designed in plan-0.10.0.md as step 3c, and its six questions are with the user.
- The decisions of 2026-11-14 are in plan-0.10.0.md, "Decided from it", and the plan was brought in line with them the same day: the cold guard asks, the directory's checks are gone, the screenshots arrived.
- The 0.9.3 release still waits only on the live sleep check.

## What's waiting, in order

1. **The live sleep check (P1), by the user.** The first try didn't prove anything. The session had a single turn (`hi`), so its first beat found the cache "out of a beat's reach" and beats paused before the sleep. The retest:
   - Start the session:
     ```sh
     claude --plugin-dir /home/zyrus/Desktop/Projects/cachebeat-rel \
       --settings '{"enabledPlugins":{"cachebeat@cachebeat":false}}' --model haiku --debug
     ```
   - Send two messages, run `/cachebeat 3`, and wait for one beat (`kept warm ×1`).
   - Suspend for about 10 minutes, then wake.
   - Expected: within about a minute, a beat lands (`×2`) and the line reads `next in 3m`, not a stuck `next in 1m`.
   - Read the timings in `~/.claude/debug/<session>.txt`, and record the result under "0.10.0 probes" (P1) in mods-gotchas.md.
2. ~~The portal check.~~ Dropped on 2026-11-14: the directory lists verified organizations only, so cachebeat isn't submitted and no release waits on the portal.
3. **Shipping 0.9.3,** once 1 passes. Follow notes/README.md, "Releasing, step by step", from step 5:
   - Run `git push origin v0.9.3:main` (a fast-forward). CI then tags and releases.
   - Run `gh release edit v0.9.3` and put this on top: "Changed default: a cache gone cold now waits for your next message instead of switching cachebeat off; set Cache gone cold to stop for the old behavior."
   - Run `git merge main` into `dev`. **This conflicts.** Checked with `git merge-tree`, it conflicts in six files: `plugin.json`, `README.md`, `register.tsx`, `pane.tsx`, `tools.ts` and the tests. The release took its files from step 1 alone, and steps 2 and 3 then rewrote the same lines on `dev`. `dev` already holds everything 0.9.3 has: step 1 plus `origin/main`.
     - First run `git log dev..origin/main`. It should list only the 0.9.3 release commit. If a cloud session has landed anything else on `main`, merge that in by hand.
     - Then resolve every plugin file to `dev`'s side (`git checkout --ours -- <files>`), and set `plugin.json` to `0.9.3`. 0.10.0 bumps it later.
     - Run the checks again before you commit the merge.
   - Remove the `cachebeat-rel` worktree and the `tmp-093` and `v0.9.3` local branches.
   - Add a line to notes/README.md, "How 0.7.0 went out, as a pattern": 0.9.3 was step 1 cut from its own merge commit, because `dev` already held later work.
4. **Then 0.10.0, step 3c onwards,** one step at a time, as plan-0.10.0.md "Steps, in order" sets out. Step 3b is built and merged.
   - 3c: Claude reads what it needs (item 10; designed, waits on the user's answers)
   - 4: resume (nothing blocks it)
   - 5: the cold guard, which now asks `Send` / `Don't send`; its probes G1–G5 come first
   - 6: Status (waits on the dollar answer and a look pass)
   - 7: CacheTax (the same)
   - 8: the GIF
   - 9: the sweep and the release

## Open with the user

- **CacheTax is [karanb192/cache-tax](https://github.com/karanb192/cache-tax)** (MIT), another mod that warms the cache and guards cold sends. What's worth borrowing from it is in plan-0.10.0.md, "From cache-tax". Credit it in the README only if what's taken is substantial (the user, 2026-11-14).
- **The idle cost rise** (+$0.002 with nothing running, step 2's live check) is left alone unless testing shows it again.
- **The screenshots arrived** (`/usage` and `/stats`; plan-0.10.0.md, "Decided from it", says what's in them). Steps 6 and 7 no longer wait on them. They wait on the dollar answer and on a look pass against the screenshots that the user approves (plan-0.10.0.md, item 5, "What steps 6 and 7 wait on").
- **Dollars:** remove `≈$` from everything users and Claude see, keeping `prices.ts` for the token-equivalent ratios, or keep and extend them? Asked on 2026-11-14, not answered. The plan marks every place it touches with `[$?]` (plan-0.10.0.md, "Still open").
- **Item 10's six questions** (plan-0.10.0.md, item 10, "Open, for the user").
- **The cold guard** (plan-0.10.0.md, item 4, rewritten 2026-11-14: it asks `Send` / `Don't send`, and the **send again within** window is gone, so its 1–15 minute range is no longer a question):
  - **Remote Control messages are held too** (the user, 2026-11-14), if a live check shows the question reaches a Remote Control client and can be answered there (G4). If it can't, the guard skips `bridge` and the README suggests running `/cachebeat` before sending from a remote session.
  - **Provisional, for the user:** the new **if unanswered** setting's default (`drop`), whether `drop` should also close the question after a while, its 1–15 minute range for the send-after value, and `channel`, `slack-ping` and `unclassified` messages passing unasked.
- **P8,** checking that `prompt.submit`, `$.session.id` and the resume fields exist on 2.1.287. CI already runs the tests on 2.1.287. `dev`'s `ci.yml` adds tsc on that leg, but it hasn't run yet. Once it does, each step's tests answer P8 for whatever that step uses.
- **The user's default model** is `haiku` in `~/.claude/settings.json`, because their `/model haiku` during the sleep test saves the default. Earlier it was `opus`, and before that a probe set it to `sonnet`. Mention it if it matters. Don't change it.

## How the work was run

The user's preferences are in memory, and repeated here so the next orchestrator follows them:

- **Roles** (the fleet as of 2026-11-14; the names change, so run ListAgents first):
  - The main session (`cachebeatOrch`) orchestrates: it decides what runs, when, and who does it, and keeps these notes current as the work goes.
  - Sessions are named `cachebeat<Model><Effort><NN>`. Fable (`cachebeatFableMedium01`) is for the determining moments: designs, and the review of each step's diff. Opus builds the harder steps and re-reviews fixes. Sonnet builds steps that have a detailed plan. Haiku does mechanical work: sweeps, running checks.
  - The `clear` session reports each session's context fill from its screen, and runs `/clear` on request.
  - The earlier fleet (`cachebeatopus1`, `sonnetcache1`, `sonnetcache2`) is gone.
- **Base sessions and forks** (since 2026-11-14). `cachebeatOpusHigh01` and `cachebeatSonnetHigh02` are base sessions: read-only, holding the notes and the source. Each build step runs in a fork of one of them, so the builder starts with that context already read instead of reading it again. The `clear` session makes the fork when asked, and closes it once its step is merged. The bases themselves don't build.
- **One step at a time.** Each step is built, reviewed, fixed, re-reviewed, then merged into `dev` before the next one starts. Two items are bundled only when they're closely related.
- **Context:** about 300k tokens is where to think about clearing a session, not a rule: a warm session that already holds what the next task needs can cost less than a fresh one reading it all again, and the cost differs by model. Before a session starts work that doesn't need its old context, have `clear` clear it, and only while it's idle. So every brief stands alone: where to work, what to read, the user's decisions, what to do and not do, the checks, and what to report.
- **Each step gets its own worktree:**
  ```sh
  git worktree add ../cachebeat-stepN -b stepN-<name> dev
  cp -r .claude-plugin/types ../cachebeat-stepN/.claude-plugin/
  ```
  The types are gitignored, and tsc needs them. After the merge, remove the worktree and delete the branch.
- **The checks** before a step reports, and again by the orchestrator before a merge:
  ```sh
  claude plugin test . > out.txt 2>&1; grep -q "^ 0 fail" out.txt
  npx -p typescript tsc -p .
  ```
  Each fix gets a test that fails without it, and implementers mutation-check their fixes.
- **Reviews:**
  - Findings come ranked, each with file:line, a concrete case and a fix.
  - Fixes are re-reviewed by diff range only.
  - Small note and comment wording fixes, the orchestrator may make itself.

## Traps from this session

- **Naming something `h` or `Fragment` in a `.tsx` file** was blocked by the directory. With the directory dropped (2026-11-14) nothing checks it any more, so the grep before a release isn't needed. (mods-gotchas, "Reviews and validation")
- **Loading the plugin from a folder regenerates its `.claude-plugin/types`** for the engine that loaded it. Newer types once broke tsc (step 2b). Don't run `--plugin-dir` on a step's worktree mid-step.
- **A live check must not touch user settings.** `/model <name>` saves the default for new sessions. Use `--model` and `--settings` on the command line instead. To keep the installed cachebeat out of a dev session, pass `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false}}'`.
- **A beat right after a conversation's first turn pauses** ("out of a beat's reach"). Every live test needs two turns before it means anything.
- **Check `origin/main` and `origin/dev` before cutting a release.** Cloud sessions release and push notes too. 0.9.2 and its notes were missed until the release, and a version number was nearly reused.
- **The release branch takes plugin files from a specific commit when `dev` holds later work:** branch from that commit, merge `origin/main` into it, then `git checkout <it> -- .claude-plugin hooks types README.md LICENSE .github` on the release branch.
