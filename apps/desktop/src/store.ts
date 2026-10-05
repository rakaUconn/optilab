import { create } from "zustand";
import doublet from "../../../samples/doublet.optilab.json";
import singlet from "../../../samples/singlet.optilab.json";
import { runJob, type RunningJob } from "./api/client";
import type { AnalysisRequest, AnalysisResult, JobStatus, SystemModel } from "./types/api";

export const SAMPLES: Record<string, SystemModel> = {
  "Achromatic doublet f=100": doublet as SystemModel,
  "BK7 singlet": singlet as SystemModel,
};

export type Tab = "spot" | "rayfan" | "mtf" | "irradiance";
export type ViewMode = "2d" | "3d";

const SEQ: AnalysisRequest["analyses"] = ["layout", "spot", "rayfan", "mtf"];
let current: RunningJob | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;

interface State {
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
    set({ model: m, selSurface: 0, selField: 0 });
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
