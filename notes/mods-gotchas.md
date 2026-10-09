# Mods: gotchas

Things about mods, the engine and the test kit that took time to work out. These held on Claude Code 2.1.294.

## The engine

- **Tool text is fixed for the session.** Edits hot-reload the module, so the new `tool.call` handler runs right away. The description and schema the model sees stay as the tools were first registered, even across `/reload-plugins`. To see new tool text, start a new session (`claude --plugin-dir .`).
- **The input schema isn't enforced.** A model call with `intervalMinutes: 90`, over the schema's `maximum: 55`, still reached our handler. Validate everything yourself; that's what `parseSet` is for.
- **A plugin tool skips the permission path.** `classic.PreToolUse` and `tool.check` sit beneath `tool.call`'s `next`, and a plugin answering its own tool never calls `next`. The test "the tools answer without the permission path beneath them" shows this against a live deny-everything hook.
- **The countdown already starts from the last turn.** `schedule()` waits the interval minus the time since the cache was last read (`s.lastWarm`, set at `turn.complete` and after each beat), so `/cachebeat on` a minute after a turn says 49m. It's easy to think it counts from the command.
- **`/cachebeat` is registered `immediate: true`,** so it answers even while a turn runs, and its `command.run` hook mustn't assume the turn's state.

## Types

- **`tool.call` matchers only take known tool names.** With MCP servers connected, the generated `McpToolInputs` lists only those servers' tools, so `{ tool: 'mcp__cachebeat__set' }` fails `tsc`. Declare the plugin's own tools in `types/index.d.ts` under `interface McpToolInputs`; that also types `e.session` and `e.settings`. Pinboard doesn't, and probably fails `tsc` once an MCP server is connected (a guess, not checked).
- **The generated `claude-code-mcp` types don't list the plugin's own tools** (checked once), so the declaration doesn't clash. If it ever does (TS2717), drop ours.

## The test kit (`claude plugin test`)

- **Register a test's own hooks before the first `$` call.** `setup()` starts the session, so a test hook goes above `await setup($, on)`. Otherwise it throws "after the test first called $".
- **`$.tool.register` needs a stub beneath it** (`on('tool.register', …)` in `setup`). Nothing answers it otherwise.
- **A `classic.PreToolUse` deny reaches the test's `$.tool.call` as an errored result** (`isError: true`, the reason as `text`), not as `{ deny }`. `{ deny }` is what a plugin's own `$.tool.call` gets.
- **Tool arguments arrive flat on `e`,** beside the reserved `tool`, `tool_use_id`, `consent` and `agentId`. Read `e.session` and `e.settings`; never validate the whole `e`, or every call fails on the reserved keys.

## Reviews and validation

- **`/code-review ultra` bundles tracked files only.** An untracked new file (`hooks/tools.ts`, before its first commit) shows up as "module does not exist". Commit, or at least `git add`, new files before an ultrareview.
- **`claude plugin validate` shows a matcher built from a constant as `?`** (`tool=?`, `requestId=?`). A literal resolves (`tool=mcp__cachebeat__set`). The plugin directory reads the source the same way, so its tool matchers are literals.
- **CI already checks the oldest supported version.** It runs on 2.1.287 and latest, so a passing CI run means the API works on 2.1.287. That's how `$.tool.register` was confirmed there.
