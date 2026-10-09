# The tools Claude calls (0.6.0)

`mcp__cachebeat__state` and `mcp__cachebeat__set` let Claude read and change cachebeat. They're specced in `hooks/tools.ts` and answered in `hooks/register.tsx`.

## Why tools, and not a skill or the command

- A mod's `/cachebeat` is a local command that answers `{ text }`. It isn't a skill, and the model can't run it: it isn't in the Skill tool's listing.
- A skill only gives Claude text, and it would still need a way to act. The tool descriptions carry the guidance a skill would.
- So it's `$.tool.register` in `session.start` (after `$.command.register`, so a refused registration can't take `/cachebeat` down with it), plus a `tool.call` hook per tool.

## The shape

- **Two tools.** `state` is read-only, so subagents can use it. `set` takes `{ session, settings }`, and the key the model writes is the scope decision.
- **`session`** is `{ enabled, intervalMinutes }` for this session alone. **`settings`** is any saved setting, used by every session.
- **The schema is derived from the settings menu's rows** (`TABS`) and the number readers (`parseMinutes` and the rest). Each reader carries its unit, min and max, so a range is written once, and the model gets the same limits as the menu. `accept(key, value)` in `settings.ts` is the one validator, used by the tools and matching the pane.
- **A bad value refuses the whole call.** `parseSet` collects every bad value into one `deny` that starts "nothing changed:", says what each field takes, and repeats what was sent.
- **`null` resets a setting** to its default, the same way `intervalMinutes: null` makes a session follow the default.
- **The `set` answer is `{ changed, session, settings }`:**
  - `changed` lists what the call itself changed: this session's switch and interval, and the settings in its own patch. Effects don't count: a session following the default isn't listed when the default moves.
  - It's computed from the patch, not by diffing the store before and after, so another session saving at the same moment isn't credited to this call.
- **`state` reports `session.cacheTtl`**, the lifetime `auto` read (0.7.0), and `intervalMinutes` comes to what `auto` resolves to.
- **`state` has `defaults`**, the default of each setting that differs from it, so an agent can check a reset on its own.

## Decisions, and why

- **A session interval turns beating on,** unless `enabled: false` comes with it, the way `/cachebeat 30` does. Two agents testing the tools weren't sure whether to send `enabled: true` with an interval, and the user chose this.
- **`skipSmallTokens` doesn't turn `skipSmall` on, and `customColor` doesn't set `color` to custom.** The descriptions say so instead. The user chose a description note for `skipSmallTokens`, and `customColor` follows it.
- **No permission gating.** The hook answers without `next`, so the permission path beneath it never runs, which a test pins. The user was fine with that: the `set` description has Claude mention once per conversation that beats count toward usage. The README says the tools skip permission prompts.
- **Subagents can read, not write.** `set` refuses calls carrying `agentId`, because a subagent isn't the user asking. This was borrowed from [pinboard](https://github.com/sirkitree/pinboard), the one other mod we found that gives Claude a tool.
- **Each call is one dim line in the transcript** (`ToolUse` drawn by us, the successful `ToolResult` drawn empty). Also from pinboard.
- **No state in the system prompt.** Pinboard puts its board there through `prompt.compose`. Here that would change the prompt prefix whenever the state changed, breaking the cache cachebeat keeps warm.
- **The tool text is static.** The tool list is part of the cached prefix, so no live values go in descriptions or schemas; they go in results.
- **`isDeferred` is left out.** The tools wait behind ToolSearch like MCP tools, following the user's own placement, so only their names sit in each request. `isDeferred` needs 2.1.293; leaving it out keeps the floor at 2.1.287.
- **No "beat now" tool and no menu tool.** Claude only ever calls mid-turn: its own turn is already warming the cache, and the pane would take the keyboard from the user.

## How it was tested

Unit tests cover these, through `$.tool.call`:
- the schema ranges, and refusals
- `null` resets and the `changed` list
- turning on mid-turn
- turning off cancelling a scheduled beat
- the permission bypass
- subagents
- the transcript rows

Two live sessions loaded the plugin with `--plugin-dir` and drove the tools over cross-session messages: one old session, and one started cold. Their reviews shaped `changed`, the null resets, `defaults`, and most of the description wording.
