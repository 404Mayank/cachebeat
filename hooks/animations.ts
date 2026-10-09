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
 * The status line's heart at `tick`. `beat` is one glyph, filled while the heart under the prompt is
 * lit, so the line never shifts; an animation plays its own loop.
 */
export function statusFrame(id: string, tick: number, timing: Timing, isHeartLit: boolean) {
  if (id === 'off') return '♥'
  if (id === 'beat') return isHeartLit ? '♥' : '♡'
  const x = variant(id)
  return x.loop[loopIndex(x, tick, timing)]!
}

const HEARTS = /[♥♡❤❥❦❧☙]/

/**
 * How many cells each of an animation's slots needs where a font is proportional: a heart, wider than
 * a cell, needs half again one wherever any frame puts one; every other character fits a cell.
 */
export function slotWidths(x: Variant): number[] {
  const frames = [...x.loop, ...x.blast].map(f => f.replaceAll('\ufe0e', ''))
  return [...frames[0]!].map((_, i) => (frames.some(f => HEARTS.test([...f][i] ?? '')) ? 1.5 : 1))
}
