# Dev notes

This is the `dev` branch: `main` plus what the plugin doesn't ship. That's the scripts that record the demo (`assets/demo.py`, `assets/demo.tape`) and draw the logo (`assets/logo/src/`), plus these notes. Users get exactly what's on `main`, since the plugin folder is the repo root.

## Keeping the branches straight

- Merge `main` into `dev` to bring it up to date: `git switch dev && git merge main`.
- Never merge `dev` into `main`. That would ship the scripts and these notes. A change made on `dev` that belongs in the plugin gets cherry-picked onto `main`.
- The scripts were added to `dev` after `main` dropped them, so merging `main` in leaves them alone.

## The notes

| File | What's in it |
| --- | --- |
| [claude-tools.md](claude-tools.md) | The two tools Claude calls: how they're built, and why each choice was made |
| [mods-gotchas.md](mods-gotchas.md) | Things about mods, the engine and the test kit that took time to find out |
| [directory.md](directory.md) | Submitting to Anthropic's plugin directory: what its validation flagged, and what was done |

Add to them whenever something takes a while to work out.
