# cachebeat

A Claude Code mod that keeps the prompt cache warm while a session sits idle.

When you step away from a session, its prompt cache expires (at most an hour after it was last read), and the next turn pays to write the whole context again. cachebeat sends a tiny side request (a "beat") shortly before that happens. The beat forks the conversation as the main thread last sent it, asks for a single period, and throws the reply away. The transcript never sees it, but the cache gets read and stays warm.

## Usage

```
/cachebeat            show status: interval, beats so far, time to the next beat
/cachebeat on         start beating (every 50 minutes of idle by default)
/cachebeat off        stop
/cachebeat <minutes>  turn on with a different interval (1–55)
```

It's off by default and set per session.

While it's armed, a small animated heart rides the hint line under the prompt, followed by the beat count. After each beat, a line under the last turn's closing row ("✻ Cogitated for 2s") shows `♥ cache kept warm ×N · next in 42m`.

### When it stops by itself

- 8 hours after your last real turn
- once the cache has gone unread for over an hour, so there's nothing left to keep warm
- when a usage limit is used up, or on a rate limit or non-transient API error
- when a beat's request wasn't served from the cache

Transient errors (overloaded, 5xx, network) are retried a minute later.

## Options

| Option | Values | Default |
| --- | --- | --- |
| `heartColor` | `dim`, `red`, `magenta`, `yellow`, `green`, `cyan`, `white` | `dim` |

Set it in `/config`. When the heart is `dim`, it rides the end of the hint line. Any other color gives it its own line under the hint line.

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
.claude-plugin/plugin.json   manifest and userConfig
hooks/hooks.json             names the hooks module
hooks/register.tsx           the mod
hooks/cachebeat.test.tsx     tests
types/index.d.ts             $.state contract
```
