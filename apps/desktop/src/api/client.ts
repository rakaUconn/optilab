import type { AnalysisRequest, AnalysisResult, JobStatus } from "../types/api";

interface EngineInfo { base: string; token: string | null }
let infoPromise: Promise<EngineInfo> | null = null;

/** Inside Tauri the Rust side picks a free port + token; in a plain browser use the dev engine. */
function engineInfo(): Promise<EngineInfo> {
  infoPromise ??= (async () => {
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      const i = await invoke<{ port: number; token: string }>("engine_info");
      return { base: `http://127.0.0.1:${i.port}`, token: i.token };
    }
    return { base: import.meta.env.VITE_ENGINE_URL ?? "http://127.0.0.1:8765", token: null };
  })();
  return infoPromise;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { base, token } = await engineInfo();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-optilab-token"] = token;
  const r = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export async function waitForEngine(timeoutMs = 20000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    try {
      await call("/health");
      return;
    } catch (e) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`engine not reachable: ${e}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export const listGlasses = () => call<string[]>("/glasses");

export interface RunningJob {
  done: Promise<JobStatus>;
  cancel: () => Promise<void>;
}

/** Submit an analysis, poll progress, resolve with the final status (done | cancelled | error). */
export function runJob(req: AnalysisRequest, onProgress: (s: JobStatus) => void): RunningJob {
  let id: string | null = null;
  let cancelled = false;
  const done = (async () => {
    const first = await call<JobStatus>("/jobs", { method: "POST", body: JSON.stringify(req) });
    id = first.id;
    if (cancelled) await call(`/jobs/${id}`, { method: "DELETE" });
    for (;;) {
      const s = await call<JobStatus>(`/jobs/${id}`);
      onProgress(s);
      if (s.state === "done" || s.state === "cancelled" || s.state === "error") return s;
      await new Promise((r) => setTimeout(r, 80));
    }
  })();
  return {
    done,
    cancel: async () => {
      cancelled = true;
      if (id) await call(`/jobs/${id}`, { method: "DELETE" });
    },
  };
}

export type { AnalysisResult };
