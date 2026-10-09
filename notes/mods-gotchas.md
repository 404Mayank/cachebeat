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
- **The test kit's engine has no `ui.close`,** so a test can't press Esc on a pane.
- **The test kit runs dispatches one at a time,** so it can't reproduce that race. The test "commands and turns arriving together" passes with or without the guard. The live rerun is the evidence: no minute with two beats.
- **`/model` raises `classic.PostModelSwitch` before the engine applies the switch** (`send set_model` comes after it in the debug log), and no `turn.complete` follows. So `$.session.model()` inside that hook may still be the old model. That's why the model is checked again when the beat fires.
- **`turn.complete` without `usage` sent no request.** Only a turn with `usage` warms the cache. cachebeat records `$.session.model()` there and compares it when a beat fires, so a model change is caught whatever events arrive.
- **A background subagent doesn't stall beats** (item 8, tested live). Beats kept landing every minute while a background subagent ran `sleep 180`, and its finishing turn reset the count as a normal turn.
- **The "beats wait" line after `/compact` lands above the compaction's output,** not at the end of the transcript. The engine places `$.ui.log` lines. This is cosmetic and isn't fixed.
- **`claude --debug` writes `~/.claude/debug/<session>.txt`.** It holds every hook dispatch (`hooks module cachebeat@inline <event> settled …`) and every `$.ui.log` line. Use it to see event order instead of guessing.

## Surfaces: the desktop app (found live, 0.7.0)

**Status: passable, left open.** The desktop app isn't the maintainer's main surface: cachebeat is built for the terminal. On desktop it works and looks acceptable, but it isn't polished. Line animations keep small gaps, and heart-heavy ones space wide (below). It's left as it is on purpose. Contributions to tighten it are welcome; the `Svg`-grid idea below is the likely route.

- **Loading a dev copy into the desktop app:** set `"CLAUDE_CODE_PLUGIN_DIRS": "<repo path>"` in the `env` block of `~/.claude/settings.json`, then start a new Code-tab session. The app's plugin manager page lists marketplace installs only, so a folder-loaded plugin never shows there. Check with `/cachebeat`, or with `<bundled claude> plugin list`.
- **The desktop app ships its own Claude Code,** at `~/.config/Claude/claude-code/<version>/claude` (2.1.293 at the time). Its logs in `~/.config/Claude/logs/` carry no hook dispatches.
- **`TurnDuration`** (the closing row the status line hangs under) is raised on the terminal only.
- **`PromptHint`'s `tail` is drawn on the terminal only.** The types say "no other surface draws it yet". A `PromptHint` tree drew nothing in the chat area either. So on desktop the hint row carries nothing of ours.
- **`AbovePrompt` (the band above the input) works on desktop.** cachebeat draws the status line there, desktop only (`isStatusOnBand`). The idea follows [desktop-statusline](https://github.com/centminmod/claude-plugins/tree/master/plugins/desktop-statusline), which builds its whole band that way.
- **The band's font is proportional:**
  - A frame whose characters differ in width (`─ ⎼ ⎺ ♥ ⠀`) changes width from frame to frame, and carries the words after it along. So a wide animation is drawn one `Box` per character, centered. That gives a fixed grid, which stopped the dancing.
  - A heart glyph is wider than a cell, so heart slots are wider (`slotWidths`).
  - Line characters are narrower than a cell, so they leave gaps between slots.
  - **`Box` widths appear to be whole cells:** fractional ones (0.6, 1.5) look rounded. That's inferred from screenshots. The test kit accepts them.
  - So line animations keep small gaps, and heart-heavy ones (Converge's burst) space wide. The user judged that acceptable. The exact alternative is drawing frames as an `Svg` grid, at the cost of fixed colors.
- **A space at the start of a `Box`'s text collapses, as in HTML.** A one-cell box was narrower than a ♥ and covered the space after it. So the single beating heart (♥/♡, one width) is drawn as plain text with its line, and a wide animation gets a `marginLeft`/`marginRight` of one cell instead of a space.
- **Colors draw on desktop:** theme keys and hex alike, as seen in the settings pane.
- **The settings pane works on desktop, but its keys are the app's own.** Tab and Shift+Tab move native focus, and a click presses. cachebeat's terminal-only two-level walk (`ui.focus` denials, arrow `ui.scroll`) fought that, so on desktop (`paneSurface`, noted when the pane draws) it passes those events through. A tab opens on press, and Esc leaves a picker or closes. Neither focus nor scroll events say which surface they come from, so the pane's own draw records it.
- **The settings pane's keys on desktop are open too (0.7.0):**
  - *Native to the app, out of a mod's reach:* Tab moves focus down and Shift+Tab up, and focus can leave the pane for the app's other controls.
  - *Works:* the 1–5 tab hotkeys.
  - *Enter was finicky.* The likely cause was cachebeat moving focus itself after every press, which suits the terminal but lands somewhere on desktop the person isn't looking. On desktop it now moves focus only to land somewhere new: the pane opening, or a list of choices opening (`focusOn`'s `isLanding`). Whether that's enough is for the user to judge. If it isn't, the next thing to try is no moves at all on desktop.
  - *Testing:* the test kit has no focus to move, but each try logs `focus <key>: …` at debug, so a test counts the tries from the log.
- **Before 0.7.0, a desktop user saw only `♥ cache renewed (…)` per beat:** the fallback log for "no closing row seen".

## Old versions (found in 0.7.0's CI)

- **On 2.1.287 a `Button` needs a `label` or a single string child.** Newer builds also accept `Text` children ("a chip, a dim part"). For a dim button, use `<Button dimColor>` with a string. The test kit on the current build accepts both, so only CI's 2.1.287 leg catches it.
- **A `Button` with a `hotkey` draws its own `r: ` before its label.** Don't write the key into the label too.
- **Every API 0.7.0 added works on 2.1.287:** `$.env.get`, `$.settings.read`, `classic.PostModelSwitch`, `session.compact`, `AbovePrompt`, `Box` `minWidth`, and the kit's `$.classic`. CI's 2.1.287 leg passed, so the floor stays.
- **Testing an old version locally:**
  1. `npm install @anthropic-ai/claude-code@2.1.287` in a scratch folder.
  2. npm blocks its install script until you approve it: `npm install-scripts approve @anthropic-ai/claude-code`.
  3. `./node_modules/.bin/claude plugin test <repo>`.

  Or push and let CI run both legs.

## Types

- **`tool.call` matchers only take known tool names.** With MCP servers connected, the generated `McpToolInputs` lists only those servers' tools, so `{ tool: 'mcp__cachebeat__set' }` fails `tsc`. Declare the plugin's own tools in `types/index.d.ts` under `interface McpToolInputs`; that also types `e.session` and `e.settings`. Pinboard doesn't, and probably fails `tsc` once an MCP server is connected (a guess, not checked).
- **The generated `claude-code-mcp` types don't list the plugin's own tools** (checked once), so the declaration doesn't clash. If it ever does (TS2717), drop ours.
- **Keep the fork's result a `const`.** In 0.7.1, `let r: ModelForkResult` assigned inside `try`/`finally` made `tsc` stop narrowing `r.error` after `r.reason === 'aborted' ||`. `const forking = $.model.fork(…)` then `const r = await forking.finally(…)` keeps the narrowing, and the original timing too.

## The test kit (`claude plugin test`)

- **Register a test's own hooks before the first `$` call.** `setup()` starts the session, so a test hook goes above `await setup($, on)`. Otherwise it throws "after the test first called $".
- **`$.tool.register` needs a stub beneath it** (`on('tool.register', …)` in `setup`). Nothing answers it otherwise.
- **A `classic.PreToolUse` deny reaches the test's `$.tool.call` as an errored result** (`isError: true`, the reason as `text`), not as `{ deny }`. `{ deny }` is what a plugin's own `$.tool.call` gets.
- **Fake the environment with `mock.env(on, world.env ?? {})`, and stub `settings.read`,** in `setup()`, as the cache lifetime is read through them. `World` has `env`, `settingsFile` and `isSubscription` for that. `mock.env` works on 2.1.287 too. Until 0.7.1 the test hooked `env.get` itself, answering any name, and the directory read that as reading the user's keys (0.7.0's credential hold).
- **`$.session.compact()` in a test needs the transcript passed in:** `$.session.compact({ messages: […] } as never)`. Without it, the event's `messages` isn't a list and every hook on it is skipped. A session supplies it itself.
- **Classic events are raised through `$.classic.<Event>(fields)`,** such as `$.classic.PostModelSwitch(SWITCH)`. Each needs a stub beneath it, like `on('classic.PostModelSwitch', () => ({}))`.
- **A `$` call left running after a test ends rejects the whole file run** ("no hooks module of that name is loaded"). A `void schedule($)` from `stop()` is one such call, so `schedule()` makes its `$` calls only on the path that arms a beat.
- **Tool arguments arrive flat on `e`,** beside the reserved `tool`, `tool_use_id`, `consent` and `agentId`. Read `e.session` and `e.settings`; never validate the whole `e`, or every call fails on the reserved keys.

## Reviews and validation

- **`/code-review ultra` bundles tracked files only.** An untracked new file (`hooks/tools.ts`, before its first commit) shows up as "module does not exist". Commit, or at least `git add`, new files before an ultrareview.
- **The directory's `$` rule wants each call as a statement of its own:** `$.a.b()`, `await $.a.b()`, or `const x = await $.a.b()`. Inside an `if`, or as an argument (`isSet(await $.env.get(…))`), it passed. `return $.ui.log(…)` didn't: that blocked every validation from 0.6.0 to 0.7.1.
- **The report's location is the hook's call into the helper chain, not the bad line itself.** It named `await openSettings($)` (line 561, then 581), and the bad call was two helpers down, in `focusOn`. Calls reached earlier from other hooks passed, so look only at what that one call reaches first.
- **`claude plugin validate` shows a matcher built from a constant as `?`** (`tool=?`, `requestId=?`). A literal resolves (`tool=mcp__cachebeat__set`). The plugin directory reads the source the same way, so its tool matchers are literals.
- **Type-checking without a loaded session (a cloud session):** `npx -p typescript tsc -p .` needs `.claude-plugin/types/`, which the engine lays only when a session loads the plugin. Instead, point a scratch tsconfig (the options are in the header of the types file) at the `plugin-authoring` skill's `types/claude-code.d.ts`, plus `hooks` and `types`. That checks against the running build's API.
- **Running 2.1.287 in a cloud session:** `npm install @anthropic-ai/claude-code@2.1.287` in a scratch folder ran without the install-script approval step, and its `claude plugin test` and `validate` work there.
- **CI already checks the oldest supported version.** It runs on 2.1.287 and latest, so a passing CI run means the API works on 2.1.287. That's how `$.tool.register` was confirmed there.
