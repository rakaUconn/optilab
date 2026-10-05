"""Compare engine output to checked-in reference JSON (singlet + achromatic doublet)."""
import json
import pathlib

import pytest

from optilab.analysis import sequential as sq
from optilab.paraxial import solve

REF = pathlib.Path(__file__).resolve().parents[1] / "reference"


@pytest.mark.parametrize("name,fixture", [("singlet", "singlet"), ("doublet", "doublet")])
def test_against_reference(request, name, fixture):
    m = request.getfixturevalue(fixture)
    ref = json.loads((REF / f"{name}.json").read_text())
    for wl, vals in ref["paraxial"].items():
        p = solve(m, float(wl))
        assert p.efl == pytest.approx(vals["efl"], rel=1e-9)
        assert p.bfl == pytest.approx(vals["bfl"], rel=1e-9)
    w0 = m.wavelengths[0].um
    p = solve(m, w0)
    for ang, vals in ref["spot_rms_mm"].items():
        s = sq.spot(m, w0, p, 0, float(ang), 8)
        o = sq.opd(m, w0, p, 0, float(ang), 33)
        assert s.rms_radius == pytest.approx(vals["rms"], rel=1e-6)
        assert o.rms_waves == pytest.approx(vals["opd_rms_waves"], rel=1e-6)
