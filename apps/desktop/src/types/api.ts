/* GENERATED from schema/optilab.schema.json by `npm run gen:types`. DO NOT EDIT. */

export type Bfl = number | null;
export type Category = "lens" | "mirror" | "prism";
/**
 * Clear outer dimension (mm)
 */
export type Diameter = number;
export type Efl = number | null;
export type Fno = number | null;
export type Glasses = string[];
export type Id = string;
/**
 * plano-convex, bi-convex, doublet, concave-mirror, right-angle-prism, ...
 */
export type Kind = string;
export type Name = string;
export type PartNumber = string;
/**
 * rays that hit ``triangles`` are absorbed (baffles, apertures)
 */
export type Absorbing = boolean;
/**
 * Constant index or a glass name
 */
export type Index = number | string;
/**
 * primitive / catalogue kind (box, cylinder, sphere, mirror-plate, aperture, …)
 */
export type Kind1 = string;
export type MirrorTriangles = number[][][];
export type Name1 = string;
export type Position = number[];
export type RotationDeg = number[];
export type Triangles = number[][][];
/**
 * how the prescription was obtained
 */
export type Source = string;
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
/**
 * Sequential lenses/mirrors; last thickness = gap to next
 */
export type Surfaces = Surface[];
/**
 * Generic | Thorlabs | Edmund Optics | User | ...
 */
export type Vendor = string;
export type Catalog = CatalogEntry[];
export type Name2 = string;
export type PartNumber1 = string;
/**
 * Contents of a Zemax .zmx file
 */
export type Text = string;
export type Vendor1 = string;
export type Bfl1 = number;
export type Efl1 = number;
/**
 * Entrance pupil position relative to surface 0
 */
export type EnpZ = number;
/**
 * Exit pupil position relative to the image plane
 */
export type ExpZ = number;
export type Fno1 = number;
/**
 * Paraxial image plane z (absolute)
 */
export type ImageZ = number;
export type SurfaceZ = number[];
export type Wavelength = number;
export type Paraxial = ParaxialResult[];
export type Kind2 = "epd";
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
export type Name3 = string;
export type DeriveFromSequential = boolean;
export type Bins = number;
/**
 * Optional (x, y, z); overrides z for posed detectors
 */
export type Center = number[] | null;
export type HalfWidth = number;
/**
 * Optional plane normal; default +z
 */
export type Normal = number[] | null;
/**
 * None: image plane of the sequential system
 */
export type Z = number | null;
export type ExtraSolids = Solid[];
export type MaxEvents = number;
/**
 * Prune rays below this fraction of one launched ray weight
 */
export type MinWeight = number;
/**
 * Number of source rays whose paths are returned for display
 */
export type PreviewRays = number;
export type Angle1 = number;
export type BeamDiameter = number;
export type Kind3 = "collimated_grid";
/**
 * Grid samples across diameter
 */
export type N = number;
/**
 * (x, y) centre of the grid in the start plane
 */
export type Offset = number[];
/**
 * Free pose: grid centre. When set, z/offset/angle are ignored
 */
export type Position1 = number[] | null;
/**
 * Free pose: beam direction = Rz·Ry·Rx · (0,0,1)
 */
export type RotationDeg1 = number[];
/**
 * Start plane (mm)
 */
export type Z1 = number;
export type TessRings = number;
export type TessSegments = number;
export type PrimaryWavelength = number;
export type Surfaces1 = Surface[];
export type Um = number;
export type Weight1 = number;
export type Wavelengths = Wavelength1[];
export type Analyses = ("layout" | "spot" | "rayfan" | "opd" | "mtf" | "irradiance")[];
/**
 * Place image plane at paraxial focus (primary λ)
 */
export type Autofocus = boolean;
export type FanPoints = number;
export type LayoutRays = number;
export type PupilRings = number;
export type Error = string | null;
export type Id1 = string;
export type Message = string;
export type Progress = number;
export type ImageZ1 = number;
export type Bins1 = number;
export type Extent = number;
export type GhostPaths = number;
export type GhostPowerFraction = number;
export type Grid = number[][];
export type NRaysLaunched = number;
export type NTriangles = number;
/**
 * [x0,y0,z0,x1,y1,z1,weight,n_partial_reflections] of previewed paths
 */
export type Segments = number[][];
export type TotalPower = number;
export type GlassAfter = string[];
export type ImageZ2 = number;
export type Field = number;
export type Points = [number, number, number][];
/**
 * @minItems 2
 * @maxItems 2
 */
export type Pupil = [number, number];
export type Vignetted = boolean;
export type Wavelength2 = number;
export type Rays = LayoutRay[];
export type SurfaceConic = number[];
export type SurfaceRadius = number[];
export type SurfaceSd = number[];
export type SurfaceZ1 = number[];
export type Cutoff = number;
export type DiffractionLimit = number[];
export type Field1 = number;
/**
 * cycles/mm
 */
export type Freq = number[];
export type Sagittal = number[];
export type Tangential = number[];
export type Wavelength3 = number;
export type Mtf = MtfResult[];
export type Field2 = number;
export type N1 = number;
export type OpdWaves = (number | null)[][];
export type PvWaves = number;
export type RmsWaves = number;
export type Wavelength4 = number;
export type Opd = OpdResult[];
export type Paraxial1 = ParaxialResult[];
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
  catalog: Catalog;
  import_request: ImportRequest | null;
  paraxial: Paraxial;
  paraxial_request: ParaxialRequest | null;
  request: AnalysisRequest;
  status: JobStatus;
  system: SystemModel;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "CatalogEntry".
 */
export interface CatalogEntry {
  bfl: Bfl;
  category: Category;
  diameter: Diameter;
  efl: Efl;
  fno: Fno;
  glasses: Glasses;
  id: Id;
  kind: Kind;
  name: Name;
  part_number: PartNumber;
  /**
   * Prisms/fold mirrors: a non-sequential solid
   */
  solid: Solid | null;
  source: Source;
  surfaces: Surfaces;
  vendor: Vendor;
}
/**
 * Non-sequential solid (convex or not; triangles must be wound outward).
 *
 * ``triangles`` are refracting faces (glass of ``index``); ``mirror_triangles`` are fully reflective faces.
 * The mesh is given in local coordinates and placed with ``rotation_deg`` (rx, ry, rz; applied as Rz·Ry·Rx)
 * then ``position``.
 *
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Solid".
 */
export interface Solid {
  absorbing: Absorbing;
  index: Index;
  kind: Kind1;
  mirror_triangles: MirrorTriangles;
  name: Name1;
  params: Params;
  position: Position;
  rotation_deg: RotationDeg;
  triangles: Triangles;
}
/**
 * parameters the UI regenerates the mesh from
 */
export interface Params {
  [k: string]: number;
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
 * via the `definition` "ImportRequest".
 */
export interface ImportRequest {
  name: Name2;
  part_number: PartNumber1;
  text: Text;
  vendor: Vendor1;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "ParaxialResult".
 */
export interface ParaxialResult {
  bfl: Bfl1;
  efl: Efl1;
  enp_z: EnpZ;
  exp_z: ExpZ;
  fno: Fno1;
  image_z: ImageZ;
  surface_z: SurfaceZ;
  wavelength: Wavelength;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "ParaxialRequest".
 */
export interface ParaxialRequest {
  model: SystemModel;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "SystemModel".
 */
export interface SystemModel {
  aperture: Aperture;
  fields: Fields;
  name: Name3;
  nonseq: NonSeq;
  primary_wavelength: PrimaryWavelength;
  surfaces: Surfaces1;
  wavelengths: Wavelengths;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Aperture".
 */
export interface Aperture {
  kind: Kind2;
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
  preview_rays: PreviewRays;
  source: Source1;
  tess_rings: TessRings;
  tess_segments: TessSegments;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Detector".
 */
export interface Detector {
  bins: Bins;
  center: Center;
  half_width: HalfWidth;
  normal: Normal;
  z: Z;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Source".
 */
export interface Source1 {
  angle: Angle1;
  beam_diameter: BeamDiameter;
  kind: Kind3;
  n: N;
  offset: Offset;
  position: Position1;
  rotation_deg: RotationDeg1;
  z: Z1;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Wavelength".
 */
export interface Wavelength1 {
  um: Um;
  weight: Weight1;
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
 * via the `definition` "JobStatus".
 */
export interface JobStatus {
  error: Error;
  id: Id1;
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
  image_z: ImageZ1;
  irradiance: IrradianceResult | null;
  layout: Layout | null;
  mtf: Mtf;
  opd: Opd;
  paraxial: Paraxial1;
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
  segments: Segments;
  total_power: TotalPower;
}
/**
 * This interface was referenced by `ApiSchema`'s JSON-Schema
 * via the `definition` "Layout".
 */
export interface Layout {
  glass_after: GlassAfter;
  image_z: ImageZ2;
  rays: Rays;
  surface_conic: SurfaceConic;
  surface_radius: SurfaceRadius;
  surface_sd: SurfaceSd;
  surface_z: SurfaceZ1;
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
  wavelength: Wavelength2;
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
  wavelength: Wavelength3;
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
