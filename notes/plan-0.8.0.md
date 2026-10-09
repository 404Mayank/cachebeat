# Plan: 0.8.0, where settings apply

Status: a proposal, not started. The open questions at the end need answers before work begins.

## The problem

It's hard to tell where a setting applies: this session, this project or everywhere. It's also hard to tell whether you choose that or it's fixed. 0.8.0 should show the scope of each setting, and let people choose the scope where it matters, without making the menu harder to read.

## How it works today (0.7.0)

### The scopes

| Scope | Kept in | What's in it | How long it lasts | How it's set |
| --- | --- | --- | --- | --- |
| This session | `$.state` (the `saved` atom) | on or off, and an interval of its own if one was given | Until the session ends. Reloads and `/clear` keep it. A new session starts from **New sessions start**. | `/cachebeat on`, `off` or `<minutes>`; the menu's **This session** row (on or off only); Claude's `set` with `session` |
| Every session | `$.store`, key `settings`: a JSON file of cachebeat's under the Claude Code config folder | all 29 settings, `defaultOn` and `interval` among them | Until changed. Other open sessions pick a change up at their next turn. | The menu; `/cachebeat global on` or `off`; `/cachebeat <minutes>` when **/cachebeat 30 changes** is "the default"; Claude's `set` with `settings` |
| A project | nothing | | | |

`auto` adds an input the user doesn't set in cachebeat at all. It beats by the cache's lifetime, which comes from the `promptCacheTtl` setting, three environment variables, and whether the account is a subscription within its usage.

### How the scope is shown

- **The menu:** one dim line under the tab bar.
  - On Beating: "This session is this session alone; every other setting applies to every session."
  - On the other tabs: "These apply to every session."
  - A session's own interval shows only as a tail on **Beat after idle** (`· this session 30m`), and the menu can't clear it.
- **Commands:**
  - `on` and `off` change this session.
  - `global on` and `off` change new sessions, and this session too.
  - `<minutes>` changes this session or the default, depending on a setting.
- **README:** "Settings are saved once and apply to every session", and "Everything in the menu applies to every session, except **This session**".
- **`/cachebeat`:** prints `on, every 30m idle · …` without saying where the 30 comes from. Claude's `state` does say (`intervalFrom`).

### What's hard to grasp

1. **The scope is said once per tab,** in a dim line, never at the setting itself.
2. **Five names cover two scopes:** "this session", "global", "the default", "every session" and "new sessions".
3. **`/cachebeat 30 changes` is a setting that changes what a command means.** You choose the scope somewhere else, and nothing shows it when you type the command.
4. **A session's own interval is easy to miss and hard to undo.** It shows only as a tail. Only Claude (`intervalMinutes: null`) or a new session clears it.
5. **There's no per-project choice.** To have it on in one repo and off everywhere else, you type `/cachebeat on` in every session there.
6. **Nothing says which value wins** when a session and the default disagree.
7. **The same setting behaves differently by route.** `/cachebeat global on` also turns this session on. The menu's **New sessions start** doesn't: "Open sessions keep what they have".

## Goals

- Every place that shows or changes a setting names its scope, in the same words.
- The user picks the scope at the moment of the change, not through a setting somewhere else.
- Add a project scope only where it's useful.
- The menu stays one list per tab, with a few more rows and no grid.

**Not goals:**

- Per-project looks, alerts or limits. These are taste, the same everywhere.
- Team-wide settings in a project's `.claude/settings.json`. Beats spend each person's own usage, and a mod can only read settings files anyway.

## The model

### Three scopes, one set of words

| Scope | Lasts | Kept in |
| --- | --- | --- |
| **This session** | Until the session ends; reloads and `/clear` keep it | `$.state`, as now |
| **This project** | Until changed | `$.store`, key `projects`, under the project's root folder (`$.session.root()`) |
| **All projects** | Until changed | `$.store`, key `settings`, as now |

The menu, command answers, README and tool descriptions all use these three names. The command word `global` stays, since it has already shipped, but answers say "all projects".

### Which settings have which scopes

| Setting | This session | This project | All projects |
| --- | --- | --- | --- |
| Beating (on or off) | yes: the live switch | | |
| New sessions start | | yes | yes |
| Beat after idle | yes | yes | yes |
| Everything else: After /model, limits, looks, alerts | | | yes |

Only these two settings get more than one scope, because they're the ones that depend on the work. A long-running repo and a scratch session want different things, and so does a project on an API key's five-minute cache. If people later ask for another (say **Stop at usage** per project), the same mechanism takes more keys.

### Which value wins

The nearest scope with a value wins: this session, then this project, then all projects.

A session or project row with no value of its own shows what it follows and what that comes to: `as this project · 45m`, `as all projects · off`. That tells people which value wins without a line of explanation.

## The menu

The Beating tab groups its rows under the three scopes. The project's folder goes in its heading:

```
 Beating   Limits   Prompt heart   Turn line   Alerts
───────────────────────────────────────────────────────
This session
  Beating               on
  Beat after idle       as this project · 45m ›
This project  ~/code/api
  New sessions start    as all projects · off ›
  Beat after idle       45m ›
All projects
  New sessions start    off
  Beat after idle       auto · 50m now ›
  After /model          wait for your next turn ›
───────────────────────────────────────────────────────
[ Beat now ]  [ Reset all ]
This session only. Set here, it wins over this project and all projects.
↑↓ move · enter changes · 1-5 tabs · esc back to the tabs
```

- **Headings** are plain text and take no focus. The arrows walk the rows as they do now.
- **A session or project row's list** offers `as this project` or `as all projects` first, then the same choices as the all-projects row, custom value included.
- **The help line** names the scope and what it wins over.
- **`r`** puts a session or project row back to `as …`, and an all-projects row back to its default, as now. **Reset all** resets the all-projects settings, as now. A project's own values clear row by row with `r`.
- **`/cachebeat 30 changes` goes away.**
- **The row count** goes from 5 rows on Beating to 7, plus three headings.
- **The other tabs'** line under the tab bar becomes "These apply to all projects."
- **The desktop app** draws headings as text, with nothing new to focus.

**Alternatives considered:**

- **A scope switcher at the top of the tab,** like VS Code's User and Workspace tabs. It needs fewer rows, but it hides the scopes you're not looking at, which is the problem being solved.
- **One row per setting, with the scope chosen in its list.** It's compact, but every change takes a list inside a list, and the overview of what applies where is gone.

## Commands

| Command | Scope |
| --- | --- |
| `/cachebeat on` / `off` | This session |
| `/cachebeat <minutes>` | This session's interval, always |
| `/cachebeat project on` / `off` / `<minutes>` | This project, and this session too |
| `/cachebeat project clear` | This project back to all projects |
| `/cachebeat global on` / `off` / `<minutes>` | All projects, and this session too |

Each answer names the scope. For example:

- `this session: on, every 30m idle`
- `this project (~/code/api): new sessions start on · this session: on, every 45m idle`

The project and global forms change this session too, as `global on` does today. A command is a one-off, so it does both and says so. The menu keeps them apart because its live switch is right there.

`/cachebeat` says where the interval comes from: `on · every 45m idle, from this project · 3 beats · next beat in 12m`.

## Claude's tools

- **`set`** takes `project: { defaultOn?, interval? }` beside `session` and `settings`, with `null` clearing a value. Its description maps what people say to a scope:
  - no scope: this session
  - "in this repo", "for this project": `project`
  - "always", "everywhere", "by default": `settings`
  - unclear: ask
- **`state`** adds `project: { root, defaultOn, interval }`, with the project's own values only. `session.intervalFrom` becomes `session`, `project`, `all projects` or `auto`.
- **[claude-tools.md](claude-tools.md)** records the change and the reasons for it.

## README

Replace "Settings are saved once and apply to every session" and "Everything in the menu applies to every session, except This session" with a short section, "Where settings apply":

- the three scopes, each with what can be set there, how long it lasts, and how to set it
- one sentence on which value wins

The Commands table gains the project rows. The Beating table loses `/cachebeat 30 changes`.

## Store, defaults and migration

- **`settings`** keeps its shape, minus `intervalScope`.
- **`projects`** is new: `{ [root]: { defaultOn?, interval? } }`. It holds only what's set, and an entry with nothing left in it is deleted.
- **When a session starts,** `s.enabled = project.defaultOn ?? cfg.defaultOn`.
- **The interval** is `s.idle ?? project.interval ?? cfg.interval`, with `auto` read off the cache lifetime as now.
- **A project change made in another session** reaches open sessions at their next turn, like settings do now: `syncSettings` reads `projects` too.
- **`normalize()` drops `intervalScope`.** Anyone who set it to "the default" finds that `/cachebeat 30` now changes this session only. The release notes say so and point to `/cachebeat global 30`.
- **Anyone who never touched a setting** sees no change in behavior.

## Edge cases

- **The project is `$.session.root()`:** where the session started, or where `/cd` or a worktree move took it. After a move, the session re-reads the project's values at its next turn, and its own on or off stays as it is.
- **Projects are keyed by absolute path,** so each worktree or folder is its own project. The heading shows the path, with `~` for the home folder.
- **A session started in the home folder** has the home folder as its project. The heading makes that visible.
- **Removed folders** leave small entries in the store. They're harmless. A list of projects with their own settings could come later.
- **Resume:** check whether `$.state` survives `--resume` and `--continue`. If it doesn't, a resumed session starts from its project's or all projects' default, like a new one. The README should say which.

## The directory

- Write each new `$` call plainly, as a statement of its own, for example `const root = await $.session.root()`. No casts or `??` around calls. See [directory-report-0.7.0.md](directory-report-0.7.0.md).
- `$.session.root()` reads a path. It reads no environment variable.

## Tests

- which value wins, session over project over all projects, for the interval and for starting on
- projects keyed by root, with `session.root` stubbed to two folders
- a root change mid-session
- `project on`, `off`, `<minutes>` and `clear`, `global <minutes>`, and answers that name the scope
- migration from a store with `intervalScope`
- the menu: headings, `as …` values, `r` clearing a session or project row, the `as …` first choice in a list
- the tools: `set.project`, `state.project`, the new `intervalFrom` values

## Releases

1. **0.7.1:** the directory fixes in [directory-report-0.7.0.md](directory-report-0.7.0.md). They're small, they don't change behavior, and they unblock the submission without waiting for this work.
2. **0.8.0:** this plan, in this order:
   1. the model and store
   2. commands
   3. the menu
   4. tools
   5. README
   6. tests throughout

## Open questions

1. **Names.** Should the widest scope be "all projects", "everywhere" or "global"? Should `all` work as a command word beside `global`? This plan recommends "all projects" in text, with `global` kept as the command word.
2. **Should more settings get a project scope?** For example **After /model**, **Stop at usage** or **Skip small chats**. This plan recommends no, until someone asks.
3. **Should `/cachebeat project on` turn this session on too,** as `global on` does? This plan recommends yes, saying so in the answer.
4. **Should a session that starts on because of its project say why** in a log line, once? Or should that be left to `/cachebeat`? This plan recommends leaving it to `/cachebeat`, so the transcript stays quiet.
5. **Should 0.7.1 ship on its own first,** or be folded into 0.8.0? This plan recommends shipping it on its own.
