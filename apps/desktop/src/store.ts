import { create } from "zustand";
import doublet from "../../../samples/doublet.optilab.json";
import singlet from "../../../samples/singlet.optilab.json";
import { runJob, type RunningJob } from "./api/client";
import { makePrimitive, type PrimitiveKind } from "./components/primitives";
import type { AnalysisRequest, AnalysisResult, CatalogEntry, JobStatus, Solid, Surface, SystemModel } from "./types/api";

export const SAMPLES: Record<string, SystemModel> = {
  "Achromatic doublet f=100": doublet as SystemModel,
  "BK7 singlet": singlet as SystemModel,
};

export type NonSeq = SystemModel["nonseq"];
export type Workspace = "sequential" | "nonseq";
/** Selection ids in the non-sequential editor: "source", "detector" or "solid:<index>". */
export type SelId = string | null;

export type Tab = "spot" | "rayfan" | "mtf" | "irradiance";
export type ViewMode = "2d" | "3d";

const SEQ: AnalysisRequest["analyses"] = ["layout", "spot", "rayfan", "mtf"];
let current: RunningJob | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;

/** Fill defaults for files written by older versions (or hand-edited JSON). */
export function normalizeModel(m: SystemModel): SystemModel {
  const ns = (m.nonseq ?? {}) as Partial<SystemModel["nonseq"]>;
  const nonseq = {
    derive_from_sequential: true, max_events: 8, min_weight: 1e-3, preview_rays: 60, tess_rings: 16, tess_segments: 48,
    ...ns,
    extra_solids: (ns.extra_solids ?? []).map((s) => ({ position: [0, 0, 0], rotation_deg: [0, 0, 0], mirror_triangles: [], index: 1.5, kind: "", params: {}, absorbing: false, ...(s as Partial<Solid>) })),
    source: { kind: "collimated_grid", beam_diameter: 10, n: 41, angle: 0, z: -5, offset: [0, 0], position: null, rotation_deg: [0, 0, 0], ...ns.source },
    detector: { z: null, center: null, normal: null, half_width: 2, bins: 64, ...ns.detector },
  };
  return { ...m, fields: m.fields?.length ? m.fields : [{ angle: 0, weight: 1 }], nonseq: nonseq as SystemModel["nonseq"] };
}

const USER_KEY = "optilab.userlib.v1";
function loadUserLib(): CatalogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "[]") as CatalogEntry[];
  } catch {
    return [];
  }
}
function saveUserLib(l: CatalogEntry[]) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(l));
  } catch {
    /* storage unavailable: the library simply is not persisted */
  }
}

interface State {
  workspace: Workspace;
  sel: SelId;
  nsPast: NonSeq[];
  nsFuture: NonSeq[];
  nsView: { rays: boolean; heat: boolean; ghosts: boolean; snap: boolean; mode: "translate" | "rotate" };
  /** Edit the non-sequential scene; ``history: false`` is for continuous edits (gizmo drags) that commit separately. */
  nsEdit: (fn: (ns: NonSeq) => void, history?: boolean) => void;
  nsCommit: (before: NonSeq) => void;
  nsUndo: () => void;
  nsRedo: () => void;
  addPrimitive: (kind: PrimitiveKind) => void;
  duplicateSolid: (i: number) => void;
  deleteSolid: (i: number) => void;
  libraryOpen: boolean;
  userLib: CatalogEntry[];
  addUserEntry: (e: CatalogEntry) => void;
  removeUserEntry: (id: string) => void;
  /** Sequential parts (lens/mirror): splice into the surface table or replace the whole system. */
  insertEntry: (e: CatalogEntry, mode: "after" | "replace", gap: number) => void;
  /** Prisms / fold mirrors: add a posed non-sequential solid. */
  addSolid: (s: Solid) => void;
  model: SystemModel;
  result: AnalysisResult;
  job: { running: boolean; progress: number; message: string; error: string | null; kind: "seq" | "nonseq" | null };
  selSurface: number;
  selField: number;
  tab: Tab;
  view: ViewMode;
  auto: boolean;
  autofocus: boolean;
  setModel: (m: SystemModel, trace?: boolean) => void;
  patch: (f: (m: SystemModel) => void) => void;
  set: (p: Partial<State>) => void;
  trace: (analyses?: AnalysisRequest["analyses"]) => Promise<void>;
  cancel: () => Promise<void>;
}

const clone = <T,>(x: T): T => structuredClone(x);

export const useStore = create<State>((set, get) => ({
  workspace: "sequential",
  sel: null,
  nsPast: [],
  nsFuture: [],
  nsView: { rays: true, heat: true, ghosts: true, snap: true, mode: "translate" },
  nsEdit: (fn, history = true) => {
    const m = clone(get().model);
    const before = clone(get().model.nonseq);
    fn(m.nonseq);
    set((s) => ({ model: m, ...(history ? { nsPast: [...s.nsPast.slice(-99), before], nsFuture: [] } : {}) }));
  },
  nsCommit: (before) => set((s) => ({ nsPast: [...s.nsPast.slice(-99), before], nsFuture: [] })),
  nsUndo: () => {
    const { nsPast, model } = get();
    if (!nsPast.length) return;
    const prev = nsPast[nsPast.length - 1];
    set((s) => ({ model: { ...s.model, nonseq: clone(prev) }, nsPast: nsPast.slice(0, -1), nsFuture: [clone(model.nonseq), ...s.nsFuture] }));
  },
  nsRedo: () => {
    const { nsFuture, model } = get();
    if (!nsFuture.length) return;
    const next = nsFuture[0];
    set((s) => ({ model: { ...s.model, nonseq: clone(next) }, nsFuture: nsFuture.slice(1), nsPast: [...s.nsPast, clone(model.nonseq)] }));
  },
  addPrimitive: (kind) => {
    const made = makePrimitive(kind);
    const n = get().model.nonseq.extra_solids.length;
    get().nsEdit((ns) => {
      ns.extra_solids.push({ ...made, name: `${made.name} ${n + 1}`, position: [0, 0, 20 + 15 * n], rotation_deg: [0, 0, 0] } as Solid);
    });
    set({ sel: `solid:${n}` });
  },
  duplicateSolid: (i) => {
    const n = get().model.nonseq.extra_solids.length;
    get().nsEdit((ns) => {
      const c = structuredClone(ns.extra_solids[i]);
      c.name = `${c.name} copy`;
      c.position = [c.position[0] + 10, c.position[1], c.position[2] + 10];
      ns.extra_solids.push(c);
    });
    set({ sel: `solid:${n}` });
  },
  deleteSolid: (i) => {
    get().nsEdit((ns) => { ns.extra_solids.splice(i, 1); });
    set({ sel: null });
  },
  libraryOpen: false,
  userLib: loadUserLib(),
  addUserEntry: (e) => {
    const l = [e, ...get().userLib.filter((x) => x.id !== e.id)];
    saveUserLib(l);
    set({ userLib: l });
  },
  removeUserEntry: (id) => {
    const l = get().userLib.filter((x) => x.id !== id);
    saveUserLib(l);
    set({ userLib: l });
  },
  insertEntry: (e, mode, gap) => {
    const parts: Surface[] = structuredClone(e.surfaces).map((s) => ({ ...s, is_stop: false }));
    if (mode === "replace") {
      parts[0].is_stop = true;
      const sd = Math.min(...parts.map((s) => s.semi_diameter));
      get().setModel({
        ...clone(get().model),
        name: e.name,
        surfaces: parts,
        aperture: { kind: "epd", value: Math.round(sd * 2 * 0.9 * 100) / 100 },
        fields: [{ angle: 0, weight: 1 }],
      });
    } else {
      const m = clone(get().model);
      const idx = Math.min(get().selSurface + 1, m.surfaces.length);
      if (idx < m.surfaces.length) parts[parts.length - 1].thickness = gap;
      m.surfaces.splice(idx, 0, ...parts);
      get().setModel(m);
      set({ selSurface: idx });
    }
  },
  addSolid: (s) => {
    const n = get().model.nonseq.extra_solids.length;
    get().nsEdit((ns) => {
      const sol = structuredClone(s);
      sol.name = `${sol.name} #${n + 1}`;
      ns.extra_solids.push(sol);
    });
    set({ tab: "irradiance", sel: `solid:${n}` });
  },
  model: clone(SAMPLES["Achromatic doublet f=100"]),
  result: {} as AnalysisResult,
  job: { running: false, progress: 0, message: "", error: null, kind: null },
  selSurface: 0,
  selField: 0,
  tab: "spot",
  view: "2d",
  auto: true,
  autofocus: true,
  set: (p) => set(p),
  setModel: (m, trace = true) => {
    set({ model: normalizeModel(m), selSurface: 0, selField: 0, sel: null, nsPast: [], nsFuture: [] });
    if (trace) void get().trace();
  },
  patch: (f) => {
    const m = clone(get().model);
    f(m);
    set({ model: m });
    if (get().auto) {
      clearTimeout(debounce);
      debounce = setTimeout(() => void get().trace(), 450);
    }
  },
  cancel: async () => {
    await current?.cancel();
  },
  trace: async (analyses = SEQ) => {
    const nonseq = analyses.includes("irradiance");
    const req: AnalysisRequest = {
      model: get().model, analyses, autofocus: get().autofocus,
      pupil_rings: 8, fan_points: 41, layout_rays: 9,
    };
    set({ job: { running: true, progress: 0, message: "starting", error: null, kind: nonseq ? "nonseq" : "seq" } });
    const job = runJob(req, (s: JobStatus) =>
      set((st) => ({ job: { ...st.job, progress: s.progress, message: s.message } })));
    const prev = current;
    current = job; // a new request supersedes whatever is running; stale results are ignored
    void prev?.cancel().catch(() => undefined);
    try {
      const s = await job.done;
      if (current !== job) return;
      if (s.state === "done" && s.result) {
        set((st) => ({
          result: nonseq ? { ...st.result, irradiance: s.result!.irradiance } : { ...s.result!, irradiance: st.result.irradiance },
          job: { running: false, progress: 1, message: "done", error: null, kind: null },
        }));
      } else {
        set({ job: { running: false, progress: 0, message: s.state, error: s.error ?? null, kind: null } });
      }
    } catch (e) {
      if (current === job) set({ job: { running: false, progress: 0, message: "", error: String(e), kind: null } });
    }
  },
}));
