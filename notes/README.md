# Dev notes

This is the `dev` branch: `main` plus what the plugin doesn't ship.

## Branches and releases

### What goes where

| | `main` | `dev` |
| --- | --- | --- |
| What it is | The plugin, exactly as users get it | `main` plus the tools and notes behind it |
| Holds | `.claude-plugin/`, `hooks/`, `types/`, `README.md`, `LICENSE`, CI, and the images the README and manifest show (`assets/demo.gif`, `assets/logo/*.svg`/`.png`) | Everything on `main`, plus `assets/demo.py` and `assets/demo.tape` (the demo recording), `assets/logo/src/` (the logo build), and `notes/` |
| Who reads it | Users, the marketplace, the plugin directory | Us |

The plugin folder is the repo root, so anything on `main` ships to every user and is read by the directory's validation. If a file isn't needed to run, show or describe the plugin, it goes on `dev`. That includes scripts that name images or fonts, which the directory holds for review.

### Day to day

- **Plugin changes** (code, tests, README, manifest) are made on `main`, or on a short branch fast-forwarded into it.
- **Notes, and changes to the demo or logo scripts,** are made on `dev`.
- **After `main` moves,** bring `dev` up to date: `git switch dev && git merge main`. The scripts were added on `dev` after `main` dropped them, so the merge leaves them alone.
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

### Where a release goes

- **GitHub:** the `v<version>` tag and release, created by CI.
- **Our own marketplace** (`claude plugin marketplace add 404Mayank/cachebeat`): users get the new version with `claude plugin update cachebeat@cachebeat`, or by themselves with auto-update on. If `version` didn't change, the update says it's already at the latest version and they keep the old copy.
- **Anthropic's plugin directory** (claude.ai/directory/manage): once the plugin is listed, the directory scans each new commit on the branch it follows (`main`) and holds a flagged version for a reviewer. Check the plugin's **Versions** tab in the portal after a release. Before it's listed, re-validate in the submission form after pushing. See [directory.md](directory.md).
- **Claude Code sessions** pick up a new version only after a restart. Tool text in particular stays as first registered until a new session (see [mods-gotchas.md](mods-gotchas.md)).

## The notes

| File | What's in it |
| --- | --- |
| [claude-tools.md](claude-tools.md) | The two tools Claude calls: how they're built, and why each choice was made |
| [mods-gotchas.md](mods-gotchas.md) | Things about mods, the engine and the test kit that took time to find out |
| [directory.md](directory.md) | Submitting to Anthropic's plugin directory: what its validation flagged, and what was done |

Add to them whenever something takes a while to work out.
