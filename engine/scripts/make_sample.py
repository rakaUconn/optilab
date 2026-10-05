"""Design the sample achromatic doublet (N-BK7 / F2, f = 100 mm, F/3.94) and write the sample file.

Solves radii so that EFL(d) = 100 mm and BFL(F) = BFL(C) (paraxial achromat), with the cemented
radius fixed. Run once; output is checked in under samples/.
"""
import json
import pathlib

from optilab.models import Aperture, Surface, SystemModel, Wavelength
from optilab.paraxial import solve

ROOT = pathlib.Path(__file__).resolve().parents[2]


def mk(r1, r2, r3):
    return SystemModel(
        name="Achromatic doublet f=100 (N-BK7/F2)",
        surfaces=[
            Surface(radius=r1, thickness=5.0, glass="N-BK7", semi_diameter=12.7, is_stop=True),
            Surface(radius=r2, thickness=3.0, glass="F2", semi_diameter=12.7),
            Surface(radius=r3, thickness=95.0, glass="AIR", semi_diameter=12.7),
        ],
        aperture=Aperture(value=25.4),
        fields=[{"angle": 0.0}, {"angle": 1.0}, {"angle": 2.0}],
        wavelengths=[Wavelength(um=0.5876), Wavelength(um=0.4861, weight=0.5), Wavelength(um=0.6563, weight=0.5)],
    )


def dch(m):
    return solve(m, 0.4861).bfl - solve(m, 0.6563).bfl


def bis(f, a, b):
    fa = f(a)
    for _ in range(100):
        c = (a + b) / 2
        fc = f(c)
        if fa * fc <= 0:
            b = c
        else:
            a, fa = c, fc
    return (a + b) / 2


R2 = -39.0


def r1_for(r3):
    return bis(lambda r1: dch(mk(r1, R2, r3)), 40.0, 60.0)


def efl(r3):
    return solve(mk(r1_for(r3), R2, r3), 0.5876).efl


r3 = bis(lambda r3: efl(r3) - 100.0, -400.0, -230.0)
r1 = round(r1_for(r3), 3)
r3 = round(r3, 3)
m = mk(r1, R2, r3)
m.surfaces[-1].thickness = round(solve(m, 0.5876).bfl, 3)
if __name__ == "__main__":
    print(r1, R2, r3, solve(m).efl, dch(m))
    (ROOT / "samples").mkdir(exist_ok=True)
    (ROOT / "samples" / "doublet.optilab.json").write_text(m.model_dump_json(indent=2) + "\n")
