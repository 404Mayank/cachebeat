"""The middle layer's edge turning into the heartbeat, and the heart it runs into."""
import math

from geometry import num


def smootherstep(t):
    t = min(1.0, max(0.0, t))
    return t*t*t*(t*(6*t - 15) + 10)


def bar_centreline(plate, beat_x):
    """The middle plate's front edges, then up its right-front edge as far as the beat's start."""
    pts = plate.front_points()
    (x0, y0), _, k = plate.right_edge()
    x = x0
    while x < beat_x:
        x = min(x + 1.0, beat_x)
        pts.append((x, y0 + k*(x - x0)))
    return pts


def bar_outline(pts, taper_start, taper_end, w_bar, w_beat):
    """The bar as a filled shape: full width w_bar until taper_start, easing to w_beat by taper_end.
    A plain stroke can't change width, so the outline is offset either side of the centreline."""
    def width(x):
        return w_bar + (w_beat - w_bar)*smootherstep((x - taper_start)/(taper_end - taper_start))
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        xa, ya = pts[max(i - 1, 0)]
        xb, yb = pts[min(i + 1, len(pts) - 1)]
        tx, ty = xb - xa, yb - ya
        length = math.hypot(tx, ty)
        nx, ny = ty/length, -tx/length
        hw = width(x)/2
        left.append((x + nx*hw, y + ny*hw))
        right.append((x - nx*hw, y - ny*hw))
    r0 = width(pts[0][0])/2
    d = f'M{num(right[0][0])} {num(right[0][1])}A{num(r0)} {num(r0)} 0 0 1 {num(left[0][0])} {num(left[0][1])}'
    d += ''.join(f'L{num(x)} {num(y)}' for x, y in left[1:])
    d += ''.join(f'L{num(x)} {num(y)}' for x, y in reversed(right))
    return d + 'Z'


def beat_path(plate, beat_x, heart_x):
    """The heartbeat on the stack's right-front face: its baseline runs along the receding edge and its
    spikes stand straight up. A small bump that rolls straight into a deep trough, the tall beat, a
    valley, then back on the line and along it under the heart."""
    (x0, y0), _, k = plate.right_edge()

    def P(x, off):
        return f'{num(x)} {num(y0 + k*(x - x0) + off)}'

    b = beat_x
    return (f'M{P(b, 0)}L{P(b + 3, 0)}'
            f'C{P(b + 6, 0)} {P(b + 7.4, -7)} {P(b + 10, -7)}'
            f'Q{P(b + 13.4, -7)} {P(b + 14.8, -1.4)}'
            f'L{P(b + 20, 21)}L{P(b + 31.5, -25)}L{P(b + 41, 13)}'
            f'Q{P(b + 45, 0)} {P(b + 50, 0)}L{P(heart_x, 0)}')


# An upright heart, one unit across: (command, points)
_HEART = [('M', [(0, -0.29)]),
          ('C', [(-0.09, -0.47), (-0.5, -0.49), (-0.5, -0.1)]),
          ('C', [(-0.5, 0.16), (-0.22, 0.33), (0, 0.5)]),
          ('C', [(0.22, 0.33), (0.5, 0.16), (0.5, -0.1)]),
          ('C', [(0.5, -0.49), (0.09, -0.47), (0, -0.29)])]


def heart_path(cx, cy, size, tilt, fore, persp):
    """The heart on the right-front face: its near (left) side low and a little larger, its far (right)
    side up and back. tilt is how far its width climbs, in degrees; fore squeezes it for the oblique
    view; persp makes the far side smaller."""
    k = math.tan(math.radians(tilt))

    def T(x, y):
        w = 1 + persp*x
        xp, yp = x*fore/w, y/w
        return cx + size*xp, cy + size*(yp - xp*k)

    d = ''
    for cmd, pts in _HEART:
        d += cmd + ' '.join(f'{num(a)} {num(b)}' for a, b in (T(*p) for p in pts))
    return d + 'Z'
