"""Builds every form of the cachebeat logo into assets/logo/:

    python3 assets/logo/src/build.py          # the SVGs: needs only Python 3
    python3 assets/logo/src/build.py --png    # and the PNGs: needs Chrome or Chromium (set CHROME to its
                                              # path if it isn't found) and Pillow

The knobs are the constants at the top. Everything is drawn in one set of units (the pixels of the
image the logo was traced from); each form's viewBox frames the part it shows.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True  # keep the repo free of __pycache__
import glyphs  # noqa: E402
from beat import bar_centreline, bar_outline, beat_path, heart_path  # noqa: E402
from geometry import Plate, num  # noqa: E402

OUT = Path(__file__).resolve().parent.parent

# ---- the knobs -------------------------------------------------------------------------------------
# The three plates: the top one's centre, its half-width and half-height on screen, its corner radius,
# and the drop from one layer to the next.
CX, CY, PLATE_W, PLATE_H, CORNER, LAYER_GAP = 372.7, 336.2, 152.7, 74.0, 23.4, 51

# The middle layer turning into the heartbeat. The beat starts at BEAT_X on the plate's right-front
# edge. Before that the bar keeps its full width BAR_W; over the last TAPER_LEN it eases down to the
# beat's width BEAT_W and warms from glass grey to orange. A bigger TAPER_LEN is a longer, softer change.
BEAT_X, TAPER_LEN, BAR_W, BEAT_W = 412.0, 65.0, 24.0, 9.0

# The heart, on the stack's right-front face (see beat.heart_path), and where the beat's line ends,
# tucked under it.
HEART = dict(cx=508, cy=395.5, size=64, tilt=21, fore=0.88, persp=0.18)
HEART_TAIL_X = 490.0

# The prompt lying on the top plate: its size.
PROMPT_SCALE = 0.8

# The wordmark: its ink runs from WORD_LEFT to WORD_RIGHT, with the h standing WORD_HEIGHT above the
# baseline WORD_BASE.
WORD_LEFT, WORD_RIGHT, WORD_BASE, WORD_HEIGHT = 586.0, 1438.0, 472.0, 123.0

# The name and the social card's line live in glyphs.SOURCES, next to the fonts they're set in.
NAME, TAGLINE = glyphs.SOURCES['wordmark'][1], glyphs.SOURCES['tagline'][1]

# Colours
CREAM, CREAM_DEEP, PEACH = '#FBF3EC', '#E9D3C3', '#FFD3B2'  # the top plate, lit warmer near the heart
PROMPT_INK = '#F8ECE2'
ORANGE, ORANGE_HOT, GLOW = '#FF8E55', '#FFB278', '#FF7436'   # the heartbeat's glow, inner to outer
CACHE_INK = '#F4EDE9'                                        # "cache"
BEAT_INK = ('#FCA877', '#F98459', '#F67F59')                 # "beat", left to right
CARD = ('#1A1B1F', '#0D0E11')                                # the dark card, top to bottom
TAGLINE_INK = '#A7A19C'

# The middle bar's colours: (how far back from the beat's start, as a fraction of TAPER_LEN; colour;
# opacity). Its glass grey to the left of all of these is set in defs().
BAR_FILL = [(.845, '#3C3D42', 1), (.675, '#47403E', 1), (.474, '#6E4A3D', 1), (.266, '#B0603F', 1),
            (.114, '#E7784B', 1), (0, '#FF8A50', 1)]
BAR_RIM = [(.845, '#5E5F65', 1), (.572, '#6A5550', 1), (.269, '#B86A4C', .55), (0, '#FF8A50', 0)]
IGNITE = .508  # the glow that lights the bar's last stretch, as a fraction of TAPER_LEN

# ---- the drawing -----------------------------------------------------------------------------------
LID, MID, BOT = (Plate(CX, CY + k*LAYER_GAP, PLATE_W, PLATE_H, CORNER) for k in range(3))
_BAR = bar_centreline(MID, BEAT_X)
BAR = bar_outline(_BAR, BEAT_X - TAPER_LEN, BEAT_X, BAR_W, BEAT_W)
BEAT = beat_path(MID, BEAT_X, HEART_TAIL_X)
HEART_D = heart_path(**HEART)
BAR_X0 = 222  # the bar's colours run from here (just left of its end) to BEAT_X
WORD, WORD_LEFTS = glyphs.word('wordmark', NAME, WORD_LEFT, WORD_RIGHT, WORD_BASE, WORD_HEIGHT)


def prompt():
    """'>_' drawn upright, then laid flat on the top plate: its top recedes, so it's foreshortened like
    the plate. Across, the '_' sits on the plate's centre line, the '>' to its left; down, the pair is
    centred on the plate."""
    h, tv, f = 31, 16, 2.2  # the chevron's half-height, arm thickness (measured upright), flat tip
    chevron = (f'M0 {num(-h - tv/2)}L{num(h + tv/2 - f)} {num(-f)}L{num(h + tv/2 - f)} {num(f)}L0 {num(h + tv/2)}'
               f'L0 {num(h - tv/2)}L{num(h - tv/2)} 0L0 {num(-h + tv/2)}Z')
    s, ky = PROMPT_SCALE, LID.ky
    gx, gy = 61.5, 15  # the '_'s centre across (x 45..78), and the middle of the pair's extent down (y -39..69)
    return (f'<g transform="translate({num(CX - gx*s)} {num(CY - gy*s*ky)}) scale({s} {num(s*ky)})">'
            f'<path d="{chevron}" stroke-width="2.2" stroke-linejoin="round"/>'
            f'<rect x="45" y="50.5" width="33" height="18.5" rx="5"/></g>')


def frac(v):
    t = f'{v:.3f}'.rstrip('0').rstrip('.')
    return t[1:] if t.startswith('0.') else t


def bar_stops(first, stops):
    out = f'<stop offset="0" stop-color="{first}"/>'
    for back, colour, opacity in stops:
        off = (BEAT_X - back*TAPER_LEN - BAR_X0)/(BEAT_X - BAR_X0)
        out += f'<stop offset="{frac(off)}" stop-color="{colour}"' + ('' if opacity == 1 else f' stop-opacity="{frac(opacity)}"') + '/>'
    return out


def defs(uid, wordmark=False):
    blur = 'color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="150" y="200" width="460" height="400"'
    word = (f'''
    <linearGradient id="{uid}-beat" gradientUnits="userSpaceOnUse" x1="{num(WORD_LEFTS[len('cache')])}" y1="0" x2="{num(WORD_RIGHT)}" y2="0">
      <stop offset="0" stop-color="{BEAT_INK[0]}"/><stop offset=".6" stop-color="{BEAT_INK[1]}"/><stop offset="1" stop-color="{BEAT_INK[2]}"/></linearGradient>'''
            if wordmark else '')
    return f'''<defs>
    <linearGradient id="{uid}-lid" gradientUnits="userSpaceOnUse" x1="240" y1="270" x2="510" y2="410">
      <stop offset="0" stop-color="{CREAM}"/><stop offset=".55" stop-color="#FDECE0"/><stop offset="1" stop-color="{PEACH}"/></linearGradient>
    <linearGradient id="{uid}-side" gradientUnits="userSpaceOnUse" x1="240" y1="0" x2="510" y2="0">
      <stop offset="0" stop-color="#CDB9AC"/><stop offset=".6" stop-color="{CREAM_DEEP}"/><stop offset="1" stop-color="#F2B38E"/></linearGradient>
    <linearGradient id="{uid}-rim-mid" gradientUnits="userSpaceOnUse" x1="{BAR_X0}" y1="0" x2="{num(BEAT_X)}" y2="0">
      {bar_stops('#6E6F75', BAR_RIM)}</linearGradient>
    <linearGradient id="{uid}-fill-mid" gradientUnits="userSpaceOnUse" x1="{BAR_X0}" y1="0" x2="{num(BEAT_X)}" y2="0">
      {bar_stops('#48494E', BAR_FILL)}</linearGradient>
    <linearGradient id="{uid}-ignite" gradientUnits="userSpaceOnUse" x1="{num(BEAT_X - IGNITE*TAPER_LEN)}" y1="0" x2="{num(BEAT_X + 2)}" y2="0">
      <stop offset="0" stop-color="#FF7A3D" stop-opacity="0"/><stop offset="1" stop-color="#FF7A3D"/></linearGradient>
    <linearGradient id="{uid}-rim-bot" gradientUnits="userSpaceOnUse" x1="222" y1="0" x2="524" y2="0">
      <stop offset="0" stop-color="#5E5F65"/><stop offset=".45" stop-color="#3C3D42"/><stop offset=".72" stop-color="#5A3F35"/><stop offset="1" stop-color="#E07B57"/></linearGradient>
    <linearGradient id="{uid}-fill-bot" gradientUnits="userSpaceOnUse" x1="222" y1="0" x2="524" y2="0">
      <stop offset="0" stop-color="#3F4045"/><stop offset=".45" stop-color="#26272B"/><stop offset=".72" stop-color="#3B2B26"/><stop offset="1" stop-color="#B55E42"/></linearGradient>
    <linearGradient id="{uid}-ecg" gradientUnits="userSpaceOnUse" x1="{num(BEAT_X)}" y1="0" x2="492" y2="0">
      <stop offset="0" stop-color="#FF8A50"/><stop offset=".6" stop-color="#FFA061"/><stop offset="1" stop-color="#FFB06E"/></linearGradient>
    <radialGradient id="{uid}-heart" cx=".36" cy=".42" r=".8">
      <stop offset="0" stop-color="#FFC995"/><stop offset=".55" stop-color="#FFB06F"/><stop offset="1" stop-color="#FF9152"/></radialGradient>
    <radialGradient id="{uid}-spill" gradientUnits="userSpaceOnUse" cx="488" cy="420" r="150">
      <stop offset="0" stop-color="#FF7A3D" stop-opacity=".42"/><stop offset=".45" stop-color="#FF6A30" stop-opacity=".16"/><stop offset="1" stop-color="#FF6A30" stop-opacity="0"/></radialGradient>{word}
    <filter id="{uid}-blur-s" {blur}><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="{uid}-blur-m" {blur}><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="{uid}-blur-l" {blur}><feGaussianBlur stdDeviation="18"/></filter>
    <path id="{uid}-ecg-p" d="{BEAT}"/>
    <path id="{uid}-heart-p" d="{HEART_D}"/>
  </defs>'''


def mark(uid):
    beat = (f'<use href="#{uid}-ecg-p" fill="none" stroke-width="{num(BEAT_W)}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<use href="#{uid}-heart-p" stroke="none"/>')
    (ex, ey), _, _ = MID.right_edge()
    end = _BAR[-1]
    return f'''
  <!-- the light the heart throws on everything near it -->
  <circle cx="488" cy="420" r="150" fill="url(#{uid}-spill)"/>
  <!-- the bottom layer: a glass bar, lit by the heart on the right -->
  <path d="{BOT.front()}" fill="none" stroke="url(#{uid}-rim-bot)" stroke-width="25" stroke-linecap="round"/>
  <path d="{BOT.front()}" fill="none" stroke="url(#{uid}-fill-bot)" stroke-width="20.5" stroke-linecap="round"/>
  <!-- the middle layer: a glass bar that thins and warms into the heartbeat -->
  <path d="{BAR}" fill="url(#{uid}-fill-mid)" stroke="url(#{uid}-rim-mid)" stroke-width="2.2" stroke-linejoin="round"/>
  <!-- the top layer: a cream plate with a thicker front edge for its depth, and a soft bloom -->
  <path d="{LID.front(to_extremes=True)}" transform="translate(0 2.6)" fill="none" stroke="url(#{uid}-side)" stroke-width="12" stroke-linecap="round"/>
  <path d="{LID.outline()}" fill="none" stroke="url(#{uid}-lid)" stroke-width="12" filter="url(#{uid}-blur-s)" opacity=".45"/>
  <path d="{LID.outline()}" fill="none" stroke="url(#{uid}-lid)" stroke-width="12"/>
  <g fill="{PROMPT_INK}" stroke="{PROMPT_INK}">{prompt()}</g>
  <!-- the heartbeat: the bar lighting up, a wide glow, a tight bloom, then the line and the heart -->
  <path d="M{num(ex)} {num(ey)}L{num(end[0])} {num(end[1])}" stroke="url(#{uid}-ignite)" stroke-width="14" stroke-linecap="round" filter="url(#{uid}-blur-m)" opacity=".7"/>
  <g fill="{GLOW}" stroke="{GLOW}" filter="url(#{uid}-blur-l)" opacity=".55">{beat}</g>
  <g fill="{ORANGE}" stroke="{ORANGE}" filter="url(#{uid}-blur-m)" opacity=".75">{beat}</g>
  <g fill="{ORANGE_HOT}" stroke="{ORANGE_HOT}" filter="url(#{uid}-blur-s)" opacity=".8">{beat}</g>
  <use href="#{uid}-ecg-p" fill="none" stroke="url(#{uid}-ecg)" stroke-width="{num(BEAT_W)}" stroke-linecap="round" stroke-linejoin="round"/>
  <use href="#{uid}-heart-p" fill="url(#{uid}-heart)"/>'''


def wordmark(uid):
    split = len('cache')  # "cache" in cream, "beat" in the warm gradient
    return f'''
  <path d="{''.join(WORD[:split])}" fill="{CACHE_INK}"/>
  <path d="{''.join(WORD[split:])}" fill="url(#{uid}-beat)"/>'''


def card(uid, x, y, w, h, r):
    """The ground that makes it universal: a dark card, with a soft shadow for light pages."""
    return f'''<defs>
    <linearGradient id="{uid}-card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{CARD[0]}"/><stop offset="1" stop-color="{CARD[1]}"/></linearGradient>
    <linearGradient id="{uid}-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
    <filter id="{uid}-shadow" x="-20%" y="-20%" width="140%" height="160%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="{num(h*0.045)}" result="b1"/><feOffset in="b1" dy="{num(h*0.035)}" result="o1"/>
      <feComponentTransfer in="o1" result="s1"><feFuncA type="linear" slope=".38"/></feComponentTransfer>
      <feGaussianBlur in="SourceAlpha" stdDeviation="{num(h*0.008)}" result="b2"/><feOffset in="b2" dy="{num(h*0.006)}" result="o2"/>
      <feComponentTransfer in="o2" result="s2"><feFuncA type="linear" slope=".3"/></feComponentTransfer>
      <feMerge><feMergeNode in="s1"/><feMergeNode in="s2"/></feMerge>
    </filter>
    <clipPath id="{uid}-clip"><rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" rx="{num(r)}"/></clipPath>
  </defs>
  <rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" rx="{num(r)}" fill="#000" filter="url(#{uid}-shadow)"/>
  <rect x="{num(x)}" y="{num(y)}" width="{num(w)}" height="{num(h)}" rx="{num(r)}" fill="url(#{uid}-card)"/>'''


def edge(uid, x, y, w, h, r):
    """A faint light edge, so the card holds its shape on dark pages."""
    return f'<rect x="{num(x + 1)}" y="{num(y + 1)}" width="{num(w - 2)}" height="{num(h - 2)}" rx="{num(r - 1)}" fill="none" stroke="url(#{uid}-edge)" stroke-width="2"/>'


NOTE = ('cachebeat: three cache layers; the top one holds the prompt, and the layer below it turns '
        'into a heartbeat that ends in a heart. Built by assets/logo/src/build.py on the dev branch. '
        'Wordmark: Lexend (SIL Open Font License 1.1), as outlines.')


def svg(view, size, body):
    vx, vy, vw, vh = view
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(vx)} {num(vy)} {num(vw)} {num(vh)}" '
            f'width="{size[0]}" height="{size[1]}" role="img" aria-label="cachebeat">\n'
            f'  <!-- {NOTE} -->\n{body}\n</svg>\n')


# ---- the forms -------------------------------------------------------------------------------------
LOCKUP = (156, 196, 1354, 396)  # the mark and the wordmark, with room around them


def logo():
    """The icon: the mark on its dark tile. Works on any background."""
    uid, s = 'cbi', 420
    x, y, r, m = 381 - s/2, 394 - s/2, s*0.225, 34
    body = (card(uid, x, y, s, s, r) + '\n  ' + defs(uid) + f'\n  <g clip-path="url(#{uid}-clip)">'
            + mark(uid) + '\n  </g>\n  ' + edge(uid, x, y, s, s, r))
    return svg((x - m, y - m, s + 2*m, s + 2*m), (256, 256), body)


def logo_wordmark():
    """The mark and the name on a dark card. Works on any background."""
    uid = 'cbw'
    (x, y, w, h), r, m = LOCKUP, 64, 40
    body = (card(uid, x, y, w, h, r) + '\n  ' + defs(uid, wordmark=True) + f'\n  <g clip-path="url(#{uid}-clip)">'
            + mark(uid) + wordmark(uid) + '\n  </g>\n  ' + edge(uid, x, y, w, h, r))
    vw, vh = w + 2*m, h + 2*m + 12
    return svg((x - m, y - m, vw, vh), (560, round(560*vh/vw)), body)


def logo_mark_on_dark():
    """The mark alone, on nothing: for dark backgrounds only."""
    uid = 'cbm'
    return svg((200, 240, 440, 335), (440, 335), defs(uid) + mark(uid))


def logo_wordmark_on_dark():
    """The mark and the name, on nothing: for dark backgrounds only."""
    uid = 'cbd'
    return svg(LOCKUP, LOCKUP[2:], defs(uid, wordmark=True) + mark(uid) + wordmark(uid))


def social_preview():
    """A 1280x640 card for the repository's social preview: the logo and its line on a dark ground."""
    uid, W, H = 'cbp', 1280, 640
    x, y, w, h = LOCKUP
    s = 980/w
    line = glyphs.line('tagline', TAGLINE, W/2, 484, 32)
    body = f'''<defs>
    <radialGradient id="{uid}-ground" gradientUnits="userSpaceOnUse" cx="640" cy="268.8" r="896" gradientTransform="translate(640 268.8) scale(1 .4286) translate(-640 -268.8)">
      <stop offset="0" stop-color="#1B1C20"/><stop offset=".75" stop-color="#0D0E11"/></radialGradient>
  </defs>
  <rect width="{W}" height="{H}" fill="url(#{uid}-ground)"/>
  <g transform="translate({num((W - w*s)/2 - x*s)} {num(132.7 - y*s)}) scale({s:.5f})">
  {defs(uid, wordmark=True)}{mark(uid)}{wordmark(uid)}
  </g>
  <path d="{line}" fill="{TAGLINE_INK}"/>'''
    return svg((0, 0, W, H), (W, H), body)


FORMS = {
    'logo.svg': logo,
    'logo-wordmark.svg': logo_wordmark,
    'logo-mark-on-dark.svg': logo_mark_on_dark,
    'logo-wordmark-on-dark.svg': logo_wordmark_on_dark,
    'social-preview.svg': social_preview,
}
WINDOW_SPARE = 200  # px of window beyond the image, more than the browser keeps for itself
PNGS = {'logo.png': ('logo.svg', 512, 512), 'social-preview.png': ('social-preview.svg', 1280, 640)}


def chrome():
    for c in (os.environ.get('CHROME'), 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'):
        path = c and (shutil.which(c) or (c if Path(c).exists() else None))
        if path:
            return path
    sys.exit('The PNGs need Chrome or Chromium: install one, or set CHROME to its path.')


def rasterize(svg_file, png_file, w, h):
    """Draws the SVG the way a browser does (its filters and masks need one), with a clear background.

    Headless Chrome draws the page into less than the window it is given, leaving the bottom of a
    window-sized screenshot blank, so it gets a taller window and the screenshot is cut back to size.
    """
    try:
        from PIL import Image
    except ImportError:
        sys.exit('The PNGs need Pillow: pip install pillow')
    with tempfile.TemporaryDirectory() as tmp:
        page, shot = Path(tmp)/'page.html', Path(tmp)/'shot.png'
        page.write_text(f'<!doctype html><style>html,body{{margin:0;background:transparent}}'
                        f'img{{display:block;width:{w}px;height:{h}px}}</style><img src="{svg_file.as_uri()}">')
        args = [chrome(), '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                f'--window-size={w},{h + WINDOW_SPARE}', '--default-background-color=00000000',
                f'--user-data-dir={tmp}/profile', f'--screenshot={shot}', page.as_uri()]
        if hasattr(os, 'geteuid') and os.geteuid() == 0:
            args.insert(1, '--no-sandbox')
        subprocess.run(args, check=True, capture_output=True)
        with Image.open(shot) as im:
            im.crop((0, 0, w, h)).save(png_file, optimize=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--png', action='store_true', help='also render the PNGs')
    args = ap.parse_args()
    for name, form in FORMS.items():
        (OUT/name).write_text(form())
        print('wrote', OUT/name)
    if args.png:
        for name, (src, w, h) in PNGS.items():
            rasterize(OUT/src, OUT/name, w, h)
            print('wrote', OUT/name)


if __name__ == '__main__':
    main()
