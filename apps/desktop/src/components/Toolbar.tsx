import { useRef } from "react";
import { Button, cx } from "../ui";
import { SAMPLES, useStore } from "../store";
import type { SystemModel } from "../types/api";

export function Toolbar({ engine }: { engine: string }) {
  const { job, trace, cancel, auto, set, setModel, model, view, workspace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = engine === "ready";

  const save = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${model.name.replace(/[^\w.-]+/g, "_") || "system"}.optilab.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const open = async (f: File | undefined) => {
    if (!f) return;
    try {
      setModel(JSON.parse(await f.text()) as SystemModel);
    } catch (e) {
      set({ job: { running: false, progress: 0, message: "", error: `bad file: ${e}`, kind: null } });
    }
  };

  return (
    <header className="flex items-center gap-2 border-b border-border bg-card px-3">
      <div className="mr-2 flex items-center gap-1.5 font-semibold tracking-tight">
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-primary" />
        OptiLab
      </div>
      <select
        className="h-7 rounded-md border border-input bg-secondary px-2 text-xs"
        value=""
        onChange={(e) => e.target.value && setModel(structuredClone(SAMPLES[e.target.value]))}
      >
        <option value="">Load sample…</option>
        {Object.keys(SAMPLES).map((k) => <option key={k}>{k}</option>)}
      </select>
      <Button variant="primary" onClick={() => set({ libraryOpen: true })}>Library</Button>
      <Button onClick={() => fileRef.current?.click()}>Open</Button>
      <Button onClick={save}>Save</Button>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => void open(e.target.files?.[0])} />
      <div className="mx-1 h-5 w-px bg-border" />
      <div className="flex rounded-md bg-secondary p-0.5">
        {([["sequential", "Sequential"], ["nonseq", "Non-sequential"]] as const).map(([w, label]) => (
          <button key={w} onClick={() => set({ workspace: w, ...(w === "nonseq" ? { tab: "irradiance" as const } : {}) })}
            className={cx("h-6 rounded px-2.5 text-xs", workspace === w ? "bg-background text-foreground" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      {workspace === "sequential" && <div className="flex rounded-md bg-secondary p-0.5">
        {(["2d", "3d"] as const).map((v) => (
          <button key={v} onClick={() => set({ view: v })}
            className={cx("h-6 rounded px-2.5 text-xs", view === v ? "bg-background text-foreground" : "text-muted-foreground")}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>}
      <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={auto} onChange={(e) => set({ auto: e.target.checked })} /> Auto-trace
      </label>
      <div className="flex-1" />
      {job.running ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
          <span className="num w-10 text-right text-xs">{Math.round(job.progress * 100)}%</span>
          <span className="max-w-56 truncate text-xs text-muted-foreground">{job.message}</span>
          <Button variant="destructive" onClick={() => void cancel()}>Cancel</Button>
        </div>
      ) : (
        <>
          {job.error && <span className="max-w-96 truncate text-xs text-destructive" title={job.error}>{job.error}</span>}
          {!job.error && job.message === "cancelled" && <span className="text-xs text-muted-foreground">cancelled</span>}
          <span className={cx("text-xs", ready ? "text-emerald-400" : "text-amber-400")}>
            {ready ? "● engine" : engine === "starting" ? "● engine starting…" : "● engine offline"}
          </span>
          <Button variant="primary" disabled={!ready} onClick={() => void trace()}>Trace</Button>
        </>
      )}
    </header>
  );
}
