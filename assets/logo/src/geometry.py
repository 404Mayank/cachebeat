"""The stack's geometry: rounded square plates, seen from above at the logo's angle.

All coordinates are in the drawing's own units (the pixels of the image the logo was traced from);
each SVG's viewBox picks the part it shows.
"""
import math

R2 = math.sqrt(2)


def num(v):
    """A compact SVG number: at most two decimals, no trailing zeros."""
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


class Plate:
    """A rounded square plate of side W and corner radius rho, centred on (cx, cy), seen from above.

    A point (u, v) on the plate lands at (cx + u - v, cy + (u + v)*H/W) on screen, so W is the plate's
    half-width on screen and H its half-height. Its rounded corners land on axis-aligned elliptical
    arcs, which SVG draws exactly.
    """

    def __init__(self, cx, cy, W, H, rho):
        self.cx, self.cy, self.ky = cx, cy, H/W
        self.rx, self.ry = rho*R2, rho*R2*self.ky
        self.a, self.h = W/2 - rho, W/2

    def p(self, u, v):
        return (self.cx + (u - v), self.cy + (u + v)*self.ky)

    def q(self, u, v):
        x, y = self.p(u, v)
        return f'{num(x)} {num(y)}'

    def outline(self):
        """The whole plate, clockwise from the top."""
        a, h = self.a, self.h
        A = f'A{num(self.rx)} {num(self.ry)} 0 0 1 '
        return (f'M{self.q(-a, -h)}L{self.q(a, -h)}{A}{self.q(h, -a)}L{self.q(h, a)}{A}{self.q(a, h)}'
                f'L{self.q(-a, h)}{A}{self.q(-h, a)}L{self.q(-h, -a)}{A}{self.q(-a, -h)}Z')

    def front(self, to_extremes=False):
        """The two front edges, round the near corner. By default from where the left corner's curve
        starts to where the right one's does; to_extremes carries on round both to the plate's far
        left and right points."""
        a, h = self.a, self.h
        A = f'A{num(self.rx)} {num(self.ry)} 0 0 0 '
        d = f'M{self.q(-a, h)}L{self.q(a, h)}{A}{self.q(h, a)}L{self.q(h, -a)}'
        if to_extremes:
            (lx, ly), (rx, ry) = self.p(-a, a), self.p(a, -a)  # the side corners' centres
            d = (f'M{num(lx - self.rx)} {num(ly)}{A}{self.q(-a, h)}' + d[d.index('L'):]
                 + f'{A}{num(rx + self.rx)} {num(ry)}')
        return d

    def right_edge(self):
        """The straight right-front edge, (start, end, slope): it recedes up and to the right."""
        start, end = self.p(self.h, self.a), self.p(self.h, -self.a)
        return start, end, (end[1] - start[1])/(end[0] - start[0])

    def front_points(self, step=0.012):
        """Points along the front edges, left corner to near corner, then up the right-front edge."""
        a, h, rx, ry = self.a, self.h, self.rx, self.ry
        pts = []
        A, B = self.p(-a, h), self.p(a, h)
        for i in range(41):
            u = i/40
            pts.append((A[0] + (B[0] - A[0])*u, A[1] + (B[1] - A[1])*u))
        cx, cy = self.p(a, a)
        th = 3*math.pi/4
        while th > math.pi/4 + 1e-9:
            th = max(th - step, math.pi/4)
            pts.append((cx + rx*math.cos(th), cy + ry*math.sin(th)))
        return pts
