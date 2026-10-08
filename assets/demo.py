"""Records assets/demo.gif with VHS: 50 idle minutes pass in seconds, and beats land on their own.

Needs vhs, ffmpeg and tesseract. From the repo root, point it at a session with a few turns:

    CACHEBEAT_DEMO_DIR=<the session's folder> CACHEBEAT_DEMO_SESSION=<session id> python3 assets/demo.py

The session also loads a small mod, written to a temporary folder, that runs cachebeat's clock
300× faster from its first beat timer until two beats have landed. Each beat is still a real request.
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
SETTINGS_RAW = Path('assets/demo-raw-settings.mp4')  # the settings menu, recorded larger and scaled to RAW's size
GIF = Path('assets/demo.gif')
FONT = subprocess.run(['fc-match', '-f', '%{file}', 'FiraCode Nerd Font Mono:style=Bold'], capture_output=True, text=True).stdout
BOTTOM = 100  # px at the bottom, the hint line, left out of what is read
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
const BEATS = 2 // after this many, the clock runs at real speed again
let from = 0 // real time the fast stretch began
let ahead = 0 // how far cachebeat's clock runs ahead of the real one
let timers = 0 // beat timers cachebeat has set
let phase: 'before' | 'fast' | 'after' = 'before'
const real = async ($: EngineInterface) => await $.clock.now() // this plugin's own reads stay real
const shown = (t: number) => (phase === 'fast' ? from + ahead + (t - from) * SPEED : t + ahead)

export const register: Register = on => {
  on('clock.now', async ($, e, next) => {
    const r = await next(e)
    return next.origin.plugin === 'cachebeat' && 'value' in r && r.value !== undefined ? { value: shown(r.value) } : r
  })
  on('clock.after', async ($, e, next) => {
    if (next.origin.plugin !== 'cachebeat' || e.ms < 30 * 60_000) return next(e)
    timers++
    if (phase === 'before') (from = await real($)), (phase = 'fast')
    else if (phase === 'fast' && timers > BEATS) {
      const t = await real($)
      ahead = shown(t) - t
      phase = 'after'
    }
    return next(phase === 'fast' ? { ms: e.ms / SPEED } : e)
  })
}
""",
}


def record() -> None:
    with tempfile.TemporaryDirectory() as mod:
        for name, text in CLOCK_MOD.items():
            (Path(mod) / name).parent.mkdir(parents=True, exist_ok=True)
            (Path(mod) / name).write_text(text)
        subprocess.run(['vhs', 'assets/demo.tape'], check=True, env={**os.environ, 'CACHEBEAT_DEMO_CLOCK': mod})
    subprocess.run(['vhs', 'assets/demo-settings.tape'], check=True)


def status() -> list[tuple[float, int | None]]:
    """Reads the status line every half second: the beat count it shows, or None while there is no status line."""
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(RAW), '-vf', f'fps={FPS},crop=iw:ih-{BOTTOM}:0:0', f'{d}/%05d.png'], check=True)
        frames = sorted(Path(d).glob('*.png'))
        env = {**os.environ, 'OMP_THREAD_LIMIT': '1'}  # one thread each, as the pool runs them side by side
        with ThreadPoolExecutor() as pool:
            texts = list(pool.map(lambda f: subprocess.run(['tesseract', str(f), '-', '--psm', '6'], capture_output=True, text=True, env=env).stdout, frames))
    out = []
    for i, text in enumerate(texts):
        line = next((l for l in text.splitlines() if ('next beat in' in l or 'kept warm' in l) and 'cachebeat' not in l), None)
        count = re.search(r'kept warm\s*\S?(\d+)', line) if line else None
        out.append((i / FPS, None if line is None else int(count.group(1)) if count else 0))
    return out


def plan(seen: list[tuple[float, int | None]]) -> list[tuple[float, float | None, float, bool]]:
    """(start, end, speed, glitch) on the recording's clock: fast and glitched from the status line's
    first appearance to the last beat, each beat at full speed."""
    start = next(t for t, n in seen if n is not None) + SETTLE
    beats = [t for (_, a), (t, b) in zip(seen, seen[1:]) if a is not None and b is not None and b > a][:2]
    parts, t = [(0.0, start, 1, False)], start
    for x in beats:
        parts.append((t, x - LEAD, FF, True))
        parts.append((x - LEAD, x + HOLD, 1, False))
        t = x + HOLD
    parts.append((t, None, 1, False))
    return parts


def render(parts: list[tuple[float, float | None, float, bool]]) -> None:
    glitch = (f"rgbashift=rh=-6:bh=6:rv=2,drawgrid=w=iw:h=4:t=1:c=black@0.35"
              f",drawtext=fontfile='{FONT}':fontsize=44:fontcolor=0x1e1e2e:box=1:boxcolor=0xf5c2e7:boxborderw=14"
              f":x=(w-tw)/2:y=h*0.18:text='▶▶ FAST-FORWARD'"
              f",drawtext=fontfile='{FONT}':fontsize=24:fontcolor=0xf5c2e7:box=1:boxcolor=0x1e1e2e@0.9:boxborderw=8"
              f":x=(w-tw)/2:y=h*0.18+88:text='~50 MIN LATER'")
    graph = [f'[0:v]split={len(parts)}' + ''.join(f'[s{i}]' for i in range(len(parts)))]
    for i, (a, b, speed, is_glitch) in enumerate(parts):
        end = '' if b is None else f':end={b}'
        graph.append(f'[s{i}]trim=start={a}{end},setpts=(PTS-STARTPTS)/{speed}' + (f',{glitch}' if is_glitch else '') + f'[p{i}]')
    graph.append(''.join(f'[p{i}]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=1:a=0,fps=12,format=yuv420p[main]')
    w, h = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
                           str(RAW)], capture_output=True, text=True, check=True).stdout.strip().split(',')
    graph.append(f'[1:v]scale={w}:{h}:flags=lanczos,setsar=1,fps=12,format=yuv420p[menu]')
    graph.append('[main][menu]xfade=transition=fade:duration=0.4:offset=' + str(round(length(parts) - 0.4, 2)) + ',split[x][y]')
    graph.append('[x]palettegen=max_colors=128:stats_mode=diff[pal]')
    graph.append('[y][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(RAW), '-i', str(SETTINGS_RAW), '-filter_complex', ';'.join(graph), str(GIF)], check=True)


def length(parts: list[tuple[float, float | None, float, bool]]) -> float:
    """How long the main recording runs once its parts are sped up."""
    end = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(RAW)],
                               capture_output=True, text=True, check=True).stdout)
    return sum(((end if b is None else b) - a) / speed for a, b, speed, _ in parts)


if __name__ == '__main__':
    if '--skip-record' not in sys.argv:
        record()
    parts = plan(status())
    for a, b, speed, is_glitch in parts:
        print(f'{a:6.1f}–{"end" if b is None else f"{b:.1f}":>6}s  ×{speed:.1f}{"  glitch" if is_glitch else ""}')
    render(parts)
    print(f'wrote {GIF} ({GIF.stat().st_size / 1e6:.1f} MB)')
