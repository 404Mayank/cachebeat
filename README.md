# cachebeat

A Claude Code mod that keeps the prompt cache warm while a session sits idle.

When you step away from a session, its prompt cache expires (at most an hour after it was last read), and the next turn pays to write the whole context again. cachebeat sends a tiny side request (a "beat") shortly before that happens. The beat forks the conversation as the main thread last sent it, asks for a single period, and throws the reply away. The transcript never sees it, but the cache gets read and stays warm.

## Usage

```
/cachebeat                 status: interval, beats so far, time to the next beat
/cachebeat on | off        start or stop beating in this session
/cachebeat <minutes>       turn on with a different interval (1–55)
/cachebeat now             beat right away
/cachebeat global on|off   whether new sessions start beating (also applies to this one)
/cachebeat settings        open the settings pane (also /cachebeat config)
```

It's off by default. `/cachebeat global on` makes every new session start beating. Each idle session will then fork every interval until it stops by itself.

While it's armed, an animated heart sits under the prompt, followed by the beat count (` ×3`). While it's on, a status line sits under the latest turn's closing row ("✻ Cogitated for 2s"), after a blank line: `♡ next beat in 50m` until the first beat, then `♥ cache kept warm ×N · next in 42m`, counting this session's beats. There's one line, and it moves down to each new turn's row as the turn ends.

### When it stops by itself

- after a set number of hours since your last real turn (8 by default)
- once the cache has gone unread for over an hour, so there's nothing left to keep warm
- when any rate-limit window reaches the usage you set (100% by default)
- on a rate limit or non-transient API error
- when a beat's request wasn't served from the cache

Transient errors (overloaded, 5xx, network) are retried a minute later.

With **Skip small contexts** on, cachebeat checks the chat's size when you turn it on and after every turn. If it's under your minimum, the log says `beats will skip: this chat is 38k tokens, under your 50k minimum` (once, not every turn), the status line under the turn row says `♡ beats skip · …`, and the heart holds still. The first turn that grows the chat past the minimum arms it again.

## Settings

`/cachebeat settings` opens a pane with five tabs: Beating, Heart, Look, Status and Alerts. Each tab is short enough to fit without scrolling.

- **Keyboard:** the pane has three levels.
  - **Tab bar:** ↑↓ and Tab switch tabs, wrapping from the last tab to the first, and the page follows. Enter goes into the tab's settings. Esc closes the pane.
  - **A tab's settings:** ↑↓ move the highlight and stop at the first and last rows; the pane scrolls to follow in a short window. Enter on an on/off row flips it. Every other row is marked `›`, and Enter on it opens a picker of its choices. Number settings also have a **custom** field at the bottom of their picker. Esc goes back to the tab bar.
  - **Picker:** ↑↓ move and Enter picks. Esc goes back to the row.

  From anywhere, 1–5 open a tab and go straight into its settings, and so does a click on a tab.

  Left and Right aren't used. The engine keeps Left for its agents view, and never passes Right to the pane.
- **Mouse:** a click does what Enter does on that row or tab. The wheel scrolls.
- **Preview:** the Heart, Look and Status tabs show a live preview of the heart and the status line. In a picker, the preview shows the highlighted option before you pick it. The Animation picker plays every variant at once, the way the bash previews did: five loops, then the blast a beat sets off.
- **Rows that don't apply are hidden:** the skip-small threshold when skipping is off, speed, timing and effect when animation is off, and the countdown and tokens rows when the status line is off.

Settings are global. They're kept in the plugin's store, so every session uses them. The store keeps only the settings you've changed, so a new default in a later version still reaches you. A session that's already running picks up changes at its next turn.

| Tab | Setting | Values | Default |
| --- | --- | --- | --- |
| Beating | This session | on / off (this session only, not saved) | off |
| | New sessions start | on / off | off |
| | Beat after idle | 1–55 min, or a custom value | 50m |
| | `/cachebeat <min>` sets | this session only / the global default | this session |
| | Stop after idle | 1–24 h, or a custom value up to 48h (`10`, `90m`) | 8h |
| | Stop at usage | 50–100%, or a custom value from 10% | 100% |
| | Skip small contexts | on / off; threshold 5k–100k tokens or a custom count like `35k` (shown when on) | off; 20k |
| Heart | Animation | 19 variants (see below) | Classic |
| | Animate | on / off | on |
| | Speed | slow 120ms / normal 80ms / fast 50ms per frame, or a custom frame time of 20–500ms | normal |
| | Timing | linear / lub-dub: the loop twice, then a rest as long as one pass. Heart animations rest on their resting frame. Endless ones (ECG, Beam, Dash, Sine, Orbit, Garland, Bounce) have no resting frame, so they play a third pass at half speed instead of freezing. | linear |
| | Placement | end of the hint line / its own line | hint line |
| | Beat count | on / off | on |
| Look | Color | dim; theme: claude, permission, warning, fastMode, inactive; presets red, magenta, yellow, green, cyan, white (drawn as hex); custom `#hex` | dim |
| | Effect | steady / flash (lights up on each full heart) / flow (a shimmer sweeping across, like the thinking text) / mixed (flash, flow, or both at once, picked at random every few seconds) | steady |
| Status | Placement | below after a blank line / directly below the turn row / off | after a blank line |
| | Countdown | on / off | on |
| | Tokens kept | on / off (`· 184k cached`) | off |
| Alerts | On a beat | none / log / toast / both (log + toast) | none |
| | On stop | none / log / toast / both (log + toast) | log |

The theme colors are theme keys, so they follow your active theme, and their highlight is the theme's own shimmer color. A preset or custom color is drawn as hex, and its highlight is a lighter shade of it.

The hint line only takes plain text, which it draws dim. A heart there can't take a color or an effect; give it its own line for those. The status line takes the color and effect wherever it's placed.

The status line can't share a line with the turn row ("✻ Cooked for 2s · done 3:10 AM"). The engine hands that row to plugins whole and full width, with no text to measure, so anything put beside it lands at the far edge.

There's no sound option. The harness's only audio API, `$.audio.play`, plays nothing on Linux or Windows.

### Animations

Classic, Pulse, Triplet, Sparkle, Fleuron, Wave, ECG, Beam, Dash, Sine, Charge, Converge, Twins, Orbit, Static, Garland, Equalizer, Cupid and Bounce. Each has a loop it plays while armed and a blast it plays once when a beat lands. Some are 5 cells wide and some are 15. A wide one can be cut off at the end of the hint line on a narrow terminal.

## Install

cachebeat is a plugin of function hooks. Load it from this folder:

```sh
claude --plugin-dir /path/to/cachebeat
```

Or link it into your skills folder, which auto-loads and hot-reloads it:

```sh
ln -s /path/to/cachebeat ~/.claude/skills/cachebeat
```

## Development

```sh
claude plugin validate .   # what the module hooks and calls, and what the engine would refuse
claude plugin test .       # hooks/*.test.tsx
tsc -p .                   # type-check
```

`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`. The engine generates that file, along with the API declarations, each time it loads the mod, so `tsc` only works once the mod has been loaded at least once. The generated types are gitignored.

## Layout

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             names the hooks module
hooks/register.tsx           the mod: scheduling, beats, commands, drawing
hooks/animations.ts          the 19 variants and their timing
hooks/settings.ts            settings, defaults, colors and effects, the pane's rows
hooks/pane.tsx               the settings pane
hooks/cachebeat.test.tsx     tests
types/index.d.ts             $.state contract and the settings type
```
