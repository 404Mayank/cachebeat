# Submitting to the plugin directory

The directory is the portal at claude.ai/directory/manage. Its rules are on claude.com: the [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist) and [submit a plugin](https://claude.com/docs/plugins/submit). `claude plugin validate --strict` doesn't run the directory's lints, so a clean local run doesn't mean a clean portal run. The mod-specific lint codes aren't in the public checklist either.

## Results

- **Blocks:** fix the finding, push, and Re-validate.
- **Policy hold:** you can submit, and a reviewer reads the held version before it goes live.
- **Warning** and **Note:** nothing needs to change.

## The first validation (0.6.0), and what was done

The report named a ref and file paths that didn't match the repo (`main@fb1066c`, `register.ts`, `assets/logo/en/build.py`), so its line numbers weren't usable. These are the findings, read against the real source:

| Finding | Result | What it was | Done |
| --- | --- | --- | --- |
| `CAPABILITY_USE_NOT_PLAIN` | Blocks | The directory reads hook registrations from the source as written. Our `ToolResult` hooks were registered in a `for` loop, and some `$` calls had `.catch(…)` chained or `??=` around them. | Every hook is its own `on(…)` call with literal matchers. `$` calls are plain, wrapped in `try`/`catch` or guarded by an `if`. `export const register: Register = on => …` stayed, since the official examples use it. (0.6.1) |
| `DENIES_PERMISSION` | Hold | Hooks that answer without `next`: `/cachebeat` and the two tools, by design. And `ui.focus` reassigned its own `e`. | `ui.focus` now builds a rewrite and passes it to `next`. The command and tools stay as they are, and the README says they answer themselves without a permission prompt. |
| `UNCHECKED_ASSET_REFERENCED` (7) | Hold | The plugin folder is the repo root, so the demo and logo scripts shipped, and they name images and fonts. | The scripts moved to this branch. |
| `FORWARDS_CREDENTIAL` | Hold | A false positive from the same scripts: `build.py` reads `$CHROME` and contains the SVG namespace URL, and `demo.py` hands its environment to `vhs` and `ffmpeg`. | Cleared by the move. |
| Unknown `plugin.json` fields | Warning | `types` (the mod's type contract, which validate needs), and the listing fields `documentation` and `support`. | Kept. |
| Answers a tool call; hooks `command.run` | Warning | Our own tools and our own command. | README line under "What it sends". |
| `EXTENSIONS`, `ASSETS_PASSED_UNREAD` | Note | | |

The checklist also says that README images in Markdown syntax and the `icon` in `plugin.json` are fine. Don't name bundled images or fonts in commands, hooks or scripts, or in backticks or code blocks.
