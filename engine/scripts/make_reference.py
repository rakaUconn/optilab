"""Regenerate engine/reference/*.json.

Paraxial numbers come from tests/analytic.py (independent ABCD code); spot/OPD numbers are
regression values from the real tracer (cross-checked against the trig trace in the tests).
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from optilab.analysis import sequential as sq  # noqa: E402
from optilab.glass import refractive_index  # noqa: E402
from optilab.models import Aperture, Surface, SystemModel, Wavelength  # noqa: E402
from optilab.paraxial import solve  # noqa: E402
from tests.analytic import efl_bfl  # noqa: E402

SINGLET = SystemModel(
    name="BK7 equiconvex singlet",
    surfaces=[Surface(radius=50.0, thickness=5.0, glass="N-BK7", semi_diameter=12.5, is_stop=True),
              Surface(radius=-50.0, thickness=0.0, glass="AIR", semi_diameter=12.5)],
    aperture=Aperture(value=10.0),
    wavelengths=[Wavelength(um=0.5876), Wavelength(um=0.4861), Wavelength(um=0.6563)],
)
DOUBLET = SystemModel.model_validate_json((ROOT.parent / "samples" / "doublet.optilab.json").read_text())


def entry(m):
    out = {"paraxial": {}, "spot_rms_mm": {}}
    surf = [dict(radius=s.radius, thickness=s.thickness, glass=s.glass) for s in m.surfaces]
    for w in m.wavelengths:
        efl, bfl = efl_bfl(surf, lambda g: refractive_index(g, w.um))
        out["paraxial"][str(w.um)] = {"efl": efl, "bfl": bfl}
    p = solve(m, m.wavelengths[0].um)
    for f in m.fields:
        s = sq.spot(m, m.wavelengths[0].um, p, 0, f.angle, 8)
        o = sq.opd(m, m.wavelengths[0].um, p, 0, f.angle, 33)
        out["spot_rms_mm"][str(f.angle)] = {"rms": s.rms_radius, "opd_rms_waves": o.rms_waves}
    return out


if __name__ == "__main__":
    ref = ROOT / "reference"
    ref.mkdir(exist_ok=True)
    (ref / "singlet.json").write_text(json.dumps(entry(SINGLET), indent=2) + "\n")
    (ref / "doublet.json").write_text(json.dumps(entry(DOUBLET), indent=2) + "\n")
    print("ok")
