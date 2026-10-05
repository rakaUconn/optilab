import { PRIMITIVES, type PrimitiveKind } from "./primitives";
import { useStore } from "../store";
import { Button, cx } from "../ui";

export function SceneTree() {
  const { model, sel, set, result, nsEdit, deleteSolid, duplicateSolid, addPrimitive } = useStore();
  const ns = model.nonseq;
  const par = result.paraxial?.[model.primary_wavelength];
  const row = (id: string, label: string, sub: string, color: string, onDelete?: () => void) => (
    <div key={id} onClick={() => set({ sel: id })}
      className={cx("flex cursor-pointer items-center gap-2 border-t border-border/50 px-3 py-1.5 text-xs", sel === id ? "bg-accent/70" : "hover:bg-muted")}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[10px] text-muted-foreground">{sub}</span>
      {onDelete && <button className="px-1 text-muted-foreground hover:text-foreground" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>}
    </div>
  );
  return (
    <aside className="flex min-h-0 flex-col overflow-auto border-r border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Scene</h2>
      </div>
      <label className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <span>
          Sequential lens system
          <span className="block text-muted-foreground">{model.surfaces.length} surfaces{par && Number.isFinite(par.efl) ? ` · EFL ${par.efl.toFixed(1)} mm` : ""}</span>
        </span>
        <input type="checkbox" checked={ns.derive_from_sequential} onChange={(e) => nsEdit((n) => { n.derive_from_sequential = e.target.checked; })} />
      </label>
      {row("source", "Source", `⌀${ns.source.beam_diameter} mm`, "#f97316")}
      {row("detector", "Detector", ns.detector.center ? "posed" : "image plane", "#22c55e")}
      {ns.extra_solids.map((s, i) => row(`solid:${i}`, s.name, s.mirror_triangles.length && !s.triangles.length ? "mirror" : s.absorbing ? "absorber" : s.kind || "solid", s.absorbing ? "#64748b" : s.mirror_triangles.length ? "#e2e8f0" : "#38bdf8", () => deleteSolid(i)))}
      {sel?.startsWith("solid:") && (
        <div className="flex gap-1 border-t border-border/50 px-3 py-1.5">
          <Button onClick={() => duplicateSolid(Number(sel.slice(6)))}>Duplicate</Button>
        </div>
      )}
      <div className="mt-auto border-t border-border p-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add object</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(PRIMITIVES) as PrimitiveKind[]).map((k) => <Button key={k} onClick={() => addPrimitive(k)}>{PRIMITIVES[k].label}</Button>)}
          <Button variant="primary" className="col-span-2" onClick={() => set({ libraryOpen: true })}>Library part (prism, fold mirror…)</Button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Objects are placed 20 mm along the beam; drag the gizmo, or type exact positions and rotations in the panel on the right.</p>
      </div>
    </aside>
  );
}
