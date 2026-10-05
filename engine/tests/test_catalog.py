import math
import re

import numpy as np
import pytest
from fastapi.testclient import TestClient

from optilab.analysis import sequential as sq
from optilab.catalog import entry_from_zmx, generic_catalog, parse_zmx
from optilab.glass import refractive_index
from optilab.models import Aperture, Detector, Source, Surface, SystemModel, Wavelength
from optilab.nonseq.trace import run
from optilab.paraxial import solve
from optilab.server import app

JSON = {"content-type": "application/json"}
client = TestClient(app)
CAT = {e.id: e for e in generic_catalog()}


def test_catalog_has_lenses_mirrors_and_prisms():
    cats = {e.category for e in CAT.values()}
    assert cats == {"lens", "mirror", "prism"}
    assert len(CAT) > 150
    assert all(e.vendor == "Generic" for e in CAT.values())      # nothing masquerades as a vendor part
    assert all(e.source for e in CAT.values())


@pytest.mark.parametrize("pat", [r"gen-(pcx|bcx|pcv|bcv|men|ach)-(-?[\d.]+)-([\d.]+)$"])
def test_stock_lenses_hit_their_nominal_focal_length(pat):
    n = 0
    for e in CAT.values():
        m = re.match(pat, e.id)
        if m:
            assert e.efl == pytest.approx(float(m.group(2)), rel=2e-3), e.id
            n += 1
    assert n > 80


def test_singlet_orientation_and_edge_thickness():
    e = CAT["gen-pcx-100-25.4"]
    assert e.surfaces[0].radius > 0 and e.surfaces[1].radius == 0
    sag = e.surfaces[0].radius - math.sqrt(e.surfaces[0].radius**2 - (e.diameter / 2) ** 2)
    assert e.surfaces[0].thickness == pytest.approx(2.0 + sag, rel=1e-3)   # 2 mm edge thickness
    assert e.bfl == pytest.approx(solve(SystemModel(surfaces=e.surfaces, aperture=Aperture(value=20))).bfl, rel=1e-6)


def test_catalog_achromat_is_achromatic():
    e = CAT["gen-ach-100-25.4"]
    m = SystemModel(surfaces=e.surfaces, aperture=Aperture(value=22))
    assert abs(solve(m, 0.4861).bfl - solve(m, 0.6563).bfl) < 0.01


# ---- mirrors -------------------------------------------------------------------------------------

def mirror_model(R, k=0.0, d=40.0):
    return SystemModel(surfaces=[Surface(radius=R, conic=k, thickness=-abs(R) / 2, glass="MIRROR",
                                         semi_diameter=d, is_stop=True)], aperture=Aperture(value=20))


def test_concave_mirror_focal_length_is_r_over_2_and_image_is_in_front():
    p = solve(mirror_model(-200.0), 0.55)
    assert p.efl == pytest.approx(100.0)
    assert p.image_z == pytest.approx(-100.0)          # light returns towards -z
    assert solve(mirror_model(+200.0), 0.55).efl == pytest.approx(-100.0)  # convex mirror diverges


def test_parabolic_mirror_is_perfect_on_axis_but_has_coma_off_axis():
    m = mirror_model(-200.0, -1.0)
    p = solve(m, 0.55)
    assert sq.spot(m, 0.55, p, 0, 0.0, 6).rms_radius < 1e-9
    assert sq.opd(m, 0.55, p, 0, 0.0, 21).rms_waves < 1e-6
    assert sq.spot(m, 0.55, p, 0, 3.0, 6).rms_radius > 1e-3
    sph = mirror_model(-200.0)
    assert sq.spot(sph, 0.55, solve(sph, 0.55), 0, 0.0, 6).rms_radius > 1e-4   # spherical aberration


def test_spherical_mirror_spherical_aberration_matches_theory():
    # exact: a ray at height h reflects across the axis at distance C-F = R / (2 cos(theta)) from the centre of curvature,
    # sin(theta) = h / R, i.e. R (1 - 1/(2 cos theta)) from the vertex
    R, h = 200.0, 15.0
    th = math.asin(h / R)
    z_cross = R * (1 - 1 / (2 * math.cos(th)))      # distance from the mirror vertex towards the source
    m = mirror_model(-R, d=30.0)
    from optilab.trace import launch, trace
    o, d = launch(m, 0.0, 0.0, np.array([[0.0, h / 10.0]]))
    tr = trace(m, 0.55, o, d, image_z=-100.0)
    y1, dd = tr.pos[0, 1, 1], tr.dir[0]
    zc = tr.pos[0, 1, 2] - y1 * dd[2] / dd[1]
    assert -zc == pytest.approx(z_cross, abs=1e-9)


# ---- Zemax import ----------------------------------------------------------------------------------

def to_zmx(surfaces, glass_line=None):
    out = ["VERS 200100\nUNIT MM X W X CM MR CPMM\nNAME Test doublet\nENPD 20"]
    out.append("SURF 0\n  TYPE STANDARD\n  CURV 0.0\n  DISZ INFINITY")
    for i, s in enumerate(surfaces, 1):
        g = ""
        if s.glass.upper() not in ("AIR", "MIRROR"):
            g = f"  GLAS {s.glass} 0 0 1.5 60 0 0 0 0 0 0\n" if glass_line is None else glass_line
        elif s.glass.upper() == "MIRROR":
            g = "  GLAS MIRROR 0 0 0 0 0 0 0 0 0 0\n"
        out.append(f"SURF {i}\n  TYPE STANDARD\n  CURV {0 if s.radius == 0 else 1 / s.radius!r}\n  DISZ {s.thickness!r}\n"
                   f"{g}  DIAM {s.semi_diameter!r} 1 0 0 1 \"\"\n  CONI {s.conic!r}" + ("\n  STOP" if s.is_stop else ""))
    out.append(f"SURF {len(surfaces) + 1}\n  TYPE STANDARD\n  CURV 0.0\n  DISZ 0.0\n  DIAM 1 1 0 0 1 \"\"")
    return "\n".join(out)


def test_zmx_round_trip_matches_the_doublet(doublet):
    e = entry_from_zmx(to_zmx(doublet.surfaces), vendor="Thorlabs", part_number="TEST-1")
    assert e.vendor == "Thorlabs" and e.part_number == "TEST-1" and e.kind == "doublet"
    assert [round(s.radius, 6) for s in e.surfaces] == [round(s.radius, 6) for s in doublet.surfaces]
    assert e.glasses == ["F2", "N-BK7"]
    assert e.efl == pytest.approx(100.0, abs=0.01)
    assert e.id == "zmx-thorlabs-test-1"


def test_zmx_utf8_bom_and_model_glass_from_index_and_abbe():
    txt = ("﻿UNIT MM\nSURF 0\n TYPE STANDARD\n DISZ INFINITY\nSURF 1\n TYPE STANDARD\n CURV 0.02\n DISZ 4\n"
           " GLAS N-LAK22X 0 0 1.65113 55.89\n DIAM 10\nSURF 2\n TYPE STANDARD\n CURV -0.02\n DISZ 0\n DIAM 10\nSURF 3\n TYPE STANDARD\n DISZ 0\n")
    s, _ = parse_zmx(txt)
    assert s[0].glass == "1.65113/55.89"
    assert refractive_index(s[0].glass, 0.5876) == pytest.approx(1.65113, abs=1e-9)
    nf, nc = (refractive_index(s[0].glass, w) for w in (0.4861, 0.6563))
    assert (1.65113 - 1) / (nf - nc) == pytest.approx(55.89, rel=1e-6)


def test_zmx_errors_are_explicit():
    with pytest.raises(ValueError, match="not in the catalogue"):
        parse_zmx("SURF 0\n DISZ INFINITY\nSURF 1\n CURV 0.01\n DISZ 3\n GLAS UNOBTANIUM 0 0 0 0\n DIAM 5\nSURF 2\n DISZ 0")
    with pytest.raises(ValueError, match="unsupported TYPE"):
        parse_zmx("SURF 0\n DISZ INFINITY\nSURF 1\n TYPE EVENASPH\n DISZ 3\nSURF 2\n DISZ 0")


# ---- prisms / fold mirrors (non-sequential solids) ------------------------------------------------

def bench(solid, det_center, det_normal, beam=6.0, n=21):
    m = SystemModel(surfaces=[Surface(radius=0, thickness=1, glass="AIR", semi_diameter=50)],
                    wavelengths=[Wavelength(um=0.5876)])
    m.nonseq.derive_from_sequential = True
    m.nonseq.extra_solids = [solid]
    m.nonseq.source = Source(beam_diameter=beam, n=n, z=-10)
    m.nonseq.detector = Detector(center=det_center, normal=det_normal, half_width=20, bins=16)
    return run(m)


def test_all_solids_are_wound_outward():
    for e in CAT.values():
        if e.solid is None:
            continue
        tris = np.array(e.solid.triangles + e.solid.mirror_triangles)
        vol = np.einsum("ij,ij->i", tris[:, 0], np.cross(tris[:, 1], tris[:, 2])).sum() / 6
        assert vol > 0, e.id


def test_right_angle_prism_turns_the_beam_by_90_degrees_via_tir():
    e = CAT["gen-right-angle-prism-25.4"]
    sol = e.solid.model_copy(update={"position": [0.0, -12.7, 0.0]})   # centre the beam on the leg
    r = bench(sol, [0.0, -20.0, 0.0], [0.0, 1.0, 0.0])
    # two uncoated surfaces: (1-R)^2 ~ 0.9216; TIR is lossless and is not counted as a ghost
    assert r.total_power == pytest.approx(0.9216, abs=0.02)
    assert r.ghost_power_fraction < 1e-2
    # and nothing arrives on the straight-through detector
    assert bench(sol, [0.0, 0.0, 40.0], [0.0, 0.0, 1.0]).total_power < 1e-9


def test_fold_mirror_reflects_everything_to_plus_y():
    sol = CAT["gen-fold-mirror-25.4"].solid
    r = bench(sol, [0.0, 30.0, 0.0], [0.0, 1.0, 0.0])
    assert r.total_power == pytest.approx(1.0, abs=1e-9)


def test_knife_edge_mirror_picks_off_a_beam_next_to_its_edge():
    sol = CAT["gen-knife-edge-mirror-12.7"].solid
    m = SystemModel(surfaces=[Surface(radius=0, thickness=1, glass="AIR", semi_diameter=50)])
    m.nonseq.extra_solids = [sol]
    m.nonseq.source = Source(beam_diameter=4.0, n=15, z=-10)
    # beam sits at x=0,y=0 -> shift the wedge so the beam strikes the mirror 3 mm from the knife edge
    m.nonseq.extra_solids = [sol.model_copy(update={"position": [0.0, -3.0, -3.0]})]
    m.nonseq.detector = Detector(center=[0.0, 30.0, 0.0], normal=[0.0, 1.0, 0.0], half_width=20, bins=16)
    assert run(m).total_power == pytest.approx(1.0, abs=1e-9)


def _refract2d(d, n_out, n1, n2):
    """Vector Snell in the y-z plane; n_out is the outward unit normal of the face."""
    nrm = -n_out if np.dot(d, n_out) > 0 else n_out        # normal opposing the ray
    c = -np.dot(nrm, d)
    mu = n1 / n2
    k = 1 - mu**2 * (1 - c**2)
    return mu * d + (mu * c - math.sqrt(k)) * nrm


def test_dispersing_prism_deviation_matches_independent_snell_trace():
    a, wl = 25.4, 0.5876
    e = CAT["gen-dispersing-prism-25.4"]
    n = refractive_index(str(e.solid.index), wl)
    h, s3 = a / 2, math.sqrt(3) / 2 * a
    P = np.array([(0, -h), (0, h), (s3, 0)], float)             # (y, z) polygon of the solid
    shift = -5.0                                                 # world y of the solid's y=0
    P[:, 0] += shift
    cen = P.mean(axis=0)

    def face(i):
        p, q = P[i], P[(i + 1) % 3]
        t = (q - p) / np.linalg.norm(q - p)
        nrm = np.array([-t[1], t[0]])
        return p, q, nrm if np.dot(nrm, (p + q) / 2 - cen) > 0 else -nrm

    theta = math.asin(n / 2) - math.radians(30.0)               # symmetric (minimum-deviation) incidence
    y0 = -9.5                                                   # aims the beam at the middle of the entry face
    d = np.array([math.sin(theta), math.cos(theta)])             # (y, z)
    o = np.array([y0, -30.0])
    pos = o.copy()
    hits = []
    for i in range(3):
        p, q, nrm = face(i)
        if abs(np.dot(d, nrm)) < 1e-9 or i == 0:                 # skip the base (face 0: y=shift plane)
            continue
        t = np.dot(p - pos, nrm) / np.dot(d, nrm)
        hits.append((t, i))
    hits.sort()
    # entry = first hit among the two slanted faces, exit = the other
    (t1, i1), (_, i2) = hits
    p1 = pos + t1 * d
    d1 = _refract2d(d, face(i1)[2], 1.0, n)
    p_, q_, n2 = face(i2)
    t2 = np.dot(p_ - p1, n2) / np.dot(d1, n2)
    p2 = p1 + t2 * d1
    d2 = _refract2d(d1, n2, n, 1.0)
    for (pt, i) in ((p1, i1), (p2, i2)):                         # both hits must lie on the finite faces
        a_, b_, _ = face(i)
        assert 0 <= np.dot(pt - a_, b_ - a_) / np.dot(b_ - a_, b_ - a_) <= 1
    target = p2 + 60.0 * d2                                      # (y, z) point on the exit ray
    dev = math.degrees(math.acos(np.clip(np.dot(d, d2), -1, 1)))
    assert 30 < dev < 80                                         # a real prism deviation, not a pass-through

    sol = e.solid.model_copy(update={"position": [0.0, shift, 0.0]})
    m = SystemModel(surfaces=[Surface(radius=0, thickness=1, glass="AIR", semi_diameter=50)], wavelengths=[Wavelength(um=wl)])
    m.nonseq.extra_solids = [sol]
    m.nonseq.source = Source(beam_diameter=0.6, n=7, z=-30, angle=math.degrees(theta), offset=[0.0, y0])
    dirn3 = np.array([0.0, d2[0], d2[1]])
    m.nonseq.detector = Detector(center=[0.0, target[0], target[1]], normal=dirn3.tolist(), half_width=1.0, bins=16)
    r = run(m)
    assert r.total_power > 0.8 * (1 - ((n - 1) / (n + 1)) ** 2) ** 2    # lands on the predicted spot
    # and a detector 3 degrees off the predicted direction misses it
    wrong = np.array([0.0, math.sin(math.atan2(d2[0], d2[1]) + math.radians(3)), math.cos(math.atan2(d2[0], d2[1]) + math.radians(3))])
    m.nonseq.detector = Detector(center=[0.0, p2[0] + 60 * wrong[1], p2[1] + 60 * wrong[2]], normal=wrong.tolist(), half_width=1.0, bins=16)
    assert run(m).total_power < 0.05


# ---- API -------------------------------------------------------------------------------------------

def test_catalog_endpoints(doublet):
    r = client.get("/catalog").json()
    assert len(r) == len(CAT) and {e["category"] for e in r} == {"lens", "mirror", "prism"}
    ok = client.post("/catalog/import", json={"text": to_zmx(doublet.surfaces), "vendor": "Edmund Optics",
                                              "part_number": "#99-999"}).json()
    assert ok["vendor"] == "Edmund Optics" and ok["efl"] == pytest.approx(100.0, abs=0.01)
    bad = client.post("/catalog/import", json={"text": "garbage", "vendor": "x"})
    assert bad.status_code == 422 and "cannot import" in bad.text


def test_paraxial_endpoint(singlet):
    from optilab.models import ParaxialRequest
    r = client.post("/paraxial", content=ParaxialRequest(model=singlet).model_dump_json(), headers=JSON).json()
    assert len(r) == 3 and r[0]["efl"] == pytest.approx(solve(singlet, 0.5876).efl)
