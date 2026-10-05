import { useEffect, useMemo, useRef, useState } from "react";
import { importZmx, listCatalog } from "../api/client";
import { useStore } from "../store";
import type { CatalogEntry } from "../types/api";
import { Button, cx } from "../ui";
import { LensEditor } from "./LensEditor";
import { Preview } from "./Preview";

const f = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(d));
const VENDORS = ["Thorlabs", "Edmund Optics", "Other"];

/** Zemax files are often UTF-16; the browser's File.text() would decode them as UTF-8 garbage. */
async function readZmx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

export function Library() {
  const { libraryOpen, set, userLib, addUserEntry, removeUserEntry, insertEntry, addSolid, selSurface, model } = useStore();
  const [generic, setGeneric] = useState<CatalogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [src, setSrc] = useState<"all" | "generic" | "mine">("all");
  const [cat, setCat] = useState<"all" | CatalogEntry["category"]>("all");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [fmin, setFmin] = useState("");
  const [fmax, setFmax] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [gap, setGap] = useState(20);
  const [imp, setImp] = useState({ vendor: VENDORS[0], part: "", busy: false, msg: "" as string | null });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (libraryOpen && !generic.length) listCatalog().then(setGeneric).catch((e) => setErr(String(e)));
  }, [libraryOpen, generic.length]);

  const all = useMemo(() => [...userLib, ...generic], [userLib, generic]);
  const kinds = useMemo(() => [...new Set(all.filter((e) => cat === "all" || e.category === cat).map((e) => e.kind))].sort(), [all, cat]);
  const rows = useMemo(() => {
    const lo = parseFloat(fmin), hi = parseFloat(fmax);
    const text = q.trim().toLowerCase();
    return all
      .filter((e) => (src === "all" || (src === "mine") === userLib.some((u) => u.id === e.id)))
      .filter((e) => cat === "all" || e.category === cat)
      .filter((e) => !kind || e.kind === kind)
      .filter((e) => !text || `${e.name} ${e.vendor} ${e.part_number} ${e.glasses.join(" ")} ${e.kind}`.toLowerCase().includes(text))
      .filter((e) => (Number.isNaN(lo) || (e.efl != null && Math.abs(e.efl) >= lo)) && (Number.isNaN(hi) || (e.efl != null && Math.abs(e.efl) <= hi)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.kind.localeCompare(b.kind) || Math.abs(a.efl ?? 1e9) - Math.abs(b.efl ?? 1e9) || a.diameter - b.diameter);
  }, [all, userLib, src, cat, kind, q, fmin, fmax]);

  const current = all.find((e) => e.id === sel) ?? null;
  const isMine = (e: CatalogEntry) => userLib.some((u) => u.id === e.id);
  if (!libraryOpen) return null;

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setImp((s) => ({ ...s, busy: true, msg: null }));
    try {
      const e = await importZmx({ text: await readZmx(file), vendor: imp.vendor, part_number: imp.part, name: "" });
      addUserEntry(e);
      setSel(e.id);
      setSrc("mine");
      setImp((s) => ({ ...s, busy: false, msg: `Imported ${e.name}` }));
    } catch (e) {
      setImp((s) => ({ ...s, busy: false, msg: String(e).replace(/^Error: \d+ /, "") }));
    }
  };

  const insert = (e: CatalogEntry, mode: "after" | "replace") => {
    insertEntry(e, mode, gap);
    set({ libraryOpen: false });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onMouseDown={(ev) => ev.target === ev.currentTarget && set({ libraryOpen: false })}>
      <div className="flex h-full max-h-[760px] w-full max-w-[1180px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">Component library</h2>
          <span className="text-xs text-muted-foreground">{rows.length} of {all.length}</span>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => set({ libraryOpen: false })}>✕</Button>
        </div>

        {err && <div className="border-b border-border bg-destructive/20 px-4 py-1.5 text-xs">Catalogue unavailable: {err}</div>}
        <div className="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)_380px]">
          {/* filters */}
          <div className="space-y-3 overflow-auto border-r border-border p-3 text-xs">
            <input placeholder="Search name, glass, part #…" value={q} onChange={(e) => setQ(e.target.value)}
              className="h-7 w-full rounded-md border border-input bg-muted px-2 focus:outline-none focus:ring-1 focus:ring-ring" />
            <Group label="Source" value={src} onChange={(v) => setSrc(v as typeof src)} options={[["all", "All"], ["generic", "Generic"], ["mine", "My library"]]} />
            <Group label="Type" value={cat} onChange={(v) => { setCat(v as typeof cat); setKind(""); }} options={[["all", "All"], ["lens", "Lenses"], ["mirror", "Mirrors"], ["prism", "Prisms"]]} />
            <label className="block">
              <span className="text-muted-foreground">Kind</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 h-7 w-full rounded-md border border-input bg-secondary px-1.5">
                <option value="">Any</option>
                {kinds.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <div>
              <span className="text-muted-foreground">|EFL| range (mm)</span>
              <div className="mt-1 flex gap-1">
                <input placeholder="min" value={fmin} onChange={(e) => setFmin(e.target.value)} className="num h-7 w-full rounded-md border border-input bg-muted px-2" />
                <input placeholder="max" value={fmax} onChange={(e) => setFmax(e.target.value)} className="num h-7 w-full rounded-md border border-input bg-muted px-2" />
              </div>
            </div>
            <div className="space-y-1.5 border-t border-border pt-3">
              <div className="font-medium">Import Zemax file</div>
              <p className="text-muted-foreground">Thorlabs and Edmund Optics publish a .zmx per part number. Choose the vendor, add the part number, then pick the file.</p>
              <select value={imp.vendor} onChange={(e) => setImp({ ...imp, vendor: e.target.value })} className="h-7 w-full rounded-md border border-input bg-secondary px-1.5">
                {VENDORS.map((v) => <option key={v}>{v}</option>)}
              </select>
              <input placeholder="Part number (e.g. AC254-100-A)" value={imp.part} onChange={(e) => setImp({ ...imp, part: e.target.value })}
                className="h-7 w-full rounded-md border border-input bg-muted px-2" />
              <Button className="w-full" disabled={imp.busy} onClick={() => fileRef.current?.click()}>{imp.busy ? "Importing…" : "Choose .zmx…"}</Button>
              <input ref={fileRef} type="file" accept=".zmx,.ZMX,.txt" hidden onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} />
              {imp.msg && <div className={cx("break-words", imp.msg.startsWith("Imported") ? "text-emerald-400" : "text-destructive")}>{imp.msg}</div>}
            </div>
          </div>

          {/* list */}
          <div className="min-h-0 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-1.5 text-left">Name</th><th className="text-left">Kind</th><th className="text-right">EFL</th><th className="text-right">Ø</th><th className="pr-3 text-right">F/#</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => { setSel(e.id); setEditing(null); }} onDoubleClick={() => setEditing(structuredClone(e))}
                    className={cx("cursor-pointer border-t border-border/50", sel === e.id ? "bg-accent/70" : "hover:bg-muted")}>
                    <td className="px-3 py-1">
                      {e.name}
                      {e.vendor !== "Generic" && <span className="ml-1.5 rounded bg-primary/20 px-1 text-[10px] text-primary">{e.vendor}{e.part_number && ` ${e.part_number}`}</span>}
                    </td>
                    <td className="text-muted-foreground">{e.kind}</td>
                    <td className="num text-right">{f(e.efl, 1)}</td>
                    <td className="num text-right">{f(e.diameter, 1)}</td>
                    <td className="num pr-3 text-right">{f(e.fno, 1)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{all.length ? "No parts match these filters." : "Loading catalogue…"}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* detail / editor */}
          <div className="min-h-0 overflow-auto border-l border-border">
            {editing ? (
              <LensEditor key={editing.id} entry={editing} onClose={() => setEditing(null)}
                onSave={(e) => { addUserEntry(e); setSel(e.id); setSrc("mine"); setEditing(null); }}
                onInsert={(e, mode) => insert(e, mode)} gap={gap} />
            ) : current ? (
              <div className="space-y-3 p-4 text-xs">
                <div>
                  <div className="text-sm font-semibold">{current.name}</div>
                  <div className="text-muted-foreground">{current.vendor}{current.part_number && ` · ${current.part_number}`} · {current.category} · {current.kind}</div>
                </div>
                <Preview entry={current} />
                <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                  <dt className="text-muted-foreground">Outer size Ø</dt><dd>{f(current.diameter, 1)} mm</dd>
                  {current.category !== "prism" && <>
                    <dt className="text-muted-foreground">EFL</dt><dd>{f(current.efl, 2)} mm</dd>
                    <dt className="text-muted-foreground">BFL</dt><dd>{f(current.bfl, 2)} mm</dd>
                    <dt className="text-muted-foreground">F/#</dt><dd>{f(current.fno, 2)}</dd>
                  </>}
                  <dt className="text-muted-foreground">Material</dt><dd>{current.glasses.join(", ") || "—"}</dd>
                </dl>
                <p className="text-muted-foreground">{current.source}</p>
                {current.vendor === "Generic" && <p className="rounded-md bg-muted p-2 text-muted-foreground">Generic stock-style part built from nominal specs — not a manufacturer prescription. Import the vendor's .zmx for the real design.</p>}
                {current.category === "prism" && current.solid ? (
                  <div className="space-y-2">
                    <Button variant="primary" className="w-full" onClick={() => { addSolid(current.solid!); set({ libraryOpen: false }); }}>Add to scene (non-sequential)</Button>
                    <p className="text-muted-foreground">Prisms and fold mirrors are non-sequential solids: set their position/rotation and the detector pose in the inspector, then run the non-sequential trace.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Air gap after the part when inserted mid-system (mm)</span>
                      <input type="number" value={gap} onChange={(e) => setGap(parseFloat(e.target.value) || 0)} className="num h-6 w-16 rounded-sm border border-input bg-muted px-1 text-right" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="primary" onClick={() => insert(current, "after")}>Insert after surface {Math.min(selSurface, model.surfaces.length - 1)}</Button>
                      <Button onClick={() => insert(current, "replace")}>Replace system</Button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  {current.category !== "prism" && <Button className="flex-1" onClick={() => setEditing(structuredClone(current))}>Edit a copy…</Button>}
                  {isMine(current) && <Button variant="destructive" onClick={() => { removeUserEntry(current.id); setSel(null); }}>Delete</Button>}
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
                Select a part to preview it. Double-click a lens or mirror to edit a copy.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <div className="mb-1 text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map(([k, name]) => (
          <button key={k} onClick={() => onChange(k)}
            className={cx("h-6 rounded-md px-2", value === k ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent")}>{name}</button>
        ))}
      </div>
    </div>
  );
}
