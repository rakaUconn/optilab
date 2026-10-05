import { useEffect, useState } from "react";
import { listGlasses } from "../api/client";
import { useStore } from "../store";
import { Button, NumInput, cx } from "../ui";
import type { Surface } from "../types/api";

const blank = (): Surface => ({ radius: 0, thickness: 5, glass: "AIR", semi_diameter: 10, conic: 0, is_stop: false });

export function SurfaceTable() {
  const { model, patch, selSurface, set, result } = useStore();
  const [glasses, setGlasses] = useState<string[]>(["AIR", "N-BK7", "F2"]);
  useEffect(() => { listGlasses().then(setGlasses).catch(() => undefined); }, []);
  const par = result.paraxial?.[model.primary_wavelength];
  const last = model.surfaces.length - 1;

  const move = (i: number, d: number) => patch((m) => {
    const j = i + d;
    if (j < 0 || j > last) return;
    [m.surfaces[i], m.surfaces[j]] = [m.surfaces[j], m.surfaces[i]];
  });

  return (
    <aside className="flex min-h-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sequential surfaces</h2>
        <div className="flex gap-1">
          <Button onClick={() => patch((m) => m.surfaces.splice(selSurface + 1, 0, blank()))}>+ Add</Button>
          <Button disabled={last < 1} onClick={() => { patch((m) => m.surfaces.splice(selSurface, 1)); set({ selSurface: Math.max(0, selSurface - 1) }); }}>Delete</Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
            <tr>
              {["#", "Radius", "Thick", "Glass", "SD", "Conic", "Stop"].map((h) => <th key={h} className="px-1 py-1 text-right font-medium first:text-left">{h}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {model.surfaces.map((s, i) => (
              <tr key={i} onClick={() => set({ selSurface: i })}
                className={cx("border-t border-border/60", selSurface === i ? "bg-accent/60" : "hover:bg-muted")}>
                <td className="num px-1 text-muted-foreground">{i}</td>
                <td className="w-[84px]"><NumInput value={s.radius} onChange={(v) => patch((m) => { m.surfaces[i].radius = v; })} title="0 = flat" /></td>
                <td className="w-[70px]"><NumInput value={s.thickness} onChange={(v) => patch((m) => { m.surfaces[i].thickness = v; })} /></td>
                <td className="w-[96px]">
                  <input list="glasses" value={s.glass} onChange={(e) => patch((m) => { m.surfaces[i].glass = e.target.value; })}
                    className="h-6 w-full rounded-sm border border-transparent bg-transparent px-1 text-xs hover:border-input focus:border-ring focus:bg-muted focus:outline-none" />
                </td>
                <td className="w-[60px]"><NumInput value={s.semi_diameter} min={0.01} onChange={(v) => patch((m) => { m.surfaces[i].semi_diameter = v; })} /></td>
                <td className="w-[56px]"><NumInput value={s.conic} onChange={(v) => patch((m) => { m.surfaces[i].conic = v; })} /></td>
                <td className="text-center">
                  <input type="checkbox" checked={s.is_stop} onChange={(e) => patch((m) => { m.surfaces.forEach((x, j) => { x.is_stop = e.target.checked && j === i; }); })} />
                </td>
                <td className="whitespace-nowrap pr-1 text-right text-muted-foreground">
                  <button className="px-0.5 hover:text-foreground" onClick={(e) => { e.stopPropagation(); move(i, -1); }}>↑</button>
                  <button className="px-0.5 hover:text-foreground" onClick={(e) => { e.stopPropagation(); move(i, 1); }}>↓</button>
                </td>
              </tr>
            ))}
            <tr className="border-t border-border/60 text-muted-foreground">
              <td className="px-1">img</td>
              <td colSpan={7} className="num px-1 text-right">z = {par ? result.image_z?.toFixed(3) : "—"}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <datalist id="glasses">{glasses.map((g) => <option key={g} value={g} />)}</datalist>
      </div>
      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        Glass = medium <em>after</em> the surface (AIR, N-BK7, F2, N-SF5, FUSED_SILICA, or a constant index like 1.52). Radius 0 = flat. Last thickness is overwritten by auto-focus.
      </div>
    </aside>
  );
}
