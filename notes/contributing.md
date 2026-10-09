# Contributing to cachebeat

Ideas, bug reports and pull requests are all welcome: a new heart animation, a setting you'd find useful, or a fix. Open an issue to talk something through, or send a PR straight away.

## The branches

- **`main`** is the plugin exactly as users install it. Pull requests for the plugin go here.
- **`dev`**, the branch you're reading now, is `main` plus what doesn't ship: these notes, and the scripts that record the demo and draw the logo. Pull requests for those go here.

## Working on it

Clone the repo and start Claude Code with it loaded:

```sh
git clone https://github.com/404Mayank/cachebeat.git
cd cachebeat
claude --plugin-dir .
```

Your edits to the hooks reload in the running session. Changes to the tools' descriptions show only in a new session.

Before sending a change:

```sh
claude plugin validate --strict .   # checks the plugin the way Claude Code loads it
claude plugin test .                # runs the test suite
npx -p typescript tsc -p .          # type-checks, once Claude Code has loaded the plugin
```

## Where things are

| File | What's in it |
| --- | --- |
| `hooks/register.tsx` | Scheduling, beats, commands, the tool handlers, and what's drawn on screen |
| `hooks/animations.ts` | The animations and their timing. A new one is a single entry: a loop and a burst, each written as frames separated by `\|` |
| `hooks/settings.ts` | Settings, defaults, colors and effects |
| `hooks/pane.tsx` | The settings menu |
| `hooks/tools.ts` | The tools Claude calls |
| `hooks/cachebeat.test.tsx` | Tests |

## The dev notes

[`notes/`](README.md) holds what took time to work out:
- how the branches and releases work
- why the tools are built as they are
- gotchas in mods and the test kit
- what the plugin directory flagged
