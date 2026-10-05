import * as echarts from "echarts/core";
import { HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useRef } from "react";
import { useStore, type Tab } from "../store";
import { Button, cx } from "../ui";
import { FIELD_COLORS } from "./Layout3D";

echarts.use([HeatmapChart, LineChart, ScatterChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const WL_COLORS = ["#a3e635", "#60a5fa", "#f87171", "#fbbf24", "#c084fc", "#2dd4bf"];
const TXT = "#94a3b8";
const AXIS = { axisLine: { lineStyle: { color: "#334155" } }, axisLabel: { color: TXT }, splitLine: { lineStyle: { color: "#1e293b" } }, nameTextStyle: { color: TXT } };

function Chart({ option, className }: { option: EChartsOption; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    const c = echarts.init(ref.current!, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current!);
    return () => { ro.disconnect(); c.dispose(); };
  }, []);
  useEffect(() => { chart.current?.setOption({ backgroundColor: "transparent", textStyle: { color: TXT }, animation: false, ...option }, true); }, [option]);
  return <div ref={ref} className={cx("h-full w-full", className)} />;
}

const num = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? NaN : x);

function SpotPlot() {
  const { result, model, selField } = useStore();
  const spots = useMemo(() => (result.spots ?? []).filter((s) => s.field === selField), [result.spots, selField]);
  const option = useMemo<EChartsOption>(() => {
    const raw = Math.max(0.005, ...spots.flatMap((s) => [...s.x, ...s.y].map((q) => Math.abs(q)))) * 1.15 * 1000;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const ext = Math.ceil(raw / mag) * mag;
    return {
      grid: { left: 52, right: 16, top: 44, bottom: 36 },
      legend: { top: 0, type: "scroll", textStyle: { color: TXT, fontSize: 10 }, itemHeight: 8 },
      tooltip: { trigger: "item", formatter: (p: any) => `${p.seriesName}<br/>x ${p.value[0].toFixed(2)} µm, y ${p.value[1].toFixed(2)} µm` },
      xAxis: { type: "value", name: "x (µm)", min: -ext, max: ext, ...AXIS },
      yAxis: { type: "value", name: "y (µm)", min: -ext, max: ext, ...AXIS },
      series: spots.map((s, i) => {
        const wi = model.wavelengths.findIndex((w) => Math.abs(w.um - s.wavelength) < 1e-9);
        return {
          type: "scatter", symbolSize: 4, itemStyle: { color: WL_COLORS[(wi < 0 ? i : wi) % WL_COLORS.length], opacity: 0.8 },
          name: `${s.wavelength.toFixed(4)} µm · RMS ${(s.rms_radius * 1000).toFixed(2)} µm`,
          data: s.x.map((x, k) => [x * 1000, s.y[k] * 1000]),
        };
      }),
    } as EChartsOption;
  }, [spots, model.wavelengths]);
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_280px]">
      <div className="aspect-square h-full justify-self-center"><Chart option={option} /></div>
      <SpotTable />
    </div>
  );
}

function SpotTable() {
  const { result, model } = useStore();
  return (
    <div className="overflow-auto border-l border-border p-2 text-xs">
      <table className="num w-full">
        <thead className="text-[10px] text-muted-foreground"><tr><th className="text-left">Field°</th><th className="text-right">λ µm</th><th className="text-right">RMS µm</th><th className="text-right">Geo µm</th></tr></thead>
        <tbody>
          {(result.spots ?? []).map((s, i) => (
            <tr key={i} className="border-t border-border/50">
              <td style={{ color: "#" + FIELD_COLORS[s.field % FIELD_COLORS.length].toString(16) }}>{model.fields[s.field]?.angle ?? s.field}</td>
              <td className="text-right">{s.wavelength.toFixed(4)}</td>
              <td className="text-right">{(num(s.rms_radius) * 1000).toFixed(2)}</td>
              <td className="text-right">{(num(s.geo_radius) * 1000).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RayFanPlot() {
  const { result, model, selField } = useStore();
  const fans = useMemo(() => (result.rayfans ?? []).filter((s) => s.field === selField), [result.rayfans, selField]);
  const mk = (key: "ey_tangential" | "ex_sagittal", title: string): EChartsOption => ({
    title: { text: title, left: "center", top: 0, textStyle: { color: TXT, fontSize: 11, fontWeight: "normal" } },
    grid: { left: 56, right: 16, top: 26, bottom: 36 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "value", name: "pupil", min: -1, max: 1, ...AXIS },
    yAxis: { type: "value", name: "error (µm)", scale: true, ...AXIS },
    series: fans.map((f, i) => ({
      type: "line", showSymbol: false, connectNulls: false,
      name: `${f.wavelength.toFixed(4)} µm`, lineStyle: { color: WL_COLORS[i % 6], width: 1.6 }, itemStyle: { color: WL_COLORS[i % 6] },
      data: f.pupil.map((p, k) => [p, f[key][k] == null ? null : f[key][k]! * 1000]),
    })),
  } as EChartsOption);
  const ang = model.fields[selField]?.angle;
  const a = useMemo(() => mk("ey_tangential", `Tangential Ey · field ${ang}°`), [fans, ang]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = useMemo(() => mk("ex_sagittal", "Sagittal Ex"), [fans]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="grid h-full grid-cols-2"><Chart option={a} /><Chart option={b} /></div>;
}

function MtfPlot() {
  const { result, model, selField } = useStore();
  const m = useMemo(() => (result.mtf ?? []).filter((s) => s.field === selField), [result.mtf, selField]);
  const option = useMemo<EChartsOption>(() => {
    const prim = m.find((s) => Math.abs(s.wavelength - model.wavelengths[model.primary_wavelength].um) < 1e-9) ?? m[0];
    const series: any[] = [];
    m.forEach((s, i) => {
      const c = WL_COLORS[i % 6];
      series.push({ type: "line", showSymbol: false, name: `T ${s.wavelength.toFixed(4)}`, lineStyle: { color: c, width: 1.6 }, itemStyle: { color: c }, data: s.freq.map((f, k) => [f, s.tangential[k]]) });
      series.push({ type: "line", showSymbol: false, name: `S ${s.wavelength.toFixed(4)}`, lineStyle: { color: c, width: 1.2, type: "dashed" }, itemStyle: { color: c }, data: s.freq.map((f, k) => [f, s.sagittal[k]]) });
    });
    if (prim) series.push({ type: "line", showSymbol: false, name: "Diffraction limit", lineStyle: { color: "#e2e8f0", width: 1, type: "dotted" }, itemStyle: { color: "#e2e8f0" }, data: prim.freq.map((f, k) => [f, prim.diffraction_limit[k]]) });
    return {
      grid: { left: 52, right: 16, top: 30, bottom: 36 },
      legend: { top: 0, type: "scroll", textStyle: { color: TXT }, itemHeight: 8 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "value", name: "cycles/mm", min: 0, max: prim?.cutoff, ...AXIS, axisLabel: { color: TXT, formatter: (v: number) => v.toFixed(0) } },
      yAxis: { type: "value", name: "MTF", min: 0, max: 1, ...AXIS },
      series,
    } as EChartsOption;
  }, [m, model]);
  return <Chart option={option} />;
}

function IrradiancePlot() {
  const { result, trace, job, model } = useStore();
  const ir = result.irradiance;
  const option = useMemo<EChartsOption>(() => {
    if (!ir) return {};
    const data: [number, number, number][] = [];
    ir.grid.forEach((row, iy) => row.forEach((val, ix) => data.push([ix, iy, val])));
    const max = Math.max(...data.map((d) => d[2]), 1e-12);
    const pix = (2 * ir.extent) / ir.bins;
    const label = (i: number) => (-ir.extent + (i + 0.5) * pix).toFixed(2);
    const cats = Array.from({ length: ir.bins }, (_, i) => label(i));
    return {
      grid: { left: 56, right: 70, top: 16, bottom: 40 },
      tooltip: { formatter: (p: any) => `x ${label(p.value[0])} mm, y ${label(p.value[1])} mm<br/>E ${p.value[2].toExponential(3)}` },
      xAxis: { type: "category", name: "x (mm)", data: cats, axisLabel: { color: TXT, interval: Math.floor(ir.bins / 8) }, axisLine: AXIS.axisLine, nameTextStyle: AXIS.nameTextStyle },
      yAxis: { type: "category", name: "y (mm)", data: cats, axisLabel: { color: TXT, interval: Math.floor(ir.bins / 8) }, axisLine: AXIS.axisLine, nameTextStyle: AXIS.nameTextStyle },
      visualMap: { min: 0, max, calculable: true, right: 4, top: 10, bottom: 30, textStyle: { color: TXT }, inRange: { color: ["#0b1020", "#312e81", "#7c3aed", "#f59e0b", "#fef08a", "#ffffff"] } },
      series: [{ type: "heatmap", data }],
    } as EChartsOption;
  }, [ir]);
  const ns = model.nonseq;
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative">
        {ir ? <div className="mx-auto aspect-square h-full"><Chart option={option} /></div> : <div className="grid h-full place-items-center text-muted-foreground">No irradiance yet — run the non-sequential trace.</div>}
      </div>
      <div className="space-y-2 overflow-auto border-l border-border p-3 text-xs">
        <Button variant="primary" className="w-full" disabled={job.running} onClick={() => void trace(["irradiance"])}>Run non-sequential trace</Button>
        <p className="text-muted-foreground">Collimated {ns.source.n}×{ns.source.n} grid, ⌀{ns.source.beam_diameter} mm → detector at the image plane (±{ns.detector.half_width} mm, {ns.detector.bins}² bins). Lens solids are tessellated from the surface table; each interface splits rays by unpolarised Fresnel R/T.</p>
        {ir && (
          <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Rays launched</dt><dd>{ir.n_rays_launched}</dd>
            <dt className="text-muted-foreground">Triangles</dt><dd>{ir.n_triangles}</dd>
            <dt className="text-muted-foreground">Power on detector</dt><dd>{(ir.total_power * 100).toFixed(2)} %</dd>
            <dt className="text-muted-foreground">Ghost paths</dt><dd>{ir.ghost_paths}</dd>
            <dt className="text-muted-foreground">Ghost share</dt><dd>{(ir.ghost_power_fraction * 100).toExponential(2)} %</dd>
          </dl>
        )}
      </div>
    </div>
  );
}

const TABS: [Tab, string][] = [["spot", "Spot"], ["rayfan", "RayFan"], ["mtf", "MTF"], ["irradiance", "Irradiance"]];

export function Plots() {
  const { tab, set, model, selField } = useStore();
  return (
    <section className="flex min-h-0 flex-col border-t border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border px-2">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => set({ tab: k })}
            className={cx("h-8 border-b-2 px-3 text-xs", tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground">field</span>
        <select className="h-6 rounded-md border border-input bg-secondary px-1.5 text-xs" value={selField} onChange={(e) => set({ selField: +e.target.value })}>
          {model.fields.map((f, i) => <option key={i} value={i}>{f.angle}°</option>)}
        </select>
      </div>
      <div className="min-h-0 flex-1 p-1">
        {tab === "spot" && <SpotPlot />}
        {tab === "rayfan" && <RayFanPlot />}
        {tab === "mtf" && <MtfPlot />}
        {tab === "irradiance" && <IrradiancePlot />}
      </div>
    </section>
  );
}
