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

## The second validation (0.7.0)

The full report, with the line behind each finding and how to fix it, is in [directory-report-0.7.0.md](directory-report-0.7.0.md).

The report again named a ref and paths that don't exist (`main 15e2b3b` for `15a263e`, `register.ts` and `cachebeat.test.ts` for the `.tsx` files). Of its line numbers (362, 508, 554, 561, 585, 620), only 554 lands on the hook it names. These are the findings, read against the source:

| Finding | Result | What it is | Status |
| --- | --- | --- | --- |
| `MOD_CAPABILITY_USE_NOT_PLAIN` | Blocks | The report now spells the rule out: a `$` call is a bare `$.noun.method(…)`, with no parenthesis, cast, `!`, `??` or square brackets around it. 0.7.0 added four calls that break it: `(await $.settings.read()).promptCacheTtl` in `cacheTtl`, `(await $.session.model()) !== …` in `resumeIfWarmed`, and `(await $.store.get('customs')) as …` in `keepCustoms` and in `openSettings` (the second also with `?? {}`). Four older calls have the same shape: `(await $.clock.now())` three times, and `$.model.fork(…).finally(…)`. | 0.7.1 rewrote all eight as statements of their own, and made `scheduledBeat` and `beatNow` `function` declarations. Re-validate still blocked, at line 581: `await openSettings($)` in `command.run`, the same call the 0.7.0 report's "reference: line 561" named. That reference line was right all along. 0.7.2 made `return $.ui.log(…)` in `focusOn` a statement, but Re-validate still blocked at the same call (line 584). That report's line numbers were accurate. 0.7.3 turned the command's `switch` into `if`s, and was still blocked. **The cause, confirmed by validating the `v0.7.4` branch:** `$.ui.open(PANE_OPEN)`, where `PANE_OPEN` was `{ … } as const`. A `$` call's whole argument was a constant whose value is a cast, and the directory can't read through the cast. It had been there since 0.6.0. The report put the location at the hook's call into the chain that reaches it first (`await openSettings($)` in `command.run`), not at the `$.ui.open` line itself. 0.7.4 writes the request into both `$.ui.open` calls, as the official pane example does. The rewrites in 0.7.1–0.7.3 weren't needed; they're harmless and stay. |
| `MCP_FORWARDS_CREDENTIAL_ENV` | Hold | Both halves are in the test file, which ships. "Reads the installer's keys" is the `env.get` stub (added in 0.7.0 for the cache TTL tests), which answers any variable name from the test's world. "A command assembled at run time" is `` `mcp__cachebeat__${…}` ``, the test's name for our two tools. | The scan raises a hold again on each version, so every release would wait for a reviewer. 0.7.1 fakes the environment with the kit's `mock.env` instead of a hook of our own, and spells out the tool names. Waiting on Re-validate. |
| Unknown `plugin.json` fields | Warning | `documentationUrl`, `supportUrl` and `types`; `icon` as a field from another tool's manifest | Kept, as before. |
| `MOD_ANSWERS_FOR_TOOL`, `MOD_HOOKS_OPERATION` | Warning | Our two tools, and `/cachebeat` | The README line under "What it sends" covers both. |
| `MOD_HOOKS_POLICY_EVENT` | Warning | `classic.PostModelSwitch`, new in 0.7.0. It passes the switch on unchanged, then pauses beats or logs a line. | 0.7.1 added a README line saying cachebeat sees `/model` switches without changing them. |
| `MOD_REGISTERS_SURFACES`, `ASSETS_PASSED_UNREAD` | Note | | |

The summary ticked 5 of 7 checks. The unticked two were "MCP servers and directory match" and "Name and publisher checks". No finding named a name or publisher problem, and the report listed only one block and one hold.

## Listing fields

The submission form's listing step asks for a privacy policy and terms of service. Both are optional, and both are `plugin.json` fields that the directory reads and Claude Code ignores. `claude plugin validate --strict` accepts both on 2.1.287 and later, so CI passes.

- `privacyPolicyUrl` (0.7.4) points to the README's Privacy section.
- `termsOfServiceUrl` (0.7.5) points to its Disclaimer.

The checklist also says that README images in Markdown syntax and the `icon` in `plugin.json` are fine. Don't name bundled images or fonts in commands, hooks or scripts, or in backticks or code blocks.
