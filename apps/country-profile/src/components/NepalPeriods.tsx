import type { ReactNode } from "react";
import type { Country } from "../types";
import { GL } from "../lib/glTokens";
import { useRegimes } from "../lib/useRegimes";
import { periodColor, periodSpan, usePeriods, type Period } from "../lib/usePeriods";

// Nepal fork: political-period overlays shared by the Regimes and Institutions charts, plus the
// context cards (periods + V-Dem regime notes) shown under the Regimes section.

type ShowFn = (ev: { clientX: number; clientY: number }, body: ReactNode) => void;

let ctx2d: CanvasRenderingContext2D | null = null;
function fitText(t: string, w: number, px = 11) {
  if (w < 24) return "";
  ctx2d ??= document.createElement("canvas").getContext("2d");
  if (!ctx2d) return t;
  ctx2d.font = `${px}px "Source Sans 3", Inter, system-ui, sans-serif`;
  if (ctx2d.measureText(t).width <= w) return t;
  let s = t;
  while (s.length > 3 && ctx2d.measureText(s + "…").width > w) s = s.slice(0, -1);
  return s.length > 3 ? s + "…" : "";
}

export const scrollToPeriod = (id: string) =>
  document.getElementById(`period-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

/** One-row strip of political periods. `x` maps (fractional) years to px. */
export function PeriodStrip({ periods, x, from, to, top, h, labelRight, show, hide }: {
  periods: Period[]; x: (y: number) => number; from: number; to: number; top: number; h: number;
  labelRight: number; show: ShowFn; hide: () => void;
}) {
  return (
    <g>
      <text x={labelRight} y={top + h / 2 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill={GL.text}>Political period</text>
      {periods.map((p) => {
        const [a, b] = periodSpan(p, to);
        if (b <= from || a >= to + 1) return null;
        const x0 = x(Math.max(a, from)), x1 = x(Math.min(b, to + 1));
        const c = periodColor(p);
        const label = fitText(p.label, x1 - x0 - 10, 11);
        return (
          <g key={p.id} role="button" tabIndex={0} className="cursor-pointer" aria-label={`${p.label}, ${p.startLabel} to ${p.endLabel}`}
            onClick={() => scrollToPeriod(p.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); scrollToPeriod(p.id); } }}
            onMouseMove={(e) => show(e, <><b>{p.label}</b><br />{p.startLabel} – {p.endLabel}<br /><span className="opacity-75">{p.dynamics}</span><br /><span className="opacity-75">Click for context</span></>)}
            onMouseLeave={hide}>
            <rect x={x0 + 0.5} y={top} width={Math.max(1, x1 - x0 - 1)} height={h} rx={3} fill={c} fillOpacity={0.22} stroke={c} strokeOpacity={0.6} />
            {label && <text x={x0 + 5} y={top + h / 2 + 4} fontSize={11} fill={GL.text} pointerEvents="none">{label}</text>}
          </g>
        );
      })}
    </g>
  );
}

/** Dashed vertical lines at the start of each period inside the visible range. */
export function PeriodBounds({ periods, x, from, to, y1, y2 }: {
  periods: Period[]; x: (y: number) => number; from: number; to: number; y1: number; y2: number;
}) {
  return (
    <g pointerEvents="none">
      {periods.map((p) => {
        const [a] = periodSpan(p, to);
        if (a <= from || a >= to + 1) return null;
        return <line key={p.id} x1={x(a)} x2={x(a)} y1={y1} y2={y2} stroke={periodColor(p)} strokeWidth={1.5} strokeDasharray="4 3" />;
      })}
    </g>
  );
}

/** Cards for each political period + one-paragraph notes per V-Dem regime. */
export function RegimeContext({ focus }: { focus: Country }) {
  const cp = usePeriods(focus.iso3);
  const { data } = useRegimes(focus.iso3);
  if (!cp) return null;
  const regimes = (data?.regimes ?? []).filter((r) => cp.regimeNotes[String(r.id)]);
  return (
    <div className="mt-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Political periods within and around V-Dem's regimes</h3>
        <p className="mt-1 text-sm text-gl-muted">
          V-Dem codes everything since May 2008 as a single regime, the democratic republic. The periods below mark
          the turning points that matter for understanding {focus.name}'s institutions; they are shown as the
          "Political period" band in the regime chart above and in the institutions chart below.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cp.periods.map((p) => (
            <article key={p.id} id={`period-${p.id}`} className="scroll-mt-24 rounded border border-gl-border bg-white p-4"
              style={{ borderLeft: `4px solid ${periodColor(p)}` }}>
              <h4 className="font-semibold">{p.label}</h4>
              <p className="text-xs tabular-nums text-gl-muted">{p.startLabel} – {p.endLabel}</p>
              <p className="mt-2 text-sm">{p.summary}</p>
              <p className="mt-2 text-sm"><span className="font-semibold">Power dynamics: </span>{p.dynamics}</p>
            </article>
          ))}
        </div>
      </div>

      {regimes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold">V-Dem's regimes: why they matter</h3>
          <div className="mt-3 divide-y divide-gl-border rounded border border-gl-border bg-white">
            {regimes.map((r) => (
              <div key={`${r.id}-${r.y0}`} className="grid gap-1 px-4 py-3 md:grid-cols-[16rem_1fr] md:gap-4">
                <div>
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs tabular-nums text-gl-muted">{r.y0 === r.y1 ? r.y0 : `${r.y0}–${r.end === "E" ? "present" : r.y1}`}</p>
                </div>
                <p className="text-sm">{cp.regimeNotes[String(r.id)]}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-gl-muted">{cp.credit}</p>
    </div>
  );
}
