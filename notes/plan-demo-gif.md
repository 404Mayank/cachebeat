# Plan: a new README demo GIF (2026-11-25)

> Planning only. Nothing here has been recorded. Written for the builder (a Sonnet session) who hasn't seen the planning conversation. Read it whole before touching the tape.
>
> **Inputs:**
> - The scout's report, kept here under "What the scout found".
> - `assets/demo.tape` and `assets/demo.py`.
> - plan-0.10.0.md, "Item 8" and "Step 8: B0–B8 results".
> - Live reads on 2026-11-25: the installed cachebeat's `state`, and strings in Claude Code 2.1.332's binary.
> - The review (`plan-review.md`, 2026-11-25) and the free checks run on it: "Checked before building", near the end.
>
> **Inferred** marks anything not checked; each such point has a check in "Checks, cheapest first".

## Builder's brief

You're building the new README GIF from this plan. The orchestrator is `cachebeat-9c`; the planner who wrote this stays up for questions. Read the whole plan first. Each step names the section that holds its details.

**Where:**
- **A worktree:** `git worktree add ../cachebeat-gif -b step-gif dev`, then `cp -r .claude-plugin/types ../cachebeat-gif/.claude-plugin/`.
- **demo.py loads a scratch copy** of the worktree's `HEAD` (`git archive`), never the folder itself. **Never `--plugin-dir` the repo or the worktree,** and use `--launch` (§5) for any launch by hand.
- **Commits:**
  - The tooling, and later the GIF and the README line, as `cachebeat 0.10.0 (gif): …` (step 8's names).
  - The notes as `dev notes: …`.
  - **Don't push or merge:** the orchestrator merges.

**Never:**
- type `/model` or `/effort`
- change a setting in `/cachebeat settings` (look, then Escape)
- let a test run write `assets/demo.gif`: set `CACHEBEAT_DEMO_GIF` to the scratchpad on every run but the final render
- send requests beyond what's listed below

**Steps, in order.** ⏸ marks a stop: message `cachebeat-9c` with what's asked, and wait for the go-ahead.

1. **Tooling** (§5): the tape and demo.py changes, the demo mod's hooks (§3), `--launch`, the env vars, the caption and mask render (§3), `FINAL`, and `BOTTOM`. Free.
2. **F1, then F2** (§6). Free. If the mask fails, take §3's fallback and say so at the next stop.
3. **Make the source** (§4): a few Sonnet turns in ProgLang-Influence-Graph under `--permission-mode default`, in a 77×23 tmux window.
   ⏸ Send the session id, its token count, and a capture of its last screenful. The tail goes public, so the orchestrator checks it.
4. **F3** (§6). Free. If `/cachebeat settings` shows the ECG heart, the pin failed: ⏸ stop and report it. Correct §5's footer layout table from F3's capture, if it differs.
5. **H1** (§6): one Haiku run, a second only if H1 changed the tape.
   ⏸ Send:
   - the gate's result (§1): payoff kept or cut
   - demo.py's printed parts and the GIF's length
   - frames of the opening, ×2, and the payoff's end
   - every H1 check that failed, and what you changed
6. **Before T1** ⏸: ask for the account's usage figure. `← N agents` in the footer is accepted, so you run T1 yourself, with no fleet closing (Revision).
7. **T1** (§6): Sonnet. Run the frame check and the payoff sanity check, then the final render with `CACHEBEAT_DEMO_BACK`. **T2 only if a frame check fails.** ⏸ Before any third take.
8. **Wrap-up:**
   - Write "Results" under §6: F1–T2, the forks' session files, and the Haiku runs' count.
   - Add the gotchas to mods-gotchas.md: the `store.*` pin, `showTurnDuration`, the mask with ImageMagick, and `stats_mode`.
   - Put the README line (§7) in its own commit.

   ⏸ Send the commit list and the final GIF's path, size and length for review.

## Revision (2026-11-26): the user's animations, and time made visible

**What this supersedes.** Where it disagrees with the sections below, it wins:
- the `» 50 min idle` and `back … later · cache still warm` drawtext captions (§2 scenes 3 and 4, §3 "The fast-forward", §5's `render()` row)
- `CACHEBEAT_DEMO_BACK`
- §8 items 4 and 6

All three are the user's decisions, through the orchestrator: the animations, the agents count, and the caption below the card.

### The user's animations in the GIF (decided)

The demo mod's `PINNED` becomes:

```ts
const PINNED = { coldGuard: false, stopAtUsage: 100, variant: 'ecg', heartEffect: 'flow', lineEffect: 'flow' }
```

- **What it shows:** the prompt heart (the hint row) plays ECG, and both the heart and the turn line take the flow shimmer.
- **Everything else stays at cachebeat's defaults.** The plugin's own defaults don't change.

### `← N agents` (decided)

The footer's agent count is accepted. The builder runs T1 itself, with no fleet closing. The brief's step 6 is changed to match.

### Time made visible: a caption below the card (the user's choice)

**First tried and rejected by the user:** a clock in the prompt row and a fill bar on the prompt box's border, which read as cachebeat features. **The rule now:** the card stays exactly as Claude Code draws it, with nothing drawn inside it. The caption is the video's own annotation, in the margin below the card.

**What shows,** centered in a pill under the card:

| When | Caption |
| --- | --- |
| before the first fast part | nothing |
| fast parts | **`▶▶ fast-forward`** `· +34m idle`, the minutes ticking up |
| the ×1 holds, beats included, up to the end of the ×2 hold | `+52m idle` |
| while the payoff is typed and answered | nothing |
| the final hold (`FINAL`) | **`back after 1h 40m`** `· cache still warm` |

- **The wall clock is gone:** the minutes-idle counter carries the time.
  - So there's no reason to record at midday. The real time still shows in the reply's `on until 3:50 AM`, but nothing points at it.
- **The minutes** are `180 − left`, from the turn line's `left`. They're read by the same 2 fps tesseract pass `status()` makes, and mapped to each output frame through `plan()`'s parts.
  - **On fast parts:** a fixed slope, `SPEED / 60` = 5 shown minutes per raw second, plus the part's median offset.
  - **On ×1 parts:** the median.
  - The prototype used plain interpolation kept monotone. Its numbers matched the line: `+34m` beside `2h 27m left` (read a moment earlier), and `1h 40m` beside `1h 20m left`.
  - **The format is cachebeat's own,** as in the turn line's `1h 20m left`: `34m` under an hour, `1h 40m` from an hour (the user, 2026-11-26).
- **`▶`** (U+25B6) is in FiraCode Nerd Font Mono; `▸` isn't.

**The look:**
- **The pill:** Primer `#30363d`, 44px tall, with an 8px corner radius, a little under the card's 10px. The user found a fully rounded pill too round (2026-11-26).
  - Its text is `#f0f6fc`, with the bold lead in FiraCode Bold and the rest in Regular at 24px. The ` · ` and `cache still warm` take `#b7bdc8`.
  - At GitHub's ~830px, the text shows at about 18px.
- **Contrast:**
  - Inside the pill, `#f0f6fc` on `#30363d` is about 11:1.
  - The pill itself stands out clearly on white, and softly on `#0d1117`, where it reads as a lighter chip under the card.
  - It's the same on both page themes, so no light variant is needed.
- **One width for every caption:** the widest text's, so the pill doesn't jitter as the text changes. The text is centered in it.

**The canvas:**
- **It grows by `STRIP = 64` transparent rows** below VHS's 1100×640, to 1100×704. The pill is centered in the strip, 4px above its middle.
- **When no caption shows,** the strip is empty and transparent, so on GitHub it's just space under the card.
- **The card's rounded mask is unchanged:** the strip has no alpha but the pill's.

**How it's drawn:**
1. Python draws one transparent PNG per output frame at 12 fps, 1100×704, with Pillow. It holds the pill only.
2. In ffmpeg, the card goes through `alphamerge` with its mask as now, then `pad=w=iw:h=ih+64:x=0:y=0:color=black@0`.
3. The PNGs are composited with `overlay=0:0:format=auto:alpha=straight`, then `format=rgba`, and then the palette as now.
4. This replaces the drawtext captions, `IDLE` and `CACHEBEAT_DEMO_BACK`. The `FINAL` split stays, to mark the final hold.

**Checked free, on H1b's raw** (the prototype is this session's scratchpad `ff/proto2.py`, run against the builder's `demo.py`; its GIF is `ff/demo-caption.gif`, which the user approved):
- The output is 21.5s and 1.21 MB, against the builder's 1.12 MB. The pill is 576×44.
- The alpha inside the card matched the card's mask in all 260 coalesced frames.
- Flattened on `#0d1117` and on white at 830px:
  - frame 72, fast: `▶▶ fast-forward · +34m idle`
  - frame 100, the ×1 hold: `+52m idle`
  - frame 250, the final hold: `back after 1h 40m · cache still warm`

  All three read clearly on both page colours.

**For the builder:**
- **Port it into `render()`:** the OCR parse, the fixed-slope model, the PNG frames, `pad`, and `overlay`.
- **README alt text (§7):** add "with a fast-forward caption" only if it reads naturally. Otherwise leave it.
- **F2-style check:**
  - In 5 grabbed frames, the caption's minutes equal `180 − left` within a minute.
  - The card's alpha matches the mask in every frame.
  - Flatten one frame on white and one on `#0d1117`, and look at both.

### The flow shimmer and OCR (flagged)

**What flow does** (`spans()`, hooks/settings.ts): a three-glyph highlight in the theme's lighter `claudeShimmer` tone sweeps across the turn line, one glyph per tick.
- Both tones are light orange on `#161b22`, so tesseract's binarization should hold (inferred).
- **The risk** is a frame where the highlight sits on the count, read as something other than `×2`.
  - `plan()` skips unread frames, since it compares a count with the last one read, so a miss costs nothing.
  - A misread *higher* count would add a false beat.
  - The clock overlay's `left` and `next` reads go through the fixed-slope model, which absorbs outliers.
- **Evidence it's likely fine:** step 8's final take OCR'd the user's own ECG-and-flow line, on Catppuccin, and `plan()` found both beats.
- **The ECG heart** is in the hint row, which `BOTTOM` crops out.

**Free check, F1b** (the printf mock can't do it: it would need the shimmer's colors per glyph per tick):
- A VHS tape launches the fork with `--launch`'s command, with nothing typed. It runs `/cachebeat settings`, opens the turn line's look tab, and records 6s.
  - That tab's live preview draws `♥ cache kept warm ×3 · 184k cached · next in 42m` through the same `spans()` and `paint()` as the real line, at the pinned flow.
- Run `status()`'s tesseract on every frame at 12 fps, with the crop as in `status()`.
- **Pass:** at least 90% of frames read `kept warm … 3` and `next in 42m`, and none reads another count.
- Typing `/cachebeat settings` writes a fork session file (F3): list it with the others.

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
- **The risk was** that cachebeat's turn line hangs on the `TurnDuration` component (`hooks/register.tsx`, `on('ui.render', { component: 'TurnDuration' } …)`), and might not be raised once its text is off.
- **Checked free (P1, "Checked before building"):** with `showTurnDuration: false`, a scratch mod's `TurnDuration` hook still drew its marker under a resumed turn, and no `✻ … done` text showed. The binary agrees: the row's wrapper always renders, and only its inner text goes null.
- **Still for H1 to confirm:** that this holds for a turn that ends live, not only for a resumed one (inferred: the same component).
- **If H1 shows it doesn't:** keep `showTurnDuration` on and cut the payoff. The GIF ends on the ×2 hold: the command plus C, about 13s. Don't keep the payoff with the times showing.

## 2. The storyboard

**Size and timing:**
- 1100×640: **77 columns by 23 rows** (measured with `tput` inside VHS by the review). A cell is about 13.4×24.7px. The `/cachebeat 3h` reply (about 82 characters) wraps onto two lines.
- Typing at 50ms.
- One fast-forward, split by two beats.
- **Target about 22s; cut if it runs past 24s,** in this order:
  1. `HOLD` 1.5s → 1.2s
  2. `FF` 3 → 4
  3. the opening hold 1.5s → 1s
  4. the payoff's final hold 2.5s → 2s
- Seconds below are GIF seconds, after demo.py's speed-up; the raw recording is longer.

| # | Typed (tape) | Wait for, then hold | On screen | GIF s |
| --- | --- | --- | --- | --- |
| 0 | `Hide`. The launch command (§5), `Sleep 9s`. Then the setup message: `in one line, what does demo.sh open?`, `Sleep 400ms`, `Enter`. | `Wait+Screen@60s /(?s)demo\.sh open\?.*●/`, then `Sleep 3s` so the line finishes and the prompt is idle. `Show`. | (hidden) | 0 |
| 1 | nothing | `Sleep 1500ms` | Opening frame. Above: the source's tail (§4). Then `❯ in one line, what does demo.sh open?` and its one-line answer, e.g. `● Neo4j Browser and Gephi, the two live-demo views.` An empty prompt box, and the footer. No cachebeat line yet: it's off. | 1.5 |
| 2 | `/cachebeat 3h`, `Sleep 400ms`, `Enter` | `Wait+Screen@10s /next beat in/`, then `Sleep 2s` | The reply, e.g. `cachebeat: this session: on until 6:16 PM (3h), every 50m idle · next beat in 50m`. Under the setup turn, the turn line, e.g. `♡ next beat in 49m · 2h 59m left`. The prompt heart in the hint row. | 3.4 |
| 3 | nothing: the demo mod runs the clock | `Wait+Screen@90s /kept warm ×2/`, then `Sleep 1500ms` | The countdown races. The caption `▸▸ 50 min idle` (§3) shows in the empty prompt row during each sped-up part only. Beat 1 lands and holds at real speed: `♥ cache kept warm ×1 · 52k cached · next in 50m · 2h 9m left`. It races again, and beat 2 holds: `♥ cache kept warm ×2 · 52k cached · next in 50m · 1h 19m left`. | ≈9.3 (2.5 + 2.1 + 2.5 + 2.1) |
| 4 (payoff, if the gate passes) | `Sleep 500ms`, `back. where were we?`, `Sleep 400ms`, `Enter` | `Wait+Screen@40s /(?s)where were we\?.*kept warm ×2/`, then `Sleep 2500ms` | The message, a short spinner, the one-line answer picking up the demo.sh thread. Then cachebeat's line moves under the new answer: `♥ cache kept warm ×2 · 52k cached · next in 50m · 1h 18m left`. It matches only once the turn has ended, because `turn.start` sets `s.row = null`, so no line shows while the answer is drawn. Through the final hold (the raw recording's last 2.5s, the tape's closing `Sleep 2500ms`), the caption `back 1h 40m later · cache still warm` shows in the empty prompt row (§3). | ≈9–11 |
| | | | **Loop point:** the end of the payoff hold, cut straight back to the opening frame. Total ≈ 23–25s before trims, ≈22s after. | |

**Notes on the scenes:**
- **Why `3h`, not `2h`.** After two beats, `2h` leaves 20 minutes, which the cache outlasts, so the line drops its countdown (the "no beat needed" case). With `3h` the line keeps `next in 50m` through the payoff and the last frame, so the heartbeat is still going as the GIF loops. Inferred: the same code path as `2h`; the Haiku dry run shows it.
- **Why the setup turn is hidden.** A forked conversation's beats wait for a turn in the fork (`RESUMED`), so one turn has to happen before `/cachebeat 3h`. Hidden, it costs no GIF time, and its question and answer stay on screen as the "you were working" opening.
  - **The tape can't sleep a fixed time for it:** a `/cachebeat` typed mid-turn runs, but its reply draws only at the turn's end.
  - **It can't wait for `done` either,** because `showTurnDuration` is off. It waits for the first `●` after the typed question. The pattern is anchored on the typed text, because a bare `/● demo\.sh/` could match the source's own tail: the B5 trap.
  - **The source must already have read `demo.sh`** (§4). Otherwise the fork's first `●` is `● Read(demo.sh)`: the wait fires early, and the tool line and its `⎿` sit in every opening frame. VHS patterns are Go RE2, with no lookahead to skip tool lines, so reading it in the source is the fix.
- **Payoff wording.** `back. where were we?` is 20 characters, 1s at 50ms. The review estimated the payoff at about 9–11s real with the longer line (inferred), so this one replaces `back. where did we leave off, in one line?`.
  - **If the answer runs past two lines,** it pushes the source's tail up and the frame gets busy. Then add `in one line` back (`back. where were we, in one line?`) rather than cut the answer.
- **The payoff's receipt.** cachebeat's line reappearing lower down is easy to miss, so the final hold adds a caption saying it outright: `back 1h 40m later · cache still warm`.
  - **When it shows:** the last `FINAL = 2.5` seconds of the raw recording, which is the tape's closing `Sleep 2500ms`. `plan()` can't find it: it marks parts only where the beat count rises, and the payoff reads `×2` again. So `render()` splits the last part at `raw duration − FINAL`, using `ffprobe`'s duration, and gives the new part the caption.
  - **Its text comes from an env var:** `CACHEBEAT_DEMO_BACK="1h 41m"` renders `back 1h 41m later · cache still warm`. Unset, there's no payoff caption: the payoff-cut fallback, and every render whose time isn't known yet.
  - **The time** is read by hand from the take's last frame: `3h` minus the `left` its line shows (for `1h 19m left`, that's `1h 41m`).
  - **H1 renders it with a placeholder,** `CACHEBEAT_DEMO_BACK="1h 40m"`, only to check its place and timing. The real time goes into the final render after T1 (§6).
  - **A sanity check, not proof:** T1 reads the fork's transcript to confirm the payoff turn read the cache (§6). It can't prove the beats kept it warm: the payoff comes about a minute of real time after the setup turn, well inside the real one-hour cache, so the read passes either way (the re-review). What the caption claims rests on the demo as a whole: two real beats, each a real cache read, over the shown 1h 40m.

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

### Transparent corners: a geometric mask, then ImageMagick (checked, P2)

The margin is made transparent in demo.py's render, so the rounded card floats on any page. **Not by colorkey:** VHS writes yuv420p, so the margin decodes as `#0c0f16`, not `#0d1117`. Its h264 ringing keys out specks inside the card (3,539 at one frame of the review's mock), which show white on a light page. The keyed GIF was also 3.0 MB against 0.19 MB opaque.

**The chain** (all measured on the review's 11s mock, `rv/m.mp4`; P2 below):
1. **A mask image, made once per render,** from the frame's geometry: white inside the rounded card (`Margin` 16, `BorderRadius` 10), black outside.
   ```sh
   M=16; RA=10; W=1100; H=640
   ffmpeg -f lavfi -i "color=black:s=${W}x${H}:d=1,format=gray,geq=lum='if(between(X,$M,$W-$M-1)*between(Y,$M,$H-$M-1), if(gt(hypot(max(0,max($M+$RA-X,X-($W-$M-1-$RA))),max(0,max($M+$RA-Y,Y-($H-$M-1-$RA)))),$RA),0,255),0)'" -frames:v 1 mask.png
   ```
   In demo.py, take `W`/`H` from `ffprobe` as `render()` already does for the height, and `M`/`RA` from constants that match the tape.
2. **ffmpeg** merges it as alpha and writes a temporary GIF:
   - **The mask input is bounded:** `-loop 1 -t <the concat's duration> -i mask.png`. Unbounded, palettegen never sees an end, and the run was killed for memory.
   - **The filter chain:** `[1:v]format=gray[m];[cut]format=rgba[v];[v][m]alphamerge,split[x][y];[x]palettegen=max_colors=128:stats_mode=full:reserve_transparent=1[p];[y][p]paletteuse=dither=none:diff_mode=rectangle:alpha_threshold=128`. `[cut]` is the trimmed and concatenated stream at 12 fps.
3. **`magick <tmp>.gif -layers Optimize "$GIF"`**, where `GIF` is demo.py's output path (`CACHEBEAT_DEMO_GIF`, §5), never `assets/demo.gif` by name (ImageMagick 7 is installed at `/usr/bin/magick`). ffmpeg's GIF encoder writes full frames once an alpha is involved, so its output is 3 MB. ImageMagick's frame optimization brings it to 0.16 MB, smaller than the opaque GIF.

**Measured (P2):**
- All 136 coalesced frames' alpha matched the mask exactly: no holes, no stray pixels.
- The corner is clean on white at 2× zoom.
- With `stats_mode=full` the orange turn line keeps its color. Under `stats_mode=diff` it came out grey (`#7b7e85`), opaque or masked, because diff mode drops small static colors.

**The fallback,** if the real take shows a problem the mock didn't: `Margin 0`, no `BorderRadius`, no mask, still `stats_mode=full`. That's a plain `#161b22` rectangle, which on GitHub reads like a code block.

### Claude Code's theme: `dark`, pinned

Add `"theme":"dark"` to the tape's `--settings`. The user's `theme` lives in ~/.claude/settings.json (`"custom:niri"`), so a `--settings` value should override it for the session. That's inferred: F3 checks it, and checks that nothing is written back.

`dark`'s colors (2.1.332's binary, checked):
- `claude` is `rgb(215,119,87)` = `#d77757`. The turn line, heart and accent take it, and it matches the badge and the wordmark's orange family.
- `userMessageBackground` is `rgb(55,55,55)`: a neutral grey bar on the `#161b22` card.

**Not `dark-ansi`:** it hands every color to VHS, and the accent would then be an ANSI red.

### Other Claude Code display settings, in the same `--settings`

- **`"showTurnDuration": false`:** the payoff gate, §1.
- **`"spinnerTipsEnabled": false`:** no rotating `Tip: …` under the spinner. It's a settings key ("Whether to show tips in the spinner").
- **`"verbose": false`, explicitly.** The user's settings.json has `"verbose": true`, so leaving the key out keeps it on (the review). Off, the `72011 tokens` readout goes, and inferred, the `1 agent type available` / `1 skill available` lines with it. H1 shows.
- **`"showThinkingSummaries": false`:** no `∴` rows from the user's `true`. A resumed transcript still shows collapsed rows such as `Thought for 10s, ran 1 shell command` with it off (P1). That's accepted in the source's tail.
- **`"remoteControlAtStartup": false`:** the `Remote Control disconnected — Trusted devices now required` notice came from an account change. It may print live at the launch of every fork, at the bottom of the screen, which is the opening frame. The key accepts flag settings (the review). P1 launched with it and showed no notice, but whether it overrides the user's `true` is still open. F3 keeps the check.
- **`"awaySummaryEnabled": false`, always.** The recap fires on return after 5 minutes or more, so F3 may not reproduce it.
- **`"crossSessionInbound": "refuse"`:** a peer message landing mid-take as a turn would burn a paid take. It doesn't hide `← 2 agents` from the footer (P1), so the fleet still closes before T1 (§8).
- **`"promptSuggestionEnabled": false`:** after a turn, Claude Code can draw a suggested next message as ghost text in the prompt row, which is where the captions go (§3, "The fast-forward"). The key is in 2.1.332's settings list; that it's this feature, and that `--settings` turns it off, is inferred. P1's prompt row was empty, but it had no fresh turn. H1 checks.
- **All the keys above but the last** were in P1's launch together: no warning in the debug log, and ~/.claude/settings.json byte-identical after.
- **Kept from the old tape:** `"advisorModel":""`, `"statusLine":{"type":"command","command":"true"}`, and `enabledPlugins` with both installed copies off.

### cachebeat's settings: pinned by the demo mod, not by touching the user's

**Why:** the installed copy's store (read 2026-11-25 through `state`) holds:
- `variant: ecg`, with `heartEffect`/`lineEffect: flow`
- `skipSmall: true` at `skipSmallTokens: 50000`: a source under 50k would never beat
- `stopAtUsage: 100`
- `onStop: both`

The `--plugin-dir` copy reads that same store (B2). Changing them through `set` or the menu touches user settings, which a live check must not do.

**How:** the demo mod (the clock mod, extended; rename its `description` to "Runs cachebeat's clock fast and pins its settings for the demo") adds three op hooks:

```ts
const PINNED = { coldGuard: false, stopAtUsage: 100, variant: 'ecg', heartEffect: 'flow', lineEffect: 'flow' } // the user's animations (Revision); everything else: cachebeat's DEFAULTS
const KEPT = ['settings', 'folders', 'customs'] // the user's own: read pinned, never written
on('store.get', async ($, e, next) => {
  if (next.origin.plugin !== 'cachebeat') return next(e)
  if (e.key === 'settings') return { value: PINNED }
  if (e.key === 'folders') return { value: {} }
  return next(e) // session:<id> records, customs, prunedAt and Stats pass through
})
// a change made in the demo session must not reach the user's store: changeSettings would write changed(global)
// built from PINNED, and saveOwn would rebuild folders from {} and wipe the folders' own settings
on('store.set', async ($, e, next) => (next.origin.plugin === 'cachebeat' && KEPT.includes(e.key) ? { value: undefined } : next(e)))
on('store.delete', async ($, e, next) => (next.origin.plugin === 'cachebeat' && KEPT.includes(e.key) ? { value: undefined } : next(e)))
```

**What this pins:**
- `load()` (`hooks/register.tsx`) reads exactly `settings` and `folders`, and `normalize` fills every missing key from `DEFAULTS` (`hooks/settings.ts`).
- So the frames get the classic heart, steady effects, `heartColor: 'claude'` (the theme's orange), `statusLine: 'spaced'`, the countdown and tokens on, `showCount` on, and skip-small off.
- **`coldGuard: false`:** the guard never shows in this concept, and with it off the source's age doesn't matter (§4).
- **`stopAtUsage: 100`:** a take near 90% of the five-hour window would otherwise stop beating mid-take. Still check account usage before each take.
- **`customs` passes through:** it's read only for custom animations, and the classic heart uses none.
- **`store.set` and `store.delete` are no-ops for those three keys** (the review). Any change in `/cachebeat settings` runs `changeSettings` (`register.tsx` 318–325), which writes `changed(global)` built from `PINNED` over the user's real settings. `saveOwn` (304–308) rebuilds `folders` from the pinned `{}`, which wipes every folder's own settings. The tape changes no setting, and F3 changes none either: these hooks are a safety net, and they're untested.
- **cachebeat's other records** (`session:<forkid>`, Stats) still land in the real store, as in every take before. They're pruned after 30 days.

**The unproven part:** op hooks on `store.*` from another plugin. `clock.now`, `clock.after` and `model.fork` are proven (B3, B4). `store.get` isn't: the types list it (`index.d.ts` `'store.get': { key }`), and `next.origin` names the caller. The return shape `{ value }` is copied from the `clock.now` hook. F3 checks the read for free.

**If the user's settings are ever overwritten anyway,** these are the values to put back. They're the installed copy's, read 2026-11-25 through `state`, under all folders, where the cachebeat folder had none of its own:
- `stopAtUsage: 100`
- `skipSmall: true`, `skipSmallTokens: 50000`
- `variant: "ecg"`
- `heartEffect: "flow"`, `lineEffect: "flow"`
- `onStop: "both"`
- every other key at its default

Other folders' own settings weren't read: the `folders` key is the one to protect.

### The fast-forward, without the badge

- **The countdown racing is the main signal.** `next beat in 49m` drops a minute every few frames, so it reads as sped up on its own.
- **A caption,** only during the sped-up parts (`plan()`'s fast segments): `▸▸ 50 min idle`. The user keeps it, so it has to read on GitHub; the review found the first draft (16px, `#7d8590`) would show at about 13px of muted grey.
  - **FiraCode Regular at the terminal's own size:** `fontsize=20` in native pixels, the tape's `FontSize`, not `px(20)`. `px()` scales by `h/560` for the old badge, which would give 23px on a 640-row frame. On GitHub it shows at about 15px, like the text around it. Color `#9198a1` (Primer's current muted foreground, about 5.7:1 on `#161b22`). No box.
  - **In the empty prompt row, right-aligned,** inside the input box (`x=w-tw-64`: margin 16, padding 20, and about two cells for the box's edge, in native pixels). It's the one row sure to be empty through the fast-forward: nothing is typed then.
  - **Not on the hint row:** under `--permission-mode auto` it reads `⏵⏵ auto mode on (shift+tab to cycle)`, plus the heart (P1). At 77 columns, that leaves no room on the right.
  - **The row's `y`:** in the footer layout (§5, `BOTTOM`) the prompt row is the 4th from the bottom, about 505–530px. Center the caption on it: `y=505+(25-th)/2`. Check it against a real frame, F3's or H1's.
- **The payoff's caption** sits in the same place and size, through the payoff's final hold only: `back 1h 40m later · cache still warm` (§2).
- **Gone:** `rgbashift`, `drawgrid`, the pink box, and `~50 MIN LATER`.

### Dark only, no light `<picture>` pair (decided, §8)

- **A light version is another recording, not a re-render.** Claude Code draws its own colors, so a light GIF needs a Claude Code `light` take, with its own timing, its own OCR pass, and real requests. Under the two-take cap, a pair spends both takes and leaves no retry.
- **A dark terminal card on a light page is the norm** for terminal GIFs on GitHub. With transparent rounded corners it reads as a deliberate object on both page themes. The scout's still showed it on white.
- **The wordmark already has an `-on-dark` variant** for that reason, while the badge row stays the same on both themes.
- **Not foreclosed:** if the user wants a pair, it's one more take after the dark one ships.

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

**Pick: a fresh source made in ProgLang-Influence-Graph** (confirmed by the user, §8):
- **The project is neutral and readable:** a programming-language influence graph with Neo4j and Gephi views. Its `demo.sh` is 12 lines with nothing private in it, and the repo has no remote (checked).
- **A fresh session controls the tail.** The existing `2b8312b3…` (75k, Sonnet, 2026-10-13) ends on `where are the ceckboxes, the ss if of n4j no?`, which would sit in every frame.
- **How to make it:** in tmux, in that folder:
  - `claude --model sonnet --permission-mode default --settings '<the takes' full --settings, §3>'`. The takes' settings, because the user's own would leak into the source's transcript (the review):
    - `remoteControlAtStartup: true` caused the notice that ruled out the old source
    - `showThinkingSummaries: true` puts `∴` rows in the tail
    - `crossSessionInbound` accepting, plus the peer hooks, lets fleet messages land as turns
  - **`--permission-mode default`,** not the takes' `auto` (the orchestrator): the source's turns read files, and a tool shouldn't run without the builder's OK. The takes stay on `auto` (§8).
  - In a 77×23 tmux window, the takes' size. A tmux-only `tmux focus-events off` notice shows above the prompt (P1); VHS runs no tmux, so ignore it.
  - Turn 1: `give me a short overview of this project: what it builds and how`. It reads the README and scripts, which builds the size.
  - Turn 2: `read demo.sh: what does it do?` This puts `demo.sh` in context, so the fork's setup question is answered without a tool call (§2). Its collapsed `Read 1 file` row stays in the tail. That's accepted: it reads as real work.
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
| `--settings`: `"verbose":false` (explicitly); add `"theme":"dark"`, `"showTurnDuration":false`, `"spinnerTipsEnabled":false`, `"showThinkingSummaries":false`, `"awaySummaryEnabled":false`, `"remoteControlAtStartup":false`, `"crossSessionInbound":"refuse"`, `"promptSuggestionEnabled":false` | `remoteControlAtStartup` may not override the user's `true`. P1 checked that `theme` overrides (the 256-color capture showed `dark`'s grey user bar, not niri's), that nothing is written back, and that the turn line survives `showTurnDuration` on a resumed row. | F3, H1 |
| `--permission-mode default` becomes `--permission-mode auto` (the user, §8) | The hint row shows auto mode's label in place of `⏸ manual mode on`; that's accepted. Auto mode runs tools without asking, so a turn that reaches for a tool shows it in frame. The setup and payoff turns must answer from context: the source reads `demo.sh` first (§4). | F3 (how the hint row looks), H1 (no tool line in either turn) |
| `cd "$CACHEBEAT_DEMO_DIR"` points at the ProgLang folder; `CACHEBEAT_DEMO_SESSION` is the new source | none new | F3 |
| Scene 0 rewritten: no `/cachebeat` + Escape trick, no guard question; the setup message and its `/(?s)demo\.sh open\?.*●/` wait | the first `●` after the question is a tool line, not the answer (the source didn't read `demo.sh`); the wait fires early | H1 |
| Scenes 1–4 as §2; scene 4 of the old tape (Status) removed | `/(?s)where were we\?.*kept warm ×2/` needs both on one screen: at 23 rows the message, the answer and the line fit (inferred) | H1 |
| The header comment: "and hides your status line and the advisor…" reworded for the new flags | none | review |

### `assets/demo.py`

| Change | Risk | Check |
| --- | --- | --- |
| `CLOCK_MOD`'s `register.ts` gains the `store.get`, `store.set` and `store.delete` hooks (§3) | an op hook on `store.get` isn't honoured, or takes another return shape: the frames show the user's ECG heart, and a source under 50k never beats. The set and delete no-ops are untested. | F3: `/cachebeat settings` shows the classic heart, Cold guard off, Skip small off; change nothing there |
| `BEATS`, `SPEED`, `STEP` and the `model.fork` hook unchanged | the payoff turn arrives while `ahead` is set. With the guard off nothing reads it for a question. `countKept` counts the turn as kept (shown time), which lands in Stats only. | H1: the payoff draws no cachebeat log line |
| `render()`: the glitch chain becomes the caption drawtext (§3). `0x1e1e2e` and `0xf5c2e7` go; the caption takes `0x9198a1` at `fontsize=20` (native pixels, not `px()`) in the prompt row. The payoff caption's part comes from `CACHEBEAT_DEMO_BACK` and the `FINAL` split (§2). `FONT` takes the Regular face (`FiraCode Nerd Font Mono:style=Regular`, checked installed). The flag becomes a caption text per part (None, `▸▸ 50 min idle`, or the payoff's), not a bool. | the caption overlaps typed text or sits off the row | F2, then H1 |
| `render()`: `palettegen` `stats_mode=diff` → `full` | none found: P2 measured it smaller, with the orange kept | F2 samples the turn line's pixels in the GIF for orange |
| `render()`: the mask, `alphamerge`, and the `magick -layers Optimize` pass (§3) | the real take has something the mock didn't; ImageMagick's time on about 270 frames (inferred: seconds) | F2: composite frames on white and on `#0d1117`; compare the size with an opaque render |
| `LEAD`/`HOLD`/`SETTLE`/`FF`: `LEAD 0.6`, `HOLD 1.5`, `SETTLE 2.0`, `FF 3`, then trim per §2 | timing only | H1's printed parts |
| `BOTTOM` 0.18 → 0.12, re-measured for 640 rows | **Untested.** The crop only has to clear the hint row: the prompt and its borders hold nothing the `status()` filter matches. |  F1 must reproduce the footer layout below; then H1: `plan()` prints exactly two beats |
| `plan()`: the beat count must not double-count the payoff | the payoff line reads `×2` again, not more, so `n > last` doesn't fire (checked by reading `plan()`) | H1 |
| **A `--launch` mode:** extracts `git archive HEAD` and writes `CLOCK_MOD` into folders under the scratchpad that it keeps, then prints the tape's full `claude …` command with `CACHEBEAT_DEMO_PLUGIN` and `CACHEBEAT_DEMO_CLOCK` filled in. `record()` and `--launch` share one helper that builds the two folders. F3 needs this: the tape's command names folders only `record()` creates, and it deletes them afterwards. Never stand in for them with `--plugin-dir .` or a worktree. | the printed command drifts from the tape's | F3: diff the printed flags against the tape's `Type` line |
| **`GIF` overridable** (`CACHEBEAT_DEMO_GIF`, defaulting to `assets/demo.gif`): **set it for every run before the final take, H1 included.** `RAW` stays `assets/demo-raw.mp4` for recording, because the tape's `Output` line names it and it's gitignored (checked). `CACHEBEAT_DEMO_RAW` overrides what's *read*, and only with `--skip-record` (demo.py refuses it otherwise), for F1 and F2. A test render is never committed: only the final take's `assets/demo.gif` is. | a test overwrites the tracked `assets/demo.gif` | `git status` after F1, F2 and H1 shows no `assets/demo.gif` change |
| The docstring: the new story, the pinned settings, no guard, any-age source | none | review |

**The footer layout, the one reference for `BOTTOM`, the caption's row and F1.** Rows are counted from the bottom, with 604px as the card's bottom edge inside the padding and 24.7px per row:

| Row from bottom | What | px |
| --- | --- | --- |
| 1 | hint row: `⏵⏵ auto mode on (shift+tab to cycle)`, the heart, `×N` | 579–604 |
| 2 | blank | 555–579 |
| 3 | prompt box, bottom border | 530–555 |
| 4 | prompt row (the captions' row) | 505–530 |
| 5 | prompt box, top border | 481–505 |
| 6 | the turn line, after beat 2 and in the payoff: lowest place, inferred | 456–481 |

- **How this was read:** from P1's tmux capture, which had one more row (tmux's `focus-events` notice) between the turn line and the top border. Without it, the turn line is assumed to sit directly on the border. F3's capture settles the real layout. If it differs, correct this table first, and everything that cites it follows.
- **What the crop needs:** `BOTTOM = 0.12` crops from 563px down. That takes the hint row and half the blank row, and keeps the prompt box and the turn line. The prompt box holds nothing the filter matches, so keeping it is harmless.

Leave the `status()` filter as it is (`'next beat in'` or `'kept warm'`, and not `'cachebeat'`): the `/cachebeat 3h` reply carries `cachebeat` and is skipped. If the reply wraps so that `next beat in` falls on its second line, that line counts 0, which is harmless (the highest count wins).

## 6. Checks, cheapest first: two real takes at most

**Free: no request sent.**
- **F1: VHS mock.** A throwaway tape with the §3 `Set` block `printf`s the frame's lines in `dark`'s colors:
  - the turn line in `rgb(215,119,87)`, at `×1` then `×2`
  - a user line on `rgb(55,55,55)`
  - under it, the footer exactly as §5's layout table gives it: the top border, the prompt row, the bottom border, a blank row, and the hint row. That puts the turn line 6th from the bottom, where it sits after beat 2 and in the payoff.

  The review's `rv/m.mp4` is a start, but its line sits near the top, so it doesn't test `BOTTOM`. The scout's `t.tape` shape works (its folder is in "What the scout found"). Run demo.py's `status()` and `plan()` on its mp4 (`CACHEBEAT_DEMO_RAW=<the mock's mp4>`; output to the scratchpad). Both counts must be read, and the turn line must sit above the `BOTTOM` crop.
- **F2: render only.** Run `python3 assets/demo.py --skip-record`, with `CACHEBEAT_DEMO_RAW` set to F1's mp4 and then to the existing `assets/demo-raw.mp4`, and `CACHEBEAT_DEMO_GIF` set to the scratchpad each time. Check:
  - the caption's place and color, and the payoff caption's split: render once more with `CACHEBEAT_DEMO_BACK="1h 40m"`, and it shows in the last 2.5s only
  - no glitch left
  - the GIF's size, against an opaque render of the same input (P2: 0.16 MB masked against 0.17 MB opaque)
  - the turn line's pixels in the GIF are orange (`stats_mode=full`)
  - transparency: `magick <gif> -coalesce`, then check that each frame's alpha matches the mask (P2's numpy check), and flatten a few on white and on `#0d1117` (`magick f.png -background white -flatten`). If holes or fringe show, take the §3 fallback.
- **F3: launch without a message.** Run `python3 assets/demo.py --launch` and run the command it prints in a **77×23** tmux window (not VHS), from the ProgLang folder, forking the source. Start it from a script file that `cd`s first: tmux's `-c` didn't take in P1, and Claude Code then asked to trust `/home/zyrus` (Escape cancels). Do this before and after: `cp ~/.claude/settings.json <scratch>/before.json`, then `diff` after quitting; it must be empty. Then check:
  - the theme is `dark` (orange accent, grey user-message bars)
  - the debug log (`--debug-file`) names `cachebeat-demo-clock@inline` first and one `cachebeat@inline`, with no `@cachebeat` or `@synced`
  - `/cachebeat settings` (local, sends nothing) shows the pinned values: Classic heart, Steady effects, Cold guard off, Skip small off, Stop at usage 100%. **Change nothing there:** Escape, then quit with no message (Ctrl+C twice). **If it shows ECG, the `store.get` pin failed: stop and report it.**
  - the footer under `--permission-mode auto`: P1 showed `⏵⏵ auto mode on (shift+tab to cycle) · ← 2 agents`. Note the prompt row's place for the caption (§3).
  - the source's tail on screen: nothing private, no welcome header
  - no notice at the launch (Remote Control, an away summary, an update): the bottom of the screen is the opening frame

**Paid but cheap: Haiku.**
- **H1: one Haiku dry run:** `CACHEBEAT_DEMO_MODEL=haiku CACHEBEAT_DEMO_GIF=<scratch>/h1.gif CACHEBEAT_DEMO_BACK="1h 40m" python3 assets/demo.py`. The payoff time is a placeholder (§2). The source stays Sonnet; B0 showed a model mismatch on a fork works. Read `assets/demo-raw.mp4` frame by frame:
  1. **The gate:** after the setup turn and `/cachebeat 3h`, the turn line shows under the setup answer with `showTurnDuration: false`. If it doesn't, rerun with `showTurnDuration` on and the payoff cut (§1).
  2. the `● demo\.sh` wait fired after the answer, with no spinner at `Show`
  3. no `∴` thinking line, no tip, no token readout, no `agent type available`
  4. both beats, the `3h` countdown kept after ×2, and `plan()` printing two beats with no fast-forward before `/cachebeat 3h`
  5. the payoff: no tool line in it or in the setup turn (auto mode would run one unasked), no cachebeat log line, the line moving under the new answer, and the wait matching only after the answer
  6. no ghost suggestion in the prompt row after the setup turn or the payoff; the caption only on fast parts, legible and in the prompt row, not overlapping; and the placeholder payoff caption only in the last 2.5s, after the line has moved under the answer
  7. the length, trimmed per §2

  A second Haiku run is fine if H1 changes the tape. Haiku runs don't count toward the take cap, but say how many ran.

**For the builder, from the review:**
- **The hint-row heart draws dim grey on purpose** (`heartPlacement: 'tail'`). Don't "fix" it: that adds a row and moves the crop.
- **VHS 0.12.1 does honour `Margin`, `MarginFill` and `BorderRadius`** (checked), though `vhs manual` doesn't list them.

**Real takes: Sonnet, two at most.**
- **T1:** `CACHEBEAT_DEMO_GIF=<scratch>/t1.gif python3 assets/demo.py`, with no `CACHEBEAT_DEMO_BACK`. Before it: account usage under 90% (`clear` reports it), and the source untouched since F3. After:
  - Check every frame against §2's "On screen" column, and `git diff` the tape and demo.py against what H1 ran.
  - **A sanity check on the payoff** (§2: it can't prove the beats worked). Read the fork's transcript, the newest `.jsonl` in the ProgLang project folder. The payoff turn's first assistant `usage` should show `cache_read_input_tokens` near the conversation's size, and `cache_creation_input_tokens` small (the turn's own new text). If it doesn't, something is badly off: drop the payoff caption and report it.
  - **The final render,** the only one that writes the tracked GIF: `CACHEBEAT_DEMO_BACK="<3h minus the last frame's left>" python3 assets/demo.py --skip-record`, with `CACHEBEAT_DEMO_GIF` unset.
- **T2** only if T1 fails a frame check. Ask the orchestrator before a third.
- **Each take** forks the source into a new session file under `~/.claude/projects/-home-zyrus-Desktop-Projects-ProgLang-Influence-Graph/`. List them in the results for the user to clear.

Record F1–T2's results under this plan as "Results", as step 8 did. Put anything that took time to find out in mods-gotchas.md: the `store.get` pin, `showTurnDuration` and the turn line, transparency.

## 7. How the README embeds it

On `main`, the README is for users. The image stays where it is (line 9, under the tagline), as plain Markdown, with no width attribute: GitHub scales it to the column.

```md
![cachebeat keeping an idle session's cache warm: /cachebeat 3h, two beats land on their own while you're away, and the next message picks up warm](assets/demo.gif)
```

- **If the payoff is cut,** the alt text ends at "while you're away".
- **Commits:** the GIF and the README line are plugin files, committed on `dev` as `cachebeat 0.10.0 (gif): …` (§8). The tape, demo.py and this plan's results are `dev notes: …` and dev-only commits. They reach `main` only through a release branch (notes/README.md, "Branches and releases").

## Checked before building (2026-11-25)

**Free checks run by the planner on the review's findings.** No request was sent.

**P1: the `TurnDuration` marker, and the takes' settings.**
- **The setup:**
  - A scratch mod (`hooks/register.tsx`: a `ui.render` hook on `TurnDuration` that draws `TD-MARKER` under `await next(e)`) was loaded with `--plugin-dir` from the scratchpad.
  - It was launched in a 77×23 tmux window, forking the Trellis session `788fe026…` on Haiku.
  - `--permission-mode auto`, and the takes' full `--settings` (§3).
  - No message was typed, and Ctrl+C twice quit.
- **Results:**
  - `TD-MARKER` drew under the resumed turn, with no `✻ … done` text.
  - The footer read `⏵⏵ auto mode on (shift+tab to cycle) · ← 2 agents`.
  - No Remote Control notice showed. A tmux-only `tmux focus-events off` notice did.
  - The colors were `dark`'s: the user bar at 256-color 237, against niri's brown, which would map near 236 (inferred from the mapping).
  - ~/.claude/settings.json was byte-identical after.
  - The debug log has no settings warning, and no model request, only MCP connection setup.
  - No fork file was written: the Trellis folder still holds only the source.

**P2: the render** (on the review's `rv/m.mp4`, 11.2s, 1100×640 yuv420p; files in this session's scratchpad, `rv2/`):

| Render | Size | Orange pixels in the last frame | Alpha off the mask |
| --- | --- | --- | --- |
| opaque, `stats_mode=diff` (today's) | 0.19 MB | 0 (grey) | n/a |
| opaque, `stats_mode=full` | 0.17 MB | 809 | n/a |
| opaque, `stats_mode=single` | 3.76 MB | 1418 | n/a |
| masked, `full`, ffmpeg only | 3.01 MB | 896 | 0 |
| masked, `full`, then `magick -layers Optimize` | **0.16 MB** | kept | **0 px in all 136 frames** |

## 8. Decided (2026-11-25)

The user confirmed the source and the release, and told the orchestrator (`cachebeat-9c`) to improvise the rest, which it did with the plan's recommendations.

1. **The source:** a fresh ProgLang-Influence-Graph session, made as §4 says (the user).
2. **The new GIF rides 0.10.0** (the user):
   - It goes on `v0.10.0` together with the builder's settings changes and the floor bump to 2.1.332.
   - The release branch is refreshed after them. Commit the GIF and README line as `cachebeat 0.10.0 (gif): …`.
3. **Dark only.** §7's `<picture>` variant isn't built.
4. **Chrome from this machine:**
   - **`← N agents` is accepted** (the user, 2026-11-26, replacing "close the fleet"). The builder runs T1 itself.
   - **The mode label:** the demo runs with `--permission-mode auto`, in place of `default` (the user, 2026-11-25). The hint row shows auto mode's label, and that's accepted. The tape's `--permission-mode` flag and §5 change together.
5. **The payoff stays if H1's gate passes;** otherwise it's cut, as §1 says.
6. **The `▸▸ 50 min idle` caption stays,** made legible (the orchestrator, from the review): the terminal's size, Primer's muted foreground, in the prompt row (§3).
7. **The typed lines:** `in one line, what does demo.sh open?` as written. The payoff became `back. where were we?` after the review's timing finding (§2). That changed an approved line; the orchestrator was told.

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
