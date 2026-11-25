"""Records assets/demo.gif with VHS: /cachebeat 3h, then 50 idle minutes pass in seconds, twice, beats land on their own,
and the next message picks up warm.

Needs vhs, ffmpeg, tesseract and ImageMagick. From the repo root, point it at a session of 40-100k tokens whose
last turns have read demo.sh (the hidden setup turn asks about it), of any age:

    CACHEBEAT_DEMO_DIR=<the session's folder> CACHEBEAT_DEMO_SESSION=<session id> python3 assets/demo.py

The recording forks that session, so its transcript is left as it was. The fork loads this checkout's
HEAD (a scratch copy of it, not the working tree) beside a small mod, written to a temporary folder,
and both installed copies of cachebeat are switched off. The mod runs cachebeat's clock 300× faster from
its first one-minute step after /cachebeat 3h until its second beat has been answered. Each beat is still
a real request, run at real speed. The mod also pins cachebeat's settings: its defaults, with the cold guard
off, the ECG heart and the flow effects, and keeps cachebeat from writing its settings to your store.

The model is sonnet; CACHEBEAT_DEMO_MODEL overrides it, for a dry run. CACHEBEAT_DEMO_GIF overrides where the GIF
is written. CACHEBEAT_DEMO_BACK (for example "1h 40m") captions the last FINAL seconds "back <it> later · cache still
warm"; unset, there is no such caption.

Pass --skip-record to re-render the GIF from the last recording; CACHEBEAT_DEMO_RAW then reads another one.
Pass --launch to build the two folders, keep them, and print the tape's claude command with them filled in.
"""
import os
import re
import shlex
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


TAPE = Path('assets/demo.tape')
RAW = Path(os.environ.get('CACHEBEAT_DEMO_RAW') or 'assets/demo-raw.mp4')
GIF = Path(os.environ.get('CACHEBEAT_DEMO_GIF') or 'assets/demo.gif')
BACK = os.environ.get('CACHEBEAT_DEMO_BACK')
FONT = subprocess.run(['fc-match', '-f', '%{file}', 'FiraCode Nerd Font Mono:style=Regular'], capture_output=True, text=True).stdout
BOTTOM = 0.12  # the share of the frame at the bottom, the hint row, left out of what is read
FPS = 2  # how often the status line is read
LEAD, HOLD = 0.6, 1.5  # seconds each beat plays at full speed, before and after
SETTLE = 2.0  # seconds the status line shows at full speed before the first fast-forward
FF = 3  # how much faster the idle stretches play
FINAL = 2.5  # the tape's closing hold, in seconds, which carries the payoff caption
MARGIN, PADDING, RADIUS = 16, 20, 10  # the tape's Margin, Padding and BorderRadius
COLS, ROWS = 77, 23  # the terminal's size inside them
CAPTION_SIZE = 20  # the tape's FontSize, in native pixels
IDLE = '» 50 min idle'  # FiraCode has no ▸, and drawtext falls back to no other font

CLOCK_MOD = {
    '.claude-plugin/plugin.json': '{ "name": "cachebeat-demo-clock", "version": "0.0.0", "description": "Runs cachebeat\'s clock fast and pins its settings for the demo", "license": "MIT" }',
    'hooks/hooks.json': '{ "modules": ["./register.ts"] }',
    'hooks/register.ts': """
import type { EngineInterface, Register } from 'claude-code'

const SPEED = 300
const STEP = 60_000 // cachebeat's step timer: the first one after /cachebeat 3h starts the fast stretch
const BEATS = 2 // once this many beats have been answered, the clock runs at real speed again
const PINNED = { coldGuard: false, stopAtUsage: 100, variant: 'ecg', heartEffect: 'flow', lineEffect: 'flow' } // everything else: cachebeat's defaults
const KEPT = ['settings', 'folders', 'customs'] // the person's own: read pinned, never written
let from = 0 // real time the fast stretch last began
let ahead = 0 // how far cachebeat's clock runs ahead of the real one
let fast = false
let forks = 0 // beats cachebeat has had answered
let started = false
const real = async ($: EngineInterface) => await $.clock.now() // this plugin's own reads stay real
const shown = (t: number) => (fast ? from + ahead + (t - from) * SPEED : t + ahead)

export const register: Register = on => {
  on('clock.now', async ($, e, next) => {
    const r = await next(e)
    return next.origin.plugin === 'cachebeat' && 'value' in r && r.value !== undefined ? { value: shown(r.value) } : r
  })
  // only the short waits: the keep-alive's long ones stay as they are
  on('clock.after', async ($, e, next) => {
    if (next.origin.plugin !== 'cachebeat') return next(e)
    if (!started && e.ms === STEP && forks === 0) {
      started = true
      from = await real($)
      fast = true
    }
    return next(fast && e.ms <= STEP ? { ...e, ms: e.ms / SPEED } : e)
  })
  // a beat's request runs at real speed: at 300x a few seconds would pass whole shown minutes and the cache would read stale
  on('model.fork', async ($, e, next) => {
    if (next.origin.plugin !== 'cachebeat' || !fast) return next(e)
    const t = await real($)
    ahead = shown(t) - t
    fast = false
    try {
      return await next(e)
    } finally {
      forks++
      from = await real($)
      fast = forks < BEATS
    }
  })
  on('store.get', async ($, e, next) => {
    if (next.origin.plugin !== 'cachebeat') return next(e)
    if (e.key === 'settings') return { value: PINNED }
    if (e.key === 'folders') return { value: {} }
    return next(e) // conversation records, customs, prunedAt and Stats pass through
  })
  // a settings change would write settings built from PINNED, and folders rebuilt from {}, over the person's own
  on('store.set', async ($, e, next) => (next.origin.plugin === 'cachebeat' && KEPT.includes(e.key) ? { value: undefined } : next(e)))
  on('store.delete', async ($, e, next) => (next.origin.plugin === 'cachebeat' && KEPT.includes(e.key) ? { value: undefined } : next(e)))
}
""",
}


def build(root: Path) -> dict[str, str]:
    """Writes the mod and a copy of HEAD under root. Loading a plugin folder regenerates its types, so the checkout itself is never loaded."""
    mod, plugin = root / 'clock', root / 'plugin'
    for name, text in CLOCK_MOD.items():
        (mod / name).parent.mkdir(parents=True, exist_ok=True)
        (mod / name).write_text(text)
    plugin.mkdir()
    archive = subprocess.run(['git', 'archive', 'HEAD'], capture_output=True, check=True).stdout
    subprocess.run(['tar', '-x', '-C', plugin], input=archive, check=True)
    return {'CACHEBEAT_DEMO_CLOCK': str(mod), 'CACHEBEAT_DEMO_PLUGIN': str(plugin)}


def record() -> None:
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['vhs', str(TAPE)], check=True, env={**os.environ, **build(Path(d))})


def launch() -> None:
    """For a launch by hand: the tape's own command, so the two can't drift. The folders are kept."""
    folders = build(Path(tempfile.mkdtemp(prefix='cachebeat-demo-')))
    line = next(l for l in TAPE.read_text().splitlines() if l.startswith('Type `') and 'claude --resume' in l)
    command = line[len('Type `'):line.rindex('`')]
    for name, path in folders.items():
        command = command.replace(f'"${name}"', shlex.quote(path))
    print(command)


def probe(entry: str) -> str:
    return subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', entry, '-of', 'csv=p=0', str(RAW)],
                          capture_output=True, text=True, check=True).stdout.strip()


def status() -> list[tuple[float, int | None]]:
    """Reads the status line every half second: the highest beat count a matching line shows, or None while there is none.
    The /cachebeat 3h reply is a matching line too, with no count: the highest is the turn line's."""
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(RAW), '-vf', f'fps={FPS},crop=iw:ih*{1 - BOTTOM}:0:0', f'{d}/%05d.png'], check=True)
        frames = sorted(Path(d).glob('*.png'))
        env = {**os.environ, 'OMP_THREAD_LIMIT': '1'}  # one thread each, as the pool runs them side by side
        with ThreadPoolExecutor() as pool:
            texts = list(pool.map(lambda f: subprocess.run(['tesseract', str(f), '-', '--psm', '6'], capture_output=True, text=True, env=env).stdout, frames))
    out = []
    for i, text in enumerate(texts):
        lines = [l for l in text.splitlines() if ('next beat in' in l or 'kept warm' in l) and 'cachebeat' not in l]
        counts = [int(m.group(1)) if (m := re.search(r'kept warm\s*\S?(\d+)', l)) else 0 for l in lines]
        out.append((i / FPS, max(counts) if counts else None))
    return out


def plan(seen: list[tuple[float, int | None]], duration: float) -> list[tuple[float, float, float, str | None]]:
    """(start, end, speed, caption) on the recording's clock: fast and captioned from the status line's
    first appearance to the last beat, each beat at full speed, and the payoff caption over the last FINAL seconds."""
    start = next(t for t, n in seen if n is not None) + SETTLE
    # the line is unreadable for a moment as a beat lands ("next beat due now" matches nothing), so a count is compared
    # with the last one read, not with the frame before it
    beats, last = [], None
    for t, n in seen:
        if n is None:
            continue
        if last is not None and n > last:
            beats.append(t)
        last = n
    beats = beats[:2]
    parts, t = [(0.0, start, 1, None)], start
    for x in beats:
        parts.append((t, x - LEAD, FF, IDLE))
        parts.append((x - LEAD, x + HOLD, 1, None))
        t = x + HOLD
    # the payoff reads ×2 again, so no beat marks it: the tape's closing hold is cut off by time
    if BACK:
        parts.append((t, duration - FINAL, 1, None))
        t = duration - FINAL
    parts.append((t, duration, 1, f'back {BACK} later · cache still warm' if BACK else None))
    return parts


def render(parts: list[tuple[float, float, float, str | None]]) -> None:
    w, h = map(int, probe('stream=width,height').split(','))
    inner = MARGIN + PADDING
    row, cell = (h - 2 * inner) / ROWS, (w - 2 * inner) / COLS
    # the prompt row, 4th from the card's bottom, right-aligned inside the input box's edge
    caption = (f"drawtext=fontfile='{FONT}':fontsize={CAPTION_SIZE}:fontcolor=0x9198a1"
               f":x=w-tw-{inner + 2 * cell:.0f}:y={h - inner - 4 * row:.1f}+({row:.1f}-th)/2:text='{{}}'")
    graph = [f'[0:v]split={len(parts)}' + ''.join(f'[s{i}]' for i in range(len(parts)))]
    for i, (a, b, speed, text) in enumerate(parts):
        graph.append(f'[s{i}]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{speed}' + (',' + caption.format(text) if text else '') + f'[p{i}]')
    graph.append(''.join(f'[p{i}]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=1:a=0,fps=12,format=rgba[v]')
    # the margin goes transparent by geometry, not by colour: yuv420p shifts the margin's colour and rings inside the card
    graph.append('[1:v]format=gray[m];[v][m]alphamerge,split[x][y]')
    graph.append('[x]palettegen=max_colors=128:stats_mode=full:reserve_transparent=1[pal]')  # diff mode greys the orange line
    graph.append('[y][pal]paletteuse=dither=none:diff_mode=rectangle:alpha_threshold=128')  # flat terminal colors: no dither keeps text crisp
    length = sum((b - a) / speed for a, b, speed, _ in parts)
    m, r, x1, y1 = MARGIN, RADIUS, w - MARGIN - 1, h - MARGIN - 1
    inside = (f"if(between(X,{m},{x1})*between(Y,{m},{y1}),"
              f"if(gt(hypot(max(0,max({m + r}-X,X-{x1 - r})),max(0,max({m + r}-Y,Y-{y1 - r}))),{r}),0,255),0)")
    with tempfile.TemporaryDirectory() as d:
        mask, full = f'{d}/mask.png', f'{d}/full.gif'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', f"color=black:s={w}x{h}:d=1,format=gray,geq=lum='{inside}'",
                        '-frames:v', '1', mask], check=True)
        # the mask is bounded: unbounded, palettegen never sees an end
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(RAW), '-loop', '1', '-t', f'{length:.3f}', '-i', mask,
                        '-filter_complex', ';'.join(graph), full], check=True)
        # ffmpeg writes whole frames once there is alpha: ImageMagick keeps only what changes. No -fuzz: any of it leaves
        # faint ghosts of text that scrolls away
        subprocess.run(['magick', full, '-coalesce', '-layers', 'Optimize', str(GIF)], check=True)


if __name__ == '__main__':
    if '--launch' in sys.argv:
        launch()
        sys.exit()
    if '--skip-record' not in sys.argv:
        if 'CACHEBEAT_DEMO_RAW' in os.environ:
            sys.exit('CACHEBEAT_DEMO_RAW is read with --skip-record only: a recording always writes assets/demo-raw.mp4')
        record()
    parts = plan(status(), float(probe('format=duration')))
    for a, b, speed, text in parts:
        print(f'{a:6.1f}–{b:6.1f}s  ×{speed:.1f}{f"  {text}" if text else ""}')
    render(parts)
    print(f'wrote {GIF} ({GIF.stat().st_size / 1e6:.2f} MB, {sum((b - a) / s for a, b, s, _ in parts):.1f}s)')
