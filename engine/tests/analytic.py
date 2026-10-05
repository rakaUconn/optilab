"""Independent reference calculations (do NOT import the engine's tracers)."""
from __future__ import annotations

import math

import numpy as np


def abcd_system(surfaces, n_of):
    """Paraxial system matrix [y; n*u] for light from infinity.

    surfaces: list of dicts(radius, thickness, glass); n_of(glass) -> index. Returns (M, n_last)."""
    M = np.eye(2)
    n_prev = 1.0
    for i, s in enumerate(surfaces):
        n = n_of(s["glass"])
        power = 0.0 if s["radius"] == 0 else (n - n_prev) / s["radius"]
        M = np.array([[1, 0], [-power, 1]]) @ M
        if i < len(surfaces) - 1:
            M = np.array([[1, s["thickness"] / n], [0, 1]]) @ M
        n_prev = n
    return M, n_prev


def efl_bfl(surfaces, n_of):
    M, _ = abcd_system(surfaces, n_of)
    # [y; nu]: y_out = A y + B nu, nu_out = C y + D nu ; collimated input nu=0
    efl = -1.0 / M[1, 0]
    bfl = -M[0, 0] / M[1, 0]
    return efl, bfl


def thick_lens_efl(n, r1, r2, d):
    p = (n - 1) * (1 / r1 - 1 / r2 + (n - 1) * d / (n * r1 * r2))
    return 1 / p


def meridional_axis_crossing(surfaces, n_of, h):
    """Classic trigonometric meridional ray trace (angle-based Snell), spherical surfaces only.

    Returns z where the real ray (height h, parallel to axis) crosses the axis after the last surface,
    measured from the last surface vertex."""
    z, y, theta = 0.0, h, 0.0  # theta: ray angle to axis (rad)
    n_prev = 1.0
    zv = 0.0
    for i, s in enumerate(surfaces):
        r = s["radius"]
        n = n_of(s["glass"])
        # intersect ray y_ray(z) = y + tan(theta)*(z - z0) with circle centred (zv + r, 0)
        if r == 0:
            z_hit = zv
            y_hit = y + math.tan(theta) * (zv - z)
            alpha = 0.0
        else:
            m = math.tan(theta)
            y0 = y - m * (z - 0)  # line: Y = m*Z + y0
            cz = zv + r
            # (Z - cz)^2 + (mZ + y0)^2 = r^2
            a = 1 + m * m
            b = -2 * cz + 2 * m * y0
            c = cz * cz + y0 * y0 - r * r
            disc = math.sqrt(b * b - 4 * a * c)
            roots = [(-b - disc) / (2 * a), (-b + disc) / (2 * a)]
            z_hit = min(roots, key=lambda zz: abs(zz - zv))
            y_hit = m * z_hit + y0
            
            alpha = -math.asin(y_hit / r)  # angle of the inward normal (towards the centre)
        inc = theta - alpha          # angle of incidence w.r.t. normal
        refr = math.asin(n_prev / n * math.sin(inc))
        theta = refr + alpha
        z, y = z_hit, y_hit
        n_prev = n
        zv += s["thickness"]
    # crossing: y + tan(theta) * (Z - z) = 0
    z_cross = z - y / math.tan(theta)
    return z_cross - (zv - surfaces[-1]["thickness"])
