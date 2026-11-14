# The tools Claude calls (0.6.0)

`mcp__cachebeat__state` and `mcp__cachebeat__set` let Claude read and change cachebeat. They're specced in `hooks/tools.ts` and answered in `hooks/register.tsx`.

## Why tools, and not a skill or the command

- A mod's `/cachebeat` is a local command that answers `{ text }`. It isn't a skill, and the model can't run it: it isn't in the Skill tool's listing.
- A skill only gives Claude text, and it would still need a way to act. The tool descriptions carry the guidance a skill would.
- So it's `$.tool.register` in `session.start` (after `$.command.register`, so a refused registration can't take `/cachebeat` down with it), plus a `tool.call` hook per tool.

## The shape

- **Two tools.** `state` is read-only, so subagents can use it. `set` takes `{ session, settings }`, and the key the model writes is the scope decision.
- **`session`** is `{ enabled, keepAliveMinutes }` for this session alone (`intervalMinutes` until 0.10.0). **`settings`** is any saved setting, used by every session.
- **The schema is derived from the settings menu's rows** (`TABS`) and the number readers (`parseMinutes` and the rest). Each reader carries its unit, min and max, so a range is written once, and the model gets the same limits as the menu. `accept(key, value)` in `settings.ts` is the one validator, used by the tools and matching the pane.
- **A bad value refuses the whole call.** `parseSet` collects every bad value into one `deny` that starts "nothing changed:", says what each field takes, and repeats what was sent.
- **`null` resets a setting** to its default, the same way `keepAliveMinutes: null` drops a session's time limit.
- **The `set` answer is `{ changed, session, settings }`:**
  - `changed` lists what the call itself changed: this session's switch and keep-alive time, and the settings in its own patch. Effects don't count: a session following the default isn't listed when the default moves.
  - It's computed from the patch, not by diffing the store before and after, so another session saving at the same moment isn't credited to this call.
- **`state` reports `session.cacheTtl`**, the lifetime `auto` read (0.7.0), and `intervalMinutes` comes to what `auto` resolves to.
- **`state` has `defaults`**, the default of each setting that differs from it, so an agent can check a reset on its own.

## Decisions, and why

- **~~A session interval turns beating on~~ (reversed in 0.10.0; see "0.10.0" below).** Until then `session.intervalMinutes` turned beating on, unless `enabled: false` came with it, the way `/cachebeat 30` did. Two agents testing the tools weren't sure whether to send `enabled: true` with an interval, and the user chose this. In 0.10.0 the user found a per-session interval unintuitive: the interval is a setting (`settings.interval`, `folder.interval`), and `/cachebeat <time>` and `session.keepAliveMinutes` now mean how long to keep the cache warm. The same rule carries over to the new field: a keep-alive time turns beating on.
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

## Folders (0.8.0)

- **`set` takes `folder` beside `session` and `settings`,** with the same fields as `settings`.
  - A value saves it as the folder's own.
  - `null` for one setting drops it, so it follows all folders. In `settings`, `null` still means "back to the default".
  - `folder: null` drops every one, the same as **Reset folder** and `/cachebeat local reset`.
  - A folder's own settings always apply while it has any. There's no on or off for them.
  - It goes through the same `accept()` as the menu, and a bad value refuses the whole call, as before.
- **The description maps phrasing to a key:**
  - "in this repo", "in this folder", "here" or "for this project": `folder`
  - "default", "everywhere", "always" and the rest: `settings`
  - no scope named: `session`
  - unclear: ask

  "Project" stays among the phrases because users say it, even though the menu says "folder".
- **Claude names the folder by its path** when it changes `folder`, and the transcript line shows the path (`cachebeat · this folder (…/api): …`). In headless tests Claude named the path once in seven tries when it was only in `state`, so `set`'s answer carries it too (`folder: { path, … }`), and the description says to name it. A subfolder or another worktree has settings of its own, so "this repo" may not be the folder Claude is in.
- **It tells Claude that a `settings` change doesn't reach a setting the folder has its own of,** and to say so.
- **Saving an interval in `settings` or `folder` drops this session's own,** as the menu and the commands do. The exception is when the same call sets `intervalMinutes`. Before, the tool kept the session's interval while the menu dropped it, and the code review flagged the mismatch. (Gone in 0.10.0, with the session interval.)
- **`state.settings` is what applies here.**
  - `folder` is `{ path, own }`.
  - `allFolders` appears only while the folder has settings of its own. Otherwise it would repeat `settings`.
- **`intervalFrom` is `session`, `folder`, `all folders` or `auto`** (no `session` from 0.10.0). `default` became `all folders`, and `auto` means all folders' auto. A folder set to auto says `folder`, since where the value comes from matters more there.
- **`changed` lists `folder.<key>` for each one set or dropped.** The answer's `folder` holds those, with `null` for a drop.
- **The transcript line** prefixes every saved change with its scope: `cachebeat · this session on, every 20m · all folders: Beat after idle 30m · this folder (…/api): New sessions start on`.

## 0.9.0

- **`nextBeat` has more states,** because beats can come mid-turn:
  - `in 42m`, counted from the end of the turn's last request too
  - `50m after the request on its way`, while a request of the turn is answered
  - `after this turn`, while beats wait for the turn's end: a conversation's first turn, or a request that re-sent the conversation
  - `after the next turn` and `null`, as before

  The tool description lists them all.
- **A beat's own prompt is tagged,** and differs mid-turn (`ASK`, `ASK_MID_TURN` in `register.tsx`). Neither is tool text, so neither touches the cached prefix.

## 0.9.1

- **`state` reports `lastBeatWrittenTokens` beside `lastBeatReadTokens`,** and its description says what a beat sends: the conversation as last sent, plus one line tagged `[cachebeat]`. In an end-user test of 0.9.0, Claude was asked what a beat reads and writes and couldn't say: it had only the read, and that was null before the session's first beat. Asked again with this text, it answered from the description and named both fields.

## 0.9.2

- **`state` gains a top-level `cache`** (beside `session`, so `session` kept its shape): `state` (`warm`, `cold`, `unknown` before anything is cached), `ttl`, `lastReadMinutesAgo`, `minutesLeft`, `coldForMinutes`, `contextTokens` (0.10.0 took `recacheUsd` out: see below). Whole minutes, floored. All of it comes from `viewOf` in `hooks/cache.ts`; nothing else decides warm or cold.
- **The description says "likely".** Warm is by time alone: now against the last read plus the lifetime, as Claude Code judges it. The engine can't confirm a hit before a request is made, and a gateway or provider can shorten the lifetime (see mods-gotchas.md, "The prompt cache"). The next beat or turn confirms it through its usage. The description lists the names, never values: tool text is fixed for the session.
- **`recacheUsd` was in the shape from the start, null until prices came,** so the description wouldn't change twice. 0.10.0 removed it (below).
- **`nextBeat` can be `due now`,** when the deadline has passed and the next step hasn't run. `session.paused` can read `the cache went cold`.
- **`CacheView` carries `at`,** the time it was taken, so `lastReadMinutesAgo` and `minutesLeft` agree with `state` instead of being worked out from a second clock read.

## 0.10.0

- **Dollars came, and went.** Step 2 gave `cache.recacheUsd` a value and added `session.lastBeatUsd`, both `≈` estimates at API prices, with a description sentence that a subscription isn't billed per token. The tokens-only step (2026-11-14) removed both fields and the sentence: tokens are cachebeat's currency, and dollars are everywhere or nowhere. `cache.contextTokens` is the re-cache figure; the beat's read and written tokens are `lastBeatReadTokens` and `lastBeatWrittenTokens`. How the dollars were worked out stays in mods-gotchas.md, "Dollars", as a record.
- **`session.keepAliveMinutes` replaces `session.intervalMinutes`** (5–2880 minutes, or null to drop it). `state.session` gains `keepAliveUntil` (UTC ISO), `keepAliveUntilLocal` (the same time on the user's clock, `4:30 PM`; added because a review found an agent could read the UTC one to the user, inferred from the UTC field and the local timezone the kit showed, not seen) and `keepAliveMinutesLeft` (whole minutes, floored), and `nextBeat` can be `none needed`: a keep-alive time is set and the cache outlives it, so no beat is armed. `intervalFrom` has no `session` any more; `intervalMinutes` stays as the interval in effect.
- **`keepAliveMinutes` with `enabled: false` is refused.** The plan let the pair through, but a keep-alive time is a deadline counted from the call, for a session that beats. Kept while off it would either run out unseen or need a second state to remember. So `schedule()` clears the time whenever the session is off (the one place every off route passes through: `off`, `stop`, the tool, the pane), and the contradictory call is a refusal naming both fields, as `parseSet` does for other bad values.
- **The old key gets a pointed refusal, not "session has no intervalMinutes".** Tool text is fixed for the session, so a session started before the update still holds the old schema and will send `intervalMinutes`. The refusal says the interval is `settings.interval` or `folder.interval`, and what `keepAliveMinutes` is.
- **The scope paragraph no longer routes "beat every 20 minutes" to `session`.** It has no session scope now: `settings.interval`, or `folder.interval` for "in this repo", else ask. "Keep it warm for 2 hours" is the session's example.
- **Stop after idle, in the tool text:** `ABOUT.stopAfterHours` and the `set` description say a keep-alive time overrides it; a usage limit or an API error still stops it.
