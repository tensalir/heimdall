"""Bake the raw oobrien/vis OSM-derived tube + Thames data down to a
compact geometry.json that the one-pager can load inline.

Outputs:
  data/geometry.json
    - bbox: [minLng, minLat, maxLng, maxLat]
    - thames: list of polygon rings (each a list of [lng,lat])
    - lines: { lineName: list of polylines (each a list of [lng,lat]) }
    - wembleyStadium: [lng, lat]
    - wembleyPark: [lng, lat]
    - wembleyCentral: [lng, lat]
"""

from __future__ import annotations

import json
import math
import pathlib
from typing import Iterable

HERE = pathlib.Path(__file__).parent
DATA_DIR = HERE / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Bounding box that comfortably includes every booked frame (Eastcote in the
# far west at -0.397 and Southgate in the north at 51.632) plus Wembley Park
# in the NW, with a small breathing margin.
BBOX = (-0.42, 51.40, 0.05, 51.65)  # minLng, minLat, maxLng, maxLat

# Lines we care about (must match keys in the oobrien lines[].name field).
LINES_OF_INTEREST = {
    "Jubilee",
    "Metropolitan",
    "Bakerloo",
    "Piccadilly",
    "Northern",
    "Victoria",
    "Central",
    "DLR",
}

# TfL official colours.
LINE_COLORS = {
    "Jubilee": "#A1A5A7",
    "Metropolitan": "#9B0058",
    "Bakerloo": "#B36305",
    "Piccadilly": "#003688",
    "Northern": "#000000",
    "Victoria": "#0098D4",
    "Central": "#E32017",
    "DLR": "#00A4A7",
}

# Known landmark coordinates (lng, lat). Wembley Stadium centre and the two
# tube stations that serve it. Verified from Wikipedia / OSM.
LANDMARKS = {
    "wembleyStadium": [-0.27958, 51.55598],
    "wembleyPark": [-0.27947, 51.56344],
    "wembleyCentral": [-0.29644, 51.55207],
    "wembleyStadiumStation": [-0.2854, 51.55406],
    "olympicWay": [-0.27935, 51.5596],
}


def perpendicular_distance(pt, a, b) -> float:
    """Perpendicular distance from pt to line a-b, in 2D euclidean."""
    if a == b:
        return math.hypot(pt[0] - a[0], pt[1] - a[1])
    x0, y0 = pt
    x1, y1 = a
    x2, y2 = b
    num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
    den = math.hypot(y2 - y1, x2 - x1)
    return num / den


def rdp(points: list[list[float]], epsilon: float) -> list[list[float]]:
    """Iterative Douglas-Peucker, returns a simplified polyline."""
    if len(points) < 3:
        return points[:]
    dmax = 0.0
    index = 0
    for i in range(1, len(points) - 1):
        d = perpendicular_distance(points[i], points[0], points[-1])
        if d > dmax:
            dmax = d
            index = i
    if dmax > epsilon:
        left = rdp(points[: index + 1], epsilon)
        right = rdp(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def in_bbox(pt) -> bool:
    return BBOX[0] <= pt[0] <= BBOX[2] and BBOX[1] <= pt[1] <= BBOX[3]


def clip_polyline(coords: list[list[float]]) -> list[list[list[float]]]:
    """Split a polyline into sub-polylines wherever it leaves the bbox.
    Cheap clipping: keep segments where at least one endpoint is in the bbox.
    """
    out: list[list[list[float]]] = []
    cur: list[list[float]] = []
    for pt in coords:
        if in_bbox(pt):
            cur.append(pt)
        else:
            # Keep one out-of-bbox point so the line visually exits cleanly.
            if cur:
                cur.append(pt)
                out.append(cur)
                cur = []
    if cur:
        out.append(cur)
    return [seg for seg in out if len(seg) >= 2]


def polygon_intersects_bbox(ring: list[list[float]]) -> bool:
    """Cheap intersect test: any vertex in bbox, or bbox vertex in ring (skip),
    or the ring bbox overlaps our bbox."""
    if any(in_bbox(p) for p in ring):
        return True
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    rmin = (min(lngs), min(lats))
    rmax = (max(lngs), max(lats))
    return not (
        rmax[0] < BBOX[0]
        or rmin[0] > BBOX[2]
        or rmax[1] < BBOX[1]
        or rmin[1] > BBOX[3]
    )


def bake_lines() -> dict[str, list[list[list[float]]]]:
    raw = json.loads((HERE / "_raw_tfl_lines.json").read_bytes())
    by_line: dict[str, list[list[list[float]]]] = {n: [] for n in LINES_OF_INTEREST}
    for feat in raw.get("features", []):
        geom = feat.get("geometry", {})
        if geom.get("type") != "LineString":
            continue
        props = feat.get("properties", {})
        names = {l.get("name") for l in props.get("lines", []) if isinstance(l, dict)}
        relevant = names & LINES_OF_INTEREST
        if not relevant:
            continue
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        for seg in clip_polyline(coords):
            simplified = rdp(seg, epsilon=0.0008)  # ~80m in mid-latitudes
            if len(simplified) >= 2:
                for name in relevant:
                    by_line[name].append(simplified)
    for name, segs in by_line.items():
        total_pts = sum(len(s) for s in segs)
        print(f"  {name}: {len(segs)} segments, {total_pts} pts")
    return by_line


def bake_thames() -> list[list[list[float]]]:
    raw = json.loads((HERE / "_raw_river_thames_simp.json").read_bytes())
    rings: list[list[list[float]]] = []
    for feat in raw.get("features", []):
        geom = feat.get("geometry", {})
        if geom.get("type") != "Polygon":
            continue
        for ring in geom.get("coordinates", []):
            if len(ring) < 4:
                continue
            if not polygon_intersects_bbox(ring):
                continue
            # Aggressive simplification for the Thames since it's purely
            # decorative low-poly geometry, not navigational.
            simplified = rdp(ring, epsilon=0.0010)
            if len(simplified) >= 4:
                rings.append(simplified)
    total = sum(len(r) for r in rings)
    print(f"  thames: {len(rings)} rings, {total} pts")
    return rings


def main() -> None:
    print("Baking tube lines...")
    lines = bake_lines()
    print("Baking Thames polygons...")
    thames = bake_thames()

    geom = {
        "bbox": list(BBOX),
        "lineColors": LINE_COLORS,
        "lines": lines,
        "thames": thames,
        "landmarks": LANDMARKS,
    }

    out = DATA_DIR / "geometry.json"
    out.write_text(json.dumps(geom, separators=(",", ":")), encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    print(f"Wrote {out}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
