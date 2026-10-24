#!/usr/bin/env python3
"""Builds src/data/worldMask.ts: the playable world-shaped arena.

Source: Natural Earth 110m land (public domain). Rasterized equirectangular, then cleaned so the arena has
no tiny pockets, thin channels, one-cell spurs or diagonal pinch points (they read as obstacles), and all
landmasses are joined by short wide land bridges so every player can reach every other.

  python3 tools/make_world_mask.py            # downloads the data if needed, writes src/data/worldMask.ts
"""
import base64, json, os, sys, urllib.request
from collections import deque

NX, NY = 440, 164                     # 2x the old 220x82: a 4x bigger world, same cell size, same lat 82N..-52S
LAT_TOP = 82.0
STEP = 360.0 / NX
URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'
CACHE = '/tmp/ne_110m_land.geojson'
HOLE_FILL = 1000                       # enclosed water smaller than this (in cells) becomes land
BRIDGE_MAX = 28                       # join landmasses closer than this many cells
MIN_ISLAND = 160                       # drop landmasses smaller than this unless bridged
MARGIN = 3                            # ocean left around the whole map, so no land ever touches the map border
MIN_WIDTH_R = 2                       # land and water channels narrower than ~2*R+1 = 5 cells are removed: no necks a head can't fit through

if not os.path.exists(CACHE):
    urllib.request.urlretrieve(URL, CACHE)
polys = []
for f in json.load(open(CACHE))['features']:
    g = f['geometry']
    for rings in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
        xs = [p[0] for p in rings[0]]; ys = [p[1] for p in rings[0]]
        polys.append(((min(xs), min(ys), max(xs), max(ys)), rings))

def inside(lon, lat):
    for (x0, y0, x1, y1), rings in polys:
        if lon < x0 or lon > x1 or lat < y0 or lat > y1: continue
        c = False
        for r in rings:
            j = len(r) - 1
            for i in range(len(r)):
                xi, yi = r[i]; xj, yj = r[j]
                if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi: c = not c
                j = i
        if c: return True
    return False

# 1. rasterize (3x3 samples per cell, a cell is land when at least 3 of 9 are)
land = [[0] * NX for _ in range(NY)]
for y in range(NY):
    for x in range(NX):
        hits = sum(inside(-180 + (x + sx) * STEP, LAT_TOP - (y + sy) * STEP) for sy in (.17, .5, .83) for sx in (.17, .5, .83))
        land[y][x] = 1 if hits >= 3 else 0

# 1b. leave an ocean margin around the map
for y in range(NY):
    for x in range(NX):
        if x < MARGIN or y < MARGIN or x >= NX - MARGIN or y >= NY - MARGIN: land[y][x] = 0

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
def get(m, x, y): return m[y][x] if 0 <= x < NX and 0 <= y < NY else 0
def disc(r): return [(dx, dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r + r]
DISC = disc(MIN_WIDTH_R)
def dilate_d(m): return [[1 if any(get(m, x + dx, y + dy) for dx, dy in DISC) else 0 for x in range(NX)] for y in range(NY)]
def erode_d(m):   # outside the map counts as water; the ocean margin keeps land away from the border anyway
    def g(x, y): return m[y][x] if 0 <= x < NX and 0 <= y < NY else 0
    return [[1 if all(g(x + dx, y + dy) for dx, dy in DISC) else 0 for x in range(NX)] for y in range(NY)]

# 2. closing: fill water channels and bays narrower than ~5 cells (straits, gulfs, narrow inlets)
land = erode_d(dilate_d(land))

# 3. fill enclosed water smaller than HOLE_FILL (anything not connected to the map border)
seen = [[0] * NX for _ in range(NY)]
for y in range(NY):
    for x in range(NX):
        if land[y][x] or seen[y][x]: continue
        comp, q, touches = [], deque([(x, y)]), False
        seen[y][x] = 1
        while q:
            cx, cy = q.popleft(); comp.append((cx, cy))
            if cx in (0, NX - 1) or cy in (0, NY - 1): touches = True
            for dx, dy in N4:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < NX and 0 <= ny < NY and not land[ny][nx] and not seen[ny][nx]: seen[ny][nx] = 1; q.append((nx, ny))
        if not touches and len(comp) < HOLE_FILL:
            for cx, cy in comp: land[cy][cx] = 1

# 4. opening: remove land narrower than ~5 cells (spurs, thin peninsulas, narrow necks), rounding the coast
land = dilate_d(erode_d(land))

def tidy(m):
    """Repeat until stable: fill diagonal-only pinch points, remove cells with fewer than two land neighbours."""
    changed = True
    while changed:
        changed = False
        for y in range(NY - 1):
            for x in range(NX - 1):
                a_, b_, c_, d_ = m[y][x], m[y][x + 1], m[y + 1][x], m[y + 1][x + 1]
                if a_ and d_ and not b_ and not c_: m[y][x + 1] = 1; changed = True
                elif b_ and c_ and not a_ and not d_: m[y][x] = 1; changed = True
        for y in range(NY):
            for x in range(NX):
                if m[y][x] and sum(get(m, x + dx, y + dy) for dx, dy in N4) < 2: m[y][x] = 0; changed = True

# 5. no diagonal-only pinch points and no spurs
tidy(land)

def components(m):
    seen = [[0] * NX for _ in range(NY)]; out = []
    for y in range(NY):
        for x in range(NX):
            if m[y][x] and not seen[y][x]:
                comp, q = [], deque([(x, y)]); seen[y][x] = 1
                while q:
                    cx, cy = q.popleft(); comp.append((cx, cy))
                    for dx, dy in N4:
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < NX and 0 <= ny < NY and m[ny][nx] and not seen[ny][nx]: seen[ny][nx] = 1; q.append((nx, ny))
                out.append(comp)
    return out

def carve(a, b):                      # a 5-cell-wide land bridge, so it never reads as a thin strip or a neck
    (x, y), (x1, y1) = a, b
    path = [(x, y)]
    while (x, y) != (x1, y1):
        if x != x1 and abs(x1 - x) >= abs(y1 - y): x += 1 if x1 > x else -1
        elif y != y1: y += 1 if y1 > y else -1
        else: x += 1 if x1 > x else -1
        path.append((x, y))
    for px, py in path:
        for dx, dy in DISC:
            if 0 <= px + dx < NX and 0 <= py + dy < NY: land[py + dy][px + dx] = 1

# 6. join near landmasses with wide bridges; drop the rest
bridges = 0
while True:
    comps = sorted(components(land), key=len, reverse=True)
    main = comps[0]
    best = None
    for c in comps[1:]:
        if len(c) < MIN_ISLAND: continue
        for ax, ay in c[::2]:
            for bx, by in main[::2]:
                dd = max(abs(ax - bx), abs(ay - by))
                if best is None or dd < best[0]: best = (dd, (ax, ay), (bx, by))
    if best is None or best[0] > BRIDGE_MAX: break
    carve(best[1], best[2]); bridges += 1
for y in range(NY):
    for x in range(NX):
        if x < MARGIN or y < MARGIN or x >= NX - MARGIN or y >= NY - MARGIN: land[y][x] = 0
tidy(land)
keep = set(sorted(components(land), key=len, reverse=True)[0])
land = [[1 if (x, y) in keep else 0 for x in range(NX)] for y in range(NY)]

# final self-check: the generated map must have no spurs and no pinch points
for y in range(NY):
    for x in range(NX):
        if land[y][x]:
            assert sum(get(land, x + dx, y + dy) for dx, dy in N4) >= 2, f'spur at {x},{y}'
            assert not (get(land, x + 1, y + 1) and not get(land, x + 1, y) and not get(land, x, y + 1)), f'pinch at {x},{y}'

total = sum(map(sum, land))
surv = sum(map(sum, dilate_d(erode_d(land))))
print(f'{NX}x{NY} arena | land cells {total} | bridges {bridges} | cells that survive a width-{2*MIN_WIDTH_R+1} opening: {100*surv/total:.1f}%', file=sys.stderr)
for y in range(0, NY, 2): print(''.join('#' if land[y][x] else '.' for x in range(0, NX, 2)), file=sys.stderr)

bits = [land[y][x] for y in range(NY) for x in range(NX)]
while len(bits) % 8: bits.append(0)
raw = bytes(int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8))
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'worldMask.ts')
open(out, 'w').write(f"""// GENERATED by tools/make_world_mask.py: do not edit by hand.
// The whole world as an arena: land is playable, ocean is outside it. Natural Earth 110m land (public domain),
// rasterized at {NX}x{NY} (equirectangular, lat 82N to 52S), then cleaned: thin channels and small enclosed seas
// filled, spurs and diagonal pinch points removed, landmasses joined by wide bridges.
import type {{ ArenaShape }} from './shape.ts';

export const WORLD_SHAPE: ArenaShape = {{
  id: 'WORLD', name: 'World', nx: {NX}, ny: {NY},
  mask: '{base64.b64encode(raw).decode()}',
}};
""")
print('wrote', os.path.normpath(out), file=sys.stderr)
