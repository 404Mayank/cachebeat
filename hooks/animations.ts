// The heart's animations: each a loop it plays while armed and a blast it plays once a beat lands.
// Frames are written as '|'-joined strings, as the bash previews they came from had them.

/** `isEndless`: a loop with no resting frame, its motion running round (a scrolling line, an orbit). */
export type Variant = { id: string; name: string; loop: string[]; blast: string[]; isEndless: boolean }
export type Timing = 'linear' | 'lubdub'

// padded with U+2800 (blank, but not whitespace a surface could collapse) so a frame keeps its width
const pad = (frames: string) => frames.split('|').map(f => f.replaceAll(' ', '\u2800'))
const ENDLESS = ['ecg', 'beam', 'dash', 'sine', 'orbit', 'garland', 'bounce']
const v = (id: string, name: string, loop: string, blast: string): Variant =>
  ({ id, name, loop: pad(loop), blast: pad(blast), isEndless: ENDLESS.includes(id) })

export const VARIANTS: readonly Variant[] = [
  v("classic", "Classic",
    "  ♡  |  ♥  | (❤︎) |( ♥ )|⋅ ♡ ⋅|  ♥  | (♥) | ⋅♡⋅ |  ♡  |  ♡  |  ♡  ",
    "  ♥  | (❤︎) | ♥♥♥ |♥ ♥ ♥|♥ ♡ ♥|♡   ♡|⋅   ⋅|     |  ⋅  "),
  v("pulse", "Pulse",
    "  ♡  |  ♥  | ‹❤︎› |« ♥ »|⋅ ♡ ⋅|  ♥  | ‹♥› | ⋅♡⋅ |  ♡  |  ♡  |  ♡  ",
    "› ♡ ‹| ›♥‹ |  ❤︎  |  ❤︎  | «❤︎» |«❥❤︎❥»|❥«♥»❥|« ♥ »|❥ ♡ ❥|› ♡ ‹|⋅ ⋅ ⋅|⋅   ⋅|     |     |  ⋅  "),
  v("triplet", "Triplet",
    "  ♡  |  ♥  | ♡❤︎♡ |♡ ♥ ♡|⋅ ♡ ⋅|  ♥  | ♡♥♡ | ⋅♡⋅ |  ♡  |  ♡  |  ♡  ",
    "♡ ♡ ♡| ♡♥♡ |  ❤︎  |  ❤︎  | ♥❤︎♥ |♥♥❤︎♥♥|❤︎♥♥♥❤︎|♥♡❤︎♡♥|♡♥♡♥♡|♥♡ ♡♥|♡ ♡ ♡|⋅ ♡ ⋅|⋅ ⋅ ⋅|     |     |  ⋅  "),
  v("sparkle", "Sparkle",
    "  ♡  |  ♥  | ✧❤︎✧ |✦ ♥ ✦|✧ ♡ ✧|⋅ ♥ ⋅| ✧♥✧ | ⋅♡⋅ |  ♡  |  ♡  |  ♡  ",
    "✧ ♡ ✧| ✧♥✧ |  ❤︎  |  ❤︎  | ✦❤︎✦ |✦✧❤︎✧✦|✧✦❤︎✦✧|✦✧♥✧✦|✧✦♡✦✧|✦ ✧ ✦|✧ ✦ ✧|⋅ ✧ ⋅|✧ ⋅ ✧|⋅   ⋅|     |     |  ⋅  "),
  v("fleuron", "Fleuron",
    "  ♡  |  ♥  | ☙❤︎❧ |☙ ♥ ❧|⋅ ♡ ⋅|  ♥  | ☙♥❧ | ⋅♡⋅ |  ♡  |  ♡  |  ♡  ",
    "☙ ♡ ❧| ☙♥❧ |  ❤︎  |  ❤︎  | (❤︎) |(♥❤︎♥)|♥♥❤︎♥♥|❤︎❤︎❤︎❤︎❤︎|♥♥♥♥♥|♥♥ ♥♥|♥ ♡ ♥|☙ ♡ ❧|♡   ♡|⋅   ⋅|     |     |  ⋅  "),
  v("wave", "Wave",
    "♡♡♡♡♡|♥♡♡♡♡|♥♥♡♡♡|♡♥♥♡♡|♡♡♥♥♡|♡♡♡♥♥|♡♡♡♡♥|♡♡♡♡♡|♡♡♡♡♡",
    "♡♡♥♡♡|♡♥♥♥♡|♥♥♥♥♥|❤︎❤︎❤︎❤︎❤︎|❤︎❤︎❤︎❤︎❤︎|♥❤︎♥❤︎♥|❤︎♥❤︎♥❤︎|♥♡♥♡♥|♡♥♡♥♡|♥♡♥♡♥|♡ ♡ ♡| ♡ ♡ |⋅ ⋅ ⋅| ⋅ ⋅ |     |     |⋅ ⋅ ⋅|♡⋅♡⋅♡"),
  v("ecg", "ECG",
    "⎼⎺⎽────⎼⎺⎽────❤︎|─⎼⎺⎽────⎼⎺⎽───♥|──⎼⎺⎽────⎼⎺⎽──❤︎|───⎼⎺⎽────⎼⎺⎽─❤︎|────⎼⎺⎽────⎼⎺⎽❤︎|⎽────⎼⎺⎽────⎼⎺❤︎|⎺⎽────⎼⎺⎽────⎼♥",
    "┄┄┄┄──────────♥|┄┄┄┄┄┄┄┄┄─────❤︎|┄┄┄┄┄┄┄┄┄┄┄┄┄┄❤︎|┄┄┄┄┄┄┄┄┄┄┄┄┄┄❤︎|┄┄┄┄┄┄┄┄┄┄┄━❥♥❤︎|┄┄┄┄┄┄┄┄━❥──❥♥♥|┄┄┄┄┄━❥──❥──❥♥❤︎|┄┄━❥──❥──❥───♥♥|❥──❥──♡──────♡♥|♡──♡──⋅───────♡|⋅──⋅──────────♡|──────────────⋅|──────────────♡|──────────────♥"),
  v("beam", "Beam",
    "╼━╾────╼━╾────❤︎|─╼━╾────╼━╾───♥|──╼━╾────╼━╾──❤︎|───╼━╾────╼━╾─❤︎|────╼━╾────╼━╾❤︎|╾────╼━╾────╼━❤︎|━╾────╼━╾────╼♥",
    "──────────────♥|──────────────❤︎|──────────━━━━❤︎|──────━━━━━━━━♥|──━━━━━━━━━━━━❤︎|━━━━━━━━━━━━━━♥|══════════════❤︎|━━━━━━━━━━━━━━❥|══════════════❤︎|╍╍╍╍╍╍╍╍╍╍╍╍╍╍♥|┅┅┅┅┅┅┅┅┅┅┅┅┅┅♥|┉┉┉┉┉┉┉┉┉┉┉┉┉┉♡|┈┈┈┈┈┈┈┈┈┈┈┈┈┈♡|              ⋅|              ⋅|──────────────♡"),
  v("dash", "Dash",
    "╌─━┄┄┄┄╌─━┄┄┄┄♥|┄╌─━┄┄┄┄╌─━┄┄┄❤︎|┄┄╌─━┄┄┄┄╌─━┄┄❤︎|┄┄┄╌─━┄┄┄┄╌─━┄❤︎|┄┄┄┄╌─━┄┄┄┄╌─━❤︎|━┄┄┄┄╌─━┄┄┄┄╌─♥|─━┄┄┄┄╌─━┄┄┄┄╌❤︎",
    "━━━━┄┄┄┄┄┄┄┄┄┄♥|━━━━━━━━━┄┄┄┄┄❤︎|━━━━━━━━━━━━━━❤︎|━━━━━━━━━━━━━━❤︎|━━━━━━━━━━━━❥♥❤︎|━━━━━━━━━❥┄┄❥♥♥|━━━━━━❥┄┄❥┄┄❥♥❤︎|━━━❥┄┄❥┄┄❥┄┄┄♥♥|❥┄┄❥┄┄♡┄┄┄┄┄┄♡♥|♡┄┄♡┄┄⋅┄┄┄┄┄┄┄♡|⋅┄┄⋅┄┄┄┄┄┄┄┄┄┄♡|┄┄┄┄┄┄┄┄┄┄┄┄┄┄⋅|┄┄┄┄┄┄┄┄┄┄┄┄┄┄♡|┄┄┄┄┄┄┄┄┄┄┄┄┄┄♥"),
  v("sine", "Sine",
    "⣀⠤⠒⠉⠒⠤⣀⠤⠒⠉⠒⠤⣀⠤❤︎|⠤⣀⠤⠒⠉⠒⠤⣀⠤⠒⠉⠒⠤⣀♥|⠒⠤⣀⠤⠒⠉⠒⠤⣀⠤⠒⠉⠒⠤❤︎|⠉⠒⠤⣀⠤⠒⠉⠒⠤⣀⠤⠒⠉⠒❤︎|⠒⠉⠒⠤⣀⠤⠒⠉⠒⠤⣀⠤⠒⠉❤︎|⠤⠒⠉⠒⠤⣀⠤⠒⠉⠒⠤⣀⠤⠒♥",
    "⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤♥|⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶❤︎|⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿❤︎|⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿❥|⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿❤︎|⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿❥|⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿❤︎|⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿♥|⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶⠶♥|⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒⠒♡|⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤♡|⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⋅|              ⋅|⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀⣀♡"),
  v("charge", "Charge",
    "──────────────♡|━━────────────♡|━━━━──────────♡|━━━━━━────────♡|━━━━━━━━──────♡|━━━━━━━━━━────♡|━━━━━━━━━━━━──♡|━━━━━━━━━━━━━━♥|──━━━━━━━━━━━━❤︎|─────━━━━━━━━━♥|────────━━━━━━❤︎|───────────━━━♥|──────────────❤︎|──────────────♡",
    "━━━━━━━━━━━━━━♥|══════════════❤︎|━━━━━━━━━━━━━━❤︎|══════════════❥|━━━━━━━━━━━━❥♥❤︎|━━━━━━━━━❥──❥♥♥|━━━━━━❥──❥──❥♥❤︎|━━━❥──❥──❥───♥♥|❥──❥──♡──────♡♥|♡──♡──⋅───────♡|⋅──⋅──────────♡|──────────────⋅|──────────────♡"),
  v("converge", "Converge",
    "⎽──────♡──────⎽|⎺⎽─────♡─────⎽⎺|⎼⎺⎽────♡────⎽⎺⎼|─⎼⎺⎽───♡───⎽⎺⎼─|──⎼⎺⎽──♡──⎽⎺⎼──|───⎼⎺⎽─♡─⎽⎺⎼───|────⎼⎺⎽♡⎽⎺⎼────|─────⎼⎺♥⎺⎼─────|──────⎼❤︎⎼──────|──────(♥)──────|─────( ♡ )─────|───────♥───────|───────♡───────",
    "───────♥───────|──────›♥‹──────|───────❤︎───────|───────❤︎───────|──────(❤︎)──────|─────♥♥❤︎♥♥─────|───♥♥♥♥❤︎♥♥♥♥───|─♥♥──♥♥❤︎♥♥──♥♥─|♥♥───♥─♥─♥───♥♥|♥───♡──♥──♡───♥|♡──⋅───♡───⋅──♡|⋅──────♡──────⋅|───────⋅───────|───────♡───────"),
  v("twins", "Twins",
    "♡   ♡|♡   ♡| ♡ ♡ | ♥ ♥ | ♡ ♡ |♡   ♡",
    "♡   ♡| ♡ ♡ | ♥ ♥ |  ❤︎  |  ❤︎  | ✦❤︎✦ |✧♥❤︎♥✧|♥✦❤︎✦♥|♥ ❤︎ ♥|♡ ♥ ♡|✧ ♡ ✧|⋅ ♡ ⋅|  ♡  |  ⋅  |     |⋅   ⋅"),
  v("orbit", "Orbit",
    "• ♥  | •♥  |  ♥• |  ♥ •|  ♥ ⋅|  ♥⋅ | ⋅♥  |⋅ ♥  ",
    "• ♥ ⋅| •♥⋅ |  ❤︎  |  ❤︎  | ◦❤︎◦ |◦•❤︎•◦|•◦♥◦•|◦ ♥ ◦|⋅ ♡ ⋅|⋅   ⋅|     |     |  ⋅  |  ♡  "),
  v("static", "Static",
    "  ♥  |  ♥  |  ♥  | ░♥  |  ♡▒ |  ♥  |  ♥  |▒ ♥ ░|  ♥  |  ❥  |  ♥  ",
    "  ♥  | ░♥▒ |▒▓♥░▒|▓░❥▓█|█▓▒░▓|░█▓█▒|▓▒█▓░|▒░▓▒▓|░▒❤︎░▒| ░❤︎▒ |  ❤︎  |  ❤︎  |  ♥  "),
  v("garland", "Garland",
    " ❥♡❦ | ♡❦♥ | ❦♥❧ | ♥❧❥ | ❧❥♡ ",
    " ♥♡❦ | ♥❦♥ | ♥♥❧ | ♥♥❥ | ♥♥♡ | ♥♥♥ | ♥♥♥ |✦♥♥♥✦|✧❤︎❤︎❤︎✧|✦♥♥♥✦|✧❤︎❤︎❤︎✧|✦♥♥♥✦|✧❤︎❤︎❤︎✧|⋅♥♥♥⋅| ♡♡♡ | ⋅⋅⋅ |     "),
  v("equalizer", "Equalizer",
    "▁▁▁▁▁▁▇❤︎▇▁▁▁▁▁▁|▁▁▁▁▁▆▃♥▃▆▁▁▁▁▁|▁▁▁▁▅▂▁♥▁▂▅▁▁▁▁|▁▁▁▄▁▁▅❤︎▅▁▁▄▁▁▁|▁▁▃▁▁▄▁♥▁▄▁▁▃▁▁|▁▂▁▁▃▁▁♡▁▁▃▁▁▂▁|▁▁▁▂▁▁▁♡▁▁▁▂▁▁▁|▁▁▁▁▁▁▁♡▁▁▁▁▁▁▁|▁▁▁▁▁▁▁♡▁▁▁▁▁▁▁",
    "▁▁▁▁▁▁▁♥▁▁▁▁▁▁▁|▁▁▁▁▃▅▇❤︎▇▅▃▁▁▁▁|▁▁▃▅▇██❤︎██▇▅▃▁▁|▅▇█████❥█████▇▅|███████❤︎███████|▇█▇█▇█▇❥▇█▇█▇█▇|█▇█▇█▇█❤︎█▇█▇█▇█|▆▅▆▅▆▅▆♥▆▅▆▅▆▅▆|▄▅▄▃▄▅▄♥▄▅▄▃▄▅▄|▃▂▃▂▃▂▃♡▃▂▃▂▃▂▃|▂▁▂▁▂▁▂♡▂▁▂▁▂▁▂|▁▁▁▁▁▁▁⋅▁▁▁▁▁▁▁|▁▁▁▁▁▁▁♡▁▁▁▁▁▁▁"),
  v("cupid", "Cupid",
    "─➤     ♡       |  ─➤   ♡       |    ─➤ ♡       |      ─♥➤      |       ♥ ─➤    |       ♡   ─➤  |       ♡     ─➤|       ♡       |       ♡       ",
    "»─➤    ♡       |  »─➤  ♡       |    »─➤♡       |     »─♥─➤     |     »─❤︎─➤     |     »─❤︎─➤     |    ✦»─❤︎─➤✦    |   ♥ ✧»♥➤✧ ♥   |  ♥  ♥ ♡ ♥  ♥  | ♥  ♡  ⋅  ♡  ♥ |♡  ⋅       ⋅  ♡|⋅             ⋅|               |       ⋅       "),
  v("bounce", "Bounce",
    "▌❤︎            ▐|▌   ♥         ▐|▌      ♥      ▐|▌         ♥   ▐|▌            ❤︎▐|▌         ♥   ▐|▌      ♥      ▐|▌   ♥         ▐",
    "▌❤︎            ▐|▌❤︎            ▐|▌ ⋅⋅❥         ▐|▌     ⋅⋅❥     ▐|▌         ⋅⋅❥ ▐|▌            ⋅❤︎|▌           ✦❤︎✦|▌         ✧ ♥ ✧|▌        ⋅  ♡  |▌            ⋅ |▌             ▐|▌⋅            ▐"),
]

export const variant = (id: string) => VARIANTS.find(x => x.id === id) ?? VARIANTS[0]!

/** Cells a frame takes: its characters, less the text-presentation selector riding a heart. */
export const cells = (frame: string) => [...frame.replaceAll('\ufe0e', '')].length

/**
 * The loop's frame index at `tick`. Linear plays the loop evenly. Lub-dub plays it twice back to
 * back, then rests as long as one pass took: on the first frame, a heart at rest, or for an endless
 * loop, which has none and would only freeze, by a third pass at half speed.
 */
export function loopIndex(x: Variant, tick: number, timing: Timing) {
  const n = x.loop.length
  if (timing === 'linear') return tick % n
  const k = tick % loopTicks(x, timing)
  if (k < 2 * n) return k % n
  return x.isEndless ? Math.floor((k - 2 * n) / 2) : 0
}

const loopTicks = (x: Variant, timing: Timing) => (timing === 'linear' ? 1 : x.isEndless ? 4 : 3) * x.loop.length

/** The settings preview, as the bash previews ran: five rounds of the loop, then the blast. */
export function previewFrame(x: Variant, tick: number, timing: Timing) {
  const span = 5 * loopTicks(x, timing)
  const k = tick % (span + x.blast.length)
  return k < span ? x.loop[loopIndex(x, k, timing)]! : x.blast[k - span]!
}

/** What the status line's own heart plays: one heart beating, a still one, or any of the animations. */
export const STATUS_HEARTS: readonly string[] = ['beat', 'off', ...VARIANTS.map(x => x.id)]

/**
 * The turn line's heart at `tick`, by the line's own timing. `beat` is one glyph, filled as Classic's
 * loop lights, so the line never shifts; an animation plays its own loop.
 */
export function statusFrame(id: string, tick: number, timing: Timing) {
  if (id === 'off') return '♥'
  const x = variant(id === 'beat' ? 'classic' : id)
  const frame = x.loop[loopIndex(x, tick, timing)]!
  return id === 'beat' ? (/[♥❤]/.test(frame) ? '♥' : '♡') : frame
}

const HEARTS = /[♥♡❤❥❦❧☙]/
const BLANK = /[ \u2800]/
// the line and bar characters a terminal draws touching: box drawing, scan lines, blocks, braille
const JOINED = /[\u2500-\u257f\u23ba-\u23bd\u2580-\u259f\u2801-\u28ff]/

/**
 * How many cells each of an animation's slots takes where a font is proportional, from every frame's
 * character there. A heart, wider than a cell, gets half again one. A slot of line or bar characters
 * alone gets less than they are wide, so neighbors overlap into one line, as a terminal draws them.
 */
export function slotWidths(x: Variant): number[] {
  const frames = [...x.loop, ...x.blast].map(f => [...f.replaceAll('\ufe0e', '')])
  return frames[0]!.map((_, i) => {
    const seen = frames.map(f => f[i] ?? ' ').filter(ch => !BLANK.test(ch))
    if (seen.some(ch => HEARTS.test(ch))) return 1.5
    return seen.length > 0 && seen.every(ch => JOINED.test(ch)) ? JOIN : 1
  })
}

const JOIN = 0.6 // cells a line character's slot takes: under its width, so neighbors overlap

/**
 * A character as its slot draws it: a line character in a slot wider than it, there for a heart that
 * other frames put in it, repeats enough to span the slot and meet the lines either side.
 */
export const slotText = (ch: string, width: number) => (JOINED.test(ch) ? ch.repeat(Math.ceil(width / JOIN)) : ch)
