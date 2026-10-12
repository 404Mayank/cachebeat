# 0.8.0: where settings apply

Status: built on `dev`, with the tests passing on 2.1.287 and the latest version. Still to do: look at it live in the terminal and the desktop app, check `--resume`, and release.

## The problem

It was hard to tell where a setting applies (this session or every session), and whether you could choose. 0.7 said the scope once per tab, in a dim line. It had five names for two scopes ("this session", "global", "the default", "every session", "new sessions"). One setting, **/cachebeat 30 changes**, changed what a command meant. There was also no way to have cachebeat on in one repo and off everywhere else.

## The design

### Three scopes, one set of words

| Scope | Holds | Kept in |
| --- | --- | --- |
| **This session** | on or off, and an interval of its own | `$.state` (`saved`), as before |
| **This folder** | any setting it sets for itself | `$.store`, key `folders`: `{ [root]: Partial<BeatSettings> }` |
| **All folders** | every setting | `$.store`, key `settings`, as before |

The nearest scope wins: this session, then this folder, then all folders. A folder's own settings always apply while it has any. There's no on or off for them, so nothing sits turned off out of sight.

The menu, the command answers, the README and the tool text all use these three names. The command words are `local` and `global`; `global` shipped before 0.8.0.

### The menu: one switch for where changes save

**Settings for** reads `all folders` (dimmed, the usual case) or `this folder · …/code/api`. It only chooses where the menu saves. On Beating it sits under **This session**, which it doesn't govern. On the other tabs it's the first line.

- **`this folder`:** changes save to the folder's own, and those rows are marked `· this folder`. The rest follow all folders, so a later change there reaches the folder too. `r` on a marked row drops it. **Reset all** becomes **Reset folder**, which drops every one.
- **`all folders`:** the menu shows and saves the settings for all folders. A row this folder has its own of shows `· here: on`. A folder with its own settings never has to turn them off to edit the all-folders ones.
- **Which side it opens on:** the menu opens on `this folder` when the folder has settings of its own, and on `all folders` otherwise. So someone who never uses folders sees the 0.7 menu plus one dim line.

**This session** keeps its row on Beating. A session's own interval (`/cachebeat 30`) shows on **Beat after idle** as `30m · this session`, and `r` drops it.

**Saving an interval drops this session's own,** so this session beats at the new one. That holds by every route: the menu, `global` or `local <minutes>`, and Claude's `set` with `settings.interval` or `folder.interval`, unless the same call also sets `intervalMinutes`. The code review found the routes disagreeing, which is the problem 0.8.0 set out to fix.

### Commands

- **`on`, `off` and `<minutes>`** change this session alone.
- **`global` and `local` with `on`, `off` or `<minutes>`** save to all folders or this folder, and also apply here.
- **`local reset`** drops the folder's own settings, the same as **Reset folder** and Claude's `folder: null`.
- **Answers:**
  - They're short, start with their scope, and end with this session's state: `all folders: every 30m idle · this folder keeps 45m · this session: on, every 45m idle`.
  - A bare `global` or `local` lists the scope's values and only its own usage.
  - The status line names an interval that isn't all folders': `on, every 45m idle (this folder's) · 3 beats · …`.

### Folders

- **The folder is `$.session.root()`:** where the session started, or where `/cd` or a worktree move took it. `load()` reads it again with the store at each sync: every turn, on opening the menu, on each tool call, and with each change.
- **When the interval that applies changes in a sync,** because of a move or another session, `syncSettings` reschedules, so the armed beat doesn't keep the old one.
- **Keys are absolute paths,** so a subfolder or another worktree is a folder of its own. Claude's tool text says to name the folder by its path for that reason, and the transcript line shows the path.
- **The path is cut to 30 cells** in the menu and in answers alike (`cut()` in `pane.tsx`). It keeps whole folders and uses the path's own separator, so Windows paths work too.
- **It isn't shown with `~`,** because that would mean reading `HOME`, and the directory scrutinizes env reads (0.7.0's credential hold).

### Store and migration

- **`normalizeOwn()`** keeps each value the menu would take, through `accept()`, and drops the rest.
- **A folder left with no settings of its own** is deleted.
- **A write reads the store fresh first,** so another session's entries survive.
- **One `changeSettings()`** applies a whole change: some settings for all folders, and some of the folder's own set or dropped. It does one load, one save per key, and one reschedule.
- **`intervalScope` is gone.** `normalize()` drops unknown keys, so an old store loses it by itself. Anyone who had it set to "the default" now finds that `/cachebeat 30` changes this session only. The release notes say so and point to `/cachebeat global 30`.
- **Anyone who never touched a setting** sees no change in behavior.

## Alternatives considered

- **The first plan: "project" scopes under three headings.** The Beating tab had This session / This project / All projects headings, with session and project rows always shown as `as this project · 45m`. Only **New sessions start** and **Beat after idle** had a project scope.
  - Dropped because "project" read as confusing, and every user would have seen the scope machinery, even those who never use it.
  - The full text is in git history (`c75aff1`).
- **Scope chips inside a setting's list.** The scope was picked at the top of the list (`This session · This project · All projects`). It's compact, but it's one more concept inside every picker.
- **Plain-language exceptions only** ("on in this project only"). It's the least visible, but it covers only on and off; an interval can't be put that way.
- **A "This folder only" toggle that also turned the folder's settings on or off** (the first build).
  - Dropped after a UX review. The one control did two jobs: it chose where edits go and whether the folder's settings applied.
  - To edit an all-folders setting from a folder with its own settings, you had to turn those settings off and back on.
  - Settings that were off came back silently, and "off", "Reset folder" and "local clear" each ended differently.
  - Its label, "This folder only", read as a Beating setting.

The switch won because it's one control that only picks where changes save, the menu stays a single list, and nothing about scope appears until someone uses it.

## Still open

- **`--resume` and `--continue`:** does `$.state` (`saved`) survive them? If it doesn't, a resumed session starts from its folder's or all folders' **New sessions start**, like a new one. Check it live and say which in the README.
- **Desktop app:** check that the Settings for line, dimmed and not, and the markers draw, and that Tab reaches the switch.
- **Removed folders** leave small entries in the store. They're harmless; a list of folders with their own settings could come later.
