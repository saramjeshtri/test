"""
One-time preprocessing: projects the real Elbasan building-footprint data
(public/data/buildings.geojson, 9409 buildings) into a small static SVG --
a genuine "city blueprint" to use as the Command Center's page background,
instead of an abstract dot-grid. Not meant to be re-run automatically; rerun
manually if buildings.geojson changes.

Samples every Nth building (kept spatially representative since the source
file is roughly index-ordered by location) to keep the output file light,
and reduces each footprint to its bounding box (a faint field of thousands
of small rects reads the same as full outlines at the low opacity/small
scale this is used at, at a fraction of the file size).
"""
import json
import math

SRC = "public/data/buildings.geojson"
OUT = "public/city-blueprint.svg"
SAMPLE_EVERY = 3  # ~3100 of 9409 buildings
VIEW_W = 1600
VIEW_H = 1000

with open(SRC) as f:
    data = json.load(f)

features = data["features"][::SAMPLE_EVERY]

min_lon = min_lat = 1e9
max_lon = max_lat = -1e9
boxes = []

for feat in features:
    geom = feat["geometry"]
    coords = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    blon0, blon1 = min(lons), max(lons)
    blat0, blat1 = min(lats), max(lats)
    boxes.append((blon0, blat0, blon1, blat1))
    min_lon = min(min_lon, blon0)
    max_lon = max(max_lon, blon1)
    min_lat = min(min_lat, blat0)
    max_lat = max(max_lat, blat1)

# rough cos(latitude) correction so longitude degrees aren't stretched
# relative to latitude degrees at this latitude band
lat_mid = (min_lat + max_lat) / 2
lon_scale = math.cos(math.radians(lat_mid))

lon_span = (max_lon - min_lon) * lon_scale
lat_span = max_lat - min_lat
data_aspect = lon_span / lat_span
view_aspect = VIEW_W / VIEW_H

if data_aspect > view_aspect:
    draw_w = VIEW_W
    draw_h = VIEW_W / data_aspect
else:
    draw_h = VIEW_H
    draw_w = VIEW_H * data_aspect
off_x = (VIEW_W - draw_w) / 2
off_y = (VIEW_H - draw_h) / 2

def project(lon, lat):
    x = off_x + (lon - min_lon) * lon_scale / (max_lon - min_lon) * draw_w
    y = off_y + (max_lat - lat) / (max_lat - min_lat) * draw_h
    return x, y

rects = []
for (blon0, blat0, blon1, blat1) in boxes:
    x0, y0 = project(blon0, blat1)  # top-left: min lon, max lat
    x1, y1 = project(blon1, blat0)  # bottom-right: max lon, min lat
    w = max(x1 - x0, 0.6)
    h = max(y1 - y0, 0.6)
    rects.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{w:.1f}" height="{h:.1f}"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W} {VIEW_H}">
<g fill="#2D5016">
{''.join(rects)}
</g>
</svg>'''

with open(OUT, "w") as f:
    f.write(svg)

import os
print(f"Wrote {len(rects)} building footprints to {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")
