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
/cachebeat settings        open the settings pane
```

It's off by default. `/cachebeat global on` makes every new session start beating. Each idle session will then fork every interval until it stops by itself.

While it's armed, an animated heart sits under the prompt, followed by the beat count. After each beat, a status line by the last turn's closing row ("✻ Cogitated for 2s") shows `♥ cache kept warm ×N · next in 42m`.

### When it stops by itself

- after a set number of hours since your last real turn (8 by default)
- once the cache has gone unread for over an hour, so there's nothing left to keep warm
- when any rate-limit window reaches the usage you set (100% by default)
- on a rate limit or non-transient API error
- when a beat's request wasn't served from the cache

Transient errors (overloaded, 5xx, network) are retried a minute later. With **Skip small contexts** on, a beat is skipped when the context is under the threshold, and the next turn arms it again.

## Settings

`/cachebeat settings` opens a pane. Tab moves between rows, Enter steps a row to its next value, and Esc closes the pane. The top of the pane previews the heart and the status line live, with your current animation, speed, timing, color and effect. **Animation ›** opens a gallery where every variant plays at once, the way the bash previews did: five loops, then the blast a beat sets off. Enter picks one.

Settings are global. They're kept in the plugin's store, so every session uses them. A session that's already running picks up changes at its next turn.

| Section | Setting | Values | Default |
| --- | --- | --- | --- |
| Beating | New sessions start | on / off | off |
| | Beat after idle | 1–55 min | 50m |
| | `/cachebeat <min>` sets | this session only / the global default | this session |
| | Stop after idle | 1–24 h | 8h |
| | Stop at usage | 50–100% | 100% |
| | Skip small contexts | on / off; threshold 5k–100k tokens (shown when on) | off; 20k |
| Heart | Animation | 19 variants (see below) | Classic |
| | Animate | on / off | on |
| | Speed | slow 120ms / normal 80ms / fast 50ms per frame | normal |
| | Timing | linear / lub-dub (the loop twice, then a rest as long as one pass) | linear |
| | Placement | end of the hint line / its own line | hint line |
| | Beat count | on / off | on |
| Look | Color | dim; theme: claude, permission, warning, fastMode, inactive; presets red, magenta, yellow, green, cyan, white (drawn as hex); custom `#hex` | dim |
| | Effect | steady / flash (lights up on each full heart) / flow (a shimmer sweeping across, like the thinking text) | steady |
| Status line | Placement | below the turn row / below after a blank line / on the turn row / off | below |
| | Countdown | on / off | on |
| | Tokens kept | on / off (`· 184k cached`) | off |
| Notify | On a beat | none / toast | none |
| | Sound on a beat | off / message / bell / complete / dialog-information | off |
| | On stop | log / toast / none | log |

The theme colors are theme keys, so they follow your active theme, and their highlight is the theme's own shimmer color. A preset or custom color is drawn as hex, and its highlight is a lighter shade of it.

The hint line only takes plain text, which it draws dim. A heart there can't take a color or an effect; give it its own line for those. The status line takes the color and effect wherever it's placed.

Sounds are freedesktop sound-theme ids, played with `canberra-gtk-play` (libcanberra). Where that isn't installed, nothing plays.

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
