/* GENERATED from schema/optilab.schema.json by `npm run gen:types`. DO NOT EDIT. */

export type Analyses = ("layout" | "spot" | "rayfan" | "opd" | "mtf" | "irradiance")[];
/**
 * Place image plane at paraxial focus (primary λ)
 */
export type Autofocus = boolean;
export type FanPoints = number;
export type LayoutRays = number;
export type Kind = "epd";
/**
 * Entrance pupil diameter (mm)
 */
export type Value = number;
/**
 * Field angle in y-z plane (deg)
 */
export type Angle = number;
export type Weight = number;
export type Fields = FieldPoint[];
export type Name = string;
export type DeriveFromSequential = boolean;
export type Bins = number;
export type HalfWidth = number;
/**
 * None: image plane of the sequential system
 */
export type Z = number | null;
export type Index = number;
export type Name1 = string;
export type Triangles = number[][][];
export type ExtraSolids = Solid[];
export type MaxEvents = number;
/**
 * Prune rays below this fraction of one launched ray weight
 */
export type MinWeight = number;
export type Angle1 = number;
export type BeamDiameter = number;
export type Kind1 = "collimated_grid";
/**
 * Grid samples across diameter
 */
export type N = number;
/**
 * Start plane (mm)
 */
export type Z1 = number;
export type TessRings = number;
export type TessSegments = number;
export type PrimaryWavelength = number;
export type Conic = number;
/**
 * Medium AFTER this surface
 */
export type Glass = string;
export type IsStop = boolean;
/**
 * Vertex radius of curvature; 0 means flat
 */
export type Radius = number;
export type SemiDiameter = number;
/**
 * Distance to next surface (mm)
 */
export type Thickness = number;
export type Surfaces = Surface[];
export type Um = number;
export type Weight1 = number;
export type Wavelengths = Wavelength[];
export type PupilRings = number;
export type Error = string | null;
export type Id = string;
export type Message = string;
export type Progress = number;
export type ImageZ = number;
export type Bins1 = number;
export type Extent = number;
export type GhostPaths = number;
export type GhostPowerFraction = number;
export type Grid = number[][];
export type NRaysLaunched = number;
export type NTriangles = number;
export type TotalPower = number;
export type GlassAfter = string[];
export type ImageZ1 = number;
export type Field = number;
export type Points = [number, number, number][];
/**
 * @minItems 2
 * @maxItems 2
 */
export type Pupil = [number, number];
export type Vignetted = boolean;
export type Wavelength1 = number;
export type Rays = LayoutRay[];
export type SurfaceConic = number[];
export type SurfaceRadius = number[];
export type SurfaceSd = number[];
export type SurfaceZ = number[];
export type Cutoff = number;
export type DiffractionLimit = number[];
export type Field1 = number;
/**
 * cycles/mm
 */
export type Freq = number[];
export type Sagittal = number[];
export type Tangential = number[];
export type Wavelength2 = number;
export type Mtf = MtfResult[];
export type Field2 = number;
export type N1 = number;
export type OpdWaves = (number | null)[][];
export type PvWaves = number;
export type RmsWaves = number;
export type Wavelength3 = number;
export type Opd = OpdResult[];
export type Bfl = number;
export type Efl = number;
/**
 * Entrance pupil position relative to surface 0
 */
export type EnpZ = number;
/**
 * Exit pupil position relative to the image plane
 */
export type ExpZ = number;
export type Fno = number;
/**
 * Paraxial image plane z (absolute)
 */
export type ImageZ2 = number;
export type SurfaceZ1 = number[];
export type Wavelength4 = number;
export type Paraxial = ParaxialResult[];
export type ExSagittal = (number | null)[];
export type EyTangential = (number | null)[];
export type Field3 = number;
export type Pupil1 = number[];
export type Wavelength5 = number;
export type Rayfans = RayFanResult[];
/**
 * @minItems 2
 * @maxItems 2
 */
export type Chief = [number, number];
export type Field4 = number;
export type GeoRadius = number;
export type NTraced = number;
export type NVignetted = number;
export type RmsRadius = number;
export type Wavelength6 = number;
export type X = number[];
export type Y = number[];
export type Spots = SpotResult[];
export type State = "queued" | "running" | "done" | "cancelled" | "error";

/**
 * Root used only to export a single JSON schema containing every public type.
 */
export interface ApiSchema {
  request: AnalysisRequest;
  status: JobStatus;
  system: SystemModel;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "AnalysisRequest".
 */
export interface AnalysisRequest {
  analyses: Analyses;
  autofocus: Autofocus;
  fan_points: FanPoints;
  layout_rays: LayoutRays;
  model: SystemModel;
  pupil_rings: PupilRings;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "SystemModel".
 */
export interface SystemModel {
  aperture: Aperture;
  fields: Fields;
  name: Name;
  nonseq: NonSeq;
  primary_wavelength: PrimaryWavelength;
  surfaces: Surfaces;
  wavelengths: Wavelengths;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Aperture".
 */
export interface Aperture {
  kind: Kind;
  value: Value;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "FieldPoint".
 */
export interface FieldPoint {
  angle: Angle;
  weight: Weight;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "NonSeq".
 */
export interface NonSeq {
  derive_from_sequential: DeriveFromSequential;
  detector: Detector;
  extra_solids: ExtraSolids;
  max_events: MaxEvents;
  min_weight: MinWeight;
  source: Source;
  tess_rings: TessRings;
  tess_segments: TessSegments;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Detector".
 */
export interface Detector {
  bins: Bins;
  half_width: HalfWidth;
  z: Z;
}
/**
 * Non-sequential solid. 'mesh' carries triangles (n,3,3) outward-wound, e.g. from STL.
 *
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Solid".
 */
export interface Solid {
  index: Index;
  name: Name1;
  triangles: Triangles;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Source".
 */
export interface Source {
  angle: Angle1;
  beam_diameter: BeamDiameter;
  kind: Kind1;
  n: N;
  z: Z1;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Surface".
 */
export interface Surface {
  conic: Conic;
  glass: Glass;
  is_stop: IsStop;
  radius: Radius;
  semi_diameter: SemiDiameter;
  thickness: Thickness;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Wavelength".
 */
export interface Wavelength {
  um: Um;
  weight: Weight1;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "JobStatus".
 */
export interface JobStatus {
  error: Error;
  id: Id;
  message: Message;
  progress: Progress;
  result: AnalysisResult | null;
  state: State;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "AnalysisResult".
 */
export interface AnalysisResult {
  image_z: ImageZ;
  irradiance: IrradianceResult | null;
  layout: Layout | null;
  mtf: Mtf;
  opd: Opd;
  paraxial: Paraxial;
  rayfans: Rayfans;
  spots: Spots;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "IrradianceResult".
 */
export interface IrradianceResult {
  bins: Bins1;
  extent: Extent;
  ghost_paths: GhostPaths;
  ghost_power_fraction: GhostPowerFraction;
  grid: Grid;
  n_rays_launched: NRaysLaunched;
  n_triangles: NTriangles;
  total_power: TotalPower;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Layout".
 */
export interface Layout {
  glass_after: GlassAfter;
  image_z: ImageZ1;
  rays: Rays;
  surface_conic: SurfaceConic;
  surface_radius: SurfaceRadius;
  surface_sd: SurfaceSd;
  surface_z: SurfaceZ;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "LayoutRay".
 */
export interface LayoutRay {
  field: Field;
  points: Points;
  pupil: Pupil;
  vignetted: Vignetted;
  wavelength: Wavelength1;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "MtfResult".
 */
export interface MtfResult {
  cutoff: Cutoff;
  diffraction_limit: DiffractionLimit;
  field: Field1;
  freq: Freq;
  sagittal: Sagittal;
  tangential: Tangential;
  wavelength: Wavelength2;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "OpdResult".
 */
export interface OpdResult {
  field: Field2;
  n: N1;
  opd_waves: OpdWaves;
  pv_waves: PvWaves;
  rms_waves: RmsWaves;
  wavelength: Wavelength3;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "ParaxialResult".
 */
export interface ParaxialResult {
  bfl: Bfl;
  efl: Efl;
  enp_z: EnpZ;
  exp_z: ExpZ;
  fno: Fno;
  image_z: ImageZ2;
  surface_z: SurfaceZ1;
  wavelength: Wavelength4;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "RayFanResult".
 */
export interface RayFanResult {
  ex_sagittal: ExSagittal;
  ey_tangential: EyTangential;
  field: Field3;
  pupil: Pupil1;
  wavelength: Wavelength5;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "SpotResult".
 */
export interface SpotResult {
  chief: Chief;
  field: Field4;
  geo_radius: GeoRadius;
  n_traced: NTraced;
  n_vignetted: NVignetted;
  rms_radius: RmsRadius;
  wavelength: Wavelength6;
  x: X;
  y: Y;
}
