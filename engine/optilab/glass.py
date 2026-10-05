"""Glass catalogue: Sellmeier dispersion for a few common materials.

Coefficients are the published Schott / Malitson values (wavelength in µm).
A numeric string such as "1.5168" is treated as a constant index.
"""
from __future__ import annotations

import numpy as np

# name -> (B1, B2, B3, C1, C2, C3)
SELLMEIER: dict[str, tuple[float, ...]] = {
    "N-BK7": (1.03961212, 0.231792344, 1.01046945, 0.00600069867, 0.0200179144, 103.560653),
    "F2": (1.34533359, 0.209073176, 0.937357162, 0.00997743871, 0.0470450767, 111.886764),
    "N-SF5": (1.52481889, 0.187085527, 1.42729015, 0.011254756, 0.0588995392, 129.141675),
    "FUSED_SILICA": (0.6961663, 0.4079426, 0.8974794, 0.00467914826, 0.0135120631, 97.9340025),
}
ALIASES = {"BK7": "N-BK7", "SF5": "N-SF5", "SILICA": "FUSED_SILICA", "FS": "FUSED_SILICA",
           "N-F2": "F2", "FUSEDSILICA": "FUSED_SILICA"}
AIR_NAMES = {"", "AIR", "VACUUM"}


def is_air(glass: str) -> bool:
    return glass.strip().upper() in AIR_NAMES


def list_glasses() -> list[str]:
    return ["AIR", *SELLMEIER.keys()]


def refractive_index(glass: str, wavelength_um: float) -> float:
    """Index of refraction of ``glass`` at ``wavelength_um`` (µm)."""
    g = glass.strip().upper()
    if g in AIR_NAMES:
        return 1.0
    g = ALIASES.get(g, g)
    if g in SELLMEIER:
        b1, b2, b3, c1, c2, c3 = SELLMEIER[g]
        l2 = wavelength_um**2
        n2 = 1.0 + b1 * l2 / (l2 - c1) + b2 * l2 / (l2 - c2) + b3 * l2 / (l2 - c3)
        return float(np.sqrt(n2))
    try:
        n = float(glass)
    except ValueError as e:
        raise ValueError(f"unknown glass {glass!r}; known: {list_glasses()}") from e
    if n < 1.0:
        raise ValueError(f"constant index must be >= 1, got {n}")
    return n
