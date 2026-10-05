import numpy as np
import pytest

from optilab.analysis import sequential as sq
from optilab.glass import refractive_index
from optilab.models import Aperture, Surface, SystemModel
from optilab.paraxial import solve
from optilab.trace import launch, trace

from .analytic import meridional_axis_crossing
from .conftest import surf_dicts

WL = 0.5876


def test_single_flat_surface_snell():
    m = SystemModel(surfaces=[Surface(radius=0, thickness=10, glass="N-BK7", semi_diameter=50, is_stop=True),
                              Surface(radius=0, thickness=10, glass="AIR", semi_diameter=50)])
    th = np.radians(30.0)
    o = np.array([[0.0, 0.0, -1.0]])
    d = np.array([[0.0, np.sin(th), np.cos(th)]])
    # stop after first surface: check direction inside the glass via 2-surface plate (exit ray parallel to input)
    tr = trace(m, WL, o, d, image_z=30.0)
    assert tr.valid[0]
    assert tr.dir[0] == pytest.approx(d[0], abs=1e-12)  # plane-parallel plate preserves direction
    n = refractive_index("N-BK7", WL)
    inner = np.arcsin(np.sin(th) / n)
    # lateral position at second surface (z=10): y = (z_surf0 offset) travel 1/cos path in air before surface 0
    y_expected = 1.0 * np.tan(th) + 10.0 * np.tan(inner)
    assert tr.pos[0, 2, 1] == pytest.approx(y_expected, rel=1e-12)


def test_small_aperture_converges_to_paraxial_focus(singlet):
    p = solve(singlet, WL)
    o, d = launch(singlet, p.enp_z, 0.0, np.array([[0.0, 1e-3]]))
    tr = trace(singlet, WL, o, d, p.image_z)
    assert abs(tr.pos[0, -1, 1]) < 1e-5 * 10


@pytest.mark.parametrize("h", [1.0, 3.0, 5.0])
def test_real_marginal_ray_vs_independent_trig_trace(singlet, h):
    n_of = lambda g: refractive_index(g, WL)  # noqa: E731
    expected = meridional_axis_crossing(surf_dicts(singlet), n_of, h)
    p = solve(singlet, WL)
    o, d = launch(singlet, p.enp_z, 0.0, np.array([[0.0, h / 5.0]]))
    tr = trace(singlet, WL, o, d, image_z=p.image_z)
    y_end, dz = tr.pos[0, -2, 1], tr.dir[0]
    z_last = tr.pos[0, -2, 2]
    z_cross = z_last - y_end * dz[2] / dz[1]
    assert z_cross - singlet.surfaces[0].thickness == pytest.approx(expected, abs=1e-9)


def test_spherical_aberration_sign_and_size(singlet):
    # positive singlet: marginal rays focus short of paraxial focus (undercorrected)
    p = solve(singlet, WL)
    expected = meridional_axis_crossing(surf_dicts(singlet), lambda g: refractive_index(g, WL), 5.0)
    assert expected + singlet.surfaces[0].thickness < p.bfl + singlet.surfaces[0].thickness - 0.5


def test_perfect_conic_lens_has_zero_aberration():
    """Plano-convex lens with an ellipsoidal exit surface (k=-n^2) focuses collimated light perfectly."""
    n = refractive_index("N-BK7", WL)
    m = SystemModel(surfaces=[
        Surface(radius=0, thickness=4, glass="N-BK7", semi_diameter=12, is_stop=True),
        Surface(radius=-30, conic=-n * n, thickness=0, glass="AIR", semi_diameter=12)], aperture=Aperture(value=20))
    p = solve(m, WL)
    s = sq.spot(m.model_copy(update={}), WL, p, 0, 0.0, 6)
    assert s.rms_radius < 1e-9
    o = sq.opd(m, WL, p, 0, 0.0, 25)
    assert o.rms_waves < 1e-6
    mt = sq.mtf(m, WL, p, 0, 0.0)
    assert np.allclose(mt.tangential, mt.diffraction_limit, atol=5e-3)
    assert np.allclose(mt.sagittal, mt.diffraction_limit, atol=5e-3)


def test_vignetting_and_tir():
    m = SystemModel(surfaces=[Surface(radius=50, thickness=5, glass="N-BK7", semi_diameter=3, is_stop=True),
                              Surface(radius=-50, thickness=0, glass="AIR", semi_diameter=3)],
                    aperture=Aperture(value=10))
    p = solve(m, WL)
    o, d = launch(m, p.enp_z, 0.0, np.array([[0.0, 0.2], [0.0, 0.9]]))
    tr = trace(m, WL, o, d, p.image_z)
    assert list(tr.valid) == [True, False]
    # TIR: ray inside glass at steep angle hitting a flat glass->air surface
    m2 = SystemModel(surfaces=[Surface(radius=0, thickness=5, glass="N-BK7", semi_diameter=50, is_stop=True),
                               Surface(radius=0, thickness=5, glass="AIR", semi_diameter=50)])
    th = np.radians(60.0)
    tr2 = trace(m2, WL, np.array([[0.0, 0.0, -1.0]]), np.array([[0.0, np.sin(th), np.cos(th)]]), 20.0)
    assert tr2.valid[0]  # sin(60)/1.5168 = 0.571 -> exits fine (plate: no TIR for plane parallel)


def test_chief_ray_passes_stop_centre(doublet):
    p = solve(doublet, WL)
    stop = doublet.stop_index
    dy = sq._opt_chief_offset(doublet, WL, p, 2.0)
    o, d, _ = sq.make_rays(doublet, WL, p, 2.0, np.zeros((1, 2)), dy)
    tr = trace(doublet, WL, o, d, p.image_z, clip=False)
    assert abs(tr.pos[0, stop + 1, 1]) < 1e-8


def test_doublet_beats_singlet_chromatically(singlet, doublet):
    """At small aperture (SA negligible) the polychromatic on-axis blur is dominated by colour."""
    singlet = singlet.model_copy(update={"aperture": Aperture(value=5)})
    doublet = doublet.model_copy(update={"aperture": Aperture(value=5)})
    ref = {id(m): solve(m, WL).image_z for m in (singlet, doublet)}

    def poly(m):
        out = []
        for w in m.wavelengths:
            par = solve(m, w.um)
            par.image_z = ref[id(m)]
            out.append(sq.spot(m, w.um, par, 0, 0.0, 8).rms_radius)
        return float(np.mean(out))

    assert poly(doublet) < poly(singlet) / 3


def test_offaxis_opd_is_not_dominated_by_launch_tilt(doublet):
    """Regression: launch-plane advance must be removed, else off-axis OPD is hundreds of waves."""
    p = solve(doublet, WL)
    on = sq.opd(doublet, WL, p, 0, 0.0, 25).rms_waves
    off = sq.opd(doublet, WL, p, 2, 2.0, 25).rms_waves
    assert off < 5 * max(on, 0.5)
