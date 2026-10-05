import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useStore } from "../store";
import type { Layout, SystemModel } from "../types/api";
import { isAir, isMirror, poseTriangles, sag } from "./profile";

export const FIELD_COLORS = [0x60a5fa, 0x34d399, 0xfbbf24, 0xf472b6, 0xa78bfa, 0x2dd4bf, 0xfb923c, 0x94a3b8];

/** Engine (x, y, z) -> three (X = z axial, Y = y, Z = x). */
const v = (p: readonly number[]) => new THREE.Vector3(p[2], p[1], p[0]);

function elements(layout: Layout) {
  const out: [number, number][] = [];
  for (let i = 0; i < layout.surface_z.length - 1; i++) {
    if (!isAir(layout.glass_after[i]) && !isMirror(layout.glass_after[i]) && !isMirror(layout.glass_after[i + 1])) out.push([i, i + 1]);
  }
  return out;
}

function profile(layout: Layout, i: number, n = 48): [number, number][] {
  const sd = layout.surface_sd[i];
  return Array.from({ length: n + 1 }, (_, k) => {
    const r = (sd * k) / n;
    return [r, layout.surface_z[i] + sag(r, layout.surface_radius[i], layout.surface_conic[i])];
  });
}

function buildLenses(layout: Layout, mode: "2d" | "3d") {
  const g = new THREE.Group();
  const fill = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: mode === "2d" ? 0.14 : 0.22, side: THREE.DoubleSide, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: 0x7dd3fc });
  for (const [a, b] of elements(layout)) {
    const front = profile(layout, a);
    const back = profile(layout, b);
    if (mode === "3d") {
      const pts = [...front, ...back.slice().reverse()].map(([r, z]) => new THREE.Vector2(r, z));
      const geo = new THREE.LatheGeometry(pts, 72);
      geo.rotateZ(-Math.PI / 2); // lathe axis Y -> X (axial)
      g.add(new THREE.Mesh(geo, fill));
      for (const side of [front, back]) {
        const [r, z] = side[side.length - 1];
        const ring: THREE.Vector3[] = [];
        for (let k = 0; k <= 72; k++) ring.push(new THREE.Vector3(z, r * Math.cos((k / 72) * 2 * Math.PI), r * Math.sin((k / 72) * 2 * Math.PI)));
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), edge));
      }
    } else {
      const top = [...front.map(([r, z]) => new THREE.Vector2(z, r)), ...back.slice().reverse().map(([r, z]) => new THREE.Vector2(z, r))];
      const bottom = top.slice().reverse().map((p) => new THREE.Vector2(p.x, -p.y));
      const poly = [...top, ...bottom];
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(poly)), fill));
      g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(poly.map((p) => new THREE.Vector3(p.x, p.y, 0))), edge));
    }
  }
  return g;
}

/** Reflective surfaces: a thin silver dish (3D) or a hatched plate (2D) on the side away from the incoming light. */
function buildMirrors(layout: Layout, mode: "2d" | "3d") {
  const g = new THREE.Group();
  const silver = new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
  let dir = 1;
  layout.glass_after.forEach((gl, i) => {
    if (!isMirror(gl)) return;
    const front = profile(layout, i);
    if (mode === "3d") {
      const geo = new THREE.LatheGeometry(front.map(([r, z]) => new THREE.Vector2(r, z)), 72);
      geo.rotateZ(-Math.PI / 2);
      g.add(new THREE.Mesh(geo, silver));
    } else {
      const top = front.map(([r, z]) => new THREE.Vector2(z, r));
      const upper = top.map((p) => new THREE.Vector2(p.x + dir * 3, p.y));
      const poly = [...top.slice().reverse().map((p) => new THREE.Vector2(p.x, -p.y)), ...top, ...upper.slice().reverse(), ...upper.map((p) => new THREE.Vector2(p.x, -p.y))];
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(poly)), silver));
      const line = [...top.slice().reverse().map((p) => new THREE.Vector3(p.x, -p.y, 0)), ...top.map((p) => new THREE.Vector3(p.x, p.y, 0))];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: 0xf8fafc })));
      void edge;
    }
    dir = -dir;
  });
  return g;
}

/** Non-sequential solids (prisms, fold mirrors) in their placed pose, plus the detector plane when it is posed. */
function buildSolids(model: SystemModel) {
  const g = new THREE.Group();
  const toGeo = (tris: number[][][]) => {
    const pos: number[] = [];
    for (const t of tris) for (const p of t) pos.push(p[2], p[1], p[0]); // engine (x,y,z) -> three (X=z, Y=y, Z=x)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  };
  for (const s of model.nonseq.extra_solids) {
    for (const [tris, color, op] of [[s.triangles, 0x38bdf8, 0.22], [s.mirror_triangles, 0xe2e8f0, 0.9]] as const) {
      if (!tris.length) continue;
      const geo = toGeo(poseTriangles(tris, s));
      g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false })));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: color === 0xe2e8f0 ? 0xffffff : 0x7dd3fc })));
    }
  }
  const d = model.nonseq.detector;
  if (d.center) {
    const n = new THREE.Vector3(...(d.normal ?? [0, 0, 1])).normalize();
    const up = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(up, n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const c = new THREE.Vector3(...d.center);
    const w = d.half_width;
    const corner = (a: number, b: number) => c.clone().addScaledVector(u, a * w).addScaledVector(v, b * w);
    const e = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].map((p) => new THREE.Vector3(p.z, p.y, p.x)); // engine -> three
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(e), new THREE.LineBasicMaterial({ color: 0xfbbf24 })));
  }
  return g;
}

function buildRays(layout: Layout, model: SystemModel, mode: "2d" | "3d") {
  const g = new THREE.Group();
  const all = [...layout.surface_z, layout.image_z];
  const lead = Math.max((Math.max(...all) - Math.min(...all)) * 0.18, 5);
  const byField = new Map<number, number[]>();
  const bad: number[] = [];
  for (const ray of layout.rays) {
    if (mode === "2d" && Math.abs(ray.pupil[0]) > 1e-12) continue; // tangential fan only
    const th = (model.fields[ray.field]?.angle ?? 0) * (Math.PI / 180);
    const dir = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
    const pts = ray.points.slice(1).map(v);
    if (pts.length < 2) continue;
    const start = pts[0].clone().addScaledVector(dir, -lead);
    const chain = [start, ...pts];
    const dst = ray.vignetted ? bad : (byField.get(ray.field) ?? byField.set(ray.field, []).get(ray.field)!);
    for (let i = 0; i < chain.length - 1; i++) dst.push(chain[i].x, chain[i].y, chain[i].z, chain[i + 1].x, chain[i + 1].y, chain[i + 1].z);
  }
  const add = (arr: number[], color: number, opacity: number) => {
    if (!arr.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  byField.forEach((arr, f) => add(arr, FIELD_COLORS[f % FIELD_COLORS.length], 0.9));
  add(bad, 0xef4444, 0.35);
  return g;
}

function buildDecor(layout: Layout) {
  const g = new THREE.Group();
  const all = [...layout.surface_z, layout.image_z];
  const span = Math.max(...all) - Math.min(...all);
  const lead = Math.max(span * 0.18, 5);
  const axis = new THREE.LineDashedMaterial({ color: 0x475569, dashSize: 2, gapSize: 2 });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.min(...all) - lead, 0, 0), new THREE.Vector3(Math.max(...all) + 5, 0, 0)]), axis);
  line.computeLineDistances();
  g.add(line);
  const h = Math.max(...layout.surface_sd) * 0.35;
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(layout.image_z, -h, 0), new THREE.Vector3(layout.image_z, h, 0)]), new THREE.LineBasicMaterial({ color: 0xfbbf24 })));
  return g;
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });
}

type Api = { setLayout: (l: Layout | null | undefined, m: SystemModel, mode: "2d" | "3d") => void; dispose: () => void };

export function Layout3D() {
  const ref = useRef<HTMLDivElement>(null);
  const three = useRef<Api | null>(null);
  const { result, model, view } = useStore();

  useEffect(() => {
    const el = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    let content = new THREE.Group();
    scene.add(content);
    let camera: THREE.Camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    let controls: OrbitControls | null = null;
    let bounds = { cx: 0, half: 50, ymax: 10 };
    let mode: "2d" | "3d" = "2d";

    const frame = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h);
      if (camera instanceof THREE.OrthographicCamera) {
        const a = w / h;
        const hh = Math.max((bounds.half * 1.08) / a, bounds.ymax * 1.5);
        camera.left = -hh * a; camera.right = hh * a;
        camera.top = hh; camera.bottom = -hh; camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = w / h; camera.updateProjectionMatrix();
      }
    };
    const render = () => renderer.render(scene, camera);
    const setup = (m: "2d" | "3d") => {
      controls?.dispose();
      mode = m;
      if (m === "2d") {
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
        camera.position.set(bounds.cx, 0, 100);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableRotate = false;
      } else {
        const p = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
        p.position.set(bounds.cx - bounds.half * 0.3, bounds.half * 0.75, bounds.half * 2.3);
        camera = p;
        controls = new OrbitControls(camera, renderer.domElement);
      }
      controls.target.set(bounds.cx, 0, 0);
      controls.addEventListener("change", render);
      controls.update();
      frame();
    };

    const api: Api = {
      setLayout(layout, model, newMode) {
        scene.remove(content);
        disposeGroup(content);
        content = new THREE.Group();
        scene.add(content);
        const solidPts = model.nonseq.extra_solids.flatMap((s) => poseTriangles([...s.triangles, ...s.mirror_triangles], s).flat());
        const zs = [...(layout ? [...layout.surface_z, layout.image_z] : []), ...solidPts.map((p) => p[2])];
        if (zs.length) {
          const zmin = Math.min(...zs) - (layout ? Math.max((layout.image_z - layout.surface_z[0]) * 0.18, 5) : 5);
          const zmax = Math.max(...zs) + 5;
          const ym = Math.max(layout ? Math.max(...layout.surface_sd) : 0, ...solidPts.map((p) => Math.abs(p[1])), model.nonseq.detector.center ? Math.abs(model.nonseq.detector.center[1]) : 0, 1);
          const next = { cx: (zmin + zmax) / 2, half: Math.max((zmax - zmin) / 2 + 5, ym * 1.2), ymax: ym };
          const refit = newMode !== mode || Math.abs(next.cx - bounds.cx) > 1e-9 || Math.abs(next.half - bounds.half) / bounds.half > 0.5;
          bounds = next;
          if (layout) content.add(buildDecor(layout), buildLenses(layout, newMode), buildMirrors(layout, newMode), buildRays(layout, model, newMode));
          content.add(buildSolids(model));
          if (refit) setup(newMode);
        } else if (newMode !== mode) setup(newMode);
        render();
      },
      dispose() { controls?.dispose(); disposeGroup(content); renderer.dispose(); renderer.domElement.remove(); },
    };
    three.current = api;
    setup("2d");
    const ro = new ResizeObserver(() => { frame(); render(); });
    ro.observe(el);
    return () => { ro.disconnect(); api.dispose(); three.current = null; };
  }, []);

  useEffect(() => { three.current?.setLayout(result.layout, model, view); }, [result.layout, model, view]);

  return (
    <div className="relative min-h-0 bg-[radial-gradient(ellipse_at_center,hsl(224_20%_10%),hsl(224_20%_6%))]">
      <div ref={ref} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-2 text-[11px] text-muted-foreground">
        {view === "2d" ? "Layout y–z (tangential fan) · scroll to zoom, drag to pan" : "3D layout · drag to orbit"}
      </div>
      {!result.layout && !model.nonseq.extra_solids.length && <div className="absolute inset-0 grid place-items-center text-muted-foreground">Run a trace to see the layout</div>}
    </div>
  );
}
