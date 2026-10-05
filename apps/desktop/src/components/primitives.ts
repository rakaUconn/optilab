import type { Solid } from "../types/api";

type V = [number, number, number];
type Tri = V[];

export type PrimitiveKind = "box" | "cylinder" | "sphere" | "mirror-plate" | "aperture" | "block";

export interface PrimitiveDef {
  label: string;
  params: Record<string, number>;
  names: Record<string, string>;
  absorbing?: boolean;
  glass?: boolean;
}

/** Parameter sets (mm) and labels; the UI regenerates the mesh whenever one changes. */
export const PRIMITIVES: Record<PrimitiveKind, PrimitiveDef> = {
  box: { label: "Glass block", params: { w: 20, h: 20, d: 20 }, names: { w: "Width x", h: "Height y", d: "Depth z" }, glass: true },
  cylinder: { label: "Glass cylinder", params: { r: 12.7, h: 10 }, names: { r: "Radius", h: "Length z" }, glass: true },
  sphere: { label: "Ball lens", params: { r: 5 }, names: { r: "Radius" }, glass: true },
  "mirror-plate": { label: "Mirror plate", params: { w: 25.4, h: 25.4, t: 6 }, names: { w: "Width x", h: "Height y", t: "Thickness" } },
  aperture: { label: "Aperture (absorbing)", params: { R: 25, r: 5, t: 2 }, names: { R: "Outer radius", r: "Hole radius", t: "Thickness" }, absorbing: true },
  block: { label: "Beam block (absorbing)", params: { w: 10, h: 10, d: 10 }, names: { w: "Width x", h: "Height y", d: "Depth z" }, absorbing: true },
};

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Add a triangle, flipping its winding so the face normal points along ``outward``. */
function tri(out: Tri[], a: V, b: V, c: V, outward: V) {
  out.push(dot(cross(sub(b, a), sub(c, a)), outward) >= 0 ? [a, b, c] : [a, c, b]);
}
function quad(out: Tri[], a: V, b: V, c: V, d: V, outward: V) {
  tri(out, a, b, c, outward);
  tri(out, a, c, d, outward);
}

function boxFaces(w: number, h: number, d: number): Tri[][] {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const P = (sx: number, sy: number, sz: number): V => [sx * x, sy * y, sz * z];
  const faces: [V[], V][] = [
    [[P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)], [0, 0, -1]],
    [[P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], [0, 0, 1]],
    [[P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, -1, 1)], [-1, 0, 0]],
    [[P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], [1, 0, 0]],
    [[P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], [0, -1, 0]],
    [[P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)], [0, 1, 0]],
  ];
  return faces.map(([q, n]) => { const o: Tri[] = []; quad(o, q[0], q[1], q[2], q[3], n); return o; });
}

function cylinder(r: number, h: number, seg = 48): Tri[] {
  const out: Tri[] = [];
  const ring = (z: number, k: number): V => [r * Math.cos((2 * Math.PI * k) / seg), r * Math.sin((2 * Math.PI * k) / seg), z];
  for (let k = 0; k < seg; k++) {
    const [a0, a1, b0, b1] = [ring(-h / 2, k), ring(-h / 2, k + 1), ring(h / 2, k), ring(h / 2, k + 1)];
    const mid = ring(0, k + 0.5);
    quad(out, a0, a1, b1, b0, [mid[0], mid[1], 0]);
    tri(out, [0, 0, -h / 2], a0, a1, [0, 0, -1]);
    tri(out, [0, 0, h / 2], b0, b1, [0, 0, 1]);
  }
  return out;
}

function sphere(r: number, nu = 32, nv = 16): Tri[] {
  const out: Tri[] = [];
  const P = (i: number, j: number): V => {
    const th = (Math.PI * j) / nv, ph = (2 * Math.PI * i) / nu;
    return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  };
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const [a, b, c, d] = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      const mid: V = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      if (j > 0) tri(out, a, b, c, mid);
      if (j < nv - 1) tri(out, a, c, d, mid);
    }
  }
  return out.filter((t) => { const n = cross(sub(t[1], t[0]), sub(t[2], t[0])); return dot(n, n) > 1e-18; });
}

/** Annulus plate: outer radius R, hole radius r, thickness t (axis z). Not convex, so windings are explicit. */
function aperture(R: number, r: number, t: number, seg = 48): Tri[] {
  const out: Tri[] = [];
  const pt = (rad: number, z: number, k: number): V => [rad * Math.cos((2 * Math.PI * k) / seg), rad * Math.sin((2 * Math.PI * k) / seg), z];
  for (let k = 0; k < seg; k++) {
    const m = (2 * Math.PI * (k + 0.5)) / seg;
    const radial: V = [Math.cos(m), Math.sin(m), 0];
    quad(out, pt(R, -t / 2, k), pt(R, -t / 2, k + 1), pt(R, t / 2, k + 1), pt(R, t / 2, k), radial);                         // outer wall
    quad(out, pt(r, -t / 2, k), pt(r, -t / 2, k + 1), pt(r, t / 2, k + 1), pt(r, t / 2, k), [-radial[0], -radial[1], 0]);    // hole wall
    quad(out, pt(r, -t / 2, k), pt(r, -t / 2, k + 1), pt(R, -t / 2, k + 1), pt(R, -t / 2, k), [0, 0, -1]);                  // front
    quad(out, pt(r, t / 2, k), pt(r, t / 2, k + 1), pt(R, t / 2, k + 1), pt(R, t / 2, k), [0, 0, 1]);                       // back
  }
  return out;
}

type Made = Pick<Solid, "triangles" | "mirror_triangles" | "absorbing" | "kind" | "params" | "name" | "index">;

/** Build the mesh (local coordinates, outward winding) for a primitive. */
export function makePrimitive(kind: PrimitiveKind, p: Record<string, number> = {}): Made {
  const def = PRIMITIVES[kind];
  const q = { ...def.params, ...p };
  let glass: Tri[] = [];
  let mirror: Tri[] = [];
  switch (kind) {
    case "box":
    case "block": glass = boxFaces(q.w, q.h, q.d).flat(); break;
    case "cylinder": glass = cylinder(q.r, q.h); break;
    case "sphere": glass = sphere(q.r); break;
    case "aperture": glass = aperture(q.R, Math.min(q.r, q.R * 0.98), q.t); break;
    case "mirror-plate": { const f = boxFaces(q.w, q.h, q.t); mirror = f[0]; glass = f.slice(1).flat(); break; }   // reflecting face = -z
  }
  return {
    kind, params: q, name: def.label, absorbing: !!def.absorbing,
    index: def.glass || kind === "mirror-plate" ? "N-BK7" : 1.5,
    triangles: glass as number[][][], mirror_triangles: mirror as number[][][],
  };
}

export function signedVolume(tris: number[][][]): number {
  return tris.reduce((s, t) => s + dot(t[0] as V, cross(t[1] as V, t[2] as V)) / 6, 0);
}
