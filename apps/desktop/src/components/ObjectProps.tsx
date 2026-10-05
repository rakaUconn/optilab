import { sourcePose } from "./NonSeqEditor";
import { PRIMITIVES, makePrimitive, type PrimitiveKind } from "./primitives";
import { useStore } from "../store";
import { Button, Field, NumInput, Section, Vec3 } from "../ui";

export function ObjectProps() {
  const { model, sel, nsEdit, result, deleteSolid, duplicateSolid } = useStore();
  const ns = model.nonseq;

  if (sel === "source") {
    const pose = sourcePose(ns);
    const setPose = (p?: number[], r?: number[]) => nsEdit((n) => {
      const cur = sourcePose(n);
      n.source.position = p ?? cur.position;
      n.source.rotation_deg = r ?? cur.rotation;
    });
    return (
      <Panel title="Source" subtitle="Collimated grid">
        <Section title="Beam">
          <Field label="Diameter (mm)"><NumInput value={ns.source.beam_diameter} onChange={(v) => nsEdit((n) => { n.source.beam_diameter = Math.max(0.1, v); })} /></Field>
          <Field label="Grid n×n"><NumInput value={ns.source.n} step={2} onChange={(v) => nsEdit((n) => { n.source.n = Math.min(401, Math.max(3, Math.round(v))); })} /></Field>
          <Field label="Previewed rays"><NumInput value={ns.preview_rays} onChange={(v) => nsEdit((n) => { n.preview_rays = Math.min(400, Math.max(0, Math.round(v))); })} /></Field>
        </Section>
        <Section title="Pose">
          <Vec3 label="Position (mm)" value={pose.position} onChange={(v) => setPose(v)} />
          <Vec3 label="Rotation (deg) — beam along Rz·Ry·Rx · ẑ" value={pose.rotation} onChange={(v) => setPose(undefined, v)} />
        </Section>
      </Panel>
    );
  }

  if (sel === "detector") {
    const d = ns.detector;
    const center = d.center ?? [0, 0, d.z ?? result.image_z ?? 0];
    return (
      <Panel title="Detector" subtitle={d.center ? "Posed plane" : "At the sequential image plane"}>
        <Section title="Pose">
          <Vec3 label="Centre (mm)" value={center} onChange={(v) => nsEdit((n) => { n.detector.center = v; n.detector.normal ??= [0, 0, 1]; })} />
          <Vec3 label="Normal" value={d.normal ?? [0, 0, 1]} onChange={(v) => nsEdit((n) => { n.detector.normal = v; n.detector.center ??= center; })} />
          <Button className="mt-1" onClick={() => nsEdit((n) => { n.detector.center = null; n.detector.normal = null; })}>Snap back to image plane</Button>
        </Section>
        <Section title="Sampling">
          <Field label="Half-width (mm)"><NumInput value={d.half_width} onChange={(v) => nsEdit((n) => { n.detector.half_width = Math.max(0.01, v); })} /></Field>
          <Field label="Bins"><NumInput value={d.bins} step={8} onChange={(v) => nsEdit((n) => { n.detector.bins = Math.min(512, Math.max(8, Math.round(v))); })} /></Field>
        </Section>
      </Panel>
    );
  }

  if (sel?.startsWith("solid:")) {
    const i = Number(sel.slice(6));
    const s = ns.extra_solids[i];
    if (!s) return null;
    const def = s.kind in PRIMITIVES ? PRIMITIVES[s.kind as PrimitiveKind] : null;
    const regen = (params: Record<string, number>) => nsEdit((n) => {
      const made = makePrimitive(s.kind as PrimitiveKind, params);
      Object.assign(n.extra_solids[i], { triangles: made.triangles, mirror_triangles: made.mirror_triangles, params: made.params });
    });
    return (
      <Panel title={s.name} subtitle={def ? def.label : s.kind || "Solid"}>
        <Section title="Object">
          <Field label="Name"><input value={s.name} onChange={(e) => nsEdit((n) => { n.extra_solids[i].name = e.target.value; })}
            className="h-6 w-full rounded-sm border border-transparent bg-transparent px-1 text-right text-xs hover:border-input focus:border-ring focus:outline-none" /></Field>
          {!s.absorbing && !(s.mirror_triangles.length && !s.triangles.length) && (
            <Field label="Material">
              <input value={String(s.index)} title="glass name (N-BK7, F2, FUSED_SILICA…) or constant index"
                onChange={(e) => nsEdit((n) => { const v = e.target.value; n.extra_solids[i].index = v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v; })}
                className="num h-6 w-full rounded-sm border border-transparent bg-transparent px-1 text-right text-xs hover:border-input focus:border-ring focus:outline-none" />
            </Field>
          )}
          <label className="flex items-center justify-between py-0.5"><span className="text-muted-foreground">Absorbs rays</span>
            <input type="checkbox" checked={s.absorbing} onChange={(e) => nsEdit((n) => { n.extra_solids[i].absorbing = e.target.checked; })} /></label>
        </Section>
        {def && (
          <Section title="Dimensions (mm)">
            {Object.keys(def.params).map((k) => (
              <Field key={k} label={def.names[k]}><NumInput value={s.params[k] ?? def.params[k]} min={0.01} onChange={(v) => regen({ ...def.params, ...s.params, [k]: Math.max(0.01, v) })} /></Field>
            ))}
          </Section>
        )}
        <Section title="Pose">
          <Vec3 label="Position (mm)" value={s.position} onChange={(v) => nsEdit((n) => { n.extra_solids[i].position = v; })} />
          <Vec3 label="Rotation (deg, Rz·Ry·Rx)" value={s.rotation_deg} onChange={(v) => nsEdit((n) => { n.extra_solids[i].rotation_deg = v; })} />
        </Section>
        <div className="flex gap-2 p-3">
          <Button onClick={() => duplicateSolid(i)}>Duplicate</Button>
          <Button variant="destructive" onClick={() => deleteSolid(i)}>Delete</Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Scene settings" subtitle="Nothing selected">
      <Section title="Tracing">
        <Field label="Max events"><NumInput value={ns.max_events} onChange={(v) => nsEdit((n) => { n.max_events = Math.min(20, Math.max(1, Math.round(v))); })} /></Field>
        <Field label="Prune below"><NumInput value={ns.min_weight} step={0.0001} onChange={(v) => nsEdit((n) => { n.min_weight = Math.max(1e-9, v); })} /></Field>
        <Field label="Lens rings"><NumInput value={ns.tess_rings} onChange={(v) => nsEdit((n) => { n.tess_rings = Math.min(64, Math.max(4, Math.round(v))); })} /></Field>
        <Field label="Lens segments"><NumInput value={ns.tess_segments} onChange={(v) => nsEdit((n) => { n.tess_segments = Math.min(180, Math.max(12, Math.round(v))); })} /></Field>
      </Section>
      <Section title="How it works">
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Click an object in the view or the list, then drag the arrows (Move, W) or rings (Rotate, E).</li>
          <li>Glass faces split rays by unpolarised Fresnel R/T, mirrors reflect everything, absorbers stop rays.</li>
          <li>Yellow rays are the direct paths; pink ones carry at least one partial reflection (ghosts).</li>
          <li>The heat-map is drawn on the detector plane after each run.</li>
        </ul>
      </Section>
    </Panel>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <aside className="min-h-0 overflow-auto border-l border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      {children}
    </aside>
  );
}
