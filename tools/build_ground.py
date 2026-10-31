"""
Builds the ground photo of every 500 m global tile of a region:   public/regions/<id>/ground/<i>_<j>.jpg

Each reference image of the region (region.json -> references) is placed by its own ground control points; for every tile
the finest reference that covers a pixel wins (soft 25 m edge), the coarser ones fill the rest. The coarse screenshot is colour-matched to the
finer photo first, so the seam is not a hard colour jump. Tile (i, j) = easting i*500.., northing j*500.. of the national projection,
the same grid the game uses (src/geo/Tiles.ts).

Usage:  python tools/build_ground.py bogura
"""
import json, math, os, sys
import cv2
import numpy as np

TILE = 500.0
FINE_PX, COARSE_PX = 512, 128

rid = sys.argv[1] if len(sys.argv) > 1 else 'bogura'
reg = json.load(open(f'public/regions/{rid}/region.json'))

class Ref:
    def __init__(self, d):
        self.id, self.w, self.h = d['id'], d['width'], d['height']
        p, q = d['gcps']
        self.sx = (q['e'] - p['e']) / (q['px'] - p['px'])            # m per pixel (east)
        self.sy = (q['n'] - p['n']) / (q['py'] - p['py'])            # negative: pixel y grows southwards
        self.e0 = p['e'] - self.sx * p['px']
        self.n0 = p['n'] - self.sy * p['py']
        self.mpp = abs(self.sx)
        self.img = cv2.imread(f'sources/{rid}/{d["image"]}', cv2.IMREAD_COLOR)
        assert self.img is not None and self.img.shape[1] == self.w and self.img.shape[0] == self.h, d['image']
    def bounds(self):
        return (self.e0, self.e0 + self.sx * self.w, self.n0 + self.sy * self.h, self.n0)   # minE maxE minN maxN
    def to_px(self, E, N):
        return (E - self.e0) / self.sx, (N - self.n0) / self.sy
    def sample(self, E, N, interp=cv2.INTER_CUBIC):
        px, py = self.to_px(E, N)
        img = cv2.remap(self.img, px.astype(np.float32), py.astype(np.float32), interp, borderMode=cv2.BORDER_REFLECT_101)  # outside the photo: mirrored, never streaks
        edge = np.minimum.reduce([px, self.w - px, py, self.h - py])      # pixels to the nearest image edge
        return img.astype(np.float32), edge

refs = sorted((Ref(d) for d in reg['references']), key=lambda r: r.mpp)       # finest first
coarse = refs[-1]

# --- colour-match every coarser reference to the finest one over their overlap (per-channel mean / std) ---
def match(src, ref):
    E0, E1, N0, N1 = [max(a, b) if k in (0, 2) else min(a, b) for k, (a, b) in enumerate(zip(src.bounds(), ref.bounds()))]
    if E1 <= E0 or N1 <= N0: return None
    step = src.mpp
    E, N = np.meshgrid(np.arange(E0, E1, step), np.arange(N1, N0, -step))
    a, ea = src.sample(E, N, cv2.INTER_AREA)
    b, eb = ref.sample(E, N, cv2.INTER_AREA)
    ok = (ea > 8) & (eb > 8)
    gain, bias = [], []
    for c in range(3):
        sa, sb = a[..., c][ok], b[..., c][ok]
        g = float(np.clip(sb.std() / max(sa.std(), 1e-3), 0.6, 1.8)); gain.append(g); bias.append(float(sb.mean() - g * sa.mean()))
    return np.array(gain, np.float32), np.array(bias, np.float32)
fix = {}
for r in refs[1:]:
    m = match(r, refs[0])
    if m: fix[r.id] = m; print('colour match', r.id, '-> gain', np.round(m[0], 2), 'bias', np.round(m[1], 1))

# --- tiles covered by the union of references ---
minE = min(r.bounds()[0] for r in refs); maxE = max(r.bounds()[1] for r in refs)
minN = min(r.bounds()[2] for r in refs); maxN = max(r.bounds()[3] for r in refs)
i0, i1 = math.floor(minE / TILE), math.ceil(maxE / TILE) - 1
j0, j1 = math.floor(minN / TILE), math.ceil(maxN / TILE) - 1
os.makedirs(f'public/regions/{rid}/ground', exist_ok=True)
n_fine = n_all = 0; total = 0
for j in range(j0, j1 + 1):
    for i in range(i0, i1 + 1):
        tb = (i * TILE, (i + 1) * TILE, j * TILE, (j + 1) * TILE)
        fine_here = any(r is not coarse and r.bounds()[0] < tb[1] and r.bounds()[1] > tb[0] and r.bounds()[2] < tb[3] and r.bounds()[3] > tb[2] for r in refs)
        S = FINE_PX if fine_here else COARSE_PX
        E, N = np.meshgrid(i * TILE + (np.arange(S) + 0.5) * TILE / S, (j + 1) * TILE - (np.arange(S) + 0.5) * TILE / S)
        out = None
        for r in reversed(refs):                       # coarse first, finer on top
            img, edge = r.sample(E, N)
            if r.id in fix: img = img * fix[r.id][0] + fix[r.id][1]
            alpha = np.clip((edge - 0.5) / (25.0 / r.mpp), 0, 1)[..., None] if r is not coarse else 1.0
            out = img if out is None else out * (1 - alpha) + img * alpha
        cv2.imwrite(f'public/regions/{rid}/ground/{i}_{j}.jpg', np.clip(out, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 80])
        n_all += 1; n_fine += fine_here
print(f'{n_all} tiles ({n_fine} fine {FINE_PX}px, {n_all - n_fine} coarse {COARSE_PX}px), i {i0}..{i1}, j {j0}..{j1}')
tot = sum(os.path.getsize(f'public/regions/{rid}/ground/{f}') for f in os.listdir(f'public/regions/{rid}/ground'))
print('ground size %.1f MB' % (tot / 1e6))
