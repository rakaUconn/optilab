"""Real (exact) 3D sequential ray trace through conic/spherical surfaces, vectorised with numpy."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .glass import is_mirror, refractive_index
from .models import SystemModel
from .paraxial import surface_positions


@dataclass
class TraceResult:
    pos: np.ndarray        # (N, S+2, 3): ray start, each surface hit, image-plane hit
    dir: np.ndarray        # (N, 3) final direction
    opl: np.ndarray        # (N,) optical path length start -> image plane
    valid: np.ndarray      # (N,) bool; False if missed / clipped / TIR


def pupil_grid(rings: int) -> np.ndarray:
    """Hexapolar pupil sampling on the unit disc, (M, 2) of (px, py); first point is the centre."""
    pts = [(0.0, 0.0)]
    for r in range(1, rings + 1):
        rad = r / rings
        for k in range(6 * r):
            a = 2 * np.pi * k / (6 * r)
            pts.append((rad * np.cos(a), rad * np.sin(a)))
    return np.array(pts)


def square_pupil(n: int) -> tuple[np.ndarray, np.ndarray]:
    """n x n Cartesian grid on [-1,1]^2 and mask of points inside the unit disc."""
    g = np.linspace(-1, 1, n)
    px, py = np.meshgrid(g, g)
    return np.stack([px.ravel(), py.ravel()], axis=1), (px**2 + py**2 <= 1.0).ravel()


def _intersect(o: np.ndarray, d: np.ndarray, radius: float, k: float) -> tuple[np.ndarray, np.ndarray]:
    """Intersect rays (vertex-local o, d) with a conic surface. Returns t, ok."""
    if radius == 0.0:
        with np.errstate(divide="ignore", invalid="ignore"):
            t = -o[:, 2] / d[:, 2]
        return t, np.isfinite(t)
    kk = 1.0 + k
    a = kk * d[:, 2] ** 2 + d[:, 0] ** 2 + d[:, 1] ** 2
    b = 2.0 * (kk * o[:, 2] * d[:, 2] + o[:, 0] * d[:, 0] + o[:, 1] * d[:, 1] - radius * d[:, 2])
    c = kk * o[:, 2] ** 2 + o[:, 0] ** 2 + o[:, 1] ** 2 - 2.0 * radius * o[:, 2]
    disc = b * b - 4 * a * c
    ok = disc >= 0
    sq = np.sqrt(np.where(ok, disc, 0.0))
    q = -0.5 * (b + np.where(b >= 0, sq, -sq))
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = q / a
        t2 = c / q
        t0 = -o[:, 2] / d[:, 2]  # intersection with the vertex plane: pick root nearest to it
    # a == 0 (e.g. an on-axis ray on a paraboloid): the quadratic degenerates to a linear equation whose
    # root is t2; likewise t2 is undefined when q == 0
    f1, f2 = np.isfinite(t1), np.isfinite(t2)
    t1, t2 = np.where(f1, t1, t2), np.where(f2, t2, t1)
    t0 = np.where(np.isfinite(t0), t0, np.where(np.isfinite(t1), t1, 0.0))
    t = np.where(np.abs(t1 - t0) <= np.abs(t2 - t0), t1, t2)
    return t, ok


def _normal(p: np.ndarray, radius: float, k: float) -> np.ndarray:
    if radius == 0.0:
        n = np.zeros_like(p)
        n[:, 2] = 1.0
        return n
    n = np.stack([p[:, 0], p[:, 1], (1.0 + k) * p[:, 2] - radius], axis=1)
    return n / np.linalg.norm(n, axis=1, keepdims=True)


def launch(model: SystemModel, enp_z: float, field_deg: float, pupil_xy: np.ndarray):
    """Rays from infinity: points on the entrance-pupil plane, direction set by field angle."""
    r = model.aperture.value / 2
    th = np.radians(field_deg)
    d = np.array([0.0, np.sin(th), np.cos(th)])
    o = np.zeros((len(pupil_xy), 3))
    o[:, 0] = pupil_xy[:, 0] * r
    o[:, 1] = pupil_xy[:, 1] * r
    o[:, 2] = enp_z
    # shift the chief ray so it passes through the pupil centre *at* the pupil plane (already true)
    return o, np.tile(d, (len(pupil_xy), 1))


def trace(model: SystemModel, wl: float, o: np.ndarray, d: np.ndarray, image_z: float,
          clip: bool = True) -> TraceResult:
    n = len(o)
    zs = surface_positions(model)
    S = len(model.surfaces)
    pos = np.zeros((n, S + 2, 3))
    pos[:, 0] = o
    valid = np.ones(n, dtype=bool)
    opl = np.zeros(n)
    n_before = 1.0
    o = o.copy()
    d = d.copy()
    for i, s in enumerate(model.surfaces):
        mirror = is_mirror(s.glass)
        n_after = n_before if mirror else refractive_index(s.glass, wl)
        ol = o - np.array([0.0, 0.0, zs[i]])
        t, ok = _intersect(ol, d, s.radius, s.conic)
        valid &= ok
        p = ol + t[:, None] * d
        opl += n_before * t
        if clip:
            valid &= (p[:, 0] ** 2 + p[:, 1] ** 2) <= s.semi_diameter**2 * (1 + 1e-9)
        nrm = _normal(p, s.radius, s.conic)
        cos_i = -np.einsum("ij,ij->i", nrm, d)
        nrm = np.where((cos_i < 0)[:, None], -nrm, nrm)
        cos_i = np.abs(cos_i)
        if mirror:
            d = d + 2.0 * cos_i[:, None] * nrm
        else:
            mu = n_before / n_after
            kk = 1.0 - mu * mu * (1.0 - cos_i * cos_i)
            valid &= kk >= 0  # TIR
            root = np.sqrt(np.where(kk >= 0, kk, 0.0))
            d = mu * d + (mu * cos_i - root)[:, None] * nrm
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        o = p + np.array([0.0, 0.0, zs[i]])
        pos[:, i + 1] = o
        n_before = n_after
    # image plane
    with np.errstate(divide="ignore", invalid="ignore"):
        t = (image_z - o[:, 2]) / d[:, 2]
    valid &= np.isfinite(t)
    o = o + np.where(np.isfinite(t), t, 0.0)[:, None] * d
    opl += n_before * np.where(np.isfinite(t), t, 0.0)
    pos[:, S + 1] = o
    return TraceResult(pos=pos, dir=d, opl=opl, valid=valid)
