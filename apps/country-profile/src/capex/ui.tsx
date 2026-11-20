import type { ReactNode } from "react";

// Shared figure block for the capital-expenditure page (label, title, subtitle, chart, source).
export function Figure({ label, title, subtitle, source, children }: { label: string; title: string; subtitle: string; source: string; children: ReactNode }) {
  return (
    <figure className="rounded border border-gl-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gl-blue">{label}</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      <p className="text-sm text-gl-muted">{subtitle}</p>
      <div className="mt-3">{children}</div>
      <figcaption className="mt-2 text-xs italic text-gl-muted">Source: {source}</figcaption>
    </figure>
  );
}
