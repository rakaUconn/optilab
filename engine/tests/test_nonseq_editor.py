"""Features behind the non-sequential editor: free source pose, absorbing solids, ray-path preview."""
import math

import numpy as np
import pytest

from optilab.catalog import _extrude
from optilab.models import Detector, Solid, Source, Surface, SystemModel
from optilab.nonseq.trace import run


def bench(solids=(), source=None, detector=None, preview=0):
    m = SystemModel(surfaces=[Surface(radius=0, thickness=1, glass="AIR", semi_diameter=50)])
    m.nonseq.extra_solids = list(solids)
    m.nonseq.source = source or Source(beam_diameter=10, n=41, z=-10)
    m.nonseq.detector = detector or Detector(center=[0, 0, 30], normal=[0, 0, 1], half_width=10, bins=20)
    m.nonseq.preview_rays = preview
    return m


def slab(n="1.5", pos=(0, 0, 0)):
    g, _ = _extrude([(-20, 0), (20, 0), (20, 5), (-20, 5)], -20, 20)
    return Solid(name="slab", index=n, triangles=g, position=list(pos))


def test_free_pose_source_is_identical_to_the_legacy_source_when_untilted():
    det = Detector(center=[0, 0, 35], normal=[0, 0, 1], half_width=30, bins=30)
    a = run(bench([slab()], Source(beam_diameter=6, n=21, z=-10), det))
    b = run(bench([slab()], Source(beam_diameter=6, n=21, position=[0, 0, -10]), det))
    assert a.total_power == pytest.approx(b.total_power, rel=1e-12)
    assert np.array_equal(np.array(a.grid), np.array(b.grid))


def test_tilted_free_pose_beam_is_perpendicular_to_its_launch_grid():
    """Legacy tilt keeps a z-normal launch plane; the free pose launches a plane wave normal to the beam."""
    th = 12.0
    det = Detector(center=[0, 10, 35], normal=[0, 0, 1], half_width=30, bins=30)    # y in [-20, 40]
    a = run(bench([slab()], Source(beam_diameter=6, n=21, z=-10, angle=th), det))
    b = run(bench([slab()], Source(beam_diameter=6, n=21, position=[0, 0, -10], rotation_deg=[-th, 0, 0]), det))
    assert a.total_power == pytest.approx(b.total_power, abs=2e-3)       # same beam, differently sampled
    ya = np.array(a.grid).sum(axis=1); yb = np.array(b.grid).sum(axis=1)
    assert np.argmax(ya) == np.argmax(yb) and np.argmax(ya) >= 14         # y ~ +9.6 mm (bin 14.8), not 0 (bin 10): deflected towards +y in both


def test_free_pose_source_points_where_the_rotation_says():
    # a beam rotated 90 deg about y travels along +x: a detector there catches everything, one on +z nothing
    src = Source(beam_diameter=4, n=11, position=[-20, 0, 0], rotation_deg=[0, 90, 0])
    hit = run(bench(source=src, detector=Detector(center=[30, 0, 0], normal=[1, 0, 0], half_width=10, bins=10)))
    miss = run(bench(source=src, detector=Detector(center=[0, 0, 30], normal=[0, 0, 1], half_width=10, bins=10)))
    assert hit.total_power == pytest.approx(1.0, abs=1e-9)
    assert miss.total_power == 0.0


def test_absorbing_block_removes_exactly_the_rays_it_covers():
    n, d = 41, 10.0
    g, _ = _extrude([(-2.1, 10), (2.1, 10), (2.1, 14), (-2.1, 14)], -2.1, 2.1)   # 4.2 x 4.2 block in the beam, z in [10,14]
    block = Solid(name="block", kind="box", absorbing=True, triangles=g)
    r = run(bench([block], Source(beam_diameter=d, n=n, z=-10)))
    grid = np.linspace(-1, 1, n)
    gx, gy = np.meshgrid(grid, grid)
    inside = gx**2 + gy**2 <= 1
    covered = (np.abs(gx * d / 2) < 2.1) & (np.abs(gy * d / 2) < 2.1) & inside
    assert r.total_power == pytest.approx(1 - covered.sum() / inside.sum(), abs=1e-12)
    assert 0.5 < r.total_power < 0.95
    assert r.ghost_paths == 0


def test_preview_paths_follow_the_real_trace():
    # fold mirror: paths go +z, turn to +y at the mirror, end on the detector
    from optilab.catalog import generic_catalog
    fold = next(e for e in generic_catalog() if e.id == "gen-fold-mirror-25.4").solid
    det = Detector(center=[0, 30, 0], normal=[0, 1, 0], half_width=15, bins=10)
    r = run(bench([fold], Source(beam_diameter=8, n=21, z=-10), det, preview=12))
    seg = np.array(r.segments)
    assert seg.shape[1] == 8 and 12 <= len(seg) <= 40
    assert np.isfinite(seg).all()
    d = seg[:, 3:6] - seg[:, :3]
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    assert (np.abs(d[:, 2] - 1) < 1e-9).sum() >= 12                       # incoming legs along +z
    assert (np.abs(d[:, 1] - 1) < 1e-6).sum() >= 12                       # outgoing legs along +y
    ends = seg[np.abs(d[:, 1] - 1) < 1e-6][:, 3:6]
    assert np.allclose(ends[:, 1], 30.0)                                  # they stop on the detector plane
    assert (seg[:, 6] <= 1 / r.n_rays_launched + 1e-12).all()


def test_preview_is_optional_and_bounded():
    assert run(bench([slab()], preview=0)).segments == []
    r = run(bench([slab()], preview=400))
    assert 0 < len(r.segments) <= 40000


def test_preview_marks_ghost_paths_by_partial_reflection_count():
    r = run(bench([slab()], Source(beam_diameter=4, n=11, z=-10), Detector(center=[0, 0, -30], normal=[0, 0, 1], half_width=10, bins=10), preview=20))
    seg = np.array(r.segments)
    assert (seg[:, 7] >= 1).any()                                         # Fresnel-reflected rays heading back to z=-30
    assert 0.03 < r.total_power < 0.09                                    # ~ R at the first face plus a little from the second
