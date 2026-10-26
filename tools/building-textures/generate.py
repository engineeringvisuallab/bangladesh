#!/usr/bin/env python3
"""
Procedural, seamless, grey-scale surface textures for the building models.
Run:  python3 tools/building-textures/generate.py
Writes JPGs to src/buildings/models/textures/. The textures are multiplied with the vertex colour of each
building part in the game, so the same brick texture serves red brick, painted brick, ... (hue comes from the vertex colour).
Every tile is periodic (tiles without seams). Scale (metres per tile) is set in SurfaceMap.ts.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 512
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'buildings', 'models', 'textures')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261018)

YY, XX = np.mgrid[0:N, 0:N].astype(np.float32)
U = XX / N
V = YY / N


def fnoise(beta=2.0, sx=1.0, sy=1.0):
    """Periodic noise with a 1/f^beta spectrum, normalised to mean 0 / std 1. sx,sy > 1 stretch features along that axis' perpendicular."""
    fx = np.fft.fftfreq(N)[None, :] * sx
    fy = np.fft.fftfreq(N)[:, None] * sy
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    spec = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N))) / (f ** (beta / 2.0))
    spec[0, 0] = 0
    a = np.fft.ifft2(spec).real.astype(np.float32)
    a -= a.mean()
    a /= a.std() + 1e-6
    return a


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def save(name, arr, q=88):
    a = np.clip(arr, 0, 1)
    img = Image.fromarray((a * 255).astype(np.uint8), 'L')
    img.save(os.path.join(OUT, name + '.jpg'), quality=q, subsampling=0)
    print('wrote', name, 'mean=%.2f' % a.mean())


def wrap_draw(draw_fn, margin=64):
    """Draw on a 3x3 tiled canvas, then crop the centre tile => seamless."""
    img = Image.new('L', (N * 3, N * 3), 0)
    return img


def tile_canvas(base):
    """base: float array -> PIL 3x3 tile canvas for drawing strokes across the border."""
    im = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8), 'L')
    big = Image.new('L', (N * 3, N * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * N, j * N))
    return big


def crop_centre(big):
    return np.asarray(big.crop((N, N, 2 * N, 2 * N)), dtype=np.float32) / 255.0


# ----------------------------------------------------------------- brick
def brick():
    bw, bh, m = N // 4, N // 8, 5
    row = (YY // bh).astype(int)
    xs = (XX + (row % 2) * bw / 2) % N
    col = (xs // bw).astype(int)
    xin = xs % bw
    yin = YY % bh
    mortar = (xin < m) | (yin < m)
    dx = np.minimum(xin, bw - xin)
    dy = np.minimum(yin, bh - yin)
    edge = np.minimum(dx, dy)
    shade_tab = rng.uniform(0.62, 0.90, size=(8, 4))
    shade = shade_tab[row % 8, col % 4]
    fine = fnoise(1.2) * 0.04 + fnoise(2.2, 4, 4) * 0.03
    b = (shade + fine) * (0.86 + 0.14 * np.clip(edge / 7.0, 0, 1))
    mort = 0.97 + fnoise(0.8) * 0.02
    out = np.where(mortar, mort, b)
    # soot / efflorescence stains
    out *= 1.0 - 0.10 * smooth(fnoise(2.6, 1.0, 0.25), 0.4, 2.0)
    save('brick', out)


# ----------------------------------------------------------------- plaster
def plaster():
    base = 0.90 + fnoise(2.6) * 0.030 + fnoise(1.0) * 0.018
    base += rng.normal(0, 0.012, (N, N)).astype(np.float32)
    streak = smooth(fnoise(2.4, 0.18, 1.0), 0.6, 2.4)
    base -= 0.08 * streak
    big = tile_canvas(base)
    d = ImageDraw.Draw(big)
    for _ in range(5):  # hairline cracks
        x, y = rng.uniform(N, 2 * N), rng.uniform(N, 2 * N)
        for _s in range(rng.integers(12, 30)):
            nx, ny = x + rng.normal(0, 7), y + rng.uniform(2, 9)
            d.line((x, y, nx, ny), fill=int(255 * rng.uniform(0.62, 0.74)), width=1)
            x, y = nx, ny
    save('plaster', crop_centre(big))


# ----------------------------------------------------------------- concrete
def concrete():
    base = 0.80 + fnoise(2.2) * 0.04 + fnoise(1.0) * 0.022
    base -= 0.06 * smooth(fnoise(2.4, 0.2, 1.0), 0.5, 2.4)
    # formwork seams (panel size = half tile) and tie holes
    for p in (0, N // 2):
        base[(YY.astype(int) - p) % N < 2] -= 0.13
        base[:, (XX[0].astype(int) - p) % N < 2] -= 0.09
    for cx in (N // 4, 3 * N // 4):
        for cy in (N // 4, 3 * N // 4):
            r = np.hypot(XX - cx, YY - cy)
            base -= 0.28 * (r < 4) + 0.04 * ((r >= 4) & (r < 7))
    big = tile_canvas(base)
    d = ImageDraw.Draw(big)
    for _ in range(900):  # air pores
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        r = rng.uniform(0.6, 2.0)
        d.ellipse((x - r, y - r, x + r, y + r), fill=int(255 * rng.uniform(0.45, 0.65)))
    save('concrete', crop_centre(big))


# ----------------------------------------------------------------- corrugated tin
def tin():
    n_ridge = 10
    ph = 2 * np.pi * n_ridge * U
    prof = 0.80 + 0.17 * np.sin(ph) - 0.03 * np.cos(2 * ph)
    prof += fnoise(1.6, 0.5, 2) * 0.015
    wear = smooth(fnoise(2.3, 0.2, 1.0), 0.7, 2.4)
    prof -= 0.12 * wear
    # rust speckles
    sp = smooth(fnoise(1.2), 1.8, 3.0)
    prof -= 0.18 * sp
    # sheet overlap line + rivets at the tile border
    seam = (YY < 6)
    prof[seam] -= 0.12
    prof[(YY >= 6) & (YY < 11)] += 0.05
    for i in range(0, N, N // 10):
        r = np.hypot(XX - (i + N // 20), YY - 22)
        prof -= 0.22 * (r < 3)
    save('tin', prof)


# ----------------------------------------------------------------- thatch
def thatch():
    strand = fnoise(0.6, 0.5, 9.0)
    strand2 = fnoise(1.2, 0.4, 5.0)
    v = 0.74 + 0.10 * strand + 0.06 * strand2
    rows = 5
    f = (YY % (N // rows)) / (N // rows)
    v *= 0.62 + 0.38 * np.power(f, 0.7)  # each bundle row is darker under the overlap
    v += 0.02 * fnoise(2.6)
    v += 0.10 * smooth(strand, 1.2, 3.0)  # a few bright straws
    save('thatch', v)


# ----------------------------------------------------------------- clay roof tile
def roof_tile():
    cols, rows = 8, 8
    cw, rh = N // cols, N // rows
    row = (YY // rh).astype(int)
    xs = (XX + (row % 2) * cw / 2) % N
    col = (xs // cw).astype(int)
    xin = (xs % cw) / cw
    yin = (YY % rh) / rh
    prof = 0.55 + 0.45 * (0.5 - 0.5 * np.cos(2 * np.pi * xin))  # curved pan
    over = 0.68 + 0.32 * np.power(yin, 0.6)  # shadow under the tile above
    tile_id = rng.uniform(0.80, 1.0, size=(rows, cols))
    v = prof * over * tile_id[row % rows, col % cols]
    v *= 0.92 + 0.08 * (fnoise(1.6) * 0.5)
    v -= 0.07 * smooth(fnoise(2.4), 1.0, 2.6)  # moss / grime
    save('roof_tile', v * 1.12)


# ----------------------------------------------------------------- earth / mud
def voronoi_edges(npts, thr):
    pts = rng.uniform(0, N, size=(npts, 2))
    offs = np.array([[dx * N, dy * N] for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    allp = (pts[None, :, :] + offs[:, None, :]).reshape(-1, 2)
    d1 = np.full((N, N), 1e9, np.float32)
    d2 = np.full((N, N), 1e9, np.float32)
    for px, py in allp:
        d = np.hypot(XX - px, YY - py).astype(np.float32)
        new2 = np.minimum(d2, np.maximum(d1, d))
        d1n = np.minimum(d1, d)
        d2, d1 = new2, d1n
    return (d2 - d1) < thr, d1


def mud():
    v = 0.78 + fnoise(2.0) * 0.06 + fnoise(1.0) * 0.03
    v += 0.05 * smooth(fnoise(2.6, 1.5, 1.5), 0.0, 2.0)
    crack, d1 = voronoi_edges(28, 2.2)
    v -= 0.30 * crack * smooth(fnoise(1.5), -1.0, 0.5)
    big = tile_canvas(v)
    d = ImageDraw.Draw(big)
    for _ in range(900):  # straw bits
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        a = rng.uniform(0, np.pi)
        L = rng.uniform(5, 16)
        d.line((x, y, x + L * np.cos(a), y + L * np.sin(a)), fill=int(255 * rng.choice([0.6, 0.95])), width=1)
    save('mud', crop_centre(big))


def earth():
    v = 0.78 + fnoise(2.2) * 0.06 + fnoise(0.8) * 0.045
    v -= 0.08 * smooth(fnoise(2.6, 0.6, 0.6), 0.6, 2.4)
    big = tile_canvas(v)
    d = ImageDraw.Draw(big)
    for _ in range(1400):  # pebbles with a tiny shadow
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        r = rng.uniform(1.0, 3.6)
        d.ellipse((x - r + 1, y - r + 1.5, x + r + 1, y + r + 1.5), fill=int(255 * 0.5))
        d.ellipse((x - r, y - r, x + r, y + r), fill=int(255 * rng.uniform(0.8, 1.0)))
    out = crop_centre(big)
    out = np.asarray(Image.fromarray((out * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32) / 255.0
    save('earth', out)


# ----------------------------------------------------------------- stone ashlar
def stone():
    rows = 4
    rh = N // rows
    row = (YY // rh).astype(int)
    bw = N // 2
    xs = (XX + (row % 2) * bw / 2) % N
    col = (xs // bw).astype(int)
    xin = xs % bw
    yin = YY % rh
    m = 3
    mortar = (xin < m) | (yin < m)
    edge = np.minimum(np.minimum(xin, bw - xin), np.minimum(yin, rh - yin))
    tab = rng.uniform(0.80, 0.97, size=(rows, 2))
    face = tab[row % rows, col % 2] + fnoise(1.4) * 0.025 + fnoise(2.4, 3, 3) * 0.02
    face *= 0.90 + 0.10 * np.clip(edge / 9.0, 0, 1)
    pit = smooth(fnoise(0.8), 1.8, 3.0)
    face -= 0.08 * pit
    out = np.where(mortar, 0.66 + fnoise(1.0) * 0.02, face)
    save('stone', out * 1.04)


# ----------------------------------------------------------------- wood planks
def wood():
    n = 8
    pw = N // n
    col = (XX // pw).astype(int)
    xin = XX % pw
    base = rng.uniform(0.66, 0.92, size=n)[col % n]
    grain = fnoise(0.9, 0.45, 12.0) * 0.06 + fnoise(1.6, 0.3, 5.0) * 0.03
    rings = 0.045 * np.sin(2 * np.pi * (xin / pw * 2.5 + fnoise(2.0, 0.4, 2.0) * 0.35))
    v = base + grain + rings
    gap = (xin < 2) | (xin > pw - 2)
    v = np.where(gap, 0.30, v)
    # per-plank end seams at different heights
    for i in range(n):
        y0 = int(rng.uniform(0, N))
        sel = (col == i) & (np.abs(YY - y0) < 1.5)
        v[sel] = 0.35
    big = tile_canvas(v)
    d = ImageDraw.Draw(big)
    for _ in range(7):  # knots
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        for k in range(4):
            r = 7 - k * 1.6
            d.ellipse((x - r * 0.7, y - r * 1.5, x + r * 0.7, y + r * 1.5), outline=int(255 * (0.40 + 0.06 * k)))
        d.ellipse((x - 1.6, y - 3, x + 1.6, y + 3), fill=int(255 * 0.32))
    save('wood', crop_centre(big))


# ----------------------------------------------------------------- woven bamboo
def bamboo():
    s = N // 16
    ci, cj = (XX // s).astype(int), (YY // s).astype(int)
    horiz = ((ci + cj) % 2 == 0)
    xin, yin = XX % s / s, YY % s / s
    across = np.where(horiz, yin, xin)
    along_noise = np.where(horiz, fnoise(0.8, 5.0, 0.35), fnoise(0.8, 0.35, 5.0))
    prof = 0.62 + 0.30 * np.sin(np.pi * across) ** 0.8
    v = prof + along_noise * 0.045
    # over/under shading near the strip ends
    endd = np.where(horiz, np.minimum(xin, 1 - xin), np.minimum(yin, 1 - yin))
    v *= 0.78 + 0.22 * np.clip(endd / 0.18, 0, 1)
    gap = (np.minimum(xin, 1 - xin) < 0.03) | (np.minimum(yin, 1 - yin) < 0.03)
    v = np.where(gap, 0.30, v)
    save('bamboo', v * 1.05)


# ----------------------------------------------------------------- foliage
def foliage():
    base = 0.58 + fnoise(2.0) * 0.06
    big = tile_canvas(base)
    d = ImageDraw.Draw(big)
    for _ in range(9000):
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        a = rng.uniform(0, 2 * np.pi)
        L, W = rng.uniform(16, 32), rng.uniform(7, 13)
        ca, sa = np.cos(a), np.sin(a)
        pts = []
        for t in np.linspace(0, 2 * np.pi, 10, endpoint=False):
            px, py = np.cos(t) * L * 0.5, np.sin(t) * W * 0.5
            pts.append((x + px * ca - py * sa, y + px * sa + py * ca))
        v = rng.uniform(0.40, 0.88)
        d.polygon(pts, fill=int(255 * v))
        pts2 = [(x + (px - x) * 0.55 - 1.5, y + (py - y) * 0.55 - 1.5) for px, py in pts]
        d.polygon(pts2, fill=int(255 * min(1.0, v + 0.14)))
        d.line((x - ca * L * 0.45, y - sa * L * 0.45, x + ca * L * 0.45, y + sa * L * 0.45), fill=int(255 * v * 0.7), width=1)
    out = crop_centre(big)
    save('foliage', out * 1.06)


def bark():
    v = 0.66 + fnoise(0.9, 0.35, 10.0) * 0.09 + fnoise(1.8, 0.5, 4.0) * 0.05
    v += 0.10 * np.sin(2 * np.pi * (U * 7 + fnoise(2.0, 0.4, 2.0) * 0.4))
    v -= 0.22 * smooth(fnoise(1.0, 0.35, 9.0), 1.4, 3.0)  # deep furrows
    save('bark', v)


def metal():
    v = 0.86 + fnoise(0.7, 10.0, 0.25) * 0.022 + fnoise(2.4) * 0.025
    v -= 0.04 * (U > 0.99)
    save('metal', v)


# ----------------------------------------------------------------- ground
def grass():
    v = 0.74 + fnoise(2.0) * 0.07 + fnoise(1.0, 2, 2) * 0.03
    big = tile_canvas(v)
    d = ImageDraw.Draw(big)
    for _ in range(14000):
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        a = np.pi / 2 + rng.normal(0, 0.45)
        L = rng.uniform(5, 13)
        d.line((x, y, x + L * np.cos(a), y - L * np.sin(a)), fill=int(255 * rng.uniform(0.55, 1.0)), width=1)
    save('grass', crop_centre(big))


def asphalt():
    g = rng.normal(0, 1, (N, N)).astype(np.float32)
    g = np.asarray(Image.fromarray(((g * 0.5 + 0.5).clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), dtype=np.float32) / 255.0 - 0.5
    v = 0.80 + g * 0.55 + fnoise(2.2) * 0.04
    big = tile_canvas(v)
    d = ImageDraw.Draw(big)
    for _ in range(3000):
        x, y = rng.uniform(0, 3 * N), rng.uniform(0, 3 * N)
        r = rng.uniform(0.7, 1.7)
        d.ellipse((x - r, y - r, x + r, y + r), fill=int(255 * rng.uniform(0.92, 1.0)))
    save('asphalt', crop_centre(big))


def water():
    h = np.zeros((N, N), np.float32)
    for _ in range(14):
        a, b = rng.integers(2, 9), rng.integers(2, 9) * rng.choice([-1, 1])
        h += np.sin(2 * np.pi * (a * U + b * V) + rng.uniform(0, 6.28)) * rng.uniform(0.4, 1.0)
    h /= 3.0
    caustic = np.exp(-np.abs(h) * 3.0)
    v = 0.76 + 0.05 * h + 0.14 * caustic + fnoise(1.4) * 0.01
    save('water', v)


def glass():
    v = 0.74 + 0.05 * np.cos(2 * np.pi * V) + fnoise(2.4) * 0.012
    s1 = np.sin(2 * np.pi * (2 * U + 1 * V))
    s2 = np.sin(2 * np.pi * (3 * U + 2 * V + 0.3))
    v += 0.20 * smooth(s1, 0.55, 0.95) + 0.10 * smooth(s2, 0.7, 0.98)
    v -= 0.10 * smooth(fnoise(2.6, 1.5, 0.5), 1.0, 2.5)
    save('glass', v)


if __name__ == '__main__':
    only = set(sys.argv[1:])
    for fn in (brick, plaster, concrete, tin, thatch, roof_tile, mud, earth, stone, wood, bamboo, foliage, bark, metal, grass, asphalt, water, glass):
        if not only or fn.__name__ in only:
            fn()
