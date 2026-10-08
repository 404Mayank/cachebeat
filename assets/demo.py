"""Records assets/demo.gif with VHS, fast-forwarding the idle stretches so beats land on their own.

Needs vhs, ffmpeg, and Python with Pillow. From the repo root, point it at a session with a few turns:

    CACHEBEAT_DEMO_DIR=<the session's folder> CACHEBEAT_DEMO_SESSION=<session id> python3 assets/demo.py

Pass --skip-record to re-render the GIF from the last recording.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

RAW = Path('assets/demo-raw.mp4')
GIF = Path('assets/demo.gif')
FONT = subprocess.run(['fc-match', '-f', '%{file}', 'FiraCode Nerd Font Mono:style=Bold'], capture_output=True, text=True).stdout
HINT_ROWS = 110  # px at the bottom where the heart animates; left out when looking for changes
STILL = 4.0  # seconds without a change before a stretch is fast-forwarded
LEAD, HOLD = 0.4, 1.6  # seconds played at full speed before and after each change
GAP = 1.0  # seconds each fast-forwarded stretch lasts in the GIF


def changes() -> list[float]:
    """When the screen above the hint line changes: typing, countdown ticks, beats."""
    with tempfile.TemporaryDirectory() as d:
        fps = 4
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(RAW),
                        '-vf', f'fps={fps},crop=iw:ih-{HINT_ROWS}:0:0,format=gray', f'{d}/%05d.png'], check=True)
        frames = sorted(Path(d).glob('*.png'))
        found, prev = [], Image.open(frames[0])
        for i, f in enumerate(frames[1:], 1):
            cur = Image.open(f)
            if ImageChops.difference(prev, cur).point(lambda v: 255 if v > 64 else 0).getbbox():  # past encoding noise
                found.append(i / fps)
            prev = cur
        return found


def render(marks: list[float]) -> None:
    # (start, end, speed) on the recording's clock: each still stretch between two changes is fast-forwarded
    parts, t = [], 0.0
    for a, b in zip(marks, marks[1:]):
        if b - a >= STILL:
            parts.append((t, a + HOLD, 1))
            parts.append((a + HOLD, b - LEAD, (b - LEAD - a - HOLD) / GAP))
            t = b - LEAD
    parts.append((t, None, 1))

    badge = (f"drawtext=fontfile='{FONT}':fontsize=20:fontcolor=0x1e1e2e:box=1:boxcolor=0xf5c2e7:boxborderw=8"
             f":x=w-tw-24:y=20:text='▶▶ fast-forward'")
    graph = [f'[0:v]split={len(parts)}' + ''.join(f'[s{i}]' for i in range(len(parts)))]
    for i, (a, b, speed) in enumerate(parts):
        end = '' if b is None else f':end={b}'
        graph.append(f'[s{i}]trim=start={a}{end},setpts=(PTS-STARTPTS)/{speed}' + (f',{badge}' if speed > 1 else '') + f'[p{i}]')
    graph.append(''.join(f'[p{i}]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=1:a=0,fps=15,split[x][y]')
    graph.append('[x]palettegen=stats_mode=diff[pal]')
    graph.append('[y][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(RAW), '-filter_complex', ';'.join(graph), str(GIF)], check=True)
    print('fast-forwarded', ', '.join(f'{a:.0f}–{b:.0f}s' for a, b, s in parts if s > 1))


if __name__ == '__main__':
    if '--skip-record' not in sys.argv:
        subprocess.run(['vhs', 'assets/demo.tape'], check=True)
    render(changes())
    print(f'wrote {GIF} ({GIF.stat().st_size / 1e6:.1f} MB)')
