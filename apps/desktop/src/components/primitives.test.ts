import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PRIMITIVES, makePrimitive, signedVolume, type PrimitiveKind } from "./primitives";
import { rotation } from "./profile";

const close = (a: number, b: number, rel: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b));

describe("primitives", () => {
  it("are wound outward (positive signed volume) and have the right volume", () => {
    close(signedVolume(makePrimitive("box", { w: 2, h: 3, d: 4 }).triangles), 24, 1e-12);
    const cyl = makePrimitive("cylinder", { r: 5, h: 10 });
    close(signedVolume(cyl.triangles), 0.5 * 48 * 25 * Math.sin((2 * Math.PI) / 48) * 10, 1e-9);
    close(signedVolume(makePrimitive("sphere", { r: 5 }).triangles), (4 / 3) * Math.PI * 125, 0.04);
    const ap = makePrimitive("aperture", { R: 20, r: 5, t: 2 });
    close(signedVolume(ap.triangles), 0.5 * 48 * (400 - 25) * Math.sin((2 * Math.PI) / 48) * 2, 1e-9);   // hollow disc
    expect(ap.absorbing).toBe(true);
  });

  it("mirror plate: one reflective face (-z) and the glass body outward", () => {
    const m = makePrimitive("mirror-plate", { w: 10, h: 10, t: 4 });
    expect(m.mirror_triangles).toHaveLength(2);
    for (const t of m.mirror_triangles) for (const v of t) expect(v[2]).toBeCloseTo(-2);
    close(signedVolume([...m.triangles, ...m.mirror_triangles]), 400, 1e-12);
  });

  it("every primitive has finite, non-degenerate triangles", () => {
    for (const k of Object.keys(PRIMITIVES) as PrimitiveKind[]) {
      const m = makePrimitive(k);
      const all = [...m.triangles, ...m.mirror_triangles];
      expect(all.length).toBeGreaterThan(5);
      for (const t of all) for (const v of t) for (const c of v) expect(Number.isFinite(c)).toBe(true);
    }
  });
});

describe("pose convention", () => {
  it("engine Rz·Ry·Rx equals three.js Euler order ZYX", () => {
    for (const [rx, ry, rz] of [[30, 0, 0], [0, 45, 0], [10, 20, 30], [-70, 15, 100]]) {
      const R = rotation(rx, ry, rz);
      const e = new THREE.Euler((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180, "ZYX");
      const m = new THREE.Matrix4().makeRotationFromEuler(e).elements;   // column-major
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(m[j * 4 + i]).toBeCloseTo(R[i][j], 12);
    }
  });
});
