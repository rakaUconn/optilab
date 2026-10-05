import pytest

from optilab.glass import refractive_index
from optilab.paraxial import solve

from .analytic import efl_bfl, thick_lens_efl
from .conftest import surf_dicts


def test_glass_catalogue_known_indices():
    assert refractive_index("N-BK7", 0.5876) == pytest.approx(1.51680, abs=2e-5)
    assert refractive_index("F2", 0.5876) == pytest.approx(1.62004, abs=3e-5)
    assert refractive_index("FUSED_SILICA", 0.5876) == pytest.approx(1.45846, abs=2e-5)
    assert refractive_index("1.7", 0.55) == 1.7
    assert refractive_index("AIR", 0.55) == 1.0


def test_singlet_vs_lensmaker(singlet):
    n = refractive_index("N-BK7", 0.5876)
    p = solve(singlet, 0.5876)
    assert p.efl == pytest.approx(thick_lens_efl(n, 50.0, -50.0, 5.0), rel=1e-12)
    assert p.fno == pytest.approx(p.efl / 10.0)


@pytest.mark.parametrize("fixture", ["singlet", "doublet"])
def test_matches_independent_abcd(request, fixture):
    m = request.getfixturevalue(fixture)
    for w in m.wavelengths:
        efl, bfl = efl_bfl(surf_dicts(m), lambda g: refractive_index(g, w.um))
        p = solve(m, w.um)
        assert p.efl == pytest.approx(efl, rel=1e-10)
        assert p.bfl == pytest.approx(bfl, rel=1e-10)


def test_doublet_is_f100_and_achromatic(doublet, singlet):
    d = solve(doublet, 0.5876)
    assert d.efl == pytest.approx(100.0, abs=0.01)
    shift_d = abs(solve(doublet, 0.4861).bfl - solve(doublet, 0.6563).bfl)
    shift_s = abs(solve(singlet, 0.4861).bfl - solve(singlet, 0.6563).bfl)
    assert shift_d < 0.01          # FC focal shift ~0 by design
    assert shift_s > 100 * shift_d  # a singlet shows ~f/V = 0.8 mm


def test_singlet_chromatic_shift_is_f_over_v(singlet):
    nd, nf, nc = (refractive_index("N-BK7", w) for w in (0.5876, 0.4861, 0.6563))
    v = (nd - 1) / (nf - nc)
    shift = solve(singlet, 0.4861).bfl - solve(singlet, 0.6563).bfl
    assert shift == pytest.approx(-solve(singlet, 0.5876).efl / v, rel=0.05)


def test_pupil_positions_stop_at_front_and_behind():
    from optilab.models import Aperture, Surface, SystemModel
    # thin-ish lens with stop on 2nd surface: ENP is the image of the stop seen through lens front
    m = SystemModel(surfaces=[
        Surface(radius=50, thickness=5, glass="N-BK7", semi_diameter=12),
        Surface(radius=-50, thickness=50, glass="AIR", semi_diameter=12, is_stop=True),
    ], aperture=Aperture(value=8))
    n = refractive_index("N-BK7", 0.5876)
    # stop sits 5 mm inside the glass; imaged through surface 0 (radius 50) travelling in -z
    s_img = 1 / ((n * (1 / -5.0) + (1 - n) / -50.0))   # image distance along -z
    assert solve(m, 0.5876).enp_z == pytest.approx(-s_img, rel=1e-9)
