import type { CatalogEntry, Solid, Surface } from "../types/api";

export const isAir = (g: string) => ["", "AIR", "VACUUM"].includes(g.trim().toUpperCase());
export const isMirror = (g: string) => ["MIRROR", "MIRR"].includes(g.trim().toUpperCase());

/** Conic sag (same formula as the engine). */
export function sag(r: number, R: number, k: number) {
  if (R === 0) return 0;
  const c = 1 / R;
  return (c * r * r) / (1 + Math.sqrt(Math.max(1 - (1 + k) * c * c * r * r, 0)));
}

export function surfaceZ(surfaces: Surface[]): number[] {
  let z = 0;
  return surfaces.map((s) => { const out = z; z += s.thickness; return out; });
}

type Pt = [number, number]; // [z, y]

/** Polylines (z, y) for a 2D cross-section preview of a lens / mirror entry. */
export function sketch(surfaces: Surface[]): { outlines: Pt[][]; lines: Pt[][] } {
  const zs = surfaceZ(surfaces);
  const prof = (i: number, sgn: number, n = 40): Pt[] =>
    Array.from({ length: n + 1 }, (_, k) => {
      const r = (surfaces[i].semi_diameter * k) / n;
      return [zs[i] + sag(r, surfaces[i].radius, surfaces[i].conic), sgn * r] as Pt;
    });
  const outlines: Pt[][] = [];
  const lines: Pt[][] = [];
  let dir = 1;
  surfaces.forEach((s, i) => {
    if (isMirror(s.glass)) {
      const front = [...prof(i, -1).reverse(), ...prof(i, 1).slice(1)];
      lines.push(front);
      const back = front.map(([z, y]) => [z + dir * 3, y] as Pt);
      outlines.push([...front, ...back.reverse()]);
      dir = -dir;
    } else if (!isAir(s.glass) && i + 1 < surfaces.length) {
      const f = [...prof(i, -1).reverse(), ...prof(i, 1).slice(1)];
      const b = [...prof(i + 1, 1).reverse(), ...prof(i + 1, -1).slice(1)];
      outlines.push([...f, ...b]);
    }
  });
  return { outlines, lines };
}

/** Rotation Rz·Ry·Rx (degrees), identical to the engine's `rotation_matrix`. */
export function rotation(rx: number, ry: number, rz: number): number[][] {
  const [a, b, c] = [rx, ry, rz].map((d) => (d * Math.PI) / 180);
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  const Rx = [[1, 0, 0], [0, ca, -sa], [0, sa, ca]];
  const Ry = [[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]];
  const Rz = [[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]];
  const mul = (A: number[][], B: number[][]) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mul(Rz, mul(Ry, Rx));
}

export function poseTriangles(tris: number[][][], s: Pick<Solid, "position" | "rotation_deg">): number[][][] {
  const R = rotation(...(s.rotation_deg as [number, number, number]));
  return tris.map((t) => t.map((p) => [0, 1, 2].map((i) => R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2] + s.position[i])));
}

/** Convex hull (monotone chain) of the (z, y) silhouette of a solid - used for 2D previews. */
export function silhouette(sol: Solid): Pt[] {
  const pts: Pt[] = [...sol.triangles, ...sol.mirror_triangles].flat().map((p) => [p[2], p[1]] as Pt);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (p: Pt[]) => { const h: Pt[] = []; for (const q of p) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 1e-12) h.pop(); h.push(q); } h.pop(); return h; };
  return [...build(pts), ...build([...pts].reverse())];
}

/** (z, y) edges of mirror faces projected to the plane - drawn in silver in previews. */
export function mirrorEdges(sol: Solid): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const t of sol.mirror_triangles) for (let i = 0; i < 3; i++) out.push([[t[i][2], t[i][1]], [t[(i + 1) % 3][2], t[(i + 1) % 3][1]]]);
  return out;
}

export function entryBounds(e: CatalogEntry): { zmin: number; zmax: number; ymax: number } {
  if (e.solid) {
    const p = poseTriangles([...e.solid.triangles, ...e.solid.mirror_triangles], e.solid).flat();
    return { zmin: Math.min(...p.map((q) => q[2])), zmax: Math.max(...p.map((q) => q[2])), ymax: Math.max(...p.map((q) => Math.abs(q[1]))) };
  }
  const zs = surfaceZ(e.surfaces);
  return { zmin: Math.min(...zs) - 4, zmax: Math.max(...zs) + 4, ymax: Math.max(...e.surfaces.map((s) => s.semi_diameter)) };
}
