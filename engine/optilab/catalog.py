"""Lens / mirror / prism catalogue.

* ``generic_catalog()`` builds stock-style parts from nominal specs (focal length, diameter, glass). They are
  labelled vendor "Generic" - they are NOT any manufacturer's prescriptions.
* ``entry_from_zmx()`` imports a Zemax .zmx file (vendors publish one per part number) so real
  Thorlabs / Edmund Optics prescriptions can be added with their vendor + part number.
"""
from __future__ import annotations

import math
import re
from functools import lru_cache

import numpy as np

from .glass import ALIASES, MODEL_GLASSES, SELLMEIER, is_air, is_mirror
from .models import Aperture, CatalogEntry, Solid, Surface, SystemModel, Wavelength
from .nonseq.mesh import sag
from .paraxial import solve

WL = 0.5876
CLEAR = 0.9  # clear aperture / outer diameter


# ---------------------------------------------------------------- helpers

def _bisect(f, a, b, n=60):
    fa = f(a)
    for _ in range(n):
        c = 0.5 * (a + b)
        fc = f(c)
        if fa * fc <= 0:
            b = c
        else:
            a, fa = c, fc
    return 0.5 * (a + b)


def measure(surfaces: list[Surface], diameter: float) -> tuple[float | None, float | None, float | None]:
    """Paraxial (EFL, BFL, F/#) of the part alone, or Nones for afocal parts."""
    m = SystemModel(surfaces=[s.model_copy() for s in surfaces], aperture=Aperture(value=CLEAR * diameter),
                    wavelengths=[Wavelength(um=WL)])
    p = solve(m, WL)
    ok = all(math.isfinite(x) for x in (p.efl, p.bfl, p.fno))
    return (p.efl, p.bfl, p.fno) if ok and abs(p.efl) < 1e7 else (None, None, None)


def _entry(id_, name, category, kind, surfaces, diameter, *, vendor="Generic", part_number="", source="") -> CatalogEntry:
    efl, bfl, fno = measure(surfaces, diameter) if surfaces else (None, None, None)
    return CatalogEntry(
        id=id_, name=name, vendor=vendor, part_number=part_number, category=category, kind=kind, source=source,
        diameter=diameter, efl=efl, bfl=bfl, fno=fno,
        glasses=sorted({s.glass for s in surfaces if not is_air(s.glass) and not is_mirror(s.glass)}),
        surfaces=surfaces,
    )


def _sd(d: float) -> float:
    return CLEAR * d / 2


def _gap_to_focus(surfaces: list[Surface], d: float) -> None:
    """Leave the last thickness at the part's own back focal distance (typical 'sitting at focus' default)."""
    _, bfl, _ = measure(surfaces, d)
    surfaces[-1].thickness = round(bfl, 3) if bfl is not None and bfl > 0 else 10.0


# ---------------------------------------------------------------- singlets

def _singlet(kind: str, f: float, d: float, glass: str, ct_edge: float = 2.0):
    """Solve radii for EFL = f (thick lens, d-line). Returns surfaces or None if not manufacturable."""
    half = d / 2

    def build(R: float) -> list[Surface]:
        sgn = 1.0 if f > 0 else -1.0
        if kind == "plano-convex":
            ct = ct_edge + float(sag(np.array(half), R, 0))
            r = [R, 0.0]
        elif kind == "bi-convex":
            ct = ct_edge + 2 * float(sag(np.array(half), R, 0))
            r = [R, -R]
        elif kind == "plano-concave":
            ct, r = max(ct_edge + 0.5, 3.0), [-R, 0.0]
        elif kind == "bi-concave":
            ct, r = max(ct_edge + 0.5, 3.0), [-R, R]
        elif kind == "meniscus":
            ct = ct_edge + float(sag(np.array(half), R, 0)) - float(sag(np.array(half), 2 * R, 0))
            r = [R, 2 * R]
        else:
            raise ValueError(kind)
        del sgn
        return [Surface(radius=r[0], thickness=ct, glass=glass, semi_diameter=_sd(d)),
                Surface(radius=r[1], thickness=0.0, glass="AIR", semi_diameter=_sd(d))]

    lo = half * 1.05 if kind != "meniscus" else half * 1.05
    hi = 20 * abs(f)
    if kind == "meniscus":
        lo = half * 1.05

    def err(R):
        efl, _, _ = measure(build(R), d)
        return (efl if efl is not None else 1e9) - f

    try:
        if err(lo) * err(hi) > 0:
            return None
        R = _bisect(err, lo, hi)
    except Exception:  # noqa: BLE001
        return None
    s = build(round(R, 3))
    if kind in ("plano-convex", "bi-convex", "meniscus") and s[0].radius < half * 1.02:
        return None
    return s


@lru_cache(maxsize=None)
def _achromat(f: float, d: float) -> list[Surface] | None:
    """BK7/F2 cemented doublet: r2 = -0.39 f; r1 solved for FC achromatism, r3 for EFL = f."""
    ct1, ct2 = (4.0, 2.5) if d <= 30 else (7.0, 4.0)
    r2 = -0.39 * f

    def mk(r1, r3):
        return [Surface(radius=r1, thickness=ct1, glass="N-BK7", semi_diameter=_sd(d)),
                Surface(radius=r2, thickness=ct2, glass="F2", semi_diameter=_sd(d)),
                Surface(radius=r3, thickness=0.0, glass="AIR", semi_diameter=_sd(d))]

    def model(s):
        return SystemModel(surfaces=s, aperture=Aperture(value=CLEAR * d))

    def r1_for(r3):
        def dch(r1):
            m = model(mk(r1, r3))
            return solve(m, 0.4861).bfl - solve(m, 0.6563).bfl
        return _bisect(dch, 0.25 * f, 0.9 * f, 45)

    def efl_err(r3):
        return solve(model(mk(r1_for(r3), r3)), WL).efl - f

    try:
        lo, hi = -6.0 * f, -1.2 * f
        if efl_err(lo) * efl_err(hi) > 0:
            return None
        r3 = _bisect(efl_err, lo, hi, 40)
    except Exception:  # noqa: BLE001
        return None
    return mk(round(r1_for(r3), 3), round(r3, 3))


# ---------------------------------------------------------------- mirrors

def _mirror(kind: str, f: float, d: float) -> list[Surface]:
    """On-axis spherical / parabolic / flat mirror. Concave (f>0): R = -2f, thickness after = -f."""
    if kind == "flat-mirror":
        return [Surface(radius=0.0, thickness=-50.0, glass="MIRROR", semi_diameter=_sd(d))]
    R = -2.0 * f
    conic = -1.0 if kind == "parabolic-mirror" else 0.0
    return [Surface(radius=R, conic=conic, thickness=-f, glass="MIRROR", semi_diameter=_sd(d))]


# ---------------------------------------------------------------- prisms (non-sequential solids)

def _extrude(poly_yz: list[tuple[float, float]], x0: float, x1: float, mirror_edges: tuple[int, ...] = ()):
    """Extrude a convex (y, z) polygon along x. Returns (refracting, mirror) triangle lists, outward wound."""
    P = np.array(poly_yz, float)
    n = len(P)
    cen = np.array([(x0 + x1) / 2, P[:, 0].mean(), P[:, 1].mean()])
    pts = lambda x, i: np.array([x, P[i % n, 0], P[i % n, 1]])  # noqa: E731
    glass, mirr = [], []

    def add(tri, bucket):
        a, b, c = (np.array(v) for v in tri)
        nrm = np.cross(b - a, c - a)
        if np.dot(nrm, (a + b + c) / 3 - cen) < 0:
            tri = (tri[0], tri[2], tri[1])
        bucket.append([list(map(float, v)) for v in tri])

    for i in range(1, n - 1):  # caps (triangle fans)
        add((pts(x0, 0), pts(x0, i), pts(x0, i + 1)), glass)
        add((pts(x1, 0), pts(x1, i), pts(x1, i + 1)), glass)
    for i in range(n):
        bucket = mirr if i in mirror_edges else glass
        a0, b0, a1, b1 = pts(x0, i), pts(x0, i + 1), pts(x1, i), pts(x1, i + 1)
        add((a0, b0, a1), bucket)
        add((b0, b1, a1), bucket)
    return glass, mirr


def _prism(kind: str, a: float) -> tuple[Solid, str]:
    h = a / 2
    if kind == "right-angle-prism":  # TIR on the hypotenuse; beam enters leg z=0, leaves leg y=0 travelling -y
        g, m = _extrude([(0, 0), (a, 0), (0, a)], -h, h)
        sol = Solid(name=f"Right-angle prism {a:g} mm", index="N-BK7", triangles=g, mirror_triangles=m)
        note = "N-BK7, TIR on the hypotenuse; beam in along +z, out along -y"
    elif kind == "right-angle-mirror-prism":  # coated hypotenuse
        g, m = _extrude([(0, 0), (a, 0), (0, a)], -h, h, mirror_edges=(1,))
        sol = Solid(name=f"Right-angle mirror prism {a:g} mm", index="N-BK7", triangles=g, mirror_triangles=m)
        note = "N-BK7, reflective coating on the hypotenuse"
    elif kind == "knife-edge-mirror":  # 45 deg front-surface mirror wedge with a sharp edge at the origin
        g, m = _extrude([(0, 0), (a, a), (0, a)], -h, h, mirror_edges=(0,))
        sol = Solid(name=f"Knife-edge 45° mirror {a:g} mm", index="N-BK7", triangles=g, mirror_triangles=m)
        note = "front-surface mirror on a wedge; the knife edge sits at the origin so a neighbouring beam can pass"
    elif kind == "fold-mirror":  # thin plate, reflecting face towards -z; rotate to fold the beam
        g, m = _extrude([(-h, 0), (h, 0), (h, 6.0), (-h, 6.0)], -h, h, mirror_edges=(0,))
        sol = Solid(name=f"Fold mirror {a:g} mm", index="N-BK7", triangles=g, mirror_triangles=m,
                    rotation_deg=[45.0, 0.0, 0.0])
        note = "6 mm plate, front-surface mirror; default pose folds a +z beam towards +y"
    elif kind == "dispersing-prism":  # 60 deg equilateral prism
        s3 = math.sqrt(3) / 2 * a
        g, m = _extrude([(0, -a / 2), (0, a / 2), (s3, 0)], -h, h)
        sol = Solid(name=f"60° dispersing prism {a:g} mm", index="N-SF11", triangles=g, mirror_triangles=m)
        note = "N-SF11 (model glass), apex towards +y"
    else:
        raise ValueError(kind)
    return sol, note


# ---------------------------------------------------------------- catalogue

@lru_cache(maxsize=1)
def generic_catalog() -> tuple[CatalogEntry, ...]:
    out: list[CatalogEntry] = []
    src = "generated from nominal specs (EFL, outer diameter, glass); not a vendor prescription"
    diams = (12.7, 25.4, 50.8)
    fl = {12.7: (15, 20, 25, 30, 40, 50, 75, 100), 25.4: (25, 30, 40, 50, 60, 75, 100, 150, 200, 300),
          50.8: (75, 100, 150, 200, 300, 500)}
    for kind, sign, tag in (("plano-convex", 1, "PCX"), ("bi-convex", 1, "BCX"),
                            ("plano-concave", -1, "PCV"), ("bi-concave", -1, "BCV"), ("meniscus", 1, "MEN")):
        for d in diams:
            for f in fl[d]:
                s = _singlet(kind, sign * f, d, "N-BK7")
                if s is None:
                    continue
                _gap_to_focus(s, d)
                out.append(_entry(f"gen-{tag.lower()}-{sign * f:g}-{d:g}", f"{tag} f={sign * f:g} Ø{d:g} N-BK7",
                                  "lens", kind, s, d, source=src))
    for d in diams:
        for f in fl[d]:
            if f < 40 and d > 25.4 or f < 30:
                continue
            s = _achromat(float(f), d)
            if s is None:
                continue
            _gap_to_focus(s, d)
            out.append(_entry(f"gen-ach-{f:g}-{d:g}", f"Achromat f={f:g} Ø{d:g} N-BK7/F2", "lens", "doublet", s, d,
                              source=src + "; BK7/F2 cemented doublet, FC-achromatised"))
    for d in diams:
        for g in ("N-BK7", "FUSED_SILICA"):
            s = [Surface(radius=0, thickness=3.0, glass=g, semi_diameter=_sd(d)),
                 Surface(radius=0, thickness=10.0, glass="AIR", semi_diameter=_sd(d))]
            out.append(_entry(f"gen-win-{g.lower()}-{d:g}", f"Window Ø{d:g} {g}", "lens", "window", s, d, source=src))
    for kind, tag, signs in (("spherical-mirror", "Spherical", (1, -1)), ("parabolic-mirror", "Parabolic", (1,))):
        for d in diams:
            for f in fl[d]:
                if f < 3 * d / 2 * 0.9 and kind == "spherical-mirror":
                    continue
                for sg in signs:
                    if sg < 0 and f > 150:
                        continue
                    ss = _mirror(kind, sg * f, d)
                    name = ("Concave" if sg > 0 else "Convex") + f" {tag.lower()} mirror f={sg * f:g} Ø{d:g}"
                    out.append(_entry(f"gen-{kind}-{sg * f:g}-{d:g}", name, "mirror",
                                      ("concave-" if sg > 0 else "convex-") + kind, ss, d, source=src))
    for d in diams:
        out.append(_entry(f"gen-flat-mirror-{d:g}", f"Flat mirror Ø{d:g} (on-axis)", "mirror", "flat-mirror",
                          _mirror("flat-mirror", 0, d), d, source=src))
    for kind, label, sizes in (("right-angle-prism", "Right-angle prism (TIR)", (10.0, 12.7, 25.4)),
                               ("right-angle-mirror-prism", "Right-angle mirror prism", (10.0, 12.7, 25.4)),
                               ("knife-edge-mirror", "Knife-edge 45° mirror", (12.7, 25.4)),
                               ("fold-mirror", "45° fold mirror", (12.7, 25.4, 50.8)),
                               ("dispersing-prism", "60° dispersing prism", (12.7, 25.4))):
        for a in sizes:
            sol, note = _prism(kind, a)
            out.append(CatalogEntry(
                id=f"gen-{kind}-{a:g}", name=f"{label} {a:g} mm", vendor="Generic", category="prism", kind=kind,
                source=f"parametric solid; {note}", diameter=a, glasses=[str(sol.index)], solid=sol))
    return tuple(out)


# ---------------------------------------------------------------- Zemax .zmx import

_NAME_FIX = {**{k: k for k in SELLMEIER}, **ALIASES, **{k: k for k in MODEL_GLASSES}}


def _glass_from_zmx(tokens: list[str]) -> str:
    name = tokens[1].upper() if len(tokens) > 1 else ""
    if name in {"MIRROR", "MIRR"}:
        return "MIRROR"
    if name in _NAME_FIX:
        return _NAME_FIX[name]
    try:
        nd = float(tokens[4]) if len(tokens) > 4 else 0.0
        vd = float(tokens[5]) if len(tokens) > 5 else 0.0
    except ValueError:
        nd = vd = 0.0
    if nd >= 1.0:
        return f"{nd:.5f}/{vd:.2f}" if vd > 0 else f"{nd:.5f}"
    raise ValueError(f"glass {name!r} is not in the catalogue and the file carries no index; "
                     "add it to MODEL_GLASSES or edit the surface to 'nd/Vd'")


def parse_zmx(text: str) -> tuple[list[Surface], dict]:
    """Parse the sequential subset of a .zmx file. Returns (surfaces without object/image, info)."""
    text = text.lstrip("﻿")
    blocks: list[dict] = []
    info: dict = {"name": "", "enpd": None, "unit": "MM"}
    cur: dict | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        tok = line.split()
        key = tok[0].upper()
        if key == "NAME" and cur is None:
            info["name"] = line[4:].strip()
        elif key == "UNIT":
            info["unit"] = tok[1].upper()
        elif key == "ENPD":
            info["enpd"] = float(tok[1])
        elif key == "SURF":
            cur = {"n": int(tok[1]), "type": "STANDARD", "curv": 0.0, "disz": 0.0, "glass": "AIR", "diam": None,
                   "coni": 0.0, "stop": False}
            blocks.append(cur)
        elif cur is not None:
            if key == "TYPE":
                cur["type"] = tok[1].upper()
            elif key == "CURV":
                cur["curv"] = float(tok[1])
            elif key == "DISZ":
                cur["disz"] = float("inf") if tok[1].upper().startswith("INF") else float(tok[1])
            elif key == "GLAS":
                cur["glass"] = _glass_from_zmx(tok)
            elif key == "DIAM":
                cur["diam"] = float(tok[1])
            elif key == "CONI":
                cur["coni"] = float(tok[1])
            elif key == "STOP":
                cur["stop"] = True
    if len(blocks) < 3:
        raise ValueError("no sequential surfaces found (expected object, >=1 surface, image)")
    scale = 25.4 if info["unit"].startswith("IN") else 10.0 if info["unit"] == "CM" else 1.0
    surfaces = []
    for b in blocks[1:-1]:
        if b["type"] != "STANDARD":
            raise ValueError(f"surface {b['n']}: unsupported TYPE {b['type']} (only STANDARD conics are supported)")
        radius = 0.0 if b["curv"] == 0 else scale / b["curv"]
        sd = (b["diam"] if b["diam"] is not None else 5.0) * scale
        surfaces.append(Surface(radius=radius, thickness=b["disz"] * scale, glass=b["glass"], semi_diameter=sd,
                                conic=b["coni"], is_stop=b["stop"]))
    return surfaces, info


def entry_from_zmx(text: str, vendor: str = "Imported", part_number: str = "", name: str = "") -> CatalogEntry:
    surfaces, info = parse_zmx(text)
    for s in surfaces:
        s.is_stop = False
    d = round(2 * max(s.semi_diameter for s in surfaces), 3)  # outer size = largest semi-diameter from the file
    has_mirror = any(is_mirror(s.glass) for s in surfaces)
    n_el = sum(1 for s in surfaces if not is_air(s.glass) and not is_mirror(s.glass))
    kind = "doublet" if n_el == 2 else "triplet" if n_el == 3 else "singlet" if n_el == 1 else "mirror" if has_mirror else "other"
    pn = part_number.strip()
    nm = name.strip() or info["name"] or (f"{vendor} {pn}".strip() or "Imported lens")
    # imports use the file's own semi-diameters for the F/# (no clear-aperture factor)
    m = SystemModel(surfaces=[s.model_copy() for s in surfaces],
                    aperture=Aperture(value=2 * min(s.semi_diameter for s in surfaces)), wavelengths=[Wavelength(um=WL)])
    p = solve(m, WL)
    ok = all(math.isfinite(x) for x in (p.efl, p.bfl, p.fno)) and abs(p.efl) < 1e7
    return CatalogEntry(
        id=f"zmx-{re.sub(r'[^A-Za-z0-9]+', '-', (vendor + '-' + (pn or nm)).lower()).strip('-')}", name=nm,
        vendor=vendor, part_number=pn, category="mirror" if has_mirror and n_el == 0 else "lens", kind=kind,
        source="imported from Zemax .zmx", diameter=d, efl=p.efl if ok else None, bfl=p.bfl if ok else None,
        fno=p.fno if ok else None,
        glasses=sorted({s.glass for s in surfaces if not is_air(s.glass) and not is_mirror(s.glass)}),
        surfaces=surfaces)
