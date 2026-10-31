"""
Bogura roads, traced by hand / ridge-filter from the georeferenced airport photo (sources/bogura/airport_full.jpg = the original
1.jpg with its map frame). Pixel -> UTM uses the tick-mark fit (E = E0 + sx*px, N = N0 - sy*py), residual 0.05 m.
Run:  python tools/trace_bogura_roads.py   -> writes public/regions/bogura/roads.json
Edit the PICKS below (pixels of the full photo) and re-run to adjust a road.
"""
import json, math, sys
import numpy as np

E0, N0, SX, SY = 733163.9164, 2753676.0500, 1.278042, 1.277999   # 1.jpg tick fit

def px2en(px, py):
    return (E0 + SX * px, N0 - SY * py)

def rdp(pts, tol):
    if len(pts) < 3: return pts
    a, b = np.array(pts[0]), np.array(pts[-1]); ab = b - a; L = np.hypot(*ab)
    d = [abs(np.cross(ab, np.array(p) - a)) / L if L else np.hypot(*(np.array(p) - a)) for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] > tol: return rdp(pts[:i + 1], tol)[:-1] + rdp(pts[i:], tol)
    return [pts[0], pts[-1]]

roads, areas = [], []

# --- Bogura main road: ridge-filter centreline (tools/ output kept in hw_path.json) ---
try:
    hw = json.load(open('tools/highway_px.json'))
    pts = rdp(list(zip(hw['x'][::4], hw['y'][::4])), 0.8)
except FileNotFoundError:
    sys.exit('tools/highway_px.json missing')
roads.append(dict(id='bogura-main-road', name='Bogura main road', kind='highway', width=10.0, points=[px2en(*p) for p in pts]))

# --- Runway: axis through both threshold bars, pavement ends found from the colour profile ---
A = np.array([318.3, 948.3]); B = np.array([1106.7, 1385.0])
d = (B - A) / np.linalg.norm(B - A); n = np.array([-d[1], d[0]])
off = 1.5                                   # edge-line peaks were at -10/+13 px -> true centre is +1.5 px
r0 = A + d * -70 + n * off; r1 = A + d * 975 + n * off
roads.append(dict(id='runway', name='Bogura airport runway (bearing 119/299)', kind='runway', width=30.0, points=[px2en(*r0), px2en(*r1)]))

# --- Taxiway from the runway edge to the apron ---
roads.append(dict(id='taxiway-1', name='Taxiway to apron', kind='taxiway', width=14.0, points=[px2en(724, 1189), px2en(731, 1240)]))

# --- Apron: rectangle aligned with the runway ---
c1 = np.array([692.5, 1235.0]); c2 = c1 + 95 * d; c3 = c2 + 48 * n; c4 = c1 + 48 * n
areas.append(dict(id='apron', name='Apron', kind='apron', points=[px2en(*c) for c in (c1, c2, c3, c4)]))

# --- Airport access road: terminal -> south -> joins the main road ---
acc = [(652, 1338), (645, 1357), (620, 1380), (595, 1415), (581, 1460), (571, 1510), (570, 1560), (575, 1610), (585, 1650), (591, 1676)]
acc_en = [px2en(*p) for p in acc]
def snap_to(poly, p):                      # closest point of a polyline to p (so the junction really sits on the main road)
    best, bd = p, 1e18
    for a, b in zip(poly[:-1], poly[1:]):
        ax, ay = a; dx, dy = b[0] - ax, b[1] - ay; l2 = dx * dx + dy * dy
        t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) if l2 else 0
        q = (ax + t * dx, ay + t * dy); d = math.dist(p, q)
        if d < bd: best, bd = q, d
    return best
acc_en[-1] = snap_to(roads[0]['points'], acc_en[-1])
roads.append(dict(id='airport-access-road', name='Airport access road', kind='access', width=7.0, points=acc_en))

def rnd(p): return [round(p[0], 2), round(p[1], 2)]
for r in roads: r['points'] = [rnd(p) for p in r['points']]
for a in areas: a['points'] = [rnd(p) for p in a['points']]
out = dict(crs='national projection (UTM zone 45N extended), metres: [easting, northing]', source='airport photo, ticks fit 0.05 m rms; traced by hand + ridge filter - first pass', roads=roads, areas=areas)
json.dump(out, open('public/regions/bogura/roads.json', 'w'), indent=1)
for r in roads:
    L = sum(math.dist(r['points'][i], r['points'][i + 1]) for i in range(len(r['points']) - 1))
    print('%-22s %-8s w=%4.1f  %3d pts  %6.0f m' % (r['id'], r['kind'], r['width'], len(r['points']), L))
