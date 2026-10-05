import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export const cx = (...a: Parameters<typeof clsx>) => clsx(...a);

export function Button({ variant = "secondary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "destructive" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex h-7 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-accent",
        variant === "ghost" && "hover:bg-accent",
        variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        className,
      )}
    />
  );
}

export function NumInput({ value, onChange, className, step = "any", ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: number; onChange: (v: number) => void }) {
  return (
    <input
      {...p}
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className={cx("num h-6 w-full rounded-sm border border-transparent bg-transparent px-1 text-right text-xs hover:border-input focus:border-ring focus:bg-muted focus:outline-none", className)}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="w-24">{children}</span>
    </label>
  );
}

export function Section({ title, unit, children, right }: { title: string; unit?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}{unit && <span className="ml-1 normal-case tracking-normal">({unit})</span>}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
