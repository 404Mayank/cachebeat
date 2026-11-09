# Handoff: 0.9.3 out for review, 0.10.0 half built (2026-11-09)

Where the work stands, and what to do next. The design and every decision are in [plan-0.10.0.md](plan-0.10.0.md). This file says where things are, what's waiting, and how the work was run.

## Where things are

| | State |
| --- | --- |
| `main` / `origin/main` | 0.9.2 (`c84ac68`, released 2026-10-13 from a cloud session: the `h` → `hash` rename in `hashOf`). |
| `v0.9.3` | The 0.9.3 release branch (`efa2be6`, pushed), [PR #13](https://github.com/404Mayank/cachebeat/pull/13). CI is green on 2.1.287 and latest. It's checked out in the worktree `/home/zyrus/Desktop/Projects/cachebeat-rel`. |
| `dev` | Steps 0, 1, 2, 2b and 3 of 0.10.0 merged, `main` and `origin/dev` merged in. 212 tests pass, tsc clean. **Not pushed:** 35+ commits ahead of `origin/dev`. Pushing `dev` is harmless (nothing reads it), but ask the user first. |
| CI on `dev` | `ci.yml` now type-checks on both legs. A `floor` job reads the minimum version from the README badge and feeds the matrix through `fromJSON`. **None of it has run on GitHub yet.** PR #13 ran `main`'s old `ci.yml`, so the 0.10.0 release PR is the first run. `main`'s ruleset blocks only force-pushes and deletion and requires no named checks, so renamed jobs can't block a merge. |
| `tmp-093` | A local scratch branch: step 1 (`f6b5971`) with `origin/main` merged in, which the release branch took its files from. Delete it after 0.9.3 is out. |
| `long-turn`, `v0.8.2`, `worktree-agent-…` | Older branches, not from this work. Leave them. |

**What 0.9.3 is:** step 1 of the plan alone. It has the sleep fix (beats timed by the wall clock, checked at least once a minute), the **Cache gone cold** setting (default: wait for the next message), the "due now" wording, and `state.cache`. The plan was to ship it as 0.9.2, but that number was already taken, so step 1's commit messages on `dev` still say "0.9.2" and the plugin files of the release say 0.9.3. Dollars and everything later are 0.10.0, and are only on `dev`.

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
2. **The portal check, by the user:** validate `404Mayank/cachebeat@v0.9.3` at claude.ai/directory/manage.
3. **Shipping 0.9.3,** once 1 and 2 pass. Follow notes/README.md, "Releasing, step by step", from step 6:
   - Run `git push origin v0.9.3:main` (a fast-forward). CI then tags and releases.
   - Run `gh release edit v0.9.3` and put this on top: "Changed default: a cache gone cold now waits for your next message instead of switching cachebeat off; set Cache gone cold to stop for the old behavior."
   - Run `git merge main` into `dev`. **This conflicts.** Checked with `git merge-tree`, it conflicts in six files: `plugin.json`, `README.md`, `register.tsx`, `pane.tsx`, `tools.ts` and the tests. The release took its files from step 1 alone, and steps 2 and 3 then rewrote the same lines on `dev`. `dev` already holds everything 0.9.3 has: step 1 plus `origin/main`.
     - First run `git log dev..origin/main`. It should list only the 0.9.3 release commit. If a cloud session has landed anything else on `main`, merge that in by hand.
     - Then resolve every plugin file to `dev`'s side (`git checkout --ours -- <files>`), and set `plugin.json` to `0.9.3`. 0.10.0 bumps it later.
     - Run the checks again before you commit the merge.
   - Remove the `cachebeat-rel` worktree and the `tmp-093` and `v0.9.3` local branches.
   - Add a line to notes/README.md, "How 0.7.0 went out, as a pattern": 0.9.3 was step 1 cut from its own merge commit, because `dev` already held later work.
4. **Then 0.10.0, step 3b onwards,** one step at a time, as plan-0.10.0.md "Steps, in order" sets out:
   - 3b: a command typed mid-turn answers at once, and the heart shows through a turn
   - 4: resume
   - 5: the cold guard
   - 6: Status
   - 7: CacheTax
   - 8: the GIF
   - 9: the sweep and the release

## Open with the user

- **The screenshots** the user sent for the Status and CacheTax pages (`/usage`, the TTL / last-active view, `/stats`) have never arrived. Every pasted image so far came through as the same unrelated picture: six files, byte-identical, under the session's `images/` folder. Steps 6 and 7 are provisional until the screenshots arrive. Ask for a file path, or for the screenshot to be copied again.
- **The cold guard,** two points recommended but not confirmed:
  - Remote Control messages aren't held.
  - A custom **send again within** takes 1–15 minutes.
- **P8,** checking that `prompt.submit`, `$.session.id` and the resume fields exist on 2.1.287. CI already runs the tests on 2.1.287. `dev`'s `ci.yml` adds tsc on that leg, but it hasn't run yet. Once it does, each step's tests answer P8 for whatever that step uses.
- **The user's default model** is `haiku` in `~/.claude/settings.json`, because their `/model haiku` during the sleep test saves the default. Earlier it was `opus`, and before that a probe set it to `sonnet`. Mention it if it matters. Don't change it.

## How the work was run

The user's preferences are in memory, and repeated here so the next orchestrator follows them:

- **Roles:**
  - The main session orchestrates: it decides what runs, when, and who does it.
  - An Opus session (`cachebeatopus1`, high effort) writes plans and reviews diffs. It doesn't code or schedule.
  - Sonnet sessions (`sonnetcache1`, `sonnetcache2`) code.
  - The `clear` session reports each session's context fill from its screen, and runs `/clear` on request.
- **One step at a time.** Each step is built, reviewed, fixed, re-reviewed, then merged into `dev` before the next one starts. Two items are bundled only when they're closely related.
- **Context:** keep each session under about 300k tokens. Before a session starts work that doesn't need its old context, have `clear` clear it, and only while it's idle. So every brief stands alone: where to work, what to read, the user's decisions, what to do and not do, the checks, and what to report.
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

- **Never name anything `h` or `Fragment` in a `.tsx` file.** The directory blocks it. Run `grep -nwE 'h|Fragment' hooks/*.tsx` before a release. (mods-gotchas, "Reviews and validation")
- **Loading the plugin from a folder regenerates its `.claude-plugin/types`** for the engine that loaded it. Newer types once broke tsc (step 2b). Don't run `--plugin-dir` on a step's worktree mid-step.
- **A live check must not touch user settings.** `/model <name>` saves the default for new sessions. Use `--model` and `--settings` on the command line instead. To keep the installed cachebeat out of a dev session, pass `--settings '{"enabledPlugins":{"cachebeat@cachebeat":false}}'`.
- **A beat right after a conversation's first turn pauses** ("out of a beat's reach"). Every live test needs two turns before it means anything.
- **Check `origin/main` and `origin/dev` before cutting a release.** Cloud sessions release and push notes too. 0.9.2 and its notes were missed until the release, and a version number was nearly reused.
- **The release branch takes plugin files from a specific commit when `dev` holds later work:** branch from that commit, merge `origin/main` into it, then `git checkout <it> -- .claude-plugin hooks types README.md LICENSE .github` on the release branch.
