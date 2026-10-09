# cachebeat

A Claude Code mod that keeps the prompt cache warm while a session sits idle. This file, `notes/`, and the demo and logo scripts exist only on the `dev` branch; `main` is the plugin as users get it.

## Branches

- **Where each change goes,** and how releases ship: `notes/README.md`, "Branches and releases".
- **Never merge `dev` into `main`.** Merge `main` into `dev`.

## What goes in user-facing docs

- **Every README on `main` is for users and their agents:** what cachebeat does, how to use it, what it sends and costs.
- **Keep everything meant for us or maintainers out of them:**
  - justifications and design notes
  - contributor workflow and build steps
  - gotchas
  
  These go in `notes/` on `dev`, and so do comments in shipped assets that name dev-only files.
- **Record what took time to work out** in `notes/` as you go: decisions and why, gotchas, anything that took time to derive.

## Before a change is done

```sh
claude plugin test .
npx -p typescript tsc -p .
claude plugin validate --strict .
```

`notes/contributing.md` maps the files.
