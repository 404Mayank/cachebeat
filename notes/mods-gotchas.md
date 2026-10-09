# Mods: gotchas

Things about mods, the engine and the test kit that took time to work out. These held on Claude Code 2.1.294.

## The engine

- **Tool text is fixed for the session.** Edits hot-reload the module, so the new `tool.call` handler runs right away. The description and schema the model sees stay as the tools were first registered, even across `/reload-plugins`. To see new tool text, start a new session (`claude --plugin-dir .`).
- **The input schema isn't enforced.** A model call with `intervalMinutes: 90`, over the schema's `maximum: 55`, still reached our handler. Validate everything yourself; that's what `parseSet` is for.
- **A plugin tool skips the permission path.** `classic.PreToolUse` and `tool.check` sit beneath `tool.call`'s `next`, and a plugin answering its own tool never calls `next`. The test "the tools answer without the permission path beneath them" shows this against a live deny-everything hook.
- **The countdown already starts from the last turn.** `schedule()` waits the interval minus the time since the cache was last read (`s.lastWarm`, set at `turn.complete` and after each beat), so `/cachebeat on` a minute after a turn says 49m. It's easy to think it counts from the command.
- **`/cachebeat` is registered `immediate: true`,** so it answers even while a turn runs, and its `command.run` hook mustn't assume the turn's state.

## The prompt cache

- **How Claude Code picks the main conversation's cache lifetime** (code.claude.com/docs/en/prompt-caching, "Which TTL each request gets" and "Choose the TTL yourself"). The first match wins:
  1. `FORCE_PROMPT_CACHING_5M=1`.
  2. `CLAUDE_CODE_PROMPT_CACHE_TTL`.
  3. The `promptCacheTtl` setting.
  4. `ENABLE_PROMPT_CACHING_1H=1`.
  5. The default: one hour on a subscription within its plan's usage, five minutes on usage credits, an API key or a cloud provider.

  `cacheTtl()` in `register.tsx` reads each input:
  - the variables through `$.env.get`
  - the setting through `$.settings.read()`, whose `Settings` type is open, so the key is there
  - the subscription through `$.session.usage().rateLimits`, which the types call "empty off a subscription". A window at 100% or more means usage credits.
- **The docs name gaps the rules can't see:**
  - a custom gateway that drops the one-hour beta header
  - the Claude apps gateway, which has no one-hour TTL
  - Bedrock, which varies by model

  That's why, under `auto`, a beat that finds the cache gone before an hour switches the session to 4-minute beats rather than stopping. The beat that found it gone wrote it afresh.
- **The engine knows the lifetime but doesn't hand it to mods,** except as `cache_ttl` in the `classic.PreModelSwitch` and `classic.PostModelSwitch` inputs.
- **Three different things are called a fork:**
  - The "forks" in the docs' five-minute bucket are forked subagents (`/subtask`, or `/fork` with agent view off). They're subagents that inherit the conversation.
  - `/fork` with agent view on copies the session into a background session.
  - `$.model.fork`, which a beat uses, re-sends the main thread's last request with only its own tail uncached.

  The docs don't say which bucket `$.model.fork` falls in. The user has seen two or more beats chain at 50 minutes on a subscription, so a beat keeps the one-hour entry alive.
- **A beat always goes to the current model.** `$.model.fork`'s doc says the prefix is "billed afresh … after `/model`". After a switch, the old model's cache is out of reach and the new one has none, so "keep warming the old model" can't exist. The option is to wait (the default) or to warm the new model, which costs the same full write the next turn would make.
- **After `/model` or a compaction, the cached prefix a beat would warm is no use to the next turn.** Each model has its own cache, and compaction replaces the history. So beats wait for the next turn: `classic.PostModelSwitch` (setting `onModelSwitch`) and `session.compact` (main thread, not `precompute`, not skipped).

## Timing and events (found live, 0.7.0)

- **`schedule()` used to arm two timers.** It cancelled the old timer, awaited (the 0.7.0 cache-lifetime read made the gap longer), then armed a new one. Two overlapping calls each armed one, and the leaked timer fired through a pause. Seen live as two beats in one minute, and a beat firing after "beats wait". Now a call counter lets only the newest call arm.
- **The test kit runs dispatches one at a time,** so it can't reproduce that race. The test "commands and turns arriving together" passes with or without the guard. The live rerun is the evidence: no minute with two beats.
- **`/model` raises `classic.PostModelSwitch` before the engine applies the switch** (`send set_model` comes after it in the debug log), and no `turn.complete` follows. So `$.session.model()` inside that hook may still be the old model. That's why the model is checked again when the beat fires.
- **`turn.complete` without `usage` sent no request.** Only a turn with `usage` warms the cache. cachebeat records `$.session.model()` there and compares it when a beat fires, so a model change is caught whatever events arrive.
- **A background subagent doesn't stall beats** (item 8, tested live). Beats kept landing every minute while a background subagent ran `sleep 180`, and its finishing turn reset the count as a normal turn.
- **The "beats wait" line after `/compact` lands above the compaction's output,** not at the end of the transcript. The engine places `$.ui.log` lines. This is cosmetic and isn't fixed.
- **`claude --debug` writes `~/.claude/debug/<session>.txt`.** It holds every hook dispatch (`hooks module cachebeat@inline <event> settled …`) and every `$.ui.log` line. Use it to see event order instead of guessing.

## Surfaces

- **`TurnDuration`, the turn's closing row that the status line hangs under, is raised on the terminal only.** `PromptHint`, the heart's row, is raised on the terminal and desktop. So on desktop the countdown rides with the heart (`isStatusOnHint`), and a beat no longer logs its own line there.
- **Before 0.7.0, a desktop user saw only `♥ cache renewed (…)` per beat:** the fallback log for "no closing row seen".

## Types

- **`tool.call` matchers only take known tool names.** With MCP servers connected, the generated `McpToolInputs` lists only those servers' tools, so `{ tool: 'mcp__cachebeat__set' }` fails `tsc`. Declare the plugin's own tools in `types/index.d.ts` under `interface McpToolInputs`; that also types `e.session` and `e.settings`. Pinboard doesn't, and probably fails `tsc` once an MCP server is connected (a guess, not checked).
- **The generated `claude-code-mcp` types don't list the plugin's own tools** (checked once), so the declaration doesn't clash. If it ever does (TS2717), drop ours.

## The test kit (`claude plugin test`)

- **Register a test's own hooks before the first `$` call.** `setup()` starts the session, so a test hook goes above `await setup($, on)`. Otherwise it throws "after the test first called $".
- **`$.tool.register` needs a stub beneath it** (`on('tool.register', …)` in `setup`). Nothing answers it otherwise.
- **A `classic.PreToolUse` deny reaches the test's `$.tool.call` as an errored result** (`isError: true`, the reason as `text`), not as `{ deny }`. `{ deny }` is what a plugin's own `$.tool.call` gets.
- **Stub `env.get` and `settings.read`** in `setup()`, as the cache lifetime is read through them. `World` has `env`, `settingsFile` and `isSubscription` for that.
- **`$.session.compact()` in a test needs the transcript passed in:** `$.session.compact({ messages: […] } as never)`. Without it, the event's `messages` isn't a list and every hook on it is skipped. A session supplies it itself.
- **Classic events are raised through `$.classic.<Event>(fields)`,** such as `$.classic.PostModelSwitch(SWITCH)`. Each needs a stub beneath it, like `on('classic.PostModelSwitch', () => ({}))`.
- **A `$` call left running after a test ends rejects the whole file run** ("no hooks module of that name is loaded"). A `void schedule($)` from `stop()` is one such call, so `schedule()` makes its `$` calls only on the path that arms a beat.
- **Tool arguments arrive flat on `e`,** beside the reserved `tool`, `tool_use_id`, `consent` and `agentId`. Read `e.session` and `e.settings`; never validate the whole `e`, or every call fails on the reserved keys.

## Reviews and validation

- **`/code-review ultra` bundles tracked files only.** An untracked new file (`hooks/tools.ts`, before its first commit) shows up as "module does not exist". Commit, or at least `git add`, new files before an ultrareview.
- **`claude plugin validate` shows a matcher built from a constant as `?`** (`tool=?`, `requestId=?`). A literal resolves (`tool=mcp__cachebeat__set`). The plugin directory reads the source the same way, so its tool matchers are literals.
- **CI already checks the oldest supported version.** It runs on 2.1.287 and latest, so a passing CI run means the API works on 2.1.287. That's how `$.tool.register` was confirmed there.
