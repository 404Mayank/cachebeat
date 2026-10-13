# Dev notes

This is the `dev` branch: `main` plus what the plugin doesn't ship.

## Branches and releases

### What goes where

| | `main` | `dev` |
| --- | --- | --- |
| What it is | The plugin, exactly as users get it | `main` plus the tools and notes behind it |
| Holds | `.claude-plugin/`, `hooks/`, `types/`, `README.md`, `LICENSE`, CI, and the images the README and manifest show (`assets/demo.gif`, `assets/logo/*.svg`/`.png`) | Everything on `main`, plus `CLAUDE.md`, `notes/`, `assets/demo.py` and `assets/demo.tape` (the demo recording), and `assets/logo/src/` with `assets/logo/README.md` (the logo build) |
| Who reads it | Users and their agents, the marketplace, the plugin directory | Us |

The plugin folder is the repo root, so anything on `main` ships to every user and is read by the directory's validation. If a file isn't needed to run, show or describe the plugin, it goes on `dev`. That includes scripts that name images or fonts, which the directory holds for review.

Every README on `main` is for users and their agents: what cachebeat does, how to use it, what it sends and costs. Justifications, design notes, contributor workflow, build steps and gotchas go here in `notes/`. So do comments in shipped files that name dev-only files.

### Day to day

- **Everything is built on `dev`:** plugin changes (code, tests, README, manifest), notes, and the demo and logo scripts. Commit plugin files and notes separately, so each commit is one or the other.
- **Plugin files reach `main` only through a release branch and a PR** (see "Releasing, step by step"). The release branch takes just the plugin's files from `dev`, never the merge.
- **The plugin's files** are what `main` holds: `.claude-plugin/`, `hooks/`, `types/`, `README.md`, `LICENSE`, `.github/`, and the shipped images (`assets/demo.gif`, `assets/logo/*.svg`/`.png`). Everything else on `dev` stays there.
- **After `main` moves,** bring `dev` up to date: `git switch dev && git merge main`. The release commit holds the same files `dev` already has, so the merge is clean. The scripts were added on `dev` after `main` dropped them, so the merge leaves them alone.
- **Keep a file on one branch or the same on both, never in two versions.** A file that differs between the branches (as `assets/logo/README.md` once did) conflicts on every merge that touches it.
- **A dev-only file that `main` deleted** is now only on `dev`. Merges leave it alone, because `main`'s deletion is already merged in.
- **Never merge `dev` into `main`.** That would ship the scripts and these notes.
- **`claude plugin validate --strict .` fails on `dev`,** for `CLAUDE.md` at the plugin root ("not loaded as project context"). That's expected: run the strict validation on the release branch, which has no `CLAUDE.md`. `plugin test` and `tsc` run fine on `dev`.

### When to ship

- **A release is a version bump.** Every push to `main` runs CI, which validates on Claude Code 2.1.287 and the latest version and runs the tests. CI only releases when `version` in `.claude-plugin/plugin.json` names a version that isn't released yet.
- **Bump `version` for every change users should get:**
  - patch (`0.6.1`) for fixes and small changes
  - minor (`0.7.0`) for a new feature
- **Every push to `main` needs a bump, README-only ones included.** The plugin directory follows `main` and scans each new commit as a version, and its docs say to raise `version` with every one. Push README fixes together with the next release, or bump the patch for them.
- **Push `main` only when the change is ready for users.** With auto-update on, they get it without asking. Push `dev` whenever you like: nothing reads it.

### Releasing, step by step

1. On `dev`, bump `version` in `.claude-plugin/plugin.json`, and check `plugin test` and `tsc` pass.
2. Cut the release branch off `main`, and take the plugin's files from `dev`:

   ```sh
   git switch -c v<version> main
   git checkout dev -- .claude-plugin hooks types README.md LICENSE .github
   git diff --name-only --cached main   # plugin files only: no notes/, CLAUDE.md, demo or logo sources
   ```

   Add any shipped image that changed (`assets/demo.gif`, `assets/logo/*.svg`/`.png`) the same way.
3. Check it on the branch:

   ```sh
   claude plugin test .
   npx -p typescript tsc -p .
   claude plugin validate --strict .
   ```

4. Commit with the version first in the message (`cachebeat 0.8.0: …`), push the branch, and open a PR into `main`. CI runs on it, on 2.1.287 and the latest version, without releasing.
5. Validate the branch in the directory portal (`404Mayank/cachebeat@v<version>` in the Repository field) before it reaches `main`.
6. Once CI and the portal pass, fast-forward `main` to the branch (`git switch main && git merge --ff-only v<version> && git push origin main`). GitHub marks the PR merged.
7. CI tags `v<version>` and creates the GitHub release with generated notes. Put a short summary and any changed defaults or removed settings on top with `gh release edit`.
8. Bring `dev` up to date (`git switch dev && git merge main`), push it, and delete the local release branch.

### Changing a default, or a setting's name

- **The store keeps only what differs from the defaults** (`changed()` in `settings.ts`). So on an update:
  - someone who never touched a setting gets its new default
  - someone who picked another value keeps theirs
- **Someone who explicitly picked the old default had nothing saved.** They move to the new default too, and nothing in the store tells them apart. Avoiding that would take versioning the store. 0.7.0 moved lub-dub timing, tokens kept, and stopping at 90% usage this way.
- **Renamed or removed keys:** `normalize()` drops keys it doesn't know and replaces invalid values with the defaults, so an old store never breaks a new version. A renamed key loses its value unless `normalize()` carries it across.
- **0.7.0 split one look into two.** `color`, `customColor`, `effect`, `animate`, `speed` and `timing` became `heart*` and `line*` (`heartHex` and `lineHex` for the custom color). `normalize()` copies an old key into both parts unless a part already has its own, then drops it.
- **Say a changed default in the release notes,** especially one that changes behavior, like stopping at 90% instead of 100%.

### How 0.7.0 went out, as a pattern

1. The work went on a branch (`v0.7`), pushed, with a PR into `main`. CI runs on the PR, on 2.1.287 and the latest version, without releasing.
2. Once both legs passed, `main` was fast-forwarded to the branch and pushed (`git merge --ff-only`). That kept the commits the same, so `dev`'s history lines up. GitHub marks the PR merged.
3. CI on `main` tagged `v<version>` and made the release with generated notes.
4. The notes were edited with `gh release edit` to put a short summary and any changed defaults on top.
5. `main` was merged into `dev`, and the release branch deleted. GitHub deletes it on the remote by itself once the PR shows as merged, so only the local branch is left to delete.

0.7.1 went out the same way from a cloud session (branch `v0.7.1`, [PR #2](https://github.com/404Mayank/cachebeat/pull/2)). Its fix was merged into `dev` before `main`, which is fine: the branch came off `main`, so `dev` gains no file `main` lacks. Its release notes are still the generated ones.

0.7.2 and 0.7.3 followed the same way ([PR #3](https://github.com/404Mayank/cachebeat/pull/3), [PR #4](https://github.com/404Mayank/cachebeat/pull/4)), each after Re-validate still blocked the one before. Next time, validate the release branch before it's released: enter `404Mayank/cachebeat@<branch>` in the portal's Repository field, and merge into `main` only once it passes.

0.7.4 went out that way ([PR #5](https://github.com/404Mayank/cachebeat/pull/5)). The `v0.7.4` branch was validated first, which cleared the block, then fast-forwarded into `main`. 0.7.5 ([PR #6](https://github.com/404Mayank/cachebeat/pull/6)) changed only `plugin.json`, so it went straight to `main`, which the submission validates anyway.

0.8.0 was the first built on `dev` and shipped by the new steps ([PR #7](https://github.com/404Mayank/cachebeat/pull/7)). The release branch took the plugin files from `dev` with `git checkout dev -- …`. A fix after review went in as a second commit on the same branch, and `main` was fast-forwarded to it. `main` merged back into `dev` cleanly, since the files matched. 0.8.1 ([PR #8](https://github.com/404Mayank/cachebeat/pull/8)) went out the same way: only the manifest and new logo files, with the logo build changes kept on `dev`.

0.8.2 (tagged beats, `/rewind`) got as far as [PR #9](https://github.com/404Mayank/cachebeat/pull/9), then was closed unshipped: the rest of 0.9.0 was ready soon after, so [PR #10](https://github.com/404Mayank/cachebeat/pull/10) carries it all. For a release that bundles work done on several branches, `dev` is fast-forwarded to the finished branch first, then the release branch takes the plugin files from `dev` as usual.

### Where a release goes

- **GitHub:** the `v<version>` tag and release, created by CI.
- **Our own marketplace** (`claude plugin marketplace add 404Mayank/cachebeat`): users get the new version with `claude plugin update cachebeat@cachebeat`, or by themselves with auto-update on. If `version` didn't change, the update says it's already at the latest version and they keep the old copy.
- **Anthropic's plugin directory** (claude.ai/directory/manage): once the plugin is listed, the directory scans each new commit on the branch it follows (`main`) and holds a flagged version for a reviewer. Check the plugin's **Versions** tab in the portal after a release. Before it's listed, re-validate in the submission form after pushing. See [directory.md](directory.md).
- **Claude Code sessions** pick up a new version only after a restart. Tool text in particular stays as first registered until a new session (see [mods-gotchas.md](mods-gotchas.md)).

## The notes

| File | What's in it |
| --- | --- |
| [contributing.md](contributing.md) | Working on cachebeat: loading it, the checks, and where things are |
| [claude-tools.md](claude-tools.md) | The two tools Claude calls: how they're built, and why each choice was made |
| [mods-gotchas.md](mods-gotchas.md) | Things about mods, the engine and the test kit that took time to find out |
| [directory.md](directory.md) | Submitting to Anthropic's plugin directory: what its validation flagged, and what was done |
| [directory-report-0.7.0.md](directory-report-0.7.0.md) | The full reading of the directory's 0.7.0 validation: each finding, the lines behind it, and how to fix it |
| [plan-0.8.0.md](plan-0.8.0.md) | 0.8.0: where settings apply (this session, this folder, all folders), as built, and the design it replaced |

Add to them whenever something takes a while to work out.
