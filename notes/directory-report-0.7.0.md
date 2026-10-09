# Directory validation of 0.7.0: the full report

> **What actually cleared the block (0.7.4):** none of the eight calls below. The cause was `$.ui.open(PANE_OPEN)`, where `PANE_OPEN` was `{ … } as const`. See [directory.md](directory.md) and [mods-gotchas.md](mods-gotchas.md). The report's "reference: line 561" (`await openSettings($)`) was the call that first reaches it.

This is the portal's validation of `main` at 0.7.0 (`15a263e`), read against the source on 2026-10-09. [directory.md](directory.md) has the short version, next to the 0.6.0 one.

Line numbers below are for `hooks/register.tsx` and `hooks/cachebeat.test.tsx` at `15a263e`. They move once either file changes.

## Summary

| Result | Findings | Needs a change |
| --- | --- | --- |
| Blocks | 1: `MOD_CAPABILITY_USE_NOT_PLAIN` | Yes, before submitting |
| Policy hold | 1: `MCP_FORWARDS_CREDENTIAL_ENV` | Not to submit. Yes to keep every release from waiting for a reviewer. |
| Warning | 5 | No. One README sentence is optional. |
| Note | 2 | No |

## The report's own details are wrong

As in 0.6.0, the report names things that don't exist, so match each finding by what it describes, not by its location:

- **The commit:** `main 15e2b3b` doesn't exist. `main` is `15a263e`.
- **The files:** `register.ts` and `cachebeat.test.ts` are `register.tsx` and `cachebeat.test.tsx`. `claude-plugin/plugin.json` is `.claude-plugin/plugin.json`, though the dot may have been lost when the report was copied.
- **The line numbers:** only one lands on what it names.

  | Report says | What's at that line | Where it actually is |
  | --- | --- | --- |
  | 362, a `tool.call` hook | the middle of `beat()` | 582 and 584 |
  | 508, `tool.register` | `goTo()` | 539 and 540 |
  | 554, `command.run` | the `command.run` hook | 554 |
  | 561 and 585, the block | `await openSettings($)`, and the `set` tool's `if (e.agentId)` | neither breaks the rule; see below |
  | 620, a `classic.` hook | a `ToolResult` render hook | 626 |

## Block: `MOD_CAPABILITY_USE_NOT_PLAIN`

The rule, as the report now states it:

- A call on `$` is written as a bare `$.noun.method(...)`, with nothing wrapped around its parts: no parenthesis, cast, `!`, `??` or square brackets.
- `$` is passed only whole, as an argument to a function declared at the top level of the same file.
- The directory reads `$` this way everywhere in a file that declares a hook.

Eight calls in `register.tsx` break the rule as written:

| Line | In | The call | What's around it | Since |
| --- | --- | --- | --- | --- |
| 72 | `cacheTtl` | `chosen((await $.settings.read()).promptCacheTtl)` | parentheses, a property read on the result | 0.7.0 |
| 97 | `keepCustoms` | `{ ...((await $.store.get('customs')) as typeof customs \| undefined), … }` | parentheses, a cast | 0.7.0 |
| 141 | `refreshLine` | `fmt(s.nextAt - (await $.clock.now()))` | parentheses | before 0.6.1 |
| 306 | `resumeIfWarmed` | `(await $.session.model()) !== s.warmModel` | parentheses | 0.7.0 |
| 345 | `beat` | `await $.model.fork({…}).finally(() => (beating = false))` | a method chained on the result | before 0.6.1 |
| 412 | `turnOn` | `Math.max(0, s.nextAt - (await $.clock.now()))` | parentheses | before 0.6.1 |
| 461 | `openSettings` | `((await $.store.get('customs')) as typeof customs \| undefined) ?? {}` | parentheses, a cast, `??` | 0.7.0 |
| 578 | the `command.run` hook | `Math.max(0, s.nextAt - (await $.clock.now()))` | parentheses | before 0.6.1 |

The report gives one location, and that location is wrong, so it doesn't say which of these it means:

- **The four from 0.7.0** match the rule's own words: parenthesis, cast, `??`.
- **The four older ones** were already in 0.6.1, the version made to clear this same block. The `.finally` has the same shape as the `.catch` that 0.6.1 removed. Nobody recorded whether 0.6.1 passed a re-validation, so these aren't known to be fine.

Fix all eight in one pass. Give each call a statement of its own, and do the rest on the result:

```ts
// 72
const merged = await $.settings.read()
const fromSettings = chosen(merged.promptCacheTtl)

// 97 and 461
const stored = await $.store.get('customs')
customs = (stored as typeof customs | undefined) ?? {}

// 141, 412 and 578
const now = await $.clock.now()
const ms = s.nextAt === null ? undefined : Math.max(0, s.nextAt - now)

// 306: split in two, so the model is still read only when it matters
if (s.paused !== MODEL_CHANGED || busy) return
const model = await $.session.model()
if (model !== s.warmModel) return

// 345: the call plain, .finally on a variable (try/finally with a `let` lost tsc's narrowing)
const forking = $.model.fork({ prompt: 'Reply with a single period.' })
const r = await forking.finally(() => (beating = false))
```

**If the block remains after all eight,** try two more. `scheduledBeat` (line 386) and `beatNow` (line 389) are `const` arrow functions, not `function` declarations, and the rule says `$` goes to "a function declared at the top level". Rewriting them as `function` declarations costs nothing. `beatNow` was also in 0.6.1.

Only the portal's Re-validate runs this lint. `claude plugin validate --strict` doesn't.

## Policy hold: `MCP_FORWARDS_CREDENTIAL_ENV`

The report says the plugin reads the installer's keys and can send data off the machine, both in the test file. Here is each half:

- **"Reads the installer's keys":** this is line 51, `on('env.get', (_$, e) => ({ value: world.env?.[e.name] }) as never)`.
  - It's the test's fake environment: a hook on `env.get` with no matcher, which answers any name from the test's `world.env`. It never reads the machine's environment.
  - It was added in 0.7.0 (`52f3939`) for the cache-lifetime tests at lines 837–842, which is why this hold is new.
- **"A command assembled at run time: mcp_cachebeat":** this is line 11, `` const TOOL = { state: `mcp__cachebeat__${STATE.name}`, set: `mcp__cachebeat__${SET.name}` } ``.
  - It's used by `call()` at line 702 (`$.tool.call({ tool: TOOL[name], … })`).
  - Line 74, the test's `tool.register` stub, builds the same names.
  - These are cachebeat's own two tools, which only read and change cachebeat's settings. The template has been there since 0.6.0.

The test file ships because the plugin folder is the repo root, and `claude plugin test .` and CI need the tests there.

**The plugin itself is different:**

- `register.tsx` reads three environment variables, none of them a credential. The local `claude plugin validate` confirms this with `env reads: CLAUDE_CODE_PROMPT_CACHE_TTL, ENABLE_PROMPT_CACHING_1H, FORCE_PROMPT_CACHING_5M`.
- Its tool names have been written out in full since 0.6.1.
- A beat (`$.model.fork`) does send the conversation to Anthropic's API, as Claude Code's own requests do. The README says so under "What it sends". That isn't what this finding names.

**What the hold means:**

- You can submit, and a reviewer reads the held version.
- The checklist says the scan can raise the same hold again on each new version. Until this is cleared, every release would wait for a reviewer, and none would publish by itself.

**How to clear it:** only Re-validate tells whether this works. 0.7.1 did both of these:

1. Fake the environment with the kit's `mock.env(on, world.env ?? {})`, so the test file has no `env.get` hook of its own. It works on 2.1.287 too. (Limiting a hook to the three names, `on('env.get', { name: 'FORCE_PROMPT_CACHING_5M' }, …)`, was the other option.)
2. Write out the tool names in the test file: `const TOOL = { state: 'mcp__cachebeat__state', set: 'mcp__cachebeat__set' } as const`. In the `tool.register` stub, answer `e.name === 'state' ? 'mcp__cachebeat__state' : 'mcp__cachebeat__set'`.

**If the hold stays:** move the plugin into a subfolder and keep the tests outside it. That's a large change:

- the marketplace `source`, CI's paths and the directory's plugin path all change
- the checklist applies stricter script checks to a plugin in a subfolder

Leave it unless the hold stays after 0.7.1.

## Warnings

| Finding | What it is | Action |
| --- | --- | --- |
| Unrecognized fields | `documentationUrl` and `supportUrl` are listing fields that the directory reads, as the report says. The report says Claude Code ignores `types`, which isn't quite true: `claude plugin validate` checks every `$.state` key against `types/index.d.ts` (its output: `types ./types/index.d.ts declares state: cachebeat.pulse, …`), and `tsc` uses it. | Keep all three |
| `icon` | A listing field the directory reads. The checklist says it's fine. | Keep |
| `MOD_ANSWERS_FOR_TOOL` | The `tool.call` hooks at 582 and 584 answer without `next`. That's how a mod runs the tools it registers (539–540). | None: `README.md:95` names both tools and says cachebeat answers them |
| `MOD_HOOKS_OPERATION` | The `command.run` hook at 554, on our own `cachebeat` command. The local validate reads it as `answers its own command`. | None: `README.md:95` and the Commands table cover it |
| `MOD_HOOKS_POLICY_EVENT` | `classic.PostModelSwitch` at 626, new in 0.7.0. It calls `next(e)` with the event unchanged, then pauses beats or logs a line. The README describes the behavior (**After /model**, "Good to know") but doesn't say the hook changes nothing. | Optional: one sentence under "What it sends", such as: "It also watches for `/model` switches, without changing them, to hold beats until your next message." |

## Notes

- `MOD_REGISTERS_SURFACES` records that the mod adds `/cachebeat` and the two tools, registered at 533–540. Nothing to do.
- `ASSETS_PASSED_UNREAD` covers `assets/demo.gif`, `assets/logo/logo.png` and `assets/logo/social-preview.png`, which were let through as images. Nothing to do.

## The checks summary

The summary ticked 5 of 7 checks. The two unticked were "MCP servers and directory match" and "Name and publisher checks".

The report lists only one block and one hold, so those are probably the two unticked checks. That's a guess, though:

- The hold's code is an `MCP_` one.
- The block is about the directory reading the source.
- Neither obviously belongs to "Name and publisher".

No finding names a name or publisher problem. `cachebeat` meets the checklist's name pattern, and a taken or confusable name would show as a finding of its own. If "Name and publisher checks" is still unticked after the block is fixed, expand it in the portal.

## What the public docs cover

The [pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist) and [submit](https://claude.com/docs/plugins/submit) pages cover these:

- Blocks, Policy hold, Warning and Note, and what each means for submitting
- that a hold can be raised again on each version
- the credential rule: "Don't read a credential that is already set in the user's environment … and send it to a server", which is held for a reviewer
- that README images in Markdown syntax and the `icon` are fine

They don't list the `MOD_` codes, and they don't explain the checks summary.

## What 0.7.1 did

- rewrote the eight calls, and made `scheduledBeat` and `beatNow` `function` declarations
- made the two test-file changes
- added the README sentence about `/model`

Its tests passed on 2.1.295 and on 2.1.287 before it was pushed, and `tsc` was clean. Whether the block and the hold clear is known only from Re-validate.
