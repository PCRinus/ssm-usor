"""The pictures `build_pictures.py` writes into the templates, drawn from their sources.

The safety signs are rendered from `svg/` at 14 mm and 600 dpi: a PNG, since Word reads an SVG
picture only from Word 2016 on and LibreOffice not from every file. The hazard-stripe examples
of 2.2 and the method figures of 9 are drawn here as SVG from their geometry, then rendered the
same way at their print size. Needs PyMuPDF and Pillow; run with the package as the working
directory: python3 tools/import/pictures/make_pictures.py
"""

import math
import os
import re

import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, 'svg')
PNG = os.path.join(HERE, 'png')
DPI = 600
SIGN_MM = 14
MM = 72 / 25.4
FONT = 'Helvetica, Arial, sans-serif'
SAFETY_YELLOW = '#F9A800'
SAFETY_RED = '#B71F2E'
FIRE_RED = '#9B2423'


def render(svg_text, out, width_px=None, grey=False, colours=None):
    # MuPDF's SVG reader drops a style property written with a space before its colon, as in
    # E009 ("fill :#237F52"), and draws the sign black.
    svg_text = re.sub(r'style="([^"]*)"', lambda m: 'style="' + re.sub(r'\s*([:;])\s*', r'\1', m.group(1)) + '"',
                      svg_text)
    document = pymupdf.open(stream=svg_text.encode('utf8'), filetype='svg')
    page = document[0]
    zoom = width_px / page.rect.width if width_px else DPI / 72
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
    if grey:
        image = image.convert('L')
    if colours:
        # Median cut keeps every sign's colours exact, the ISO ones included, at a third of the size.
        image = image.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    image.save(out, optimize=True, dpi=(DPI, DPI))


def hydrant():
    """The hydrant sign has no ISO or Romanian standard drawing: the common white H on fire red."""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            f'<rect width="100" height="100" fill="{FIRE_RED.lower()}"/>'
            '<rect x="4" y="4" width="92" height="92" fill="none" stroke="#fff" stroke-width="2"/>'
            '<text x="50" y="74" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="70" '
            'fill="#fff" text-anchor="middle">H</text></svg>')


class Drawing:
    def __init__(self, width, height):
        self.width, self.height, self.parts = width, height, []

    def line(self, x1, y1, x2, y2, width=0.3, colour='#000'):
        self.parts.append(f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" stroke="{colour}" '
                          f'stroke-width="{width}"/>')

    def dashed(self, x1, y1, x2, y2, width=0.15, dash=0.8, gap=0.6, colour='#444'):
        length = math.hypot(x2 - x1, y2 - y1)
        at = 0.0
        while at < length:
            end = min(at + dash, length)
            self.line(x1 + (x2 - x1) * at / length, y1 + (y2 - y1) * at / length,
                      x1 + (x2 - x1) * end / length, y1 + (y2 - y1) * end / length, width, colour=colour)
            at = end + gap

    def path(self, points, width=0.35):
        d = 'M' + ' L'.join(f'{x:.3f} {y:.3f}' for x, y in points)
        self.parts.append(f'<path d="{d}" fill="none" stroke="#000" stroke-width="{width}" '
                          'stroke-linejoin="round" stroke-linecap="round"/>')

    def rect(self, x, y, w, h, fill='none', stroke='#000', width=0.3):
        self.parts.append(f'<rect x="{x:.3f}" y="{y:.3f}" width="{w:.3f}" height="{h:.3f}" fill="{fill}" '
                          f'stroke="{stroke}" stroke-width="{width}"/>')

    def polygon(self, points, fill):
        d = ' '.join(f'{x:.3f},{y:.3f}' for x, y in points)
        self.parts.append(f'<polygon points="{d}" fill="{fill}"/>')

    def dot(self, x, y, r=0.3):
        self.parts.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{r}" fill="#000"/>')

    def text(self, x, y, content, size=2.6, anchor='start', bold=False):
        weight = ' font-weight="bold"' if bold else ''
        self.parts.append(f'<text x="{x:.3f}" y="{y:.3f}" font-family="{FONT}" font-size="{size}"{weight} '
                          f'text-anchor="{anchor}">{content}</text>')

    def arrow_up(self, x, y):
        self.polygon([(x, y), (x - 0.9, y + 2.4), (x + 0.9, y + 2.4)], '#000')

    def arrow_right(self, x, y):
        self.polygon([(x, y), (x - 2.4, y - 0.9), (x - 2.4, y + 0.9)], '#000')

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}mm" height="{self.height}mm" '
                f'viewBox="0 0 {self.width} {self.height}"><rect width="{self.width}" height="{self.height}" '
                f'fill="#fff"/>{"".join(self.parts)}</svg>')


def small(text, size=1.9, rise=-1.0):
    return f'<tspan font-size="{size}" dy="{rise}">{text}</tspan><tspan dy="{-rise}"> </tspan>'


def axes(drawing, origin, right, top, x_label, y_label, label_size=2.6, bold=True):
    ox, oy = origin
    drawing.line(ox, oy, right - 2, oy)
    drawing.arrow_right(right, oy)
    drawing.line(ox, oy, ox, top + 2)
    drawing.arrow_up(ox, top)
    if x_label:
        drawing.text(right + 1.2, oy + 0.9, x_label, label_size, bold=bold)
    if y_label:
        drawing.text(ox - 1.2, top + 1, y_label, label_size, anchor='end', bold=bold)


def relation():
    """Fig. 1.1: safety falls as risk grows, both towards infinity."""
    drawing = Drawing(66, 46)
    ox, oy = 24, 39
    axes(drawing, (ox, oy), 60, 6, None, None)
    drawing.text(ox, 4.4, '+∞', 2.4, anchor='middle', bold=True)
    drawing.text(61.2, oy + 0.9, '+∞', 2.4, bold=True)
    drawing.text(ox - 1.5, 10.5, 'SECURITATE', 2.4, anchor='end', bold=True)
    drawing.text(59, oy + 4.4, 'RISC', 2.4, anchor='end', bold=True)
    drawing.path([(ox + 1.2 + t * 33, oy - 1.5 - 31 * (0.045 / (t + 0.05) - 0.04)) for t in (i / 200 for i in range(201))])
    drawing.text(40, 25, 'y = f(x)', 2.6)
    return drawing


def equivalence():
    """Fig. 1.2: three risks of equal size, gravity times probability, on one hyperbola (x·y = 6)."""
    unit = 7.6
    ox, oy = 9, 40
    drawing = Drawing(66, 46)
    to = lambda x, y: (ox + x * unit, oy - y * unit)
    step = 0.9
    for x0, y0, x1, y1, horizontal in ((0, 0, 2, 3, True), (0, 0, 3, 2, False)):
        (left, top), (right, bottom) = to(x0, y1), to(x1, y0)
        if horizontal:
            y = bottom - step
            while y > top + 0.1:
                drawing.line(left, y, right, y, 0.15)
                y -= step
        else:
            x = left + step
            while x < right - 0.1:
                drawing.line(x, top, x, bottom, 0.15)
                x += step
    for x1, y1 in ((2, 3), (3, 2), (5, 1.2)):
        left, top = to(0, y1)
        drawing.rect(left, top, x1 * unit, y1 * unit, width=0.3)
    drawing.path([to(x, 6 / x) for x in (1.45 + i * (6.5 - 1.45) / 200 for i in range(201))])
    for x, y, label in ((1, 2.5, '1'), (2.5, 1.6, '2'), (4, 0.6, '3')):
        cx, cy = to(x, y)
        drawing.rect(cx - 2.3, cy - 2.1, 4.6, 3.6, fill='#fff', stroke='none')
        drawing.text(cx - 0.4, cy + 0.6, 'F' + small(label, 1.9, 0.7), 2.8, anchor='middle', bold=True)
    axes(drawing, (ox, oy), ox + 6.9 * unit, 3, 'x', 'y')
    for value in range(1, 7):
        x, y = to(value, 0)
        drawing.line(x, y, x, y + 0.9, 0.3)
        drawing.text(x, y + 3.6, str(value), 2.4, anchor='middle')
    for value in range(1, 5):
        x, y = to(0, value)
        drawing.line(x - 0.9, y, x, y, 0.3)
        drawing.text(x - 1.6, y + 0.85, str(value), 2.4, anchor='end')
    return drawing


def acceptability():
    """Fig. 1.3: the acceptability curve C = X·Y; A under it is acceptable, B above it is not."""
    drawing = Drawing(76, 50)
    ox, oy, width, height = 14, 40, 44, 32
    at = lambda u, v: (ox + u * width, oy - v * height)
    axes(drawing, (ox, oy), 60, 5, None, None)
    drawing.text(ox - 1.5, 3.4, 'Gravitatea Y', 2.4, bold=True)
    drawing.text(75, oy + 8, 'Probabilitatea X', 2.4, anchor='end', bold=True)
    curve = lambda u: 0.16 / (u - 0.13)
    drawing.path([at(u, curve(u)) for u in (0.29 + i * 0.71 / 200 for i in range(201))])
    drawing.text(*at(0, 0)[:1], oy + 4, '0', 2.4, anchor='middle')
    for u, exponent in ((0.3, '-9'), (0.57, '-6'), (0.85, '-3')):
        x, y = at(u, 0)
        drawing.line(x, y, x, y + 0.9, 0.3)
        # MuPDF misplaces a raised part of a centred text, so the label starts where centring would put it.
        drawing.text(x - 2.4, y + 4, '10' + small(exponent), 2.4)
    for u, v, label, dx in ((0.3, 0.62, 'A', -2.4), (0.85, 0.4, 'B', 1.0)):
        x, y = at(u, v)
        drawing.line(x, y, x, oy, 0.25)
        drawing.line(ox, y, x, y, 0.25)
        drawing.dot(x, y, 0.45)
        drawing.text(x + dx, y - 1.2, label, 2.6, bold=True)
    drawing.text(*at(0.68, 0.84), 'INACCEPTABIL', 2.4, anchor='middle', bold=True)
    drawing.text(*at(0.5, 0.1), 'ACCEPTABIL', 2.4, anchor='middle', bold=True)
    x, y = at(1, curve(1))
    drawing.text(x + 1.5, y - 1.2, 'Curba C', 2.4)
    drawing.text(x + 1.5, y + 2.2, 'C = X · Y', 2.4)
    return drawing


# The pairs (gravity class g, probability class p) of each risk level, as 9 lists them under
# Fig. 1.5 b: the curves must leave each level's pairs on or under its own curve and above the
# curve of the level below.
LEVELS = {
    1: '(1,1) (1,2) (1,3) (1,4) (1,5) (1,6) (2,1)',
    2: '(2,2) (2,3) (2,4) (3,1) (3,2) (4,1)',
    3: '(2,5) (2,6) (3,3) (3,4) (4,2) (5,1) (6,1) (7,1)',
    4: '(3,5) (3,6) (4,3) (4,4) (5,2) (5,3) (6,2) (7,2)',
    5: '(4,5) (4,6) (5,4) (5,5) (6,3) (7,3)',
    6: '(5,6) (6,4) (6,5) (7,4)',
    7: '(6,6) (7,5) (7,6)',
}
LEVEL_OF = {tuple(map(int, pair)): level for level, pairs in LEVELS.items()
            for pair in re.findall(r'\((\d),(\d)\)', pairs)}
MARGIN = 0.05
# The method draws the first level's curve through the pair (g, p) = (1, 6), the last of the
# first row, so that pair lies on it, not under it.
THROUGH = {1: (6, 1)}
# Where the provider's drawing has each curve at p = 1 … 6, read off the picture; the fitted
# curves keep to it as far as the pairs allow.
DRAWN = {
    1: (2.6, 1.65, 1.3, 1.15, 1.05, 1.0),
    2: (4.7, 3.3, 2.55, 2.15, 1.9, 1.8),
    3: (None, 4.8, 3.7, 3.05, 2.75, 2.6),
    4: (None, None, 5.5, 4.3, 3.9, 3.7),
    5: (None, None, None, 5.85, 5.1, 4.7),
    6: (None, None, None, None, 6.5, 5.7),
}


def diagonal_point(k):
    """The k-th of the seven equal parts of the diagonal from (p, g) = (1, 1) to (6, 7)."""
    return 1 + 5 * k / 7, 1 + 6 * k / 7


def bounds(k, p):
    under = [g for g in range(1, 8) if LEVEL_OF[(g, p)] <= k]
    over = [g for g in range(1, 8) if LEVEL_OF[(g, p)] > k]
    return (max(under) if under else 0), (min(over) if over else math.inf)


def level_curve(k):
    """g = a + b / (p - c) through the k-th point of the diagonal, between the pairs it parts."""
    dp, dg = diagonal_point(k)
    best = None
    through = THROUGH.get(k)
    for ci in range(-150, int(dp * 50)):
        c = ci / 50
        if through:
            tp, tg = through
            slopes = [(dg - tg) / (1 / (dp - c) - 1 / (tp - c))]
        else:
            slopes = [bi / 20 for bi in range(1, 600)]
        for b in slopes:
            a = dg - b / (dp - c)
            error = 0
            for p in range(1, 7):
                low, high = bounds(k, p)
                if p <= c:
                    if high != math.inf:
                        break
                    continue
                g = a + b / (p - c)
                if through and p == through[0]:
                    assert abs(g - through[1]) < 1e-9 and LEVEL_OF[(through[1], p)] == k
                    continue
                if b <= 0 or g < low + MARGIN or g > high - MARGIN:
                    break
                if DRAWN[k][p - 1] is not None:
                    error += (g - DRAWN[k][p - 1]) ** 2
            else:
                if best is None or error < best[0]:
                    best = (error, a, b, c)
    assert best, f'no curve for level {k}'
    _, a, b, c = best
    return lambda p: a + b / (p - c) if p > c else math.inf


def risk_grid(curves, ticks):
    """Fig. 1.4 and 1.5: 6 probability classes against 7 gravity classes, a gravity class drawn
    √2 times the length of a probability class, as the method says."""
    pu = 5.5
    gu = pu * math.sqrt(2)
    ox, oy = 8.5, 5.5 + 7.6 * gu
    drawing = Drawing(50, oy + 6.5)
    to = lambda p, g: (ox + p * pu, oy - g * gu)
    for p in range(1, 7):
        drawing.dashed(*to(p, 0), *to(p, 7.4))
    for g in range(1, 8):
        drawing.dashed(*to(0, g), *to(6.3, g))
    for p in range(1, 7):
        for g in range(1, 8):
            drawing.dot(*to(p, g), 0.32)
    axes(drawing, to(0, 0), to(6.75, 0)[0], to(0, 7.7)[1], 'p', 'g')
    for p in range(1, 7):
        x, y = to(p, 0)
        drawing.text(x, y + 3.6, str(p), 2.4, anchor='middle')
    for g in range(1, 8):
        x, y = to(0, g)
        drawing.text(x - 1.6, y + 0.85, str(g), 2.4, anchor='end')
    if ticks:
        drawing.line(*to(1, 1), *to(6, 7), 0.3)
        dx, dy = 5 * pu, 6 * gu
        length = math.hypot(dx, dy)
        nx, ny = dy / length * 1.1, dx / length * 1.1
        for k in range(1, 7):
            x, y = to(*diagonal_point(k))
            drawing.line(x - nx, y - ny, x + nx, y + ny, 0.3)
    for curve in curves:
        points = []
        for i in range(0, 601):
            p = 0.55 + i * (6 - 0.55) / 600
            g = curve(p)
            if g <= 7.2:
                points.append(to(p, g))
        drawing.path(points)
    return drawing


def clipped(points, left, right):
    """The part of a convex polygon between two vertical lines."""
    for bound, inside in ((left, lambda x: x >= left), (right, lambda x: x <= right)):
        kept = []
        for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]):
            if inside(x1):
                kept.append((x1, y1))
            if inside(x1) != inside(x2):
                kept.append((bound, y1 + (y2 - y1) * (bound - x1) / (x2 - x1)))
        points = kept
    return points


def stripes(colour, between, outline):
    """A hazard band, as annex 5 to H.G. 971/2006 asks: stripes at 45°, the two colours the same width."""
    width, height, stripe, edge = 70, 7, 3.5, 0.3
    drawing = Drawing(width + 2 * edge, height + 2 * edge)
    drawing.rect(edge, edge, width, height, fill=between, stroke='none')
    pitch = stripe * math.sqrt(2)
    x = -height
    while x < width:
        stripe_points = [(x, height), (x + pitch, height), (x + pitch + height, 0), (x + height, 0)]
        points = clipped(stripe_points, 0, width)
        if len(points) > 2:
            drawing.polygon([(px + edge, py + edge) for px, py in points], colour)
        x += 2 * pitch
    drawing.rect(edge, edge, width, height, stroke=outline, width=2 * edge)
    return drawing


def main():
    os.makedirs(PNG, exist_ok=True)
    with open(os.path.join(SVG, 'H.svg'), 'w', encoding='utf8') as out:
        out.write(hydrant())
    for name in sorted(os.listdir(SVG)):
        if name.endswith('.svg') and not name.startswith(('figure-', 'stripes-')):
            with open(os.path.join(SVG, name), encoding='utf8') as source:
                render(source.read(), os.path.join(PNG, name[:-4] + '.png'), round(SIGN_MM / 25.4 * DPI), colours=64)
    curves = [level_curve(k) for k in range(1, 7)]
    figures = {
        'figure-1.1': relation(),
        'figure-1.2': equivalence(),
        'figure-1.3': acceptability(),
        'figure-1.4': risk_grid([], False),
        'figure-1.5a': risk_grid(curves[:1], True),
        'figure-1.5b': risk_grid(curves, True),
        'stripes-yellow-black': stripes(SAFETY_YELLOW, '#000', '#000'),
        'stripes-red-white': stripes(SAFETY_RED, '#fff', SAFETY_RED),
    }
    for name, drawing in figures.items():
        text = drawing.svg()
        with open(os.path.join(SVG, name + '.svg'), 'w', encoding='utf8') as out:
            out.write(text)
        render(text, os.path.join(PNG, name + '.png'), grey=name.startswith('figure-'),
               colours=16 if name.startswith('figure-') else None)


if __name__ == '__main__':
    main()
