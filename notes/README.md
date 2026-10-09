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

- **Plugin changes** (code, tests, README, manifest) are made on `main`, or on a short branch fast-forwarded into it.
- **Notes, and changes to the demo or logo scripts,** are made on `dev`.
- **After `main` moves,** bring `dev` up to date: `git switch dev && git merge main`. The scripts were added on `dev` after `main` dropped them, so the merge leaves them alone.
- **Keep a file on one branch or the same on both, never in two versions.** A file that differs between the branches (as `assets/logo/README.md` once did) conflicts on every merge that touches it.
- **A dev-only file that `main` deleted** is now only on `dev`. Merges leave it alone, because `main`'s deletion is already merged in.
- **Never merge `dev` into `main`.** That would ship the scripts and these notes. If something done on `dev` belongs in the plugin, such as a new `demo.gif` or regenerated logo files, cherry-pick it or check out just those files onto `main`:

  ```sh
  git switch main && git checkout dev -- assets/demo.gif
  ```

### When to ship

- **A release is a version bump.** Every push to `main` runs CI, which validates on Claude Code 2.1.287 and the latest version and runs the tests. CI only releases when `version` in `.claude-plugin/plugin.json` names a version that isn't released yet.
- **Bump `version` for every change users should get:**
  - patch (`0.6.1`) for fixes and small changes
  - minor (`0.7.0`) for a new feature
- **README-only changes don't need a bump.** They show on GitHub at once, and the directory listing takes them with the next version.
- **Push `main` only when the change is ready for users.** With auto-update on, they get it without asking. Push `dev` whenever you like: nothing reads it.

### Releasing, step by step

1. On `main`, make the change and bump `version` in `.claude-plugin/plugin.json`.
2. Check it:

   ```sh
   claude plugin test .
   npx -p typescript tsc -p .
   claude plugin validate --strict .
   ```

3. Commit with the version first in the message (`cachebeat 0.6.1: …`), then `git push origin main`.
4. CI tags `v<version>` and creates the GitHub release with generated notes.
5. Bring `dev` up to date (`git merge main`) and push it.

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
| [plan-0.8.0.md](plan-0.8.0.md) | The plan for 0.8.0: settings by scope (this session, this project, all projects), and how the menu shows it |

Add to them whenever something takes a while to work out.
