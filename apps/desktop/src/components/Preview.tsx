import { useMemo } from "react";
import type { CatalogEntry } from "../types/api";
import { mirrorEdges, poseTriangles, silhouette, sketch, surfaceZ } from "./profile";

type Pt = [number, number];

/** Vector cross-section of a lens / mirror / prism (axis z to the right, y up). */
export function Preview({ entry, height = 150 }: { entry: Pick<CatalogEntry, "surfaces" | "solid">; height?: number }) {
  const art = useMemo(() => {
    let outlines: Pt[][] = [];
    let lines: Pt[][] = [];
    let mirrors: [Pt, Pt][] = [];
    if (entry.solid) {
      const posed = { ...entry.solid, triangles: poseTriangles(entry.solid.triangles, entry.solid), mirror_triangles: poseTriangles(entry.solid.mirror_triangles, entry.solid) };
      outlines = [silhouette(posed)];
      mirrors = mirrorEdges(posed);
    } else if (entry.surfaces.length) {
      ({ outlines, lines } = sketch(entry.surfaces));
      if (!outlines.length && !lines.length) lines = [[[0, -5], [0, 5]]];
    }
    const pts = [...outlines.flat(), ...lines.flat(), ...mirrors.flat()];
    if (!pts.length) return null;
    const zmin = Math.min(...pts.map((p) => p[0])), zmax = Math.max(...pts.map((p) => p[0]));
    const ymax = Math.max(...pts.map((p) => Math.abs(p[1])), 1);
    const span = Math.max(zmax - zmin, ymax * 2, 1);
    const pad = span * 0.12;
    const cz = (zmin + zmax) / 2;
    return { outlines, lines, mirrors, vb: `${cz - span / 2 - pad} ${-span / 2 - pad} ${span + 2 * pad} ${span + 2 * pad}`, zmin, zmax, sw: span / 150, axisZ: surfaceZ(entry.surfaces) };
  }, [entry]);
  if (!art) return null;
  const path = (p: Pt[], close = false) => p.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(3)} ${(-q[1]).toFixed(3)}`).join(" ") + (close ? " Z" : "");
  return (
    <svg viewBox={art.vb} style={{ height }} className="w-full rounded-md bg-background">
      <line x1={art.zmin - 1e3} x2={art.zmax + 1e3} y1={0} y2={0} stroke="#475569" strokeWidth={art.sw} strokeDasharray={`${art.sw * 4} ${art.sw * 4}`} />
      {art.outlines.map((o, i) => <path key={i} d={path(o, true)} fill="rgba(56,189,248,.18)" stroke="#7dd3fc" strokeWidth={art.sw} />)}
      {art.lines.map((l, i) => <path key={`l${i}`} d={path(l)} fill="none" stroke="#e2e8f0" strokeWidth={art.sw * 2} />)}
      {art.mirrors.map((m, i) => <line key={`m${i}`} x1={m[0][0]} y1={-m[0][1]} x2={m[1][0]} y2={-m[1][1]} stroke="#e2e8f0" strokeWidth={art.sw * 2.4} />)}
    </svg>
  );
}
