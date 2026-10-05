# OptiLab

Imaging optical design for macOS (arm64 + x86_64), Windows and Linux. MVP: sequential + non-sequential tracing,
a dark three.js layout (2D/3D) with ray fans, and Spot / RayFan / MTF / Irradiance analyses — **every plot is computed
from a real ray trace** by the Python engine; there is no mock data anywhere.

```
Tauri 2 shell (Rust) ──spawns──▶ Python 3.11 FastAPI sidecar (numpy)  ◀── React + TS + Tailwind + three.js + ECharts
        engine_info {port, token}        POST /jobs · GET /jobs/{id} · DELETE /jobs/{id}
```

* Shared types: Pydantic models in `engine/optilab/models.py` → `schema/optilab.schema.json` → generated
  `apps/desktop/src/types/api.ts` (`npm run gen`). CI fails if the generated files are stale.
* Clean-room MIT implementation. The optics are written from textbook formulas (y-nu paraxial trace, exact conic
  ray–surface intersection, vector Snell law, Möller–Trumbore, Fresnel equations). The projects
  [ray-optics](https://github.com/mjhoptics/ray-optics), [Optiland](https://github.com/HarrisonKramer/optiland) and
  [Kraken](https://github.com/garchupiter/kraken-optical-simulator) were consulted for *structure and ideas only*;
  no code was copied (Kraken is GPL).

## Quick start (dev)

Prerequisites: Python ≥ 3.11, Node ≥ 20, Rust (stable) and the [Tauri 2 system deps](https://tauri.app/start/prerequisites/)
(Linux: `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf`, …).

```bash
npm run setup          # creates .venv, installs the engine (editable) and the UI deps
npm run test           # pytest (engine)
npm run tauri dev      # opens the desktop app; Rust starts `python -m optilab.server` from .venv
```

Browser-only development (no Rust): `npm run engine` in one terminal, `npm run dev` in another →
http://localhost:1420. Override the interpreter with `OPTILAB_PYTHON=/path/to/python`.

Open `samples/doublet.optilab.json` (f = 100 mm N-BK7/F2 achromat, also in the *Load sample* menu) or
`samples/singlet.optilab.json`.

## System model (JSON)

```jsonc
{
  "surfaces": [ { "radius": 49.554, "thickness": 5, "glass": "N-BK7", "semi_diameter": 12.7, "conic": 0, "is_stop": true }, … ],
  "fields":      [ { "angle": 0 }, { "angle": 2 } ],              // deg, object at infinity
  "wavelengths": [ { "um": 0.5876 }, { "um": 0.4861, "weight": .5 } ],
  "primary_wavelength": 0,
  "aperture": { "kind": "epd", "value": 25.4 },
  "nonseq": { "source": {…}, "detector": {…}, "extra_solids": [ … STL triangles … ] }
}
```
`glass` is the medium *after* the surface (`AIR`, `N-BK7`, `F2`, `N-SF5`, `FUSED_SILICA`, or a constant index such as `1.52`).
`radius: 0` is a flat. Units: mm, degrees, µm. The last thickness is replaced by the paraxial focus when *auto-focus* is on.

**Non-sequential objects are derived from this table**: each glass element becomes tessellated surface patches + an edge band,
the source is a collimated grid, the detector a plane at the image plane. Extra STL solids can be appended
(`optilab.nonseq.mesh.load_stl`).

## Component library (lenses, mirrors, prisms)

**Library** in the toolbar opens a searchable catalogue (type / kind / EFL range / text), a cross-section preview, a
**lens editor** with a live first-order readout (EFL, BFL, F/#), and *Insert after surface* / *Replace system* for lenses and
mirrors, or *Add to scene* for prisms. Edited parts are saved to *My library* (browser storage) and can be exported as JSON.

* **Generic** parts (≈210) are generated from nominal specs — plano/bi-convex, plano/bi-concave, meniscus, BK7/F2 achromats,
  windows, spherical and parabolic mirrors, flat mirrors, right-angle prisms (TIR and mirror-coated), knife-edge 45° mirrors,
  45° fold mirrors and 60° dispersing prisms. They are labelled *Generic*: they are **not** any manufacturer's prescriptions.
* **Real Thorlabs / Edmund Optics parts**: both publish a Zemax `.zmx` file per part number. Use *Import Zemax file*, pick the
  vendor and enter the part number; the prescription is stored with that vendor/part tag. Supported: STANDARD surfaces
  (radius, thickness, conic, semi-diameter, stop, mirrors); glasses in the built-in set, or any glass carrying `nd`/`Vd`
  in the file (approximated with a two-term Cauchy model). Anything else is rejected with an explicit error.
* **Mirrors** are sequential surfaces with medium `MIRROR` (use a negative thickness after them, Zemax-style).
  **Prisms and fold mirrors** are non-sequential solids (posed with position + rotation, refracting and reflective faces);
  the non-sequential detector can be placed at any centre/normal, and TIR/mirror bounces are not counted as ghosts.

## Non-sequential editor (place objects in 3D)

Switch the toolbar to **Non-sequential**. The centre becomes a 3D workspace with a bench grid and world axes
(x red, y green, z blue = beam axis); the left panel is the scene tree, the right panel the selected object's properties.

* **Select** by clicking an object in the view or the list; **Move (W)** / **Rotate (E)** with the gizmo (snap 1 mm / 5°), or type
  exact position / rotation (Rz·Ry·Rx, degrees). Del removes, D duplicates, Ctrl+Z / Ctrl+Y undo/redo (one step per drag or edit),
  Esc deselects. View presets: 3D, Top, Side, Front.
* **Objects**: the sequential lens system (as a read-only, switchable part of the scene), the **source** (free pose, grid size,
  diameter), the **detector** (any plane: centre + normal, or snapped back to the image plane), and solids you add:
  glass block, cylinder, ball lens, mirror plate, **aperture** (absorbing annulus), beam block (absorber), plus any library prism or fold mirror.
  Primitive dimensions are editable and the mesh is regenerated.
* **Run non-sequential** traces with Fresnel splitting; the result is drawn in the scene: yellow rays are direct paths,
  pink rays carry at least one partial reflection (ghosts), and the irradiance heat-map is painted on the detector plane.
  The bottom *Irradiance* tab keeps the numbers (power on detector, ghost paths).

## What is computed

| Analysis | Method |
|---|---|
| Paraxial | y-nu transfer, EFL/BFL/F#, entrance & exit pupil, per wavelength |
| Real trace | exact conic intersection, vector Snell refraction, clipping at semi-diameter, TIR flag |
| Spot | hexapolar pupil grid, RMS about the centroid, per field × wavelength |
| Ray fan | tangential and sagittal transverse aberration |
| OPD | OPL to a chief-ray-centred reference sphere (launch-plane advance removed) |
| MTF | autocorrelation of the pupil function with real OPD (T and S) + analytic diffraction limit at the paraxial F/# |
| Irradiance | collimated grid → ray splitting at every interface with unpolarised Fresnel R/T → detector heat-map; ghost paths = paths with ≥ 2 reflections reaching the detector |

Jobs run asynchronously with progress and cooperative **Cancel** (checked per ray batch).

## Validation

`cd engine && pytest` (53 tests) checks the engine against *independent* references:

* singlet vs. the thick-lens lensmaker's formula, and singlet + doublet vs. an independent ABCD-matrix implementation (`tests/analytic.py`);
* real marginal rays vs. a separate angle-based (trigonometric) meridional trace to 1e-9 mm;
* a plano-convex lens with an ellipsoidal exit surface (k = −n²) is aberration-free: RMS spot ≈ 1e-15 mm, OPD ≈ 1e-11 waves,
  MTF equals the diffraction limit;
* achromat: BFL(F) = BFL(C), singlet chromatic shift = f/V;
* checked-in reference JSON (`engine/reference/*.json`, regenerate with `engine/scripts/make_reference.py`);
* non-sequential: Fresnel normal-incidence R, plane-parallel plate transmission `(1−R)/(1+R)` and ghost share `R²` within 5 %, energy conservation, STL parser;
* non-sequential editor: free-pose source (identical to the legacy source when untilted), absorbing blocks remove exactly the rays they cover, previewed ray paths follow the real trace (fold mirror → detector); UI unit tests (`npm test` in `apps/desktop`): primitive volumes/winding and the engine ↔ three.js rotation convention;
* API: job lifecycle, progress, cancel, error reporting;
* catalogue: every stock singlet/achromat hits its nominal EFL, concave mirror f = R/2, parabolic mirror perfect on axis,
  spherical-mirror aberration vs the exact formula, Zemax round-trip, right-angle prism (TIR, 90° turn, (1−R)²),
  fold-mirror and knife-edge mirror (100 % reflection), 60° prism deviation vs an independent Snell trace (a detector 3° off misses).

## Building installers

CI (`.github/workflows/release.yml`, tag `v*` or manual dispatch) builds macOS arm64 + x86_64, Windows and Linux. Locally:

```bash
pip install -e "engine[build]"
python engine/scripts/build_sidecar.py          # PyInstaller → apps/desktop/src-tauri/binaries/optilab-engine-<triple>
cd apps/desktop && npm run tauri build          # .app / .dmg in src-tauri/target/release/bundle
```

### macOS: sign + notarize

Requires an Apple Developer account ($99/yr) and a *Developer ID Application* certificate.

1. Export the certificate from Keychain as `.p12`; `base64 -i cert.p12 | pbcopy`.
2. Create an app-specific password at appleid.apple.com. Note your Team ID.
3. Build with the signing environment set (CI does this from repository secrets
   `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`):
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   export APPLE_ID="you@example.com" APPLE_PASSWORD="abcd-efgh-ijkl-mnop" APPLE_TEAM_ID="TEAMID"
   cd apps/desktop && npm run tauri build -- --target aarch64-apple-darwin   # and x86_64-apple-darwin on an Intel Mac/runner
   ```
   Tauri signs with the hardened runtime using `src-tauri/Entitlements.plist` (needed because the frozen Python
   engine loads numpy's native libraries) and submits to Apple's notary service.
4. Manual route, if you sign outside Tauri:
   ```bash
   codesign --force --options runtime --timestamp --entitlements apps/desktop/src-tauri/Entitlements.plist \
            -s "$APPLE_SIGNING_IDENTITY" OptiLab.app/Contents/MacOS/optilab-engine
   codesign --force --deep --options runtime --timestamp --entitlements apps/desktop/src-tauri/Entitlements.plist \
            -s "$APPLE_SIGNING_IDENTITY" OptiLab.app
   ditto -c -k --keepParent OptiLab.app OptiLab.zip
   xcrun notarytool submit OptiLab.zip --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD" --wait
   xcrun stapler staple OptiLab.app && spctl -a -vv OptiLab.app
   ```
5. A universal build is not used: ship one DMG per architecture, each with a natively frozen engine
   (PyInstaller cannot cross-compile; the release workflow uses an Apple-silicon and an Intel runner).

> The macOS steps above could not be exercised in the Linux environment this MVP was developed in — treat them as a checklist to verify on first release.

## Limitations (MVP)

* Object at infinity (field = angle); no finite conjugates, tilts/decentres (use non-sequential solids for folds), coatings or polarisation. Sequential mirrors are on-axis only.
* Glass catalogue is a small built-in Sellmeier set (no AGF import yet).
* MTF is monochromatic per wavelength (not polychromatic) and uses the geometric wavefront (no diffraction of edges).
* Non-sequential intersection is brute-force vectorised over triangles (fine to ~10⁴ triangles × 10⁴ rays), no BVH yet; scatter is not modelled.

## Layout

```
engine/      Python engine, FastAPI server, tests, reference JSON
apps/desktop React UI + Tauri (src-tauri)
schema/      generated JSON Schema (single source of truth for TS types)
samples/     example systems
```

MIT licensed.
