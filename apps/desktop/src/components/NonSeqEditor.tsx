import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useStore, type NonSeq } from "../store";
import type { IrradianceResult, Layout, Solid } from "../types/api";
import { Button, cx } from "../ui";
import { buildLenses, buildMirrors } from "./Layout3D";

const DEG = Math.PI / 180;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Detector basis exactly as the engine builds it (so the viewport and the binning agree). */
export function detectorBasis(normal: number[]) {
  const n = new THREE.Vector3(...normal).normalize();
  const up = Math.abs(n.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return { u, v, n, q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n)) };
}

/** Source pose: the legacy tilt/offset form is shown as the equivalent free pose. */
export function sourcePose(ns: NonSeq) {
  const s = ns.source;
  return s.position
    ? { position: s.position, rotation: s.rotation_deg }
    : { position: [s.offset[0], s.offset[1], s.z], rotation: [-s.angle, 0, 0] };
}

const PALETTE = ["#0b1020", "#312e81", "#7c3aed", "#f59e0b", "#fef08a", "#ffffff"];
function heatTexture(ir: IrradianceResult) {
  const c = document.createElement("canvas");
  c.width = c.height = ir.bins;
  const g = c.getContext("2d")!;
  const img = g.createImageData(ir.bins, ir.bins);
  const max = Math.max(1e-12, ...ir.grid.flat());
  const stops = PALETTE.map((h) => new THREE.Color(h));
  for (let r = 0; r < ir.bins; r++) {
    for (let x = 0; x < ir.bins; x++) {
      const t = Math.sqrt(ir.grid[ir.bins - 1 - r][x] / max) * (stops.length - 1);   // canvas row 0 = top = +v
      const i = Math.min(Math.floor(t), stops.length - 2);
      const col = stops[i].clone().lerp(stops[i + 1], t - i);
      const k = (r * ir.bins + x) * 4;
      img.data.set([col.r * 255, col.g * 255, col.b * 255, 235], k);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function meshGroup(s: Solid, id: string, selected: boolean) {
  const g = new THREE.Group();
  g.userData.id = id;
  g.position.set(s.position[0], s.position[1], s.position[2]);
  g.rotation.set(s.rotation_deg[0] * DEG, s.rotation_deg[1] * DEG, s.rotation_deg[2] * DEG, "ZYX");
  const add = (tris: number[][][], color: number, opacity: number, edge: number) => {
    if (!tris.length) return;
    const pos = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => t.forEach((p, j) => pos.set(p, i * 9 + j * 3)));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: selected ? 0xfbbf24 : edge })));
  };
  if (s.absorbing) add(s.triangles, 0x64748b, 0.8, 0xcbd5e1);
  else add(s.triangles, 0x38bdf8, 0.25, 0x7dd3fc);
  add(s.mirror_triangles, 0xe2e8f0, 0.92, 0xffffff);
  return g;
}

function sourceGroup(ns: NonSeq, selected: boolean) {
  const { position, rotation } = sourcePose(ns);
  const g = new THREE.Group();
  g.userData.id = "source";
  g.position.set(position[0], position[1], position[2]);
  g.rotation.set(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, "ZYX");
  const rad = ns.source.beam_diameter / 2;
  const col = selected ? 0xfbbf24 : 0xf97316;
  g.add(new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })));
  const ring = Array.from({ length: 65 }, (_, k) => new THREE.Vector3(rad * Math.cos((k / 64) * 2 * Math.PI), rad * Math.sin((k / 64) * 2 * Math.PI), 0));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: col })));
  g.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), Math.max(18, rad * 2.2), col, 5, 3));
  return g;
}

function detectorGroup(ns: NonSeq, imageZ: number, selected: boolean) {
  const d = ns.detector;
  const center = d.center ?? [0, 0, d.z ?? imageZ];
  const { q } = detectorBasis(d.normal ?? [0, 0, 1]);
  const g = new THREE.Group();
  g.userData.id = "detector";
  g.position.set(center[0], center[1], center[2]);
  g.quaternion.copy(q);
  const w = d.half_width;
  const col = selected ? 0xfbbf24 : 0x22c55e;
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(2 * w, 2 * w), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })));
  g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, -w, 0), new THREE.Vector3(w, -w, 0), new THREE.Vector3(w, w, 0), new THREE.Vector3(-w, w, 0)]), new THREE.LineBasicMaterial({ color: col })));
  g.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), Math.max(8, w), col, 3, 2));
  return g;
}

function rayLines(ir: IrradianceResult, ghosts: boolean) {
  const g = new THREE.Group();
  const wmax = Math.max(1e-12, ...ir.segments.map((s) => s[6]));
  const buckets: Record<"p" | "g", { pos: number[]; col: number[] }> = { p: { pos: [], col: [] }, g: { pos: [], col: [] } };
  for (const s of ir.segments) {
    const ghost = s[7] >= 1;
    if (ghost && !ghosts) continue;
    const b = buckets[ghost ? "g" : "p"];
    const base = ghost ? new THREE.Color(0xf472b6) : new THREE.Color(0xfde047);
    const k = ghost ? 0.35 + 0.65 * Math.min(1, Math.sqrt(s[6] / wmax) * 4) : 0.4 + 0.6 * Math.min(1, s[6] / wmax);
    b.pos.push(s[0], s[1], s[2], s[3], s[4], s[5]);
    b.col.push(base.r * k, base.g * k, base.b * k, base.r * k, base.g * k, base.b * k);
  }
  for (const b of Object.values(buckets)) {
    if (!b.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true })));
  }
  return g;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); });
  });
}

type View = "persp" | "top" | "side" | "front";
interface Api {
  sync: (p: { ns: NonSeq; layout: Layout | null | undefined; ir: IrradianceResult | undefined; imageZ: number; sel: string | null; rays: boolean; heat: boolean; ghosts: boolean }) => void;
  setGizmo: (mode: "translate" | "rotate", snap: boolean) => void;
  view: (v: View) => void;
  dispose: () => void;
}

export function NonSeqEditor() {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const dragging = useRef(false);
  const [rev, setRev] = useState(0);
  const st = useStore();
  const { model, result, sel, nsView, job, nsPast, nsFuture } = st;

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20000);
    camera.position.set(-90, 70, -110);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 40);
    const grid = new THREE.GridHelper(600, 60, 0x334155, 0x1e293b);
    scene.add(grid);
    for (const [dir, col] of [[[1, 0, 0], 0xef4444], [[0, 1, 0], 0x22c55e], [[0, 0, 1], 0x3b82f6]] as const) {
      scene.add(new THREE.ArrowHelper(new THREE.Vector3(...dir), new THREE.Vector3(), 30, col, 5, 3));
    }
    const content = new THREE.Group();
    scene.add(content);
    const tc = new TransformControls(camera, renderer.domElement);
    tc.size = 1.5;
    const helper = tc.getHelper();
    scene.add(helper);
    if (location.search.includes("e2e")) (window as unknown as { __ns: unknown }).__ns = { tc, camera, renderer };   // test hook

    const render = () => renderer.render(scene, camera);
    orbit.addEventListener("change", render);
    tc.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let pickables: THREE.Object3D[] = [];
    let before: NonSeq | null = null;
    let bounds = new THREE.Box3(new THREE.Vector3(-30, -30, 0), new THREE.Vector3(30, 30, 100));

    // ---- gizmo -> store
    tc.addEventListener("dragging-changed", (e) => {
      const active = !!(e as unknown as { value: boolean }).value;
      orbit.enabled = !active;
      dragging.current = active;
      const s = useStore.getState();
      if (active) before = structuredClone(s.model.nonseq);
      else if (before) {
        s.nsCommit(before);
        before = null;
        setRev((r) => r + 1);   // rebuild once the drag is over (snaps the detector basis, refreshes the panel)
      }
    });
    tc.addEventListener("objectChange", () => {
      const o = tc.object;
      const id = o?.userData.id as string | undefined;
      if (!o || !id) return;
      const pos = [r3(o.position.x), r3(o.position.y), r3(o.position.z)];
      const rot = [r3(o.rotation.x / DEG), r3(o.rotation.y / DEG), r3(o.rotation.z / DEG)];
      useStore.getState().nsEdit((ns) => {
        if (id === "source") { ns.source.position = pos; ns.source.rotation_deg = rot; }
        else if (id === "detector") {
          const n = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
          ns.detector.center = pos;
          ns.detector.normal = [r3(n.x), r3(n.y), r3(n.z)];
        } else if (id.startsWith("solid:")) {
          const s = ns.extra_solids[Number(id.slice(6))];
          if (s) { s.position = pos; s.rotation_deg = rot; }
        }
      }, false);
    });

    // ---- picking
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down || tc.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const meshes: THREE.Object3D[] = [];
      pickables.forEach((p) => p.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c); }));
      const hit = ray.intersectObjects(meshes, false)[0];
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && !o.userData.id) o = o.parent;
      useStore.setState({ sel: (o?.userData.id as string) ?? null });
    });

    const a: Api = {
      sync({ ns, layout, ir, imageZ, sel, rays, heat, ghosts }) {
        tc.detach();
        scene.remove(content);
        disposeTree(content);
        content.clear();
        pickables = [];
        const box = new THREE.Box3();
        if (layout && ns.derive_from_sequential) {
          const wrap = new THREE.Group();
          wrap.matrixAutoUpdate = false;
          wrap.matrix.set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);   // layout builders use (X, Y, Z) = (z, y, x)
          wrap.add(buildLenses(layout, "3d"), buildMirrors(layout, "3d"));
          content.add(wrap);
          box.union(new THREE.Box3(new THREE.Vector3(-layout.surface_sd[0], -layout.surface_sd[0], Math.min(...layout.surface_z, layout.image_z)), new THREE.Vector3(layout.surface_sd[0], layout.surface_sd[0], Math.max(...layout.surface_z, layout.image_z))));
        }
        const objs: THREE.Object3D[] = ns.extra_solids.map((s, i) => meshGroup(s, `solid:${i}`, sel === `solid:${i}`));
        objs.push(sourceGroup(ns, sel === "source"), detectorGroup(ns, imageZ, sel === "detector"));
        for (const o of objs) { content.add(o); pickables.push(o); box.union(new THREE.Box3().setFromObject(o)); }
        if (ir && heat) {
          const d = detectorGroup(ns, imageZ, false);
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * ir.extent, 2 * ir.extent), new THREE.MeshBasicMaterial({ map: heatTexture(ir), side: THREE.DoubleSide, transparent: true }));
          plane.position.copy(d.position);
          plane.quaternion.copy(d.quaternion);
          plane.translateZ(0.02);
          content.add(plane);
          disposeTree(d);
        }
        if (ir && rays) content.add(rayLines(ir, ghosts));
        if (!box.isEmpty()) bounds = box;
        scene.add(content);
        const target = sel ? pickables.find((p) => p.userData.id === sel) : undefined;
        if (target) tc.attach(target);
        render();
      },
      setGizmo(mode, snap) {
        tc.setMode(mode);
        tc.setSpace("world");
        tc.setTranslationSnap(snap ? 1 : null);
        tc.setRotationSnap(snap ? 5 * DEG : null);
        render();
      },
      view(v) {
        const c = bounds.getCenter(new THREE.Vector3());
        const D = Math.max(60, bounds.getSize(new THREE.Vector3()).length() * 1.1);
        camera.up.set(0, 1, 0);
        if (v === "persp") camera.position.set(c.x - D * 0.55, c.y + D * 0.5, c.z - D * 0.8);
        if (v === "top") { camera.up.set(1, 0, 0); camera.position.set(c.x, c.y + D * 1.2, c.z); }
        if (v === "side") camera.position.set(c.x - D * 1.2, c.y, c.z);
        if (v === "front") camera.position.set(c.x, c.y, c.z - D * 1.2);
        orbit.target.copy(c);
        orbit.update();
        render();
      },
      dispose() { ro.disconnect(); orbit.dispose(); tc.detach(); tc.disconnect(); scene.remove(helper); disposeTree(helper); disposeTree(content); renderer.dispose(); renderer.domElement.remove(); },
    };
    api.current = a;
    a.view("persp");
    resize();
    return () => { a.dispose(); api.current = null; };
  }, []);

  useEffect(() => { api.current?.setGizmo(nsView.mode, nsView.snap); }, [nsView.mode, nsView.snap]);

  useEffect(() => {
    if (dragging.current) return;   // the gizmo owns the object while it is being dragged
    api.current?.sync({ ns: model.nonseq, layout: result.layout, ir: result.irradiance ?? undefined, imageZ: result.image_z ?? 0, sel, rays: nsView.rays, heat: nsView.heat, ghosts: nsView.ghosts });
  }, [model.nonseq, result.layout, result.irradiance, result.image_z, sel, nsView.rays, nsView.heat, nsView.ghosts, rev]);

  // keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.shiftKey ? s.nsRedo() : s.nsUndo(); }
      else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); s.nsRedo(); }
      else if (k === "w") s.set({ nsView: { ...s.nsView, mode: "translate" } });
      else if (k === "e") s.set({ nsView: { ...s.nsView, mode: "rotate" } });
      else if (k === "escape") s.set({ sel: null });
      else if ((k === "delete" || k === "backspace") && s.sel?.startsWith("solid:")) s.deleteSolid(Number(s.sel.slice(6)));
      else if (k === "d" && s.sel?.startsWith("solid:")) s.duplicateSolid(Number(s.sel.slice(6)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const set = (p: Partial<typeof nsView>) => st.set({ nsView: { ...nsView, ...p } });
  const ir = result.irradiance;

  return (
    <div className="relative min-h-0 bg-[radial-gradient(ellipse_at_center,hsl(224_20%_10%),hsl(224_20%_6%))]">
      <div ref={mount} className="absolute inset-0" data-testid="ns-viewport" />
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/90 p-1.5 backdrop-blur">
        <div className="flex rounded-md bg-secondary p-0.5">
          {([["translate", "Move (W)"], ["rotate", "Rotate (E)"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => set({ mode: m })} className={cx("h-6 rounded px-2 text-xs", nsView.mode === m ? "bg-background" : "text-muted-foreground")}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={nsView.snap} onChange={(e) => set({ snap: e.target.checked })} />Snap 1 mm / 5°</label>
        <div className="mx-1 h-5 w-px bg-border" />
        {(["persp", "top", "side", "front"] as const).map((v) => <Button key={v} variant="ghost" onClick={() => api.current?.view(v)}>{v === "persp" ? "3D" : v[0].toUpperCase() + v.slice(1)}</Button>)}
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" disabled={!nsPast.length} onClick={() => st.nsUndo()}>↶ Undo</Button>
        <Button variant="ghost" disabled={!nsFuture.length} onClick={() => st.nsRedo()}>↷ Redo</Button>
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-card/90 p-1.5 backdrop-blur">
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={nsView.rays} onChange={(e) => set({ rays: e.target.checked })} />Rays</label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={nsView.ghosts} onChange={(e) => set({ ghosts: e.target.checked })} />Ghosts</label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={nsView.heat} onChange={(e) => set({ heat: e.target.checked })} />Heat-map</label>
        {job.running && job.kind === "nonseq" ? (
          <>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
            <Button variant="destructive" onClick={() => void st.cancel()}>Cancel</Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => void st.trace(["irradiance"])}>▶ Run non-sequential</Button>
        )}
      </div>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted-foreground">
        Click to select · drag the gizmo to place · right-drag pans · scroll zooms · Del removes · D duplicates · Ctrl+Z undoes
        {ir && <span className="ml-2 text-foreground">· {(ir.total_power * 100).toFixed(1)} % on detector, {ir.ghost_paths} ghost paths</span>}
        {job.error && <span className="ml-2 text-destructive">· {job.error}</span>}
      </div>
    </div>
  );
}
