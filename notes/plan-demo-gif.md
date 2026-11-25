# Plan: a new README demo GIF (2026-11-25)

> Planning only. Nothing here has been recorded. Written for the builder (a Sonnet session) who hasn't seen the planning conversation. Read it whole before touching the tape.
>
> **Inputs:**
> - The scout's report, kept here under "What the scout found".
> - `assets/demo.tape` and `assets/demo.py`.
> - plan-0.10.0.md, "Item 8" and "Step 8: B0–B8 results".
> - Live reads on 2026-11-25: the installed cachebeat's `state`, and strings in Claude Code 2.1.332's binary.
>
> **Inferred** marks anything not checked; each such point has a check in "Checks, cheapest first".

**The floor is the installed Claude Code, 2.1.332** (the user, 2026-11-25). Record and check with the installed `claude` only, with no old binaries.

**Build after the builder's current wording changes merge into `dev`:** "no beat needed", the Notices setting, and the guard after `/model`. Take every on-screen string below as an example of its shape, and read the real one from the dry run.

## Why a new one

The user dislikes `assets/demo.gif`: it looks "way different" from the GitHub page around it. It should look like it belongs on the page, without necessarily copying GitHub's theme. What clashes, all checked by the scout:
- **VHS draws on Catppuccin Mocha** (`#1e1e2e`), but Claude Code draws in the user's own theme, `custom:niri` (~/.claude/themes/niri.json). That theme uses a pink accent (`#e6a8b9`) and a brown user-message background (`#2e262a`).
- **The page around it is orange:** the wordmark (`#FF7A3D` family on `#0D0E11`) and the `#d97757` Claude Code badge.
- **The glitch badge:** a pink "▶▶ FAST-FORWARD" block with an RGB shift and scanlines.
- **The busy transcript:** the guard question first, Status at the end, and this machine's chrome.
- **The user's cachebeat settings leak in:** the ECG heart with flow effects, where a new install shows the classic heart.

## 1. The concept: "Away and back"

The scout's **A**, with the guard left out and a gate on the payoff.

> You turn cachebeat on and step away. Beats keep the cache warm on their own, and your next message picks up warm.

That pitch is the README's lead line ("You come back from lunch, type your next message, and it picks up right where you left off"), shown.

**Why A:**
- **It shows the product in the order a user meets it:** the command, the beats, the payoff.
- **The current GIF never shows the payoff**, though the README promises it.
- **One take, one fast-forward.**
- **Why not B ("two futures": the guard's cold warning, then a warm path).** It's the strongest contrast, but it needs twice the takes and an edit between them. The two-take cap would leave no retry.
- **Why not C (an 8s close-up of the turn line).** It's cheapest, but it has no command and no payoff, so a viewer can't tell what they'd type. C is the fallback if the payoff gate fails (below).
- **The cold guard is left out on purpose.** It's secondary, the current GIF wrongly opens on it, and the README covers it in words. Pinning it off (§3) also frees the source from any age window (§4).

**The payoff gate.** The only on-screen sign that the payoff went warm is cachebeat's turn line reappearing under the new answer: `♥ cache kept warm ×2 · … · next in 50m`. cachebeat logs nothing on a warm send (`countKept` only counts it for Stats). One more problem: Claude Code's own `✻ Cooked for 2s · done 3:18 PM` runs on real time, while cachebeat's clock is sped up. A payoff `done` a minute or two after the setup turn's `done`, under a caption saying 50 minutes passed twice, contradicts itself.
- **Fix:** `"showTurnDuration": false` in `--settings`. It's a settings key ("Show "Cooked for Nm Ns" after each assistant turn", found in 2.1.332's binary). The render code drops the whole `X for Ns · done T` text when it's off.
- **The risk:** cachebeat's turn line is drawn by a `ui.render` hook on the `TurnDuration` component (`hooks/register.tsx`, `on('ui.render', { component: 'TurnDuration' } …)`). If that component isn't raised once its text is off, the turn line vanishes with it, and with it the whole GIF. Check **H1** settles this first.
- **If the turn line survives** with `showTurnDuration: false`: the payoff stays, and no `done` time shows anywhere.
- **If it doesn't:** keep `showTurnDuration` on and cut the payoff. The GIF ends on the ×2 hold: the command plus C, about 13s. Don't try to keep the payoff with the times showing.

## 2. The storyboard

**Size and timing:**
- 1100×640, about 85 columns by 23 rows.
- Typing at 50ms.
- One fast-forward, split by two beats.
- **Target 19s; cut if it runs past 21s,** in this order:
  1. `HOLD` 1.5s → 1.2s
  2. `FF` 3 → 4
  3. the opening hold 1.5s → 1s
- Seconds below are GIF seconds, after demo.py's speed-up; the raw recording is longer.

| # | Typed (tape) | Wait for, then hold | On screen | GIF s |
| --- | --- | --- | --- | --- |
| 0 | `Hide`. The launch command (§5), `Sleep 9s`. Then the setup message: `in one line, what does demo.sh open?`, `Sleep 400ms`, `Enter`. | `Wait+Screen@60s /(?s)demo\.sh open\?.*●/`, then `Sleep 3s` so the line finishes and the prompt is idle. `Show`. | (hidden) | 0 |
| 1 | nothing | `Sleep 1500ms` | Opening frame. Above: the source's tail (§4). Then `❯ in one line, what does demo.sh open?` and its one-line answer, e.g. `● Neo4j Browser and Gephi, the two live-demo views.` An empty prompt box, and the footer. No cachebeat line yet: it's off. | 1.5 |
| 2 | `/cachebeat 3h`, `Sleep 400ms`, `Enter` | `Wait+Screen@10s /next beat in/`, then `Sleep 2s` | The reply, e.g. `cachebeat: this session: on until 6:16 PM (3h), every 50m idle · next beat in 50m`. Under the setup turn, the turn line, e.g. `♡ next beat in 49m · 2h 59m left`. The prompt heart in the hint row. | 3.4 |
| 3 | nothing: the demo mod runs the clock | `Wait+Screen@90s /kept warm ×2/`, then `Sleep 1500ms` | The countdown races, with the caption `▸▸ 50 min idle` (§3) during each sped-up part only. Beat 1 lands and holds at real speed: `♥ cache kept warm ×1 · 52k cached · next in 50m · 2h 9m left`. It races again, and beat 2 holds: `♥ cache kept warm ×2 · 52k cached · next in 50m · 1h 19m left`. | ≈9.3 (2.5 + 2.1 + 2.5 + 2.1) |
| 4 (payoff, if the gate passes) | `Sleep 500ms`, `back. where did we leave off, in one line?`, `Sleep 400ms`, `Enter` | `Wait+Screen@40s /(?s)leave off.*kept warm ×2/`, then `Sleep 2500ms` | The message, a short spinner, the one-line answer picking up the demo.sh thread. Then cachebeat's line moves under the new answer: `♥ cache kept warm ×2 · 52k cached · next in 50m · 1h 18m left`. That line under the new answer is the receipt. It matches only once the turn has ended, because `turn.start` sets `s.row = null`, so no line shows while the answer is drawn. | ≈7 |
| | | | **Loop point:** the end of the payoff hold, cut straight back to the opening frame. Total ≈ 21s before trims, ≈19s after. | |

**Notes on the scenes:**
- **Why `3h`, not `2h`.** After two beats, `2h` leaves 20 minutes, which the cache outlasts, so the line drops its countdown (the "no beat needed" case). With `3h` the line keeps `next in 50m` through the payoff and the last frame, so the heartbeat is still going as the GIF loops. Inferred: the same code path as `2h`; the Haiku dry run shows it.
- **Why the setup turn is hidden.** A forked conversation's beats wait for a turn in the fork (`RESUMED`), so one turn has to happen before `/cachebeat 3h`. Hidden, it costs no GIF time, and its question and answer stay on screen as the "you were working" opening.
  - **The tape can't sleep a fixed time for it:** a `/cachebeat` typed mid-turn runs, but its reply draws only at the turn's end.
  - **It can't wait for `done` either,** because `showTurnDuration` is off. It waits for the first `●` after the typed question. The pattern is anchored on the typed text, because a bare `/● demo\.sh/` could match the source's own tail: the B5 trap.
  - **The source must already have read `demo.sh`** (§4). Otherwise the fork's first `●` is `● Read(demo.sh)`: the wait fires early, and the tool line and its `⎿` sit in every opening frame. VHS patterns are Go RE2, with no lookahead to skip tool lines, so reading it in the source is the fix.
- **Payoff wording.** `back. where did we leave off, in one line?` is 43 characters, 2.2s at 50ms. Shorten it if timing runs long, e.g. `back. where were we?` (but then ask the setup turn's answer to stay one line).

## 3. The look

### VHS settings (exact)

```
Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 20
Set Width 1100
Set Height 640
Set Padding 20
Set Margin 16
Set MarginFill "#0d1117"
Set BorderRadius 10
Set TypingSpeed 50ms
Set Theme {"name":"cachebeat-gh","background":"#161b22","foreground":"#e6edf3","black":"#484f58","red":"#ff7b72","green":"#3fb950","yellow":"#d29922","blue":"#58a6ff","magenta":"#bc8cff","cyan":"#39c5cf","white":"#b1bac4","brightBlack":"#6e7681","brightRed":"#ffa198","brightGreen":"#56d364","brightYellow":"#e3b341","brightBlue":"#79c0ff","brightMagenta":"#d2a8ff","brightCyan":"#56d4dd","brightWhite":"#ffffff","cursor":"#e6edf3","selection":"#264f78"}
```

**Why these values:**
- **The colors are GitHub Primer's dark palette.** The card is `#161b22`, GitHub's raised dark surface. The margin is `#0d1117`, the dark page itself.
- **The font stays FiraCode Nerd Font Mono at 20,** which is installed and proven with the OCR. It also has Claude Code's glyphs (`❯ ● ✻ ⎿ ♥ ♡`).
- **At 1100 wide,** GitHub's README column (about 830px, inferred) scales it to about 0.75, so text reads at about 15px.
- **No `WindowBar`:** macOS dots would be one more borrowed look.

### Transparent corners (render-only, free to test)

The margin is keyed out in demo.py's render, so the rounded card floats on any page:
- **The filter chain:** `colorkey=0x0d1117:0.02:0` before the split, then `palettegen=max_colors=128:stats_mode=diff:reserve_transparent=1` and `paletteuse=dither=none:diff_mode=rectangle:alpha_threshold=128`.
- **The corner fringe** blends `#161b22` into `#0d1117`. Both are dark, so on a light page it reads as the card's edge.
- **The risk is holes:** any `#0d1117` pixel inside the card would key out too. Claude Code's `dark` theme isn't known to draw it (inferred). F2 checks this.
- **The fallback,** if the fringe or holes show: `Margin 0`, no `BorderRadius`, no colorkey. That's a plain `#161b22` rectangle, which on GitHub reads like a code block.

### Claude Code's theme: `dark`, pinned

Add `"theme":"dark"` to the tape's `--settings`. The user's `theme` lives in ~/.claude/settings.json (`"custom:niri"`), so a `--settings` value should override it for the session. That's inferred: F3 checks it, and checks that nothing is written back.

`dark`'s colors (2.1.332's binary, checked):
- `claude` is `rgb(215,119,87)` = `#d77757`. The turn line, heart and accent take it, and it matches the badge and the wordmark's orange family.
- `userMessageBackground` is `rgb(55,55,55)`: a neutral grey bar on the `#161b22` card.

**Not `dark-ansi`:** it hands every color to VHS, and the accent would then be an ANSI red.

### Other Claude Code display settings, in the same `--settings`

- **`"showTurnDuration": false`:** the payoff gate, §1.
- **`"spinnerTipsEnabled": false`:** no rotating `Tip: …` under the spinner. It's a settings key ("Whether to show tips in the spinner").
- **`verbose` off** (drop `"verbose":true`): the `72011 tokens` readout goes. Inferred: the `1 agent type available` / `1 skill available` lines go with it. F3 and H1 show.
- **`"remoteControlAtStartup": false`:** the `Remote Control disconnected — Trusted devices now required` notice came from an account change. It may print live at the launch of every fork, at the bottom of the screen, which is the opening frame. The key sits in the same config-key list as `theme` and `showTurnDuration` in 2.1.332's binary, so it's inferred to be accepted from `--settings`. F3 checks it.
- **`awaySummaryEnabled`:** in the same list. Set it `false` too if any resume or away summary shows at launch (F3).
- **Kept from the old tape:** `"advisorModel":""`, `"statusLine":{"type":"command","command":"true"}`, and `enabledPlugins` with both installed copies off.

### cachebeat's settings: pinned by the demo mod, not by touching the user's

**Why:** the installed copy's store (read 2026-11-25 through `state`) holds:
- `variant: ecg`, with `heartEffect`/`lineEffect: flow`
- `skipSmall: true` at `skipSmallTokens: 50000`: a source under 50k would never beat
- `stopAtUsage: 100`
- `onStop: both`

The `--plugin-dir` copy reads that same store (B2). Changing them through `set` or the menu touches user settings, which a live check must not do.

**How:** the demo mod (the clock mod, extended; rename its `description` to "Runs cachebeat's clock fast and pins its settings for the demo") adds one op hook:

```ts
const PINNED = { coldGuard: false, stopAtUsage: 100 } // everything else: cachebeat's DEFAULTS, as a new install has them
on('store.get', async ($, e, next) => {
  if (next.origin.plugin !== 'cachebeat') return next(e)
  if (e.key === 'settings') return { value: PINNED }
  if (e.key === 'folders') return { value: {} }
  return next(e) // session:<id> records, customs, prunedAt and Stats pass through
})
```

**What this pins:**
- `load()` (`hooks/register.tsx`) reads exactly `settings` and `folders`, and `normalize` fills every missing key from `DEFAULTS` (`hooks/settings.ts`).
- So the frames get the classic heart, steady effects, `heartColor: 'claude'` (the theme's orange), `statusLine: 'spaced'`, the countdown and tokens on, `showCount` on, and skip-small off.
- **`coldGuard: false`:** the guard never shows in this concept, and with it off the source's age doesn't matter (§4).
- **`stopAtUsage: 100`:** a take near 90% of the five-hour window would otherwise stop beating mid-take. Still check account usage before each take.
- **`customs` passes through:** it's read only for custom animations, and the classic heart uses none.
- **`store.set` isn't hooked:** cachebeat writes `settings` only in `changeSettings`, on a change, and the tape changes none. Its `session:<forkid>` and Stats records still land in the real store, as in every take before; they're pruned after 30 days.

**The unproven part:** an op hook on `store.get` from another plugin. `clock.now`, `clock.after` and `model.fork` are proven (B3, B4); `store.get` isn't (the types list it, `index.d.ts` `'store.get': { key }`). The return shape `{ value }` is copied from the `clock.now` hook. F3 checks it for free.

### The fast-forward, without the badge

- **The countdown racing is the main signal.** `next beat in 49m` drops a minute every few frames, so it reads as sped up on its own.
- **A quiet caption,** only during the sped-up parts (`plan()`'s fast segments): `▸▸ 50 min idle`.
  - FiraCode Regular at 16px (scaled `px(16)` on a 640-row frame), color `#7d8590` (Primer's muted text), no box.
  - Placed bottom-right inside the card, on the hint row: `x=w-tw-px(36)`, `y=h-th-px(40)`.
  - The hint row's left holds the mode label and the heart, and its right end is empty (inferred from the old frames). F2 places it, and H1 confirms no overlap.
- **Gone:** `rgbashift`, `drawgrid`, the pink box, and `~50 MIN LATER`.

### Dark only, no light `<picture>` pair (recommended)

- **A light version is another recording, not a re-render.** Claude Code draws its own colors, so a light GIF needs a Claude Code `light` take, with its own timing, its own OCR pass, and real requests. Under the two-take cap, a pair spends both takes and leaves no retry.
- **A dark terminal card on a light page is the norm** for terminal GIFs on GitHub. With transparent rounded corners it reads as a deliberate object on both page themes. The scout's still showed it on white.
- **The wordmark already has an `-on-dark` variant** for that reason, while the badge row stays the same on both themes.
- **Not foreclosed:** if the user wants a pair, it's one more take after the dark one ships. It's asked in §7.

## 4. The source conversation

**What it needs, now that the guard is pinned off and skip-small is off:**
- **Any age.** The fork's hidden setup turn re-caches it if cold, out of frame.
- **40–100k tokens**, so the line's `cached` figure reads like real work (`52k cached`). Size is no longer a threshold: any size beats.
- **A clean last screenful.** About 11 rows of its tail show above the setup turn in every frame:
  - no typos in the user's lines
  - no absolute paths (`/home/zyrus/…`), emails, names or keys
  - no `Remote Control disconnected` notice
  - no long tool output
  - the Claude Code welcome header scrolled off the top
- **On Sonnet,** the takes' model, so the fork shares it (after a model switch cachebeat reads the cache differently; B0 found a Haiku source worked, but matching costs nothing).
- **Made with no cachebeat loaded:** both installed copies off in `--settings`, and no `--plugin-dir`. That keeps no cachebeat line in its transcript.

**Pick: a fresh source made in ProgLang-Influence-Graph** (recommended; the orchestrator confirms with the user before it's used):
- **The project is neutral and readable:** a programming-language influence graph with Neo4j and Gephi views. Its `demo.sh` is 12 lines with nothing private in it, and the repo has no remote (checked).
- **A fresh session controls the tail.** The existing `2b8312b3…` (75k, Sonnet, 2026-10-13) ends on `where are the ceckboxes, the ss if of n4j no?`, which would sit in every frame.
- **How to make it:** in tmux, in that folder:
  - `claude --model sonnet --settings '{"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false},"theme":"dark","showTurnDuration":false,"spinnerTipsEnabled":false}'`
  - Turn 1: `give me a short overview of this project: what it builds and how`. It reads the README and scripts, which builds the size.
  - Turn 2: `read demo.sh: what does it do?` This puts `demo.sh` in context, so the fork's setup question is answered without a tool call (§2).
  - Check the tokens (the `/context` figure, or the transcript's last `usage`) and the tail. If the tail has a path or a long listing, one more short turn (`thanks, that's clear`) pushes it up.
  - Record the session id in this plan.

**The other candidates, and why not:**
- **niri-mcp `e724d215…`** (243k, Sonnet, 2026-10-03): the most striking figure (`243k cached`), and the second choice if the user prefers it. But its tail is unread, the topic (computer-use research) runs to links and long answers, and each take re-caches 243k.
- **RecursiveThinkingTree-Trellis `788fe026…`** (50k, Haiku): its thread is git housekeeping (`is this repo pushed to github`, asked twice; `add that to gitignore`). It reads as chores, not work.
- **The Arduino one, `adb66a7d…`** (71k, Sonnet): its transcript holds the `Remote Control disconnected — Trusted devices now required` notice, and it's the transcript of the GIF the user dislikes.

**The setup turn's text depends on the source.** With a different source, replace `demo.sh` in scene 0 and the payoff with a file the source has already read.

## 5. Tooling changes

Every change, with its risk and the check that clears it. The check IDs are in the next section.

### `assets/demo.tape`

| Change | Risk | Check |
| --- | --- | --- |
| The `Set` block (§3) replaces size, padding, theme and typing | OCR misses the new colors or size; the bottom crop (`BOTTOM`) eats the turn line at 640 rows | F1 (mock), H1 |
| `--settings`: drop `"verbose":true`; add `"theme":"dark"`, `"showTurnDuration":false`, `"spinnerTipsEnabled":false` | `theme` doesn't override from `--settings`; a value is written back to ~/.claude/settings.json; the turn line dies with `showTurnDuration` | F3, H1 |
| `--permission-mode default` | It shows `⏸ manual mode on` in the hint row (inferred: because the user's default mode differs). Try the launch without the flag and see which footer is quieter. Keep the flag if dropping it shows a mode that runs tools unasked, because the setup and payoff turns must not run tools. | F3 |
| `cd "$CACHEBEAT_DEMO_DIR"` points at the ProgLang folder; `CACHEBEAT_DEMO_SESSION` is the new source | none new | F3 |
| `--settings` also gains `"remoteControlAtStartup":false` (and `"awaySummaryEnabled":false` if F3 shows a summary) | the keys aren't honoured from `--settings`; a notice prints at the bottom of the opening frame | F3 |
| Scene 0 rewritten: no `/cachebeat` + Escape trick, no guard question; the setup message and its `● demo\.sh` wait | the answer doesn't start with `demo.sh`, and the wait times out | H1 (Haiku follows it too, or rephrase) |
| Scenes 1–4 as §2; scene 4 of the old tape (Status) removed | `/(?s)leave off.*kept warm ×2/` needs both on one screen: at 23 rows the message, the answer and the line fit (inferred) | H1 |
| The header comment: "and hides your status line and the advisor…" reworded for the new flags | none | review |

### `assets/demo.py`

| Change | Risk | Check |
| --- | --- | --- |
| `CLOCK_MOD`'s `register.ts` gains the `store.get` hook (§3) | an op hook on `store.get` isn't honoured, or takes another return shape: the frames show the user's ECG heart, and a source under 50k never beats | F3: `/cachebeat settings` shows the classic heart, Cold guard off, Skip small off |
| `BEATS`, `SPEED`, `STEP` and the `model.fork` hook unchanged | the payoff turn arrives while `ahead` is set. With the guard off nothing reads it for a question. `countKept` counts the turn as kept (shown time), which lands in Stats only. | H1: the payoff draws no cachebeat log line |
| `render()`: the glitch chain becomes the caption drawtext (§3). `0x1e1e2e` and `0xf5c2e7` go; the caption takes `0x7d8590`. `FONT` takes the Regular face (`FiraCode Nerd Font Mono:style=Regular`). Rename the `glitch`/`is_glitch` flag to `caption`. | the caption overlaps the hint row's text | F2, then H1 |
| `render()`: colorkey and transparency (§3) | holes inside the card; fringe; GIF transparency with `diff_mode=rectangle` leaves smears between frames | F2: composite frames on white and on `#0d1117` |
| `LEAD`/`HOLD`/`SETTLE`/`FF`: `LEAD 0.6`, `HOLD 1.5`, `SETTLE 2.0`, `FF 3`, then trim per §2 | timing only | H1's printed parts |
| `BOTTOM` re-measured for 640 rows: the crop must take the hint row and prompt box, and never the turn line | too large a crop drops the turn line once it sits just above the prompt (after beat 2 and in the payoff), and `plan()` finds one beat | F1 on a mock frame, then H1: `plan()` prints exactly two beats |
| `plan()`: the beat count must not double-count the payoff | the payoff line reads `×2` again, not more, so `n > last` doesn't fire (checked by reading `plan()`) | H1 |
| **A `--launch` mode:** extracts `git archive HEAD` and writes `CLOCK_MOD` into folders under the scratchpad that it keeps, then prints the tape's full `claude …` command with `CACHEBEAT_DEMO_PLUGIN` and `CACHEBEAT_DEMO_CLOCK` filled in. `record()` and `--launch` share one helper that builds the two folders. F3 needs this: the tape's command names folders only `record()` creates, and it deletes them afterwards. Never stand in for them with `--plugin-dir .` or a worktree. | the printed command drifts from the tape's | F3: diff the printed flags against the tape's `Type` line |
| **`RAW` and `GIF` overridable** (`CACHEBEAT_DEMO_RAW`, `CACHEBEAT_DEMO_GIF`, defaulting to today's paths). Test renders go to the scratchpad. A test render is never committed: only a final take's `assets/demo.gif` is. | a test overwrites the tracked `assets/demo.gif` | `git status` after F1/F2 shows no `assets/demo.gif` change |
| The docstring: the new story, the pinned settings, no guard, any-age source | none | review |

Leave the `status()` filter as it is (`'next beat in'` or `'kept warm'`, and not `'cachebeat'`): the `/cachebeat 3h` reply carries `cachebeat` and is skipped. If the reply wraps so that `next beat in` falls on its second line, that line counts 0, which is harmless (the highest count wins).

## 6. Checks, cheapest first: two real takes at most

**Free: no request sent.**
- **F1: VHS mock.** A throwaway tape with the §3 `Set` block `printf`s the frame's lines in `dark`'s colors:
  - the turn line in `rgb(215,119,87)`, at `×1` then `×2`
  - a user line on `rgb(55,55,55)`
  - a hint row at the bottom

  The scout's `t.tape` shape works (its folder is in "What the scout found"). Run demo.py's `status()` and `plan()` on its mp4 (`CACHEBEAT_DEMO_RAW=<the mock's mp4>`; output to the scratchpad). Both counts must be read, and the turn line must sit above the `BOTTOM` crop.
- **F2: render only.** Run `python3 assets/demo.py --skip-record`, with `CACHEBEAT_DEMO_RAW` set to F1's mp4 and then to the existing `assets/demo-raw.mp4`, and `CACHEBEAT_DEMO_GIF` set to the scratchpad each time. Check:
  - the caption's place and color
  - no glitch left
  - the GIF's size
  - transparency: extract three frames and composite each on white and on `#0d1117` (`ffmpeg … -filter_complex "color=white:s=1100x640[bg];[bg][1:v]overlay"`). Look for holes and corner fringe. If either shows, take the §3 fallback.
- **F3: launch without a message.** Run `python3 assets/demo.py --launch` and run the command it prints in tmux (not VHS), from the ProgLang folder, forking the source. Do this before and after: `cp ~/.claude/settings.json <scratch>/before.json`, then `diff` after quitting; it must be empty. Then check:
  - the theme is `dark` (orange accent, grey user-message bars)
  - the debug log (`--debug-file`) names `cachebeat-demo-clock@inline` first and one `cachebeat@inline`, with no `@cachebeat` or `@synced`
  - `/cachebeat settings` (local, sends nothing) shows the pinned values: Classic heart, Steady effects, Cold guard off, Skip small off, Stop at usage 100%. Escape, then quit with no message. **If it shows ECG, the `store.get` pin failed: stop and report it.**
  - the footer, with and without `--permission-mode default`, and whether `← N agents` shows while the fleet runs
  - the source's tail on screen: nothing private, no welcome header
  - no notice at the launch (Remote Control, an away summary, an update): the bottom of the screen is the opening frame

**Paid but cheap: Haiku.**
- **H1: one Haiku dry run** (`CACHEBEAT_DEMO_MODEL=haiku python3 assets/demo.py`). The source stays Sonnet; B0 showed a model mismatch on a fork works. Read `assets/demo-raw.mp4` frame by frame:
  1. **The gate:** after the setup turn and `/cachebeat 3h`, the turn line shows under the setup answer with `showTurnDuration: false`. If it doesn't, rerun with `showTurnDuration` on and the payoff cut (§1).
  2. the `● demo\.sh` wait fired after the answer, with no spinner at `Show`
  3. no `∴` thinking line, no tip, no token readout, no `agent type available`
  4. both beats, the `3h` countdown kept after ×2, and `plan()` printing two beats with no fast-forward before `/cachebeat 3h`
  5. the payoff: no cachebeat log line, the line moving under the new answer, and the wait matching only after the answer
  6. the caption only on fast parts, not overlapping
  7. the length, trimmed per §2

  A second Haiku run is fine if H1 changes the tape. Haiku runs don't count toward the take cap, but say how many ran.

**Real takes: Sonnet, two at most.**
- **T1.** Before it: account usage under 90% (`clear` reports it), the fleet state as the user chose (§7), and the source untouched since F3. After: check every frame against §2's "On screen" column, and `git diff` the tape and demo.py against what H1 ran.
- **T2** only if T1 fails a frame check. Ask the orchestrator before a third.
- **Each take** forks the source into a new session file under `~/.claude/projects/-home-zyrus-Desktop-Projects-ProgLang-Influence-Graph/`. List them in the results for the user to clear.

Record F1–T2's results under this plan as "Results", as step 8 did. Put anything that took time to find out in mods-gotchas.md: the `store.get` pin, `showTurnDuration` and the turn line, transparency.

## 7. How the README embeds it

On `main`, the README is for users. The image stays where it is (line 9, under the tagline), as plain Markdown, with no width attribute: GitHub scales it to the column.

```md
![cachebeat keeping an idle session's cache warm: /cachebeat 3h, two beats land on their own while you're away, and the next message picks up warm](assets/demo.gif)
```

- **If the payoff is cut,** the alt text ends at "while you're away".
- **If the user chooses the light pair:**

  ```html
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="assets/demo-light.gif">
    <img alt="…the same alt…" src="assets/demo.gif">
  </picture>
  ```

  Then notes/README.md's list of shipped images gains `assets/demo-light.gif`.
- **Commits:** the GIF and the README line are plugin files, committed on `dev` as `cachebeat <version> (gif): …`. The tape, demo.py and this plan's results are `dev notes: …` and dev-only commits. They reach `main` only through a release branch (notes/README.md, "Branches and releases").

## 8. Open questions for the user

1. **The source:** a fresh session in ProgLang-Influence-Graph (recommended), niri-mcp's 243k one for the bigger figure, or another project?
2. **Release timing:** PR #14 (0.10.0) is open and ships the old GIF. Should the new GIF replace it on `v0.10.0` before 0.10.0 ships, or go out in 0.10.1? 0.10.1 is less churn on a branch already checked green.
3. **Dark only (recommended), or a dark and light pair?** The pair costs a third real take.
4. **Chrome from this machine:**
   - `← 2 agents` shows while the fleet runs. Should T1 run with the fleet closed?
   - The hint row's mode label (`⏸ manual mode on` under `--permission-mode default`): accept it, or run without the flag if F3 shows that's quieter and safe?
5. **The payoff:** keep it if H1's gate passes (recommended)? Or end on the ×2 hold anyway, for a 13s GIF?
6. **The caption `▸▸ 50 min idle`:** keep it, or let the racing countdown speak alone?
7. **The typed lines** show in every frame: the setup question `in one line, what does demo.sh open?` and the payoff `back. where did we leave off, in one line?`. Do they read right, or should they be worded differently?

## What the scout found (2026-11-25, kept for reference)

**Its report and stills** are in `/tmp/claude-1000/-home-zyrus-Desktop-Projects-cachebeat/9965b518-636a-4a42-b2fe-c9742c9bc6ba/scratchpad/`. They're temporary: `scout-report.md`, `both.png` (the Primer card on `#0d1117` and on white), `t.tape`, and `frames/` from the current GIF.

**Ranked, what to show:**
1. the turn line counting on its own
2. the command
3. the payoff
4. the cold guard, optional
5. the prompt heart, free

**Cut:**
- the glitch badge
- Status
- the source's noise: `1 agent type / 1 skill available`, `∴` thinking, spinner tips
- this machine's chrome
- the verbose token count

**Constraints the tooling carries** (from step 8, still true):
- **The clock mod:**
  - fast only from cachebeat's first 60s step
  - never shorten `DROP_AFTER` or `SETTLE`
  - forks run at real speed
  - real speed again after `BEATS=2`
  - its `--plugin-dir` before cachebeat's
- **Beats need a turn in the fork first.**
- **Beat detection is OCR** and breaks silently on size, font or color changes.
- **Every take sends real requests:** it re-caches the source once, plus two beats and the payoff.
