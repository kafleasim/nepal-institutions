import { useEffect, useRef, useState, type ReactNode } from "react";
import { GL } from "../lib/glTokens";

// Nepal fork: federal capital execution from the MoF Red Books, and a federal-vs-local comparison.
// Data: public/nepal/federal_capex.json, written by 06_redbook_execution.py in the Growth Lab Nepal workstream
// (Red Book panel, FY 2069/70-2083/84). Budget for FY t comes from book t, revised from book t+1, actual from book t+2.

export type FedYear = {
  fy_bs: string; fy_ad: string; period: string;
  budget: number | null; revised: number | null; actual: number | null;
  exec_budget: number | null; exec_revised: number | null; planning_gap: number | null; impl_gap: number | null;
  gon_exec: number | null; foreign_exec: number | null;
};
type Sector = { sector: string; budget: number; revised: number; actual: number; exec_budget: number; exec_revised: number; unspent_bn: number };
type Prog = { programme_code: string; programme_en: string; sector: string; budget: number; actual: number; exec_budget: number; unspent_bn: number };
export type FedDoc = {
  built: string; source: string; units: string; years: FedYear[]; sectors: Sector[]; mof_lump_sum_budget: number; programmes: Prog[];
  periods: { period: string; years: string; budget: number; actual: number; exec_budget: number; planning_gap: number; impl_gap: number }[];
};
export type LocalPoint = { fy_ad: string; fy_bs: string; cap_spent_share: number };

const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
const bn = (v: number | null | undefined) => (v == null ? "–" : `NRs ${v.toFixed(0)} bn`);
const FED = GL.highlight, LOCAL = GL.blue, MUTE = "#AFB5BE", MUTE_DARK = "#5F6773", LIGHT = "#9CC3E0";

type ShowFn = (ev: { clientX: number; clientY: number }, body: ReactNode) => void;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function useFederal() {
  const [doc, setDoc] = useState<FedDoc | null | undefined>(undefined);
  useEffect(() => {
    fetch("/nepal/federal_capex.json").then((r) => (r.ok ? r.json() : null)).then(setDoc).catch(() => setDoc(null));
  }, []);
  return doc;
}

type Series = { name: string; color: string; values: (number | null)[]; width?: number; dash?: string; labels?: boolean };

/** Year-axis line chart; null values break the line (missing Red Books). */
function LineChart({ xs, sub, series, fmt, max, show, hide, aria }: {
  xs: string[]; sub?: string[]; series: Series[]; fmt: (v: number) => string; max: number; show: ShowFn; hide: () => void; aria: string;
}) {
  const [ref, W] = useWidth();
  const m = { l: 56, r: 16, t: 20, b: sub ? 36 : 24 }, H = 300;
  const band = (W - m.l - m.r) / xs.length;
  const cx = (i: number) => m.l + band * (i + 0.5);
  const yS = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const step = max > 2 ? (max > 300 ? 100 : 50) : 0.2;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(+t.toFixed(2));
  const every = W < 560 ? 3 : W < 800 ? 2 : 1;
  const path = (vs: (number | null)[]) => {
    let d = "", pen = false;
    vs.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${cx(i).toFixed(1)},${yS(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block w-5" style={{ borderTop: `${s.width ?? 2}px ${s.dash ? "dashed" : "solid"} ${s.color}` }} />{s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={aria}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={yS(t)} y2={yS(t)} stroke={t === 0 ? GL.text : GL.border} />
            <text x={m.l - 8} y={yS(t) + 4} textAnchor="end" fontSize={11} fill={GL.muted} className="tabular-nums">{fmt(t)}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" />
            {s.values.map((v, i) => v == null ? null : (
              <g key={i}>
                <circle cx={cx(i)} cy={yS(v)} r={3.5} fill={s.color} />
                {s.labels && <text x={cx(i)} y={yS(v) - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill={s.color} className="tabular-nums">{fmt(v)}</text>}
              </g>
            ))}
          </g>
        ))}
        {xs.map((x, i) => (
          <g key={x}>
            {i % every === 0 && <text x={cx(i)} y={H - m.b + 16} textAnchor="middle" fontSize={11} fill={GL.text}>{x}</text>}
            {sub && i % every === 0 && <text x={cx(i)} y={H - m.b + 29} textAnchor="middle" fontSize={10} fill={GL.muted}>{sub[i]}</text>}
            <rect x={cx(i) - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent"
              onMouseMove={(e) => show(e, (
                <>
                  <b>FY {x}</b>{sub ? ` (${sub[i]})` : ""}
                  {series.map((s) => <span key={s.name}><br />{s.name}: {s.values[i] == null ? "no data" : fmt(s.values[i] as number)}</span>)}
                </>
              ))} onMouseLeave={hide} />
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Figure 1: federal vs local capital execution, on one year axis. */
export function CompareChart({ fed, local, show, hide }: { fed: FedDoc; local: LocalPoint[]; show: ShowFn; hide: () => void }) {
  const first = fed.years.findIndex((y) => y.exec_budget != null);
  const lastAd = [...fed.years.filter((y) => y.exec_budget != null).map((y) => y.fy_ad), ...local.map((l) => l.fy_ad)].sort().pop()!;
  const ys = fed.years.slice(first).filter((y) => y.fy_ad <= lastAd);
  const lmap = new Map(local.map((l) => [l.fy_ad, l.cap_spent_share]));
  return (
    <LineChart xs={ys.map((y) => y.fy_ad)} sub={ys.map((y) => y.fy_bs)} max={1.1} fmt={(v) => pct(v)} show={show} hide={hide}
      aria="Share of capital budget spent, federal and local governments"
      series={[
        { name: "Federal: actual ÷ revised estimate", color: MUTE, values: ys.map((y) => y.exec_revised), width: 1.5, dash: "5 4" },
        { name: "Local governments: capital spent ÷ (capital spent + unspent balance)", color: LOCAL, values: ys.map((y) => lmap.get(y.fy_ad) ?? null), width: 2.4, labels: true },
        { name: "Federal: actual ÷ original budget", color: FED, values: ys.map((y) => y.exec_budget), width: 2.4, labels: true },
      ]} />
  );
}

export function FederalLevels({ fed, show, hide }: { fed: FedDoc; show: ShowFn; hide: () => void }) {
  const ys = fed.years;
  const max = Math.ceil(Math.max(...ys.map((y) => y.budget ?? 0)) / 100) * 100;
  return (
    <LineChart xs={ys.map((y) => y.fy_ad)} sub={ys.map((y) => y.fy_bs)} max={max} fmt={(v) => v.toFixed(0)} show={show} hide={hide}
      aria="Federal capital budget, revised estimate and actual spending"
      series={[
        { name: "Budget (book t)", color: MUTE, values: ys.map((y) => y.budget), width: 1.8 },
        { name: "Revised estimate (book t+1)", color: LIGHT, values: ys.map((y) => y.revised), width: 1.8 },
        { name: "Actual (book t+2)", color: LOCAL, values: ys.map((y) => y.actual), width: 2.4 },
      ]} />
  );
}

/** Spent / planning gap / implementation gap, as shares of the original budget. */
export function GapBars({ fed, show, hide }: { fed: FedDoc; show: ShowFn; hide: () => void }) {
  const [ref, W] = useWidth();
  const ys = fed.years.filter((y) => y.exec_budget != null && y.impl_gap != null && y.planning_gap != null);
  const m = { l: 56, r: 16, t: 16, b: 36 }, H = 300;
  const band = (W - m.l - m.r) / ys.length, bw = Math.min(56, band * 0.62);
  const cx = (i: number) => m.l + band * (i + 0.5);
  const yS = (v: number) => H - m.b - v * (H - m.t - m.b);
  const segs = (y: FedYear) => {
    const a = y.exec_budget!, ig = Math.max(0, y.impl_gap!), pg = 1 - a - ig;
    return [
      { k: "Spent", v: a, c: LOCAL, txt: "#fff" },
      { k: "Implementation gap (revised − actual)", v: ig, c: FED, txt: "#fff" },
      { k: "Planning gap (budget − revised)", v: Math.max(0, pg), c: "#CDD2D9", txt: MUTE_DARK },
    ];
  };
  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        {segs(ys[0]).map((s) => (
          <span key={s.k} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: s.c }} />{s.k}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Capital budget split into spent, implementation gap and planning gap">
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={yS(t)} y2={yS(t)} stroke={t === 0 ? GL.text : GL.border} />
            <text x={m.l - 8} y={yS(t) + 4} textAnchor="end" fontSize={11} fill={GL.muted} className="tabular-nums">{pct(t)}</text>
          </g>
        ))}
        {ys.map((y, i) => {
          let acc = 0;
          return (
            <g key={y.fy_bs} onMouseMove={(e) => show(e, (
              <>
                <b>FY {y.fy_ad}</b> ({y.fy_bs})
                <br />Budget {bn(y.budget)} → revised {bn(y.revised)} → actual {bn(y.actual)}
                <br />Spent: {pct(y.exec_budget)} of budget
                <br />Planning gap: {pct(y.planning_gap)} · implementation gap: {pct(y.impl_gap)}
              </>
            ))} onMouseLeave={hide}>
              {segs(y).map((s) => {
                const y0 = acc; acc += s.v;
                return (
                  <g key={s.k}>
                    <rect x={cx(i) - bw / 2} y={yS(acc)} width={bw} height={Math.max(0, yS(y0) - yS(acc) - 1)} fill={s.c} />
                    {s.v > 0.07 && <text x={cx(i)} y={(yS(y0) + yS(acc)) / 2 + 4} textAnchor="middle" fontSize={11} fill={s.txt} className="tabular-nums">{pct(s.v)}</text>}
                  </g>
                );
              })}
              <text x={cx(i)} y={H - m.b + 16} textAnchor="middle" fontSize={11} fill={GL.text}>{y.fy_ad}</text>
              <text x={cx(i)} y={H - m.b + 29} textAnchor="middle" fontSize={10} fill={GL.muted}>{y.fy_bs}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Unspent capital by sector (federal era pooled), top sectors highlighted. */
export function SectorBars({ fed, show, hide }: { fed: FedDoc; show: ShowFn; hide: () => void }) {
  const [ref, W] = useWidth();
  const ss = fed.sectors.filter((s) => s.budget > 5);
  const lab = W < 560 ? 130 : 210, m = { l: lab, r: W < 560 ? 70 : 230, t: 4, b: 24 }, row = 22;
  const H = m.t + m.b + row * ss.length;
  const max = Math.max(...ss.map((s) => s.unspent_bn));
  const xS = (v: number) => m.l + (v / max) * (W - m.l - m.r);
  const ticks = [0, 50, 100, 150].filter((t) => t <= max);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Unspent federal capital budget by sector">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xS(t)} x2={xS(t)} y1={m.t} y2={H - m.b} stroke={t === 0 ? GL.text : GL.border} />
            <text x={xS(t)} y={H - m.b + 15} textAnchor="middle" fontSize={11} fill={GL.muted} className="tabular-nums">{t}</text>
          </g>
        ))}
        {ss.map((s, i) => {
          const hi = i < 3, y = m.t + i * row;
          return (
            <g key={s.sector} onMouseMove={(e) => show(e, (
              <>
                <b>{s.sector}</b>
                <br />Budget {bn(s.budget)} · actual {bn(s.actual)}
                <br />Spent: {pct(s.exec_budget)} of budget, {pct(s.exec_revised)} of revised
                <br />Unspent: {bn(s.unspent_bn)}
              </>
            ))} onMouseLeave={hide}>
              <text x={m.l - 8} y={y + row / 2 + 4} textAnchor="end" fontSize={11} fill={GL.text}>{s.sector}</text>
              <rect x={xS(0)} y={y + 3} width={Math.max(1, xS(s.unspent_bn) - xS(0))} height={row - 6} fill={hi ? FED : MUTE} />
              <text x={xS(s.unspent_bn) + 6} y={y + row / 2 + 4} fontSize={11} fill={hi ? FED : MUTE_DARK} className="tabular-nums">
                {W < 560 ? pct(s.exec_budget) : `${pct(s.exec_budget)} spent (${bn(s.budget)} budgeted)`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ProgrammeTable({ fed }: { fed: FedDoc }) {
  return (
    <div className="overflow-x-auto rounded border border-gl-border bg-white">
      <table className="w-full text-sm">
        <caption className="px-3 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-gl-muted">
          Largest unspent federal capital programmes, FY 2078/79–2081/82 pooled (NRs billion)
        </caption>
        <thead>
          <tr className="border-b border-gl-border text-xs text-gl-muted">
            <th className="px-3 py-2 text-left font-semibold">Programme</th>
            <th className="px-3 py-2 text-left font-semibold">Sector</th>
            <th className="px-3 py-2 text-right font-semibold">Budget</th>
            <th className="px-3 py-2 text-right font-semibold">Actual</th>
            <th className="px-3 py-2 text-right font-semibold">Spent</th>
            <th className="px-3 py-2 text-right font-semibold">Unspent</th>
          </tr>
        </thead>
        <tbody>
          {fed.programmes.map((p) => (
            <tr key={p.programme_code} className="border-b border-gl-border last:border-0">
              <td className="px-3 py-1.5">{p.programme_en} <span className="text-xs text-gl-muted">({p.programme_code})</span></td>
              <td className="px-3 py-1.5 text-gl-muted">{p.sector}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{p.budget.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{p.actual.toFixed(1)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.exec_budget)}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: FED }}>{p.unspent_bn.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
