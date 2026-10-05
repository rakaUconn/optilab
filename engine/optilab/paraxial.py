"""Paraxial (first-order) y-nu ray trace."""
from __future__ import annotations

import numpy as np

from .glass import is_mirror, refractive_index
from .models import ParaxialResult, SystemModel


def media(model: SystemModel, wl: float) -> list[float]:
    """Signed index after each surface (Welford convention: the sign flips after every mirror)."""
    out, cur = [], 1.0
    for s in model.surfaces:
        cur = -cur if is_mirror(s.glass) else (1.0 if cur > 0 else -1.0) * refractive_index(s.glass, wl)
        out.append(cur)
    return out


def surface_positions(model: SystemModel) -> list[float]:
    z, out = 0.0, []
    for s in model.surfaces:
        out.append(z)
        z += s.thickness
    return out


def trace_ray(model: SystemModel, wl: float, y: float, u: float, start: int = 0, stop: int | None = None):
    """Trace (y, u) given at surface `start` (ray height and slope in the medium BEFORE it).

    Returns (y, u, ys) after refracting at surface `stop` (inclusive; default last).
    """
    ns = media(model, wl)
    last = len(model.surfaces) - 1 if stop is None else stop
    n_before = 1.0 if start == 0 else ns[start - 1]
    ys = []
    for i in range(start, last + 1):
        s = model.surfaces[i]
        n_after = ns[i]
        phi = 0.0 if s.radius == 0 else (n_after - n_before) / s.radius
        u = (n_before * u - y * phi) / n_after
        ys.append(y)
        if i < last:
            y = y + s.thickness * u
        n_before = n_after
    return y, u, ys


def solve(model: SystemModel, wl: float | None = None) -> ParaxialResult:
    wl = model.wavelengths[model.primary_wavelength].um if wl is None else wl
    zs = surface_positions(model)
    epd = model.aperture.value
    # marginal ray from infinity, h = EPD/2
    h = epd / 2
    y, u, _ = trace_ray(model, wl, h, 0.0)
    if abs(u) < 1e-14:
        efl = bfl = float("inf")
        image_z = zs[-1] + model.surfaces[-1].thickness
    else:
        n_last = media(model, wl)[-1]
        efl = -h / (n_last * u)
        bfl = -y / u
        image_z = zs[-1] + bfl
    stop = model.stop_index
    # entrance pupil: ray y=0,u=1 launched at the stop, traced backwards via 2x2 matrix to surface 0
    # forward matrix from surface 0 (before) to the stop plane (does not include stop refraction effect on y)
    if stop == 0:
        enp_z = 0.0
    else:
        ya, ua, _ = trace_ray(model, wl, 1.0, 0.0, 0, stop - 1)
        yb, ub, _ = trace_ray(model, wl, 0.0, 1.0, 0, stop - 1)
        # propagate to stop plane
        t = model.surfaces[stop - 1].thickness
        a = ya + t * ua
        b = yb + t * ub
        enp_z = b / a if abs(a) > 1e-14 else float("inf")
    # exit pupil: ray from the stop centre (y=0, slope after the stop = 1/n) traced on to the image plane
    ns = media(model, wl)
    uu = 1.0 / ns[stop]
    if stop == len(model.surfaces) - 1:
        yy = 0.0
    else:
        yy = model.surfaces[stop].thickness * uu
        yy, uu, _ = trace_ray(model, wl, yy, uu, stop + 1)
    ye = yy + (image_z - zs[-1]) * uu if stop != len(model.surfaces) - 1 else (image_z - zs[stop]) * uu
    ue = uu
    exp_z = -ye / ue if abs(ue) > 1e-14 else float("inf")  # axis crossing relative to image plane
    fno = abs(efl / epd) if np.isfinite(efl) else float("inf")
    return ParaxialResult(
        wavelength=wl, efl=efl, bfl=bfl, fno=fno, enp_z=enp_z, exp_z=exp_z,
        image_z=image_z, surface_z=zs,
    )
