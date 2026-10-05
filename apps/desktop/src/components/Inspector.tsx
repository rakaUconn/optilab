import { useStore } from "../store";
import { Button, Field, NumInput, Section } from "../ui";

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

      <Section title="Fields (deg)" right={<Button variant="ghost" onClick={() => patch((m) => m.fields.push({ angle: 1, weight: 1 }))}>+</Button>}>
        {model.fields.map((fl, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="radio" name="fld" checked={selField === i} onChange={() => set({ selField: i })} />
            <NumInput value={fl.angle} onChange={(v) => patch((m) => { m.fields[i].angle = v; })} />
            <button className="px-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={model.fields.length < 2}
              onClick={() => { patch((m) => m.fields.splice(i, 1)); set({ selField: 0 }); }}>×</button>
          </div>
        ))}
      </Section>

      <Section title="Wavelengths (µm)" right={<Button variant="ghost" onClick={() => patch((m) => m.wavelengths.push({ um: 0.55, weight: 1 }))}>+</Button>}>
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

      <Section title="First-order (primary λ)">
        <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">EFL</dt><dd>{f(par?.efl)}</dd>
          <dt className="text-muted-foreground">BFL</dt><dd>{f(par?.bfl)}</dd>
          <dt className="text-muted-foreground">F/#</dt><dd>{f(par?.fno, 2)}</dd>
          <dt className="text-muted-foreground">ENP z</dt><dd>{f(par?.enp_z)}</dd>
          <dt className="text-muted-foreground">Image z</dt><dd>{f(result.image_z)}</dd>
        </dl>
      </Section>

      <Section title={`RMS spot, field ${selField}`}>
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
