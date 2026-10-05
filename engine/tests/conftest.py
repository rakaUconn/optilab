import json
import pathlib

import pytest

from optilab.models import Aperture, Surface, SystemModel, Wavelength

ROOT = pathlib.Path(__file__).resolve().parents[2]


@pytest.fixture
def singlet() -> SystemModel:
    return SystemModel(
        name="BK7 equiconvex singlet",
        surfaces=[
            Surface(radius=50.0, thickness=5.0, glass="N-BK7", semi_diameter=12.5, is_stop=True),
            Surface(radius=-50.0, thickness=0.0, glass="AIR", semi_diameter=12.5),
        ],
        aperture=Aperture(value=10.0),
        wavelengths=[Wavelength(um=0.5876), Wavelength(um=0.4861), Wavelength(um=0.6563)],
    )


@pytest.fixture
def doublet() -> SystemModel:
    return SystemModel.model_validate_json((ROOT / "samples" / "doublet.optilab.json").read_text())


def surf_dicts(m: SystemModel):
    return [dict(radius=s.radius, thickness=s.thickness, glass=s.glass) for s in m.surfaces]
