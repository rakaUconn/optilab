"""Triangle patches for non-sequential tracing: lens tessellation and STL loading.

A patch is a set of triangles whose winding normal points from the 'front' medium (index n_front)
into the 'back' medium (index n_back).
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np

from ..glass import is_mirror, refractive_index
from ..models import SystemModel
from ..paraxial import surface_positions


@dataclass
class Patch:
    tris: np.ndarray   # (T, 3, 3)
    n_front: float
    n_back: float
    name: str = ""
    mirror: bool = False
    absorb: bool = False


def sag(r: np.ndarray, radius: float, k: float) -> np.ndarray:
    if radius == 0.0:
        return np.zeros_like(r)
    c = 1.0 / radius
    arg = 1.0 - (1.0 + k) * c * c * r * r
    return c * r * r / (1.0 + np.sqrt(np.maximum(arg, 0.0)))


def _surface_grid(radius, k, sd, z0, rings, segs):
    r = np.linspace(0.0, sd, rings + 1)
    phi = np.linspace(0.0, 2 * np.pi, segs, endpoint=False)
    R, P = np.meshgrid(r, phi, indexing="ij")
    pts = np.stack([R * np.cos(P), R * np.sin(P), z0 + sag(R, radius, k)], axis=-1)  # (rings+1, segs, 3)
    return pts


def _grid_tris(pts: np.ndarray, flip: bool) -> np.ndarray:
    a = pts[:-1, :, :]
    b = np.roll(pts, -1, axis=1)[:-1, :, :]
    c = pts[1:, :, :]
    dd = np.roll(pts, -1, axis=1)[1:, :, :]
    t1 = np.stack([a, b, c], axis=2).reshape(-1, 3, 3)
    t2 = np.stack([b, dd, c], axis=2).reshape(-1, 3, 3)
    t = np.concatenate([t1, t2])
    if flip:
        t = t[:, ::-1, :]
    # drop zero-area triangles (centre fan duplicates)
    cr = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    return t[np.linalg.norm(cr, axis=1) > 1e-14]


def derive_from_sequential(model: SystemModel, wl: float, rings: int, segs: int) -> list[Patch]:
    """One patch per optical surface (+ an edge band per glass element), all derived from the table."""
    zs = surface_positions(model)
    S = len(model.surfaces)
    patches: list[Patch] = []
    n_after, cur = [], 1.0
    for s in model.surfaces:
        cur = cur if is_mirror(s.glass) else refractive_index(s.glass, wl)
        n_after.append(cur)
    for i, s in enumerate(model.surfaces):
        n_before = 1.0 if i == 0 else n_after[i - 1]
        if is_mirror(s.glass):
            pts = _surface_grid(s.radius, s.conic, s.semi_diameter, zs[i], rings, segs)
            patches.append(Patch(_grid_tris(pts, flip=False), n_before, n_before, f"mirror {i}", mirror=True))
            continue
        if abs(n_before - n_after[i]) < 1e-12:
            continue  # dummy surface
        pts = _surface_grid(s.radius, s.conic, s.semi_diameter, zs[i], rings, segs)
        # winding with e_phi x e_r = -z : normal toward -z (front side = light side)
        patches.append(Patch(_grid_tris(pts, flip=False), n_before, n_after[i], f"surface {i}"))
    i = 0
    while i < S:
        if n_after[i] > 1.0 + 1e-12 and i + 1 < S and not is_mirror(model.surfaces[i + 1].glass):
            f, b = model.surfaces[i], model.surfaces[i + 1]
            F = _surface_grid(f.radius, f.conic, f.semi_diameter, zs[i], 1, segs)[-1]
            B = _surface_grid(b.radius, b.conic, b.semi_diameter, zs[i + 1], 1, segs)[-1]
            Fn, Bn = np.roll(F, -1, axis=0), np.roll(B, -1, axis=0)
            t = np.concatenate([np.stack([F, Fn, B], axis=1), np.stack([Fn, Bn, B], axis=1)])
            patches.append(Patch(t, 1.0, n_after[i], f"edge {i}"))
        i += 1
    return patches


def load_stl(data: bytes) -> np.ndarray:
    """Parse binary or ASCII STL into (T, 3, 3) triangles."""
    if data[:5].lower() == b"solid" and b"facet" in data[:1000]:
        txt = data.decode("ascii", "ignore").split()
        v = [float(txt[i + 1]) for i, w in enumerate(txt) if w == "vertex" for _ in [0]
             for j in range(1)] if False else None
        vals, i = [], 0
        while i < len(txt):
            if txt[i] == "vertex":
                vals.append([float(txt[i + 1]), float(txt[i + 2]), float(txt[i + 3])])
                i += 4
            else:
                i += 1
        return np.array(vals).reshape(-1, 3, 3)
    n = struct.unpack("<I", data[80:84])[0]
    dt = np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    return np.frombuffer(data, dtype=dt, count=n, offset=84)["v"].astype(float)


def rotation_matrix(rx: float, ry: float, rz: float) -> np.ndarray:
    """R = Rz · Ry · Rx, angles in degrees."""
    a, b, c = np.radians([rx, ry, rz])
    ca, sa, cb, sb, cc, sc = np.cos(a), np.sin(a), np.cos(b), np.sin(b), np.cos(c), np.sin(c)
    Rx = np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])
    Ry = np.array([[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]])
    Rz = np.array([[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def pose(tris: np.ndarray, position, rotation_deg) -> np.ndarray:
    """Apply the solid pose to (T, 3, 3) local-coordinate triangles. Proper rotations keep outward winding."""
    if len(tris) == 0:
        return tris
    R = rotation_matrix(*rotation_deg)
    return tris @ R.T + np.asarray(position, float)
