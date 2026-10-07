# cachebeat ♥

**Keep Claude Code's prompt cache warm while you're away.**

When a Claude Code session sits idle, its prompt cache quietly expires, and your next message has to rebuild it from scratch. cachebeat gives the session a small heartbeat: shortly before the cache would lapse, it sends a tiny background request that reads the conversation and keeps the cache alive. Your transcript never sees it.

You come back from lunch, type your next message, and it picks up right where you left off.

```
✻ Cogitated for 12s · done 3:09 PM

♥ cache kept warm ×3 · next in 42m

❯
  ⏸ manual mode on · ⠀(♥)⠀ ×3
```

## Features

- **Background beats** that keep the cache warm while you're idle, invisible to the conversation
- **A live heart** under the prompt, with 19 animations to choose from
- **A status line** under your latest turn: beats so far and the countdown to the next
- **A settings menu** with live previews, driven by keyboard or mouse
- **Safety stops** for long idle stretches, usage limits, errors, and chats too small to bother with
- **Per session or everywhere**: turn it on for one session, or have every new session start with it

## Requirements

- Claude Code with plugin support (built and tested on v2.1.292)
- A terminal. The heart, status line and settings menu are drawn for the terminal.

## Install

Clone the repository:

```sh
git clone https://github.com/404Mayank/cachebeat.git
```

Then pick one way to load it.

**In every session (recommended).** Link it into your skills folder. Claude Code loads it in every session and reloads it when the files change:

```sh
ln -s "$PWD/cachebeat" ~/.claude/skills/cachebeat
```

**In one session.** Start Claude Code with the folder as a plugin directory:

```sh
claude --plugin-dir /path/to/cachebeat
```

## Quick start

In any session:

```
/cachebeat on
```

The heart appears under the prompt, and after your next turn it starts beating. To have every new session start with it on:

```
/cachebeat global on
```

## Commands

| Command | What it does |
| --- | --- |
| `/cachebeat` | Shows the status: on or off, the interval, beats so far, the next beat |
| `/cachebeat on` | Turns it on for this session |
| `/cachebeat off` | Turns it off for this session |
| `/cachebeat <minutes>` | Turns it on with a different interval, e.g. `/cachebeat 30` (1–55) |
| `/cachebeat now` | Beats right away |
| `/cachebeat global on` / `off` | Sets whether new sessions start on, and applies it here too |
| `/cachebeat settings` | Opens the settings menu |

## What you'll see

**The heart** sits at the end of the hint line under the prompt, with the beat count beside it. It beats while a beat is scheduled, bursts when one lands, and holds still while it waits for your next turn.

**The status line** sits under your latest turn. Before the first beat it reads `♡ next beat in 50m`, and after that `♥ cache kept warm ×3 · next in 42m`. When you send a new message, the line moves down to the new turn.

## Settings

Open the menu with `/cachebeat settings`. Settings are saved once and apply to every session.

**Getting around:**

- On the tab bar, ↑↓ switch tabs and Enter goes into one
- Inside a tab, ↑↓ move between settings, and Enter changes one or opens its list of choices
- In a list, ↑↓ preview each choice and Enter picks it
- Esc goes back one step, and closes the menu from the tab bar
- 1–5 jump straight into a tab
- The mouse works too: click to pick, scroll to scroll

Settings with numbers also take a custom value at the bottom of their list, such as `35` minutes, `90m`, or `35k` tokens.

### Beating

| Setting | What it does | Default |
| --- | --- | --- |
| This session | Turns beating on or off right here | off |
| New sessions start | Whether new sessions start with it on | off |
| Beat after idle | How long the session sits idle before a beat | 50 minutes |
| `/cachebeat <min>` sets | Whether `/cachebeat 30` changes this session only, or the default for all | this session |
| Stop after idle | Stops beating after this long without a message from you | 8 hours |
| Stop at usage | Stops once any of your usage limits reaches this percentage | 100% |
| Skip small contexts | Skips beating chats under a minimum size | off, 20k tokens |

With **Skip small contexts** on, cachebeat tells you up front when a chat is under your minimum, once in the log and in the status line: `♡ beats skip · this chat is 38k tokens, under your 50k minimum`. It starts beating as soon as the chat grows past the minimum.

### Heart

| Setting | What it does | Default |
| --- | --- | --- |
| Animation | Which of the 19 animations the heart plays | Classic |
| Animate | Turns the animation on or off | on |
| Speed | Slow, normal, fast, or a custom frame time | normal |
| Timing | Linear plays evenly; lub-dub beats twice, then rests | linear |
| Placement | At the end of the hint line, or on its own line below it | hint line |
| Beat count | Shows the `×3` beside the heart | on |

The Animation list plays every animation at once, so you can watch them side by side before you pick. Linear suits the line animations, and lub-dub suits the hearts.

**The animations:** Classic, Pulse, Triplet, Sparkle, Fleuron, Wave, ECG, Beam, Dash, Sine, Charge, Converge, Twins, Orbit, Static, Garland, Equalizer, Cupid and Bounce.

```
Classic    ⋅ ♡ ⋅            ECG     ─⎼⎺⎽────⎼⎺⎽───♥
Sparkle    ✦ ♥ ✦            Sine    ⠒⠉⠒⠤⣀⠤⠒⠉⠒⠤⣀⠤⠒⠉❤︎
Orbit       •♥              Cupid       ─➤ ♡
```

### Look

| Setting | What it does | Default |
| --- | --- | --- |
| Color | Dim, a color from your theme, a preset, or any hex color | dim |
| Effect | Steady; flash on each beat; flow, a shimmer sweeping across; or mixed, which switches between them | steady |

Theme colors follow your Claude Code theme, so they change when you switch themes. A heart at the end of the hint line is always dim; put it on its own line to give it color. The status line takes the color either way.

### Status

| Setting | What it does | Default |
| --- | --- | --- |
| Placement | Under the turn after a blank line, directly under it, or off | after a blank line |
| Countdown | Shows the time to the next beat | on |
| Tokens kept | Shows how much the last beat kept warm, e.g. `· 184k cached` | off |

### Alerts

| Setting | What it does | Default |
| --- | --- | --- |
| On a beat | Log, toast, both, or nothing when a beat lands | nothing |
| On stop | Log, toast, both, or nothing when beating stops by itself | log |

## When it stops on its own

cachebeat turns itself off for the session when:

- you haven't sent a message for longer than **Stop after idle**
- a usage limit reaches **Stop at usage**
- the API rate-limits it, or returns an error that doesn't clear up (a passing hiccup is retried a minute later)
- the cache is already gone, so there's nothing left to keep warm

It tells you why, the way you chose under **Alerts**.

## Good to know

- Each beat is one small request, and it counts toward your usage like any other.
- Beats only happen while the session is idle. Sending a message restarts the countdown.
- `/clear` starts a fresh conversation: the count goes back to zero, and beats resume after your first message.
- Settings you change in one session reach your other open sessions at their next turn.

## Contributing

Ideas, bug reports and pull requests are all welcome: a new heart animation, a setting you'd find useful, or a fix. Open an issue to talk something through, or send a PR straight away.

To work on it, clone the repo and link it into `~/.claude/skills` as above. Your edits reload in the running session. Before sending a change:

```sh
claude plugin validate .   # checks the plugin the way Claude Code loads it
claude plugin test .       # runs the test suite
tsc -p .                   # type-checks (once Claude Code has loaded the plugin)
```

| File | What's in it |
| --- | --- |
| `hooks/register.tsx` | Scheduling, beats, commands, and what's drawn on screen |
| `hooks/animations.ts` | The animations and their timing |
| `hooks/settings.ts` | Settings, defaults, colors and effects |
| `hooks/pane.tsx` | The settings menu |
| `hooks/cachebeat.test.tsx` | Tests |

A new animation is a single entry in `hooks/animations.ts`: a loop and a burst, each written as frames separated by `|`.

## License

[MIT](LICENSE)
