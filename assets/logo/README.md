# The cachebeat logo

Three cache layers seen from above. The top one holds the prompt, lying flat on it. The one below runs as a glass bar that thins and warms into a heartbeat, which climbs the stack's receding edge into a heart.

## The files

| File | What it is | Where it works |
| --- | --- | --- |
| `logo.svg`, `logo.png` | The icon: the mark on its own dark tile (the PNG is 512px) | Any background |
| `logo-wordmark.svg` | The mark and the name on a dark card | Any background |
| `logo-mark-on-dark.svg` | The mark alone, with no background | Dark backgrounds only |
| `logo-wordmark-on-dark.svg` | The mark and the name, with no background | Dark backgrounds only |
| `social-preview.svg`, `social-preview.png` | A 1280×640 card for links to the repository | GitHub's Settings → General → Social preview |

## Rebuilding

Every file here is drawn by `src/build.py`, so change the code rather than the SVGs. From the repo root:

```sh
python3 assets/logo/src/build.py          # the SVGs: needs only Python 3
python3 assets/logo/src/build.py --png    # and the PNGs: needs Chrome or Chromium, and Pillow
```

The PNGs are drawn by headless Chrome, since the logo's glow and masks need a browser. If it isn't found, point `CHROME` at it, for example `CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.

## Changing it

The knobs are the constants at the top of `src/build.py`:

- `TAPER_LEN`: how long the middle bar takes to thin and warm into the heartbeat. Bigger is longer and softer.
- `BEAT_X`: where along the edge the heartbeat starts.
- `HEART`: the heart's position and size, and how far it's turned into the stack's face.
- `PROMPT_SCALE`: the size of the prompt on the top plate.
- The colours, including the middle bar's colour stops in `BAR_FILL` and `BAR_RIM`.

Everything is drawn in one set of units, the pixels of the image the logo was traced from, and each file's viewBox frames the part it shows. The rest of the code: `src/geometry.py` draws the plates, `src/beat.py` the bar, the heartbeat and the heart, and `src/glyphs.py` the lettering.

## The lettering

The name and the social card's line are set in [Lexend](https://github.com/googlefonts/lexend) and drawn as outlines, so the SVGs don't need the font. Lexend is under the SIL Open Font License 1.1, which is in `src/fonts/OFL.txt` alongside the two weights used.

The outlines are cached in `src/glyphs.json`, which is why building needs nothing beyond Python. To change the name or the line, edit `SOURCES` in `src/glyphs.py`, then refresh the cache. That step needs fontTools:

```sh
pip install fonttools
python3 assets/logo/src/glyphs.py
python3 assets/logo/src/build.py --png
```
