import { useEffect, useMemo, useState } from "react";
import { listGlasses, paraxial } from "../api/client";
import { normalizeModel } from "../store";
import type { CatalogEntry, ParaxialResult, Surface, SystemModel } from "../types/api";
import { Button, NumInput } from "../ui";
import { isAir, isMirror } from "./profile";
import { Preview } from "./Preview";

const f = (x: number | null | undefined, d = 3) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(d));
const KINDS = ["plano-convex", "bi-convex", "plano-concave", "bi-concave", "meniscus", "doublet", "triplet", "singlet", "window", "concave-spherical-mirror", "convex-spherical-mirror", "concave-parabolic-mirror", "flat-mirror", "other"];

/** Edit a lens / mirror prescription with a live first-order readout from the engine. */
export function LensEditor({ entry, onSave, onInsert, onClose, gap }: {
  entry: CatalogEntry;
  onSave: (e: CatalogEntry) => void;
  onInsert: (e: CatalogEntry, mode: "after" | "replace") => void;
  onClose: () => void;
  gap: number;
}) {
  const [e, setE] = useState<CatalogEntry>(() => ({ ...structuredClone(entry), name: entry.vendor === "User" ? entry.name : `${entry.name} (copy)` }));
  const [px, setPx] = useState<ParaxialResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [glasses, setGlasses] = useState<string[]>([]);
  useEffect(() => { listGlasses().then(setGlasses).catch(() => undefined); }, []);

  const model = useMemo<SystemModel>(() => normalizeModel({
    name: e.name, surfaces: e.surfaces.map((s) => ({ ...s, is_stop: false })),
    fields: [{ angle: 0, weight: 1 }], wavelengths: [{ um: 0.5876, weight: 1 }], primary_wavelength: 0,
    aperture: { kind: "epd", value: Math.max(0.1, 2 * Math.min(...e.surfaces.map((s) => s.semi_diameter))) },
  } as unknown as SystemModel), [e.name, e.surfaces]);

  useEffect(() => {
    if (!e.surfaces.length) return;
    const t = setTimeout(() => {
      paraxial(model).then((r) => { setPx(r[0]); setErr(null); }).catch((x) => setErr(String(x).replace(/^Error: \d+ /, "")));
    }, 250);
    return () => clearTimeout(t);
  }, [model, e.surfaces.length]);

  const upd = (i: number, p: Partial<Surface>) => setE((c) => ({ ...c, surfaces: c.surfaces.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  const finite = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? x : null);

  const finalize = (): CatalogEntry => ({
    ...e,
    id: e.vendor === "User" && e.id.startsWith("user-") ? e.id : `user-${Date.now().toString(36)}`,
    vendor: e.vendor === "Generic" ? "User" : e.vendor,
    source: e.source.startsWith("edited") ? e.source : `edited copy of ${entry.name}`,
    diameter: Math.round(2 * Math.max(...e.surfaces.map((s) => s.semi_diameter)) * 1000) / 1000,
    efl: finite(px?.efl), bfl: finite(px?.bfl), fno: finite(px?.fno),
    glasses: [...new Set(e.surfaces.filter((s) => !isAir(s.glass) && !isMirror(s.glass)).map((s) => s.glass))].sort(),
  });

  const download = () => {
    const blob = new Blob([JSON.stringify(finalize(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${e.name.replace(/[^\w.-]+/g, "_")}.lens.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3 p-4 text-xs">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Lens editor</div>
        <Button variant="ghost" onClick={onClose}>← Back</Button>
      </div>
      <input value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })}
        className="h-7 w-full rounded-md border border-input bg-muted px-2" placeholder="Name" />
      <div className="grid grid-cols-2 gap-2">
        <input value={e.vendor} onChange={(x) => setE({ ...e, vendor: x.target.value })} placeholder="Vendor" className="h-7 rounded-md border border-input bg-muted px-2" />
        <input value={e.part_number} onChange={(x) => setE({ ...e, part_number: x.target.value })} placeholder="Part number" className="h-7 rounded-md border border-input bg-muted px-2" />
      </div>
      <select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value })} className="h-7 w-full rounded-md border border-input bg-secondary px-1.5">
        {[...new Set([e.kind, ...KINDS])].map((k) => <option key={k}>{k}</option>)}
      </select>

      <Preview entry={{ surfaces: e.surfaces, solid: null }} />

      <table className="w-full border-collapse">
        <thead className="text-[10px] uppercase text-muted-foreground">
          <tr><th className="text-left">#</th><th className="text-right">Radius</th><th className="text-right">Thick</th><th className="text-left pl-2">Medium</th><th className="text-right">SD</th><th className="text-right">k</th><th /></tr>
        </thead>
        <tbody>
          {e.surfaces.map((s, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="text-muted-foreground">{i}</td>
              <td className="w-[62px]"><NumInput value={s.radius} onChange={(v) => upd(i, { radius: v })} title="0 = flat" /></td>
              <td className="w-[56px]"><NumInput value={s.thickness} onChange={(v) => upd(i, { thickness: v })} /></td>
              <td className="pl-2"><input list="ed-glasses" value={s.glass} onChange={(x) => upd(i, { glass: x.target.value })}
                className="h-6 w-[84px] rounded-sm border border-transparent bg-transparent px-1 hover:border-input focus:border-ring focus:bg-muted focus:outline-none" /></td>
              <td className="w-[46px]"><NumInput value={s.semi_diameter} onChange={(v) => upd(i, { semi_diameter: Math.max(0.01, v) })} /></td>
              <td className="w-[44px]"><NumInput value={s.conic} onChange={(v) => upd(i, { conic: v })} /></td>
              <td><button className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={e.surfaces.length < 2}
                onClick={() => setE({ ...e, surfaces: e.surfaces.filter((_, j) => j !== i) })}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="ed-glasses">{[...glasses, "MIRROR"].map((g) => <option key={g} value={g} />)}</datalist>
      <Button onClick={() => setE({ ...e, surfaces: [...e.surfaces, { radius: 0, thickness: 5, glass: "AIR", semi_diameter: e.surfaces.at(-1)?.semi_diameter ?? 10, conic: 0, is_stop: false }] })}>+ Surface</Button>
      <p className="text-muted-foreground">Medium = what follows the surface (AIR, N-BK7, F2, …, <b>MIRROR</b>, or <code>nd/Vd</code> such as <code>1.6700/47.1</code>). After a mirror use a negative thickness.</p>

      <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md bg-muted p-2">
        <dt className="text-muted-foreground">EFL</dt><dd>{f(px?.efl)} mm</dd>
        <dt className="text-muted-foreground">BFL</dt><dd>{f(px?.bfl)} mm</dd>
        <dt className="text-muted-foreground">F/#</dt><dd>{f(px?.fno, 2)}</dd>
      </dl>
      {err && <div className="text-destructive">{err}</div>}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => onSave(finalize())}>Save to My library</Button>
        <Button onClick={download}>Export JSON</Button>
        <Button onClick={() => onInsert(finalize(), "after")}>Insert after surface</Button>
        <Button onClick={() => onInsert(finalize(), "replace")}>Replace system</Button>
      </div>
      <p className="text-muted-foreground">Mid-system insertion leaves a {gap} mm air gap after the part.</p>
    </div>
  );
}
