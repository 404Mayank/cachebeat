"""Letter outlines for the wordmark and the social card's line, cached in glyphs.json so a build needs
nothing but Python. After changing the words or the fonts in SOURCES, refresh the cache (this part needs
fontTools: pip install fonttools):

    python3 assets/logo/src/glyphs.py
"""
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from geometry import num  # noqa: E402

HERE = Path(__file__).resolve().parent
CACHE = HERE/'glyphs.json'
SOURCES = {  # style: (font, the text set in it): the wordmark's name and the social card's line
    'wordmark': ('fonts/lexend-latin-900-normal.woff', 'cachebeat'),
    'tagline': ('fonts/lexend-latin-300-normal.woff', 'Keep Claude Code’s prompt cache warm while you’re away.'),
}


def refresh():
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.ttLib import TTFont
    out = {}
    for style, (file, chars) in SOURCES.items():
        font = TTFont(HERE/file)
        gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
        glyphs = {}
        for ch in sorted(set(chars)):
            name = cmap[ord(ch)]
            pen, box = SVGPathPen(gs), BoundsPen(gs)
            gs[name].draw(pen)
            gs[name].draw(box)
            glyphs[ch] = {'adv': hmtx[name][0], 'bounds': list(box.bounds) if box.bounds else None, 'd': pen.getCommands()}
        out[style] = {'font': file, 'upm': font['head'].unitsPerEm, 'glyphs': glyphs}
    CACHE.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')


def _glyphs(style, text):
    g = json.loads(CACHE.read_text())[style]['glyphs']
    missing = sorted(set(text) - set(g))
    if missing:
        sys.exit(f'glyphs.json has no outline for {"".join(missing)!r}: put the text in SOURCES in glyphs.py, '
                 f'then refresh the cache with python3 assets/logo/src/glyphs.py')
    return g


_TOKEN = re.compile(r'[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE]-?\d+)?')


def place(d, ox, base, s):
    """A glyph's outline (font units, y up) with its origin at ox on the baseline base, scaled by s."""
    out, cmd, nums = [], None, []

    def flush():
        if cmd in 'HV':
            out.append(' '.join(num(ox + s*v if cmd == 'H' else base - s*v) for v in nums))
        elif nums:
            out.append(' '.join(f'{num(ox + s*x)} {num(base - s*y)}' for x, y in zip(nums[::2], nums[1::2])))

    for tok in _TOKEN.findall(d):
        if tok.isalpha():
            if cmd:
                flush()
            cmd, nums = tok, []
            out.append(tok)
        else:
            nums.append(float(tok))
    if cmd:
        flush()
    return ''.join(out)


def word(style, text, left, right, base, height, measure='h'):
    """text set with the font's own spacing plus one even tracking value, so its ink runs from left
    to right; it is scaled so that the letter `measure` stands `height` above the baseline.
    Returns each letter's outline and where its ink starts."""
    g = _glyphs(style, text + measure)
    s = height/g[measure]['bounds'][3]
    adv = [g[c]['adv']*s for c in text]
    lsb = [g[c]['bounds'][0]*s for c in text]
    first_ink = left - lsb[0]
    span = first_ink + sum(adv[:-1]) + g[text[-1]]['bounds'][2]*s - left
    track = ((right - left) - span)/(len(text) - 1)
    paths, lefts, o = [], [], first_ink
    for c, a in zip(text, adv):
        paths.append(place(g[c]['d'], o, base, s))
        lefts.append(o + g[c]['bounds'][0]*s)
        o += a + track
    return paths, lefts


def line(style, text, cx, base, size):
    """text at font size `size`, centred on cx, with the font's own advances."""
    g, s = _glyphs(style, text), size/json.loads(CACHE.read_text())[style]['upm']
    o = cx - sum(g[c]['adv'] for c in text)*s/2
    out = []
    for c in text:
        if g[c]['d']:
            out.append(place(g[c]['d'], o, base, s))
        o += g[c]['adv']*s
    return ''.join(out)


if __name__ == '__main__':
    refresh()
    print('wrote', CACHE)
