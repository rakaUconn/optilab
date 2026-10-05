import { useStore } from "../store";
import { Button, Field, NumInput, Section } from "../ui";

const AX = ["x", "y", "z"] as const;

function Vec3({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="py-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex gap-1">
        {AX.map((a, i) => (
          <label key={a} className="flex min-w-0 flex-1 items-center gap-0.5"><span className="text-[10px] text-muted-foreground">{a}</span>
            <NumInput value={value[i]} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} /></label>
        ))}
      </div>
    </div>
  );
}

const f = (x: number | null | undefined, d = 3) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(d));

export function Inspector() {
  const { model, patch, result, selField, set, selSurface, autofocus } = useStore();
  const par = result.paraxial?.[model.primary_wavelength];
  const s = model.surfaces[selSurface];
  const spot = result.spots?.filter((x) => x.field === selField);

  return (
    <aside className="min-h-0 overflow-auto border-l border-border bg-card">
      <Section title="System">
        <Field label="Name">
          <input className="h-6 w-full rounded-sm border border-transparent bg-transparent px-1 text-right text-xs hover:border-input focus:border-ring focus:outline-none"
            value={model.name} onChange={(e) => patch((m) => { m.name = e.target.value; })} />
        </Field>
        <Field label="EPD (mm)"><NumInput value={model.aperture.value} min={0.01} onChange={(v) => patch((m) => { m.aperture.value = v; })} /></Field>
        <label className="flex items-center justify-between py-0.5">
          <span className="text-muted-foreground">Auto-focus image plane</span>
          <input type="checkbox" checked={autofocus} onChange={(e) => set({ autofocus: e.target.checked })} />
        </label>
      </Section>

      <Section title="Fields" unit="deg" right={<Button variant="ghost" onClick={() => patch((m) => m.fields.push({ angle: 1, weight: 1 }))}>+</Button>}>
        {model.fields.map((fl, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="radio" name="fld" checked={selField === i} onChange={() => set({ selField: i })} />
            <NumInput value={fl.angle} onChange={(v) => patch((m) => { m.fields[i].angle = v; })} />
            <button className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={model.fields.length < 2}
              onClick={() => { patch((m) => m.fields.splice(i, 1)); set({ selField: 0 }); }}>×</button>
          </div>
        ))}
      </Section>

      <Section title="Wavelengths" unit="µm" right={<Button variant="ghost" onClick={() => patch((m) => m.wavelengths.push({ um: 0.55, weight: 1 }))}>+</Button>}>
        {model.wavelengths.map((w, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="radio" name="pri" title="primary" checked={model.primary_wavelength === i} onChange={() => patch((m) => { m.primary_wavelength = i; })} />
            <NumInput value={w.um} step={0.001} onChange={(v) => patch((m) => { m.wavelengths[i].um = v; })} />
            <NumInput value={w.weight} className="w-12" onChange={(v) => patch((m) => { m.wavelengths[i].weight = v; })} />
            <button className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={model.wavelengths.length < 2}
              onClick={() => patch((m) => { m.wavelengths.splice(i, 1); m.primary_wavelength = 0; })}>×</button>
          </div>
        ))}
      </Section>

      <Section title={`Surface ${selSurface}`}>
        {s && (
          <>
            <Field label="Radius"><NumInput value={s.radius} onChange={(v) => patch((m) => { m.surfaces[selSurface].radius = v; })} /></Field>
            <Field label="Semi-diameter"><NumInput value={s.semi_diameter} onChange={(v) => patch((m) => { m.surfaces[selSurface].semi_diameter = v; })} /></Field>
            <Field label="Conic k"><NumInput value={s.conic} onChange={(v) => patch((m) => { m.surfaces[selSurface].conic = v; })} /></Field>
          </>
        )}
      </Section>

      <Section title="Non-sequential" unit="source · detector · solids">
        <Field label="Beam ⌀ (mm)"><NumInput value={model.nonseq.source.beam_diameter} onChange={(v) => patch((m) => { m.nonseq.source.beam_diameter = Math.max(0.1, v); })} /></Field>
        <Field label="Grid n×n"><NumInput value={model.nonseq.source.n} step={2} onChange={(v) => patch((m) => { m.nonseq.source.n = Math.min(401, Math.max(3, Math.round(v))); })} /></Field>
        <Field label="Tilt (deg)"><NumInput value={model.nonseq.source.angle} onChange={(v) => patch((m) => { m.nonseq.source.angle = v; })} /></Field>
        <Field label="Start z (mm)"><NumInput value={model.nonseq.source.z} onChange={(v) => patch((m) => { m.nonseq.source.z = v; })} /></Field>
        <Vec3 label="Beam centre (x, y)" value={[model.nonseq.source.offset[0], model.nonseq.source.offset[1], 0]} onChange={(v) => patch((m) => { m.nonseq.source.offset = [v[0], v[1]]; })} />
        <label className="mt-1 flex items-center justify-between py-0.5">
          <span className="text-muted-foreground">Detector at image plane</span>
          <input type="checkbox" checked={!model.nonseq.detector.center}
            onChange={(e) => patch((m) => { m.nonseq.detector.center = e.target.checked ? null : [0, 0, result.image_z ?? 0]; m.nonseq.detector.normal = e.target.checked ? null : [0, 0, 1]; })} />
        </label>
        {model.nonseq.detector.center && (
          <>
            <Vec3 label="Detector centre" value={model.nonseq.detector.center} onChange={(v) => patch((m) => { m.nonseq.detector.center = v; })} />
            <Vec3 label="Detector normal" value={model.nonseq.detector.normal ?? [0, 0, 1]} onChange={(v) => patch((m) => { m.nonseq.detector.normal = v; })} />
          </>
        )}
        <Field label="Detector ± (mm)"><NumInput value={model.nonseq.detector.half_width} onChange={(v) => patch((m) => { m.nonseq.detector.half_width = Math.max(0.01, v); })} /></Field>
        {model.nonseq.extra_solids.map((sol, i) => (
          <div key={i} className="mt-2 rounded-md border border-border p-2">
            <div className="flex items-center justify-between">
              <input value={sol.name} onChange={(e) => patch((m) => { m.nonseq.extra_solids[i].name = e.target.value; })}
                className="h-6 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1 text-xs font-medium hover:border-input focus:border-ring focus:outline-none" />
              <button className="px-1 text-muted-foreground hover:text-foreground" title="Remove" onClick={() => patch((m) => { m.nonseq.extra_solids.splice(i, 1); })}>×</button>
            </div>
            <Vec3 label="Position (mm)" value={sol.position} onChange={(v) => patch((m) => { m.nonseq.extra_solids[i].position = v; })} />
            <Vec3 label="Rotation (deg, Rz·Ry·Rx)" value={sol.rotation_deg} onChange={(v) => patch((m) => { m.nonseq.extra_solids[i].rotation_deg = v; })} />
          </div>
        ))}
        {!model.nonseq.extra_solids.length && <p className="mt-1 text-muted-foreground">No prisms or fold mirrors. Add them from the Library.</p>}
      </Section>

      <Section title="First-order" unit="primary λ">
        <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">EFL</dt><dd>{f(par?.efl)}</dd>
          <dt className="text-muted-foreground">BFL</dt><dd>{f(par?.bfl)}</dd>
          <dt className="text-muted-foreground">F/#</dt><dd>{f(par?.fno, 2)}</dd>
          <dt className="text-muted-foreground">ENP z</dt><dd>{f(par?.enp_z)}</dd>
          <dt className="text-muted-foreground">Image z</dt><dd>{f(result.image_z)}</dd>
        </dl>
      </Section>

      <Section title="RMS spot" unit={`field ${selField}`}>
        <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
          {(spot ?? []).map((sp) => (
            <div key={sp.wavelength} className="contents">
              <dt className="text-muted-foreground">{sp.wavelength.toFixed(4)} µm</dt>
              <dd>{f(sp.rms_radius * 1000, 2)} µm</dd>
            </div>
          ))}
          {!spot?.length && <dd className="col-span-2 text-muted-foreground">no data yet</dd>}
        </dl>
      </Section>
    </aside>
  );
}
