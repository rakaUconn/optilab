"""Shared data model (single source of truth for the TS types).

Units: lengths in mm, angles in degrees, wavelengths in µm.
Sequential convention: object at infinity, light travels +z, surface 0 vertex at z=0.
``thickness`` of surface i is the distance to surface i+1 (last one: to image plane).
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Surface(BaseModel):
    radius: float = Field(0.0, description="Vertex radius of curvature; 0 means flat")
    thickness: float = Field(0.0, description="Distance to next surface (mm)")
    glass: str = Field("AIR", description="Medium AFTER this surface")
    semi_diameter: float = Field(10.0, gt=0)
    conic: float = 0.0
    is_stop: bool = False


class FieldPoint(BaseModel):
    angle: float = Field(0.0, description="Field angle in y-z plane (deg)")
    weight: float = 1.0


class Wavelength(BaseModel):
    um: float = Field(0.5876, gt=0)
    weight: float = 1.0


class Aperture(BaseModel):
    kind: Literal["epd"] = "epd"
    value: float = Field(10.0, gt=0, description="Entrance pupil diameter (mm)")


class Solid(BaseModel):
    """Non-sequential solid. 'mesh' carries triangles (n,3,3) outward-wound, e.g. from STL."""
    name: str = "solid"
    index: float = Field(1.5, ge=1.0)
    triangles: list[list[list[float]]] = Field(default_factory=list)


class Source(BaseModel):
    kind: Literal["collimated_grid"] = "collimated_grid"
    beam_diameter: float = Field(10.0, gt=0)
    n: int = Field(41, ge=3, le=401, description="Grid samples across diameter")
    angle: float = 0.0
    z: float = Field(-5.0, description="Start plane (mm)")


class Detector(BaseModel):
    z: float | None = Field(None, description="None: image plane of the sequential system")
    half_width: float = Field(2.0, gt=0)
    bins: int = Field(64, ge=8, le=512)


class NonSeq(BaseModel):
    derive_from_sequential: bool = True
    extra_solids: list[Solid] = Field(default_factory=list)
    source: Source = Field(default_factory=Source)
    detector: Detector = Field(default_factory=Detector)
    max_events: int = Field(8, ge=1, le=20)
    min_weight: float = Field(1e-3, gt=0, description="Prune rays below this fraction of one launched ray weight")
    tess_rings: int = Field(16, ge=4, le=64)
    tess_segments: int = Field(48, ge=12, le=180)


class SystemModel(BaseModel):
    name: str = "untitled"
    surfaces: list[Surface]
    fields: list[FieldPoint] = Field(default_factory=lambda: [FieldPoint()])
    wavelengths: list[Wavelength] = Field(default_factory=lambda: [Wavelength()])
    primary_wavelength: int = 0
    aperture: Aperture = Field(default_factory=Aperture)
    nonseq: NonSeq = Field(default_factory=NonSeq)

    @model_validator(mode="after")
    def _check(self):
        if len(self.surfaces) < 1:
            raise ValueError("need at least one surface")
        if not (0 <= self.primary_wavelength < len(self.wavelengths)):
            raise ValueError("primary_wavelength out of range")
        if sum(s.is_stop for s in self.surfaces) > 1:
            raise ValueError("at most one stop surface")
        return self

    @property
    def stop_index(self) -> int:
        for i, s in enumerate(self.surfaces):
            if s.is_stop:
                return i
        return 0


# ---------------- results ----------------

class ParaxialResult(BaseModel):
    wavelength: float
    efl: float
    bfl: float
    fno: float
    enp_z: float = Field(description="Entrance pupil position relative to surface 0")
    exp_z: float = Field(description="Exit pupil position relative to the image plane")
    image_z: float = Field(description="Paraxial image plane z (absolute)")
    surface_z: list[float]


class Layout(BaseModel):
    surface_z: list[float]
    surface_sd: list[float]
    surface_radius: list[float]
    surface_conic: list[float]
    glass_after: list[str]
    image_z: float
    rays: list["LayoutRay"]


class LayoutRay(BaseModel):
    field: int
    wavelength: int
    pupil: tuple[float, float]
    points: list[tuple[float, float, float]]
    vignetted: bool


class SpotResult(BaseModel):
    field: int
    wavelength: float
    x: list[float]
    y: list[float]
    chief: tuple[float, float]
    rms_radius: float
    geo_radius: float
    n_traced: int
    n_vignetted: int


class RayFanResult(BaseModel):
    field: int
    wavelength: float
    pupil: list[float]
    ey_tangential: list[float | None]
    ex_sagittal: list[float | None]


class OpdResult(BaseModel):
    field: int
    wavelength: float
    n: int
    opd_waves: list[list[float | None]]
    rms_waves: float
    pv_waves: float


class MtfResult(BaseModel):
    field: int
    wavelength: float
    freq: list[float] = Field(description="cycles/mm")
    tangential: list[float]
    sagittal: list[float]
    diffraction_limit: list[float]
    cutoff: float


class IrradianceResult(BaseModel):
    extent: float
    bins: int
    grid: list[list[float]]
    total_power: float
    ghost_paths: int
    ghost_power_fraction: float
    n_rays_launched: int
    n_triangles: int


class AnalysisRequest(BaseModel):
    model: SystemModel
    analyses: list[Literal["layout", "spot", "rayfan", "opd", "mtf", "irradiance"]] = Field(
        default_factory=lambda: ["layout", "spot", "rayfan", "mtf"]
    )
    autofocus: bool = Field(True, description="Place image plane at paraxial focus (primary λ)")
    pupil_rings: int = Field(8, ge=2, le=40)
    fan_points: int = Field(41, ge=5, le=201)
    layout_rays: int = Field(7, ge=3, le=41)


class AnalysisResult(BaseModel):
    paraxial: list[ParaxialResult] = Field(default_factory=list)
    layout: Layout | None = None
    spots: list[SpotResult] = Field(default_factory=list)
    rayfans: list[RayFanResult] = Field(default_factory=list)
    opd: list[OpdResult] = Field(default_factory=list)
    mtf: list[MtfResult] = Field(default_factory=list)
    irradiance: IrradianceResult | None = None
    image_z: float = 0.0


class JobStatus(BaseModel):
    id: str
    state: Literal["queued", "running", "done", "cancelled", "error"]
    progress: float = 0.0
    message: str = ""
    result: AnalysisResult | None = None
    error: str | None = None


class ApiSchema(BaseModel):
    """Root used only to export a single JSON schema containing every public type."""
    request: AnalysisRequest
    status: JobStatus
    system: SystemModel
