"""Sequential analyses built on the real trace: layout, spot, ray fan, OPD, MTF."""
from __future__ import annotations

import numpy as np

from ..models import (Layout, LayoutRay, MtfResult, OpdResult, ParaxialResult, RayFanResult,
                      SpotResult, SystemModel)
from ..trace import TraceResult, launch, pupil_grid, square_pupil, trace


def _opt_chief_offset(model: SystemModel, wl: float, par: ParaxialResult, field_deg: float) -> float:
    """y shift in the entrance-pupil plane so the real chief ray crosses the stop centre."""
    stop = model.stop_index
    r = model.aperture.value / 2
    tol = 1e-9

    def miss(dy: float) -> float:
        o, d = launch(model, par.enp_z, field_deg, np.zeros((1, 2)))
        o[:, 1] += dy
        tr = trace(model, wl, o, d, par.image_z, clip=False)
        return float(tr.pos[0, stop + 1, 1])

    dy = 0.0
    for _ in range(12):
        f = miss(dy)
        if abs(f) < tol:
            break
        h = 1e-4 * max(r, 1.0)
        slope = (miss(dy + h) - f) / h
        if abs(slope) < 1e-12:
            break
        dy -= f / slope
    return dy


def make_rays(model, wl, par, field_deg, pupil_xy, dy=None):
    if dy is None:
        dy = _opt_chief_offset(model, wl, par, field_deg)
    o, d = launch(model, par.enp_z, field_deg, pupil_xy)
    o[:, 1] += dy
    return o, d, dy


def chief_ray(model, wl, par, field_deg, dy=None) -> TraceResult:
    o, d, _ = make_rays(model, wl, par, field_deg, np.zeros((1, 2)), dy)
    return trace(model, wl, o, d, par.image_z, clip=False)


def spot(model, wl, par, fi, field_deg, rings) -> SpotResult:
    dy = _opt_chief_offset(model, wl, par, field_deg)
    chief = chief_ray(model, wl, par, field_deg, dy).pos[0, -1]
    o, d, _ = make_rays(model, wl, par, field_deg, pupil_grid(rings), dy)
    tr = trace(model, wl, o, d, par.image_z)
    v = tr.valid
    hit = tr.pos[v, -1]
    if hit.shape[0] == 0:
        return SpotResult(field=fi, wavelength=wl, x=[], y=[], chief=(0, 0), rms_radius=float("nan"),
                          geo_radius=float("nan"), n_traced=len(v), n_vignetted=len(v))
    cx, cy = hit[:, 0].mean(), hit[:, 1].mean()
    r2 = (hit[:, 0] - cx) ** 2 + (hit[:, 1] - cy) ** 2
    return SpotResult(
        field=fi, wavelength=wl,
        x=(hit[:, 0] - chief[0]).tolist(), y=(hit[:, 1] - chief[1]).tolist(),
        chief=(float(chief[0]), float(chief[1])),
        rms_radius=float(np.sqrt(r2.mean())), geo_radius=float(np.sqrt(r2.max())),
        n_traced=int(len(v)), n_vignetted=int((~v).sum()),
    )


def rayfan(model, wl, par, fi, field_deg, n) -> RayFanResult:
    dy = _opt_chief_offset(model, wl, par, field_deg)
    chief = chief_ray(model, wl, par, field_deg, dy).pos[0, -1]
    p = np.linspace(-1, 1, n)
    tang = np.stack([np.zeros(n), p], axis=1)
    sag = np.stack([p, np.zeros(n)], axis=1)
    out = []
    for grid, axis in ((tang, 1), (sag, 0)):
        o, d, _ = make_rays(model, wl, par, field_deg, grid, dy)
        tr = trace(model, wl, o, d, par.image_z)
        e = tr.pos[:, -1, axis] - chief[axis]
        out.append([float(x) if ok else None for x, ok in zip(e, tr.valid)])
    return RayFanResult(field=fi, wavelength=wl, pupil=p.tolist(), ey_tangential=out[0], ex_sagittal=out[1])


def opd_grid(model, wl, par, field_deg, n):
    """OPD (waves) on an n x n pupil grid relative to the chief-ray reference sphere. NaN outside."""
    dy = _opt_chief_offset(model, wl, par, field_deg)
    ct = chief_ray(model, wl, par, field_deg, dy)
    pc = ct.pos[0, -1]
    R = abs(par.exp_z) if np.isfinite(par.exp_z) and abs(par.exp_z) > 1e-9 else 1e6
    pxy, inside = square_pupil(n)
    o, d, _ = make_rays(model, wl, par, field_deg, pxy, dy)
    tr = trace(model, wl, o, d, par.image_z)

    def to_sphere(pos_img, dirs, opl):
        w = pos_img - pc
        b = np.einsum("ij,ij->i", dirs, w)
        c = np.einsum("ij,ij->i", w, w) - R * R
        disc = np.maximum(b * b - c, 0.0)
        s = -b - np.sqrt(disc)
        return opl + s  # image space is air

    ref = to_sphere(ct.pos[:, -1], ct.dir, ct.opl)[0]
    # launch points lie on the z = enp_z plane; the incident wavefront is perpendicular to the ray
    # direction through the chief-ray launch point, so add each ray's advance along it
    adv = (o - ct.pos[0, 0]) @ d[0]
    w = to_sphere(tr.pos[:, -1], tr.dir, tr.opl + adv)
    opd = (w - ref) / (wl * 1e-3)  # mm -> waves
    ok = tr.valid & inside
    opd = np.where(ok, opd, np.nan)
    mean = np.nanmean(opd) if ok.any() else 0.0
    return (opd - mean).reshape(n, n), ok.reshape(n, n)


def opd(model, wl, par, fi, field_deg, n=33) -> OpdResult:
    g, ok = opd_grid(model, wl, par, field_deg, n)
    vals = g[ok]
    return OpdResult(
        field=fi, wavelength=wl, n=n,
        opd_waves=[[None if not np.isfinite(x) else float(x) for x in row] for row in g],
        rms_waves=float(vals.std()) if vals.size else float("nan"),
        pv_waves=float(vals.max() - vals.min()) if vals.size else float("nan"),
    )


def diffraction_limit(nu: np.ndarray) -> np.ndarray:
    nu = np.clip(nu, 0, 1)
    return (2 / np.pi) * (np.arccos(nu) - nu * np.sqrt(1 - nu**2))


def mtf(model, wl, par, fi, field_deg, n=65) -> MtfResult:
    """Monochromatic geometric-wavefront MTF: autocorrelation of the pupil function with real OPD."""
    g, ok = opd_grid(model, wl, par, field_deg, n)
    pupil = np.where(ok, np.exp(2j * np.pi * np.nan_to_num(g)), 0.0)
    m = 2 * n
    psf = np.abs(np.fft.fft2(pupil, s=(m, m))) ** 2
    otf = np.fft.ifft2(psf)
    otf = otf / otf[0, 0]
    tang = np.abs(otf[:n, 0])
    sag = np.abs(otf[0, :n])
    fno = par.fno if np.isfinite(par.fno) else 1e6
    cutoff = 1000.0 / (wl * fno)  # cycles/mm
    k = np.arange(n)
    nu = k / (n - 1)
    return MtfResult(
        field=fi, wavelength=wl, freq=(nu * cutoff).tolist(),
        tangential=tang.tolist(), sagittal=sag.tolist(),
        diffraction_limit=diffraction_limit(nu).tolist(), cutoff=cutoff,
    )


def layout(model, wl, par, n_rays) -> Layout:
    rays: list[LayoutRay] = []
    p = np.linspace(-1, 1, n_rays)
    grids = [np.stack([np.zeros(n_rays), p], axis=1), np.stack([p, np.zeros(n_rays)], axis=1)]
    for fi, f in enumerate(model.fields):
        dy = _opt_chief_offset(model, wl, par, f.angle)
        for gi, grid in enumerate(grids):
            if gi == 1 and abs(f.angle) > 0:
                pass  # sagittal fan still drawn for 3D view
            o, d, _ = make_rays(model, wl, par, f.angle, grid, dy)
            # start rays 20 mm before the first surface along the ray for display
            tr = trace(model, wl, o, d, par.image_z)
            pos = np.nan_to_num(tr.pos, nan=0.0, posinf=0.0, neginf=0.0)
            start = pos[:, 0] - d * 0.0
            pos[:, 0] = start
            for k in range(len(grid)):
                rays.append(LayoutRay(
                    field=fi, wavelength=model.primary_wavelength,
                    pupil=(float(grid[k, 0]), float(grid[k, 1])),
                    points=[tuple(map(float, q)) for q in pos[k]], vignetted=bool(~tr.valid[k]),
                ))
    return Layout(
        surface_z=par.surface_z, surface_sd=[s.semi_diameter for s in model.surfaces],
        surface_radius=[s.radius for s in model.surfaces], surface_conic=[s.conic for s in model.surfaces],
        glass_after=[s.glass for s in model.surfaces], image_z=par.image_z, rays=rays,
    )
