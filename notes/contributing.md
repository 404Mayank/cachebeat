# Working on cachebeat

Clone the repo and start Claude Code with it loaded. Edits to the hooks reload in the running session. Tool descriptions and schemas need a new session (see [mods-gotchas.md](mods-gotchas.md)).

```sh
git clone https://github.com/404Mayank/cachebeat.git
cd cachebeat
claude --plugin-dir .
```

Before sending a change:

```sh
claude plugin validate --strict .   # checks the plugin the way Claude Code loads it
claude plugin test .                # runs the test suite
npx -p typescript tsc -p .          # type-checks, once Claude Code has loaded the plugin
```

Plugin changes go on `main` (see [the branches](README.md#branches-and-releases)).

## Where things are

| File | What's in it |
| --- | --- |
| `hooks/register.tsx` | Scheduling, beats, commands, the tool handlers, and what's drawn on screen |
| `hooks/animations.ts` | The animations and their timing |
| `hooks/settings.ts` | Settings, defaults, colors and effects, the number readers, and `accept` |
| `hooks/pane.tsx` | The settings menu |
| `hooks/tools.ts` | The specs of the tools Claude calls, and the reading of a `set` call |
| `hooks/cachebeat.test.tsx` | Tests |
| `types/index.d.ts` | The mod's type contract: its `$.state` values and its tools' inputs |
| `assets/logo/src/` (`dev` only) | The logo build. Its README says how to rebuild and change the logo |
| `assets/demo.py`, `assets/demo.tape` (`dev` only) | The demo recording |

A new animation is a single entry in `hooks/animations.ts`: a loop and a burst, each written as frames separated by `|`.
