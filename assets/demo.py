"""Records assets/demo.gif with VHS: a cold-cache question, then 50 idle minutes pass in seconds and beats land on their own.

Needs vhs, ffmpeg and tesseract. From the repo root, point it at a session of 20k tokens or more
that last answered more than an hour ago (the guard asks on a cold cache), 2-6h ago to read well:

    CACHEBEAT_DEMO_DIR=<the session's folder> CACHEBEAT_DEMO_SESSION=<session id> python3 assets/demo.py

The recording forks that session, so its transcript is left as it was. The fork loads this checkout's
HEAD (a scratch copy of it, not the working tree) beside a small mod, written to a temporary folder,
and both installed copies of cachebeat are switched off. The mod runs cachebeat's clock 300× faster from
its first one-minute step after /cachebeat 2h until its second beat has been answered. Each beat is still
a real request, run at real speed. The model is sonnet; CACHEBEAT_DEMO_MODEL overrides it, for a dry run.
Pass --skip-record to re-render the GIF from the last recording.
"""
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


RAW = Path('assets/demo-raw.mp4')
GIF = Path('assets/demo.gif')
FONT = subprocess.run(['fc-match', '-f', '%{file}', 'FiraCode Nerd Font Mono:style=Bold'], capture_output=True, text=True).stdout
BOTTOM = 0.18  # the share of the frame at the bottom, the hint line, left out of what is read
FPS = 2  # how often the status line is read
LEAD, HOLD = 0.6, 3.0  # seconds each beat plays at full speed, before and after
SETTLE = 2.5  # seconds the status line shows at full speed before the first fast-forward
FF = 3  # how much faster the idle stretches play

CLOCK_MOD = {
    '.claude-plugin/plugin.json': '{ "name": "cachebeat-demo-clock", "version": "0.0.0", "description": "Runs cachebeat\'s clock fast for the demo", "license": "MIT" }',
    'hooks/hooks.json': '{ "modules": ["./register.ts"] }',
    'hooks/register.ts': """
import type { EngineInterface, Register } from 'claude-code'

const SPEED = 300
const STEP = 60_000 // cachebeat's step timer: the first one after /cachebeat 2h starts the fast stretch
const BEATS = 2 // once this many beats have been answered, the clock runs at real speed again
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
  // only the short waits: the cold question's close (5m) and the keep-alive's long ones stay as they are
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
}
""",
}


def record() -> None:
    """Loading a plugin folder regenerates its types, so the checkout itself is never loaded: HEAD is extracted into a scratch folder."""
    with tempfile.TemporaryDirectory() as mod, tempfile.TemporaryDirectory() as plugin:
        for name, text in CLOCK_MOD.items():
            (Path(mod) / name).parent.mkdir(parents=True, exist_ok=True)
            (Path(mod) / name).write_text(text)
        archive = subprocess.run(['git', 'archive', 'HEAD'], capture_output=True, check=True).stdout
        subprocess.run(['tar', '-x', '-C', plugin], input=archive, check=True)
        env = {**os.environ, 'CACHEBEAT_DEMO_CLOCK': mod, 'CACHEBEAT_DEMO_PLUGIN': plugin}
        subprocess.run(['vhs', 'assets/demo.tape'], check=True, env=env)


def status() -> list[tuple[float, int | None]]:
    """Reads the status line every half second: the highest beat count a matching line shows, or None while there is none.
    The /cachebeat 2h reply is a matching line too, with no count: the highest is the turn line's."""
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


def plan(seen: list[tuple[float, int | None]]) -> list[tuple[float, float | None, float, bool]]:
    """(start, end, speed, glitch) on the recording's clock: fast and glitched from the status line's
    first appearance to the last beat, each beat at full speed."""
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
    parts, t = [(0.0, start, 1, False)], start
    for x in beats:
        parts.append((t, x - LEAD, FF, True))
        parts.append((x - LEAD, x + HOLD, 1, False))
        t = x + HOLD
    parts.append((t, None, 1, False))
    return parts


def render(parts: list[tuple[float, float | None, float, bool]]) -> None:
    h = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=height', '-of', 'csv=p=0',
                            str(RAW)], capture_output=True, text=True, check=True).stdout)
    k = h / 560  # the badge is sized for a 560-row frame, and scales with it
    px = lambda n: round(n * k)
    glitch = (f"rgbashift=rh=-{px(6)}:bh={px(6)}:rv={px(2)},drawgrid=w=iw:h={px(4)}:t={px(1)}:c=black@0.35"
              f",drawtext=fontfile='{FONT}':fontsize={px(44)}:fontcolor=0x1e1e2e:box=1:boxcolor=0xf5c2e7:boxborderw={px(14)}"
              f":x=(w-tw)/2:y=h*0.18:text='▶▶ FAST-FORWARD'"
              f",drawtext=fontfile='{FONT}':fontsize={px(24)}:fontcolor=0xf5c2e7:box=1:boxcolor=0x1e1e2e@0.9:boxborderw={px(8)}"
              f":x=(w-tw)/2:y=h*0.18+{px(88)}:text='~50 MIN LATER'")
    graph = [f'[0:v]split={len(parts)}' + ''.join(f'[s{i}]' for i in range(len(parts)))]
    for i, (a, b, speed, is_glitch) in enumerate(parts):
        end = '' if b is None else f':end={b}'
        graph.append(f'[s{i}]trim=start={a}{end},setpts=(PTS-STARTPTS)/{speed}' + (f',{glitch}' if is_glitch else '') + f'[p{i}]')
    graph.append(''.join(f'[p{i}]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=1:a=0,fps=12,split[x][y]')
    graph.append('[x]palettegen=max_colors=128:stats_mode=diff[pal]')
    graph.append('[y][pal]paletteuse=dither=none:diff_mode=rectangle')  # flat terminal colors: no dither keeps text crisp
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(RAW), '-filter_complex', ';'.join(graph), str(GIF)], check=True)


if __name__ == '__main__':
    if '--skip-record' not in sys.argv:
        record()
    parts = plan(status())
    for a, b, speed, is_glitch in parts:
        print(f'{a:6.1f}–{"end" if b is None else f"{b:.1f}":>6}s  ×{speed:.1f}{"  glitch" if is_glitch else ""}')
    render(parts)
    print(f'wrote {GIF} ({GIF.stat().st_size / 1e6:.1f} MB)')
