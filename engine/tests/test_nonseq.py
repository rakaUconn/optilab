import numpy as np
import pytest

from optilab.models import Aperture, Detector, Source, Surface, SystemModel
from optilab.nonseq.mesh import load_stl
from optilab.nonseq.trace import fresnel_unpolarised, run
from optilab.paraxial import solve


def slab(n: float = 1.5) -> SystemModel:
    m = SystemModel(
        surfaces=[Surface(radius=0, thickness=5, glass=str(n), semi_diameter=15, is_stop=True),
                  Surface(radius=0, thickness=20, glass="AIR", semi_diameter=15)],
        aperture=Aperture(value=10))
    m.nonseq.source = Source(beam_diameter=8, n=15, z=-5)
    m.nonseq.detector = Detector(z=25, half_width=6, bins=16)
    m.nonseq.tess_rings, m.nonseq.tess_segments = 6, 32
    return m


def test_fresnel_normal_incidence():
    R, _, tir = fresnel_unpolarised(np.array([1.0]), np.array([1.0]), np.array([1.5]))
    assert R[0] == pytest.approx(0.04, rel=1e-12)
    assert not tir[0]
    R, _, tir = fresnel_unpolarised(np.array([np.cos(np.radians(60))]), np.array([1.5]), np.array([1.0]))
    assert tir[0] and R[0] == 1.0


def test_slab_transmission_and_ghosts_match_analytic():
    """Plane-parallel plate at normal incidence: T = (1-R)/(1+R); ghost (>=2 refl) share of T ~ R^2."""
    n = 1.5
    R = ((n - 1) / (n + 1)) ** 2
    m = slab(n)
    m.nonseq.min_weight = 1e-4
    r = run(m)
    assert r.total_power == pytest.approx((1 - R) / (1 + R), abs=2e-4)
    assert r.ghost_power_fraction == pytest.approx(R**2, rel=0.05)
    assert r.ghost_paths > 0
    assert np.array(r.grid).sum() * (2 * r.extent / r.bins) ** 2 == pytest.approx(r.total_power, rel=1e-9)


def test_lens_focus_concentrates_irradiance(singlet):
    m = singlet.model_copy(deep=True)
    m.surfaces[-1].thickness = solve(m, 0.5876).bfl
    m.nonseq.source = Source(beam_diameter=8, n=21, z=-5)
    m.nonseq.detector = Detector(z=None, half_width=1.0, bins=32)
    r = run(m)
    g = np.array(r.grid)
    iy, ix = np.unravel_index(g.argmax(), g.shape)
    assert abs(iy - 15.5) <= 2 and abs(ix - 15.5) <= 2
    assert r.total_power > 0.85
    assert r.ghost_paths >= 0 and r.n_triangles > 100


def test_stl_roundtrip_ascii_and_binary():
    import struct
    tri = np.array([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]], float)
    binary = b"\0" * 80 + struct.pack("<I", 1) + struct.pack("<12fH", 0, 0, 1, *tri.ravel().astype("f4"), 0)
    assert np.allclose(load_stl(binary), tri)
    ascii_ = "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid"
    assert np.allclose(load_stl(ascii_.encode()), tri)
