"""Non-sequential Monte-Carlo-free ray splitting: collimated grid -> detector irradiance + ghosts."""
from __future__ import annotations

import numpy as np

from ..models import IrradianceResult, SystemModel
from ..paraxial import solve
from ..glass import refractive_index
from .mesh import Patch, derive_from_sequential, pose, rotation_matrix

EPS = 1e-9


def fresnel_unpolarised(cos_i: np.ndarray, n1: np.ndarray, n2: np.ndarray):
    """Returns (R, cos_t, tir)."""
    sin_t2 = (n1 / n2) ** 2 * (1.0 - cos_i**2)
    tir = sin_t2 >= 1.0
    cos_t = np.sqrt(np.maximum(1.0 - sin_t2, 0.0))
    rs = ((n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t)) ** 2
    rp = ((n1 * cos_t - n2 * cos_i) / (n1 * cos_t + n2 * cos_i)) ** 2
    R = np.where(tir, 1.0, 0.5 * (rs + rp))
    return R, cos_t, tir


def _intersect(o, d, e0, e1, v0, check=lambda: None, chunk_elems=3_000_000):
    """Nearest triangle hit per ray: returns t, tri index (-1 if none)."""
    n = len(o)
    T = len(v0)
    best_t = np.full(n, np.inf)
    best_i = np.full(n, -1, dtype=np.int64)
    step = max(1, chunk_elems // max(T, 1))
    for s in range(0, n, step):
        check()
        oo = o[s:s + step][:, None, :]
        dd = d[s:s + step][:, None, :]
        pv = np.cross(dd, e1[None, :, :])
        det = np.einsum("rtk,tk->rt", pv, e0)
        ok = np.abs(det) > 1e-14
        inv = 1.0 / np.where(ok, det, 1.0)
        tv = oo - v0[None, :, :]
        u = np.einsum("rtk,rtk->rt", tv, pv) * inv
        qv = np.cross(tv, e0[None, :, :])
        v = np.einsum("rk,rtk->rt", d[s:s + step], qv) * inv
        t = np.einsum("tk,rtk->rt", e1, qv) * inv
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > EPS)
        t = np.where(hit, t, np.inf)
        idx = np.argmin(t, axis=1)
        tmin = t[np.arange(len(idx)), idx]
        best_t[s:s + step] = tmin
        best_i[s:s + step] = np.where(np.isfinite(tmin), idx, -1)
    return best_t, best_i


def run(model: SystemModel, progress=lambda f, m="": None, check=lambda: None) -> IrradianceResult:
    ns = model.nonseq
    wl = model.wavelengths[model.primary_wavelength].um
    par = solve(model, wl)
    patches: list[Patch] = []
    if ns.derive_from_sequential:
        patches += derive_from_sequential(model, wl, ns.tess_rings, ns.tess_segments)
    for sol in ns.extra_solids:
        n_sol = float(sol.index) if isinstance(sol.index, (int, float)) else refractive_index(str(sol.index), wl)
        glass = np.array(sol.triangles, dtype=float).reshape(-1, 3, 3)
        mirr = np.array(sol.mirror_triangles, dtype=float).reshape(-1, 3, 3)
        if len(glass):
            patches.append(Patch(pose(glass, sol.position, sol.rotation_deg), 1.0, n_sol, sol.name, absorb=sol.absorbing))
        if len(mirr):
            patches.append(Patch(pose(mirr, sol.position, sol.rotation_deg), 1.0, 1.0, sol.name + " (mirror)", mirror=True))
    tris = np.concatenate([p.tris for p in patches]) if patches else np.zeros((0, 3, 3))
    nf = np.concatenate([np.full(len(p.tris), p.n_front) for p in patches]) if patches else np.zeros(0)
    nb = np.concatenate([np.full(len(p.tris), p.n_back) for p in patches]) if patches else np.zeros(0)
    v0 = tris[:, 0]
    e0 = tris[:, 1] - v0
    e1 = tris[:, 2] - v0
    ab = np.concatenate([np.full(len(p.tris), p.absorb) for p in patches]) if patches else np.zeros(0, bool)
    mir = np.concatenate([np.full(len(p.tris), p.mirror) for p in patches]) if patches else np.zeros(0, bool)
    nrm = np.cross(e0, e1)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-300)

    det = ns.detector
    det_z = par.image_z if det.z is None else det.z
    d_n = np.array(det.normal if det.normal is not None else [0.0, 0.0, 1.0], float)
    d_n /= np.linalg.norm(d_n)
    d_c = np.array(det.center if det.center is not None else [0.0, 0.0, det_z], float)
    up = np.array([0.0, 1.0, 0.0]) if abs(d_n[1]) < 0.99 else np.array([1.0, 0.0, 0.0])
    d_u = np.cross(up, d_n)
    d_u /= np.linalg.norm(d_u)
    d_v = np.cross(d_n, d_u)
    # source
    src = ns.source
    g = np.linspace(-1, 1, src.n)
    gx, gy = np.meshgrid(g, g)
    inside = (gx**2 + gy**2 <= 1).ravel()
    r = src.beam_diameter / 2
    if src.position is not None:  # free pose: grid lies in the plane perpendicular to the beam
        Rs = rotation_matrix(*src.rotation_deg)
        d0 = Rs @ np.array([0.0, 0.0, 1.0])
        loc = np.stack([gx.ravel() * r, gy.ravel() * r, np.zeros(gx.size)], axis=1)[inside]
        o = loc @ Rs.T + np.asarray(src.position, float)
    else:
        th = np.radians(src.angle)
        d0 = np.array([0.0, np.sin(th), np.cos(th)])
        o = np.stack([gx.ravel() * r + src.offset[0], gy.ravel() * r + src.offset[1], np.full(gx.size, src.z)], axis=1)[inside]
    n_launch = len(o)
    d = np.tile(d0, (n_launch, 1))
    w = np.full(n_launch, 1.0 / n_launch)
    nmed = np.ones(n_launch)
    nref = np.zeros(n_launch, dtype=int)
    # paths of a sparse subset of launched rays are recorded for display
    pid = np.full(n_launch, -1)
    k = min(ns.preview_rays, n_launch)
    if k:
        pid[np.unique(np.linspace(0, n_launch - 1, k).astype(int))] = 1
        pid[pid >= 0] = np.arange(int((pid >= 0).sum()))
    segments: list[list[float]] = []
    STUB = 40.0

    bins = det.bins
    hw = det.half_width
    grid = np.zeros((bins, bins))
    total = 0.0
    ghost_paths = 0
    ghost_power = 0.0

    for ev in range(ns.max_events):
        check()
        progress(ev / ns.max_events, f"event {ev + 1}/{ns.max_events}: {len(o)} rays")
        if len(o) == 0:
            break
        t_obj, ti = _intersect(o, d, e0, e1, v0, check) if len(tris) else (np.full(len(o), np.inf), np.full(len(o), -1))
        with np.errstate(divide="ignore", invalid="ignore"):
            t_det = ((d_c - o) @ d_n) / (d @ d_n)
        t_det = np.where(t_det > EPS, t_det, np.inf)
        to_det = np.isfinite(t_det) & (t_det < t_obj)
        tracked = np.flatnonzero(pid >= 0)
        if len(tracked) and len(segments) < 40000:
            t_end = np.where(to_det, t_det, t_obj)[tracked]
            t_end = np.where(np.isfinite(t_end), t_end, STUB)
            p1 = o[tracked] + d[tracked] * t_end[:, None]
            segments.extend(np.concatenate([o[tracked], p1, w[tracked, None], nref[tracked, None]], axis=1).round(5).tolist())
        if to_det.any():
            p = o[to_det] + t_det[to_det, None] * d[to_det] - d_c
            ix = np.floor((p @ d_u + hw) / (2 * hw) * bins).astype(int)
            iy = np.floor((p @ d_v + hw) / (2 * hw) * bins).astype(int)
            m = (ix >= 0) & (ix < bins) & (iy >= 0) & (iy < bins)
            np.add.at(grid, (iy[m], ix[m]), w[to_det][m])
            total += float(w[to_det][m].sum())
            gm = m & (nref[to_det] >= 2)
            ghost_paths += int(gm.sum())
            ghost_power += float(w[to_det][gm].sum())
        hit = (~to_det) & (ti >= 0)
        if not hit.any():
            break
        idx = ti[hit]
        oh = o[hit] + t_obj[hit, None] * d[hit]
        dh, wh, nm, nr, ph = d[hit], w[hit], nmed[hit], nref[hit], pid[hit]
        N = nrm[idx]
        cos_s = np.einsum("ij,ij->i", N, dh)
        entering = cos_s < 0  # moving from front to back
        n1 = np.where(entering, nf[idx], nb[idx])
        n2 = np.where(entering, nb[idx], nf[idx])
        Nf = np.where(entering[:, None], N, -N)  # normal opposing the ray
        cos_i = np.abs(cos_s)
        R, cos_t, tir = fresnel_unpolarised(cos_i, n1, n2)
        is_m = mir[idx]
        R = np.where(is_m, 1.0, R)   # mirror faces reflect everything, from either side
        tir = tir | is_m
        mu = n1 / n2
        # reflected
        dr = dh + 2.0 * cos_i[:, None] * Nf
        # transmitted
        dt = mu[:, None] * dh + (mu * cos_i - cos_t)[:, None] * Nf
        dt /= np.linalg.norm(dt, axis=1, keepdims=True)
        wmin = ns.min_weight / n_launch  # threshold is relative to the launch weight
        absorbed = ab[idx]
        keep_r = (wh * R >= wmin) & ~absorbed
        keep_t = (~tir) & (wh * (1 - R) >= wmin) & ~absorbed
        o = np.concatenate([oh[keep_r], oh[keep_t]])
        d = np.concatenate([dr[keep_r], dt[keep_t]])
        w = np.concatenate([(wh * R)[keep_r], (wh * (1 - R))[keep_t]])
        nmed = np.concatenate([n1[keep_r], n2[keep_t]])
        pid = np.concatenate([ph[keep_r], ph[keep_t]])
        # only partial (Fresnel) reflections create ghosts; mirrors and total internal reflection are intended paths
        nref = np.concatenate([(nr + (~tir).astype(int))[keep_r], nr[keep_t]])
    progress(1.0, "done")
    cell = (2 * hw / bins) ** 2
    return IrradianceResult(
        extent=hw, bins=bins, grid=(grid / cell).tolist(), total_power=total,
        ghost_paths=ghost_paths, ghost_power_fraction=ghost_power / total if total > 0 else 0.0,
        n_rays_launched=n_launch, n_triangles=len(tris), segments=segments,
    )
