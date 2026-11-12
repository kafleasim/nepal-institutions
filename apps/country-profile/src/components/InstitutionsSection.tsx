import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Country } from "../types";
import { GL } from "../lib/glTokens";
import { useRegimes, type Regime, type RegimeCountry, type RegimeYear } from "../lib/useRegimes";

// Nepal fork: selected V-Dem institutional indicators over time, drawn against V-Dem's regime periods
// (same regime / head-of-government strips as the Regimes section), with benchmark countries.
// Data: public/nepal/institutions.json, written by scripts/export_nepal_institutions.R.

type Props = { focus: Country };

type VarMeta = { tag: string; group: string; scale: "unit" | "latent"; higher: "better" | "worse"; name: string; desc: string };
type Series = { v: (number | null)[]; lo: (number | null)[]; hi: (number | null)[]; n?: number[] };
type Entity = { name: string; kind: "country" | "aggregate"; vars: Record<string, Series> };
type Doc = {
  built: string; source: string; bands: { country: string; aggregate: string };
  y0: number; y1: number; vars: VarMeta[]; series: Record<string, Entity>;
};

const COLORS: Record<string, string> = { IND: GL.orange, BGD: GL.green, WLD: GL.greyDeep };
const FOCUS_COLOR = GL.blue;
const RANGES = [1946, 1990, 2008];
const REG_FILL = ["#ececec", "#dcdcdc"];

let docPromise: Promise<Doc | null> | null = null;
function useDoc() {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  useEffect(() => {
    docPromise ??= fetch("/nepal/institutions.json")
      .then((r) => (r.ok ? (r.json() as Promise<Doc>) : null))
      .catch(() => null);
    let alive = true;
    docPromise.then((d) => alive && setDoc(d));
    return () => { alive = false; };
  }, []);
  return doc;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const mean = (a: (number | null | undefined)[]) => {
  const v = a.filter((x): x is number => x != null && isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const yrs = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
const govHead = (r: RegimeYear) => r.hog ?? r.hos;
type Run = { v: string; y0: number; y1: number };
function headRuns(rows: RegimeYear[]): Run[] {
  const out: Run[] = [];
  for (const r of rows) {
    const v = govHead(r);
    if (!v) continue;
    const last = out[out.length - 1];
    if (last && last.v === v && last.y1 === r.y - 1) last.y1 = r.y;
    else out.push({ v, y0: r.y, y1: r.y });
  }
  return out;
}
function surname(n: string) {
  const p = n.split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : n;
}
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
function niceTicks(lo: number, hi: number, unit: boolean): number[] {
  if (unit) return [0, 0.25, 0.5, 0.75, 1];
  const span = hi - lo;
  const step = span > 4 ? 1 : span > 2 ? 0.5 : 0.25;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(2));
  return out;
}
// Two decimals on both scales; `unit` kept so call sites read clearly if formats diverge later.
const fmt = (v: number | null | undefined, _unit: boolean) => (v == null ? "–" : v.toFixed(2));

type Tip = { x: number; y: number; body: ReactNode } | null;
function TipLayer({ tip }: { tip: Tip }) {
  if (!tip) return null;
  const left = tip.x + 14 + 300 > window.innerWidth ? tip.x - 14 - 300 : tip.x + 14;
  return (
    <div className="pointer-events-none fixed z-50 max-w-[300px] rounded bg-gl-text px-2.5 py-2 text-xs leading-snug text-white shadow"
      style={{ left: Math.max(8, left), top: tip.y + 14 }}>
      {tip.body}
    </div>
  );
}

export function InstitutionsSection({ focus }: Props) {
  const doc = useDoc();
  const { data: reg } = useRegimes(focus.iso3);
  const [tag, setTag] = useState("v2x_accountability");
  const [compare, setCompare] = useState<string>("none");
  const [from, setFrom] = useState(1990);
  const [tip, setTip] = useState<Tip>(null);

  if (doc === undefined) return <p className="mt-12 text-sm text-gl-muted">Loading institutional indicators…</p>;
  if (!doc || !doc.series[focus.iso3]) return null; // only rendered for countries in the export

  const focusE = doc.series[focus.iso3];
  const benchIds = Object.keys(doc.series).filter((k) => k !== focus.iso3);
  const shown = compare === "none" ? [] : compare === "all" ? benchIds : [compare];
  const meta = doc.vars.find((v) => v.tag === tag) ?? doc.vars[0];
  const groups = [...new Set(doc.vars.map((v) => v.group))];
  const show = (ev: { clientX: number; clientY: number }, body: ReactNode) => setTip({ x: ev.clientX, y: ev.clientY, body });
  const hide = () => setTip(null);
  const tabs: { id: string; label: string }[] = [
    { id: "none", label: `${focusE.name} only` },
    ...benchIds.map((id) => ({ id, label: `vs ${doc.series[id].name}` })),
    { id: "all", label: "All benchmarks" },
  ];

  return (
    <section className="mt-12 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Institutions across regimes</h2>
        <p className="mt-1 text-sm text-gl-muted">
          Selected V-Dem indicators of civil society, accountability, corruption and clientelism, plotted year by year
          against the regime periods and heads of government from V-Dem's regime survey. The solid line is the yearly
          estimate; the shaded area is its uncertainty ({doc.bands.country}). Dashed segments show the average score
          within each regime. Benchmarks can be overlaid: for countries the band is again V-Dem's interval; for the
          world average it is the {doc.bands.aggregate.toLowerCase()}.
        </p>
      </div>

      {/* variable picker */}
      <div className="space-y-2 rounded border border-gl-border bg-white px-3 py-3">
        {groups.map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-44 shrink-0 font-semibold uppercase tracking-wide text-gl-muted">{g}</span>
            {doc.vars.filter((v) => v.group === g).map((v) => (
              <button key={v.tag} type="button" onClick={() => setTag(v.tag)}
                className={`rounded border px-2 py-1 ${v.tag === meta.tag ? "border-gl-text bg-gl-text text-white" : "border-gl-border bg-white hover:bg-gl-bg"}`}>
                {v.name.replace(/ \(reversed.*\)$/, "")}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* benchmark tabs + range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Benchmark" className="flex flex-wrap gap-1 text-sm">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={compare === t.id} type="button" onClick={() => setCompare(t.id)}
              className={`rounded-t border-b-2 px-3 py-1.5 ${compare === t.id ? "border-gl-text font-semibold" : "border-transparent text-gl-muted hover:text-gl-text"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gl-muted">From</span>
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setFrom(r)}
              className={`rounded border px-2 py-0.5 ${from === r ? "border-gl-text bg-gl-text text-white" : "border-gl-border bg-white hover:bg-gl-bg"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* what the indicator measures */}
      <div className="rounded border border-gl-border bg-white px-3 py-2 text-sm">
        <p>
          <b>{meta.name}</b> <span className="text-xs text-gl-muted">({meta.tag})</span>{" "}
          <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${meta.higher === "better" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            Higher = {meta.higher}
          </span>
          <span className="ml-2 text-xs text-gl-muted">{meta.scale === "unit" ? "Index from 0 to 1" : "Unbounded scale from V-Dem's measurement model (roughly −3 to +4)"}</span>
        </p>
        <p className="mt-1 text-gl-muted">{meta.desc}</p>
      </div>

      <Legend focus={focusE} shown={shown} doc={doc} />
      <Chart doc={doc} focusId={focus.iso3} shown={shown} meta={meta} reg={reg ?? null} from={from} show={show} hide={hide} />
      {reg && <RegimeTable doc={doc} focusId={focus.iso3} benchIds={benchIds} meta={meta} reg={reg} from={from} />}
      <p className="text-xs text-gl-muted">
        Source: {doc.source}; regime periods from V-Dem's regime survey. Exported {doc.built}.
      </p>
      <TipLayer tip={tip} />
    </section>
  );
}

function Legend({ focus, shown, doc }: { focus: Entity; shown: string[]; doc: Doc }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-gl-border bg-white px-3 py-2 text-xs">
      <Swatch color={FOCUS_COLOR} label={`${focus.name} (yearly estimate)`} />
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: FOCUS_COLOR }} />
        {focus.name}, mean within regime
      </span>
      {shown.map((id) => <Swatch key={id} color={COLORS[id] ?? GL.purple} label={doc.series[id].name} />)}
    </div>
  );
}
function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: color, opacity: 0.25, outline: `2px solid ${color}`, outlineOffset: -2 }} />
      {label}
    </span>
  );
}

function Chart({ doc, focusId, shown, meta, reg, from: fromPref, show, hide }: {
  doc: Doc; focusId: string; shown: string[]; meta: VarMeta; reg: RegimeCountry | null; from: number;
  show: (ev: { clientX: number; clientY: number }, body: ReactNode) => void; hide: () => void;
}) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const unit = meta.scale === "unit";
  const from = Math.max(fromPref, doc.y0);
  const to = doc.y1;
  const idx = (y: number) => y - doc.y0;
  const ids = [focusId, ...shown];
  const ser = (id: string) => doc.series[id].vars[meta.tag];

  const regs: Regime[] = reg ? reg.regimes.filter((r) => r.y1 >= from && r.y0 <= to) : [];
  const regRows = reg ? reg.rows.filter((r) => r.y >= from && r.y <= to) : [];
  const heads = headRuns(regRows);
  const hasReg = regs.length > 0;

  const m = { l: 140, r: 12 };
  const regH = hasReg ? 32 : 0, hosH = hasReg ? 22 : 0, gap = hasReg ? 6 : 0;
  const chartT = hasReg ? regH + hosH + gap * 2 + 6 : 8, chartH = 240, H = chartT + chartH + 26;

  // y domain
  const [ylo, yhi] = useMemo(() => {
    if (unit) return [0, 1];
    let lo = Infinity, hi = -Infinity;
    for (const id of ids) {
      const s = ser(id);
      for (let y = from; y <= to; y++) {
        for (const v of [s.v[idx(y)], s.lo[idx(y)], s.hi[idx(y)]]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    }
    if (!isFinite(lo)) return [-1, 1];
    const pad = (hi - lo) * 0.06;
    return [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, meta.tag, ids.join(","), from]);

  const x = (y: number) => m.l + ((y - from) / (to + 1 - from)) * (W - m.l - m.r);
  const xInv = (px: number) => from + ((px - m.l) / (W - m.l - m.r)) * (to + 1 - from);
  const yS = (v: number) => chartT + chartH - ((v - ylo) / (yhi - ylo)) * chartH;
  const step = Math.max(2, Math.ceil((to - from) / Math.max(3, Math.floor((W - m.l) / 60)) / 5) * 5) || 5;
  const xticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) xticks.push(t);
  const yticks = niceTicks(ylo, yhi, unit);

  const line = (s: Series) => {
    let d = "", pen = false;
    for (let y = from; y <= to; y++) {
      const v = s.v[idx(y)];
      if (v == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(y + 0.5).toFixed(1)},${yS(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const area = (s: Series) => {
    const segs: number[][] = [];
    let cur: number[] = [];
    for (let y = from; y <= to; y++) {
      if (s.lo[idx(y)] == null || s.hi[idx(y)] == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(y);
    }
    if (cur.length) segs.push(cur);
    return segs.map((sg) =>
      "M" + sg.map((y) => `${x(y + 0.5).toFixed(1)},${yS(s.hi[idx(y)]!).toFixed(1)}`).join("L") +
      "L" + [...sg].reverse().map((y) => `${x(y + 0.5).toFixed(1)},${yS(s.lo[idx(y)]!).toFixed(1)}`).join("L") + "Z").join("");
  };
  const regMean = (r: Regime, s: Series) => {
    const vals: (number | null)[] = [];
    for (let y = Math.max(r.y0, doc.y0); y <= Math.min(r.y1, to); y++) vals.push(s.v[idx(y)]);
    return mean(vals);
  };
  const regOfYear = (y: number) => regs.find((r) => y >= r.y0 && y <= r.y1);
  const rowOfYear = (y: number) => regRows.find((r) => r.y === y);
  const fs = ser(focusId);

  return (
    <div ref={ref} className="w-full rounded border border-gl-border bg-white p-2">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img"
        aria-label={`${doc.series[focusId].name}: ${meta.name} over time, by regime`}>
        {hasReg && (
          <>
            <g fontSize={12} fill={GL.text}>
              <text x={m.l - 8} y={regH / 2 + 4} textAnchor="end" fontWeight={600}>Regime</text>
              <text x={m.l - 8} y={regH + gap + hosH / 2 + 4} textAnchor="end" fontWeight={600}>Head of government</text>
            </g>
            {regs.map((r, i) => {
              const x0 = x(Math.max(r.y0, from)), x1 = x(Math.min(r.y1, to) + 1);
              const label = fitText(r.name, x1 - x0 - 10, 12);
              const rm = regMean(r, fs);
              return (
                <g key={`${r.id}-${r.y0}`} onMouseLeave={hide}
                  onMouseMove={(e) => show(e, <><b>{r.name}</b><br />{yrs(r.y0, r.y1)}<br />Mean {meta.name.replace(/ \(reversed.*\)$/, "").toLowerCase()}: {fmt(rm, unit)}</>)}>
                  <rect x={x0 + 1} width={Math.max(1, x1 - x0 - 2)} height={regH} rx={3} fill={REG_FILL[i % 2]} />
                  {label && <text x={x0 + 6} y={regH / 2 + 4} fontSize={12} fill={GL.text} pointerEvents="none">{label}</text>}
                </g>
              );
            })}
            <g transform={`translate(0,${regH + gap})`}>
              {heads.map((h, i) => {
                const x0 = x(h.y0), x1 = x(h.y1 + 1);
                const label = fitText(surname(h.v), x1 - x0 - 6, 11);
                return (
                  <g key={`${h.y0}`} onMouseLeave={hide} onMouseMove={(e) => show(e, <><b>{h.v}</b><br />Head of government, {yrs(h.y0, h.y1)}</>)}>
                    <rect x={x0 + 0.5} width={Math.max(1, x1 - x0 - 1)} height={hosH} rx={2} fill={REG_FILL[i % 2]} />
                    {label && <text x={x0 + 4} y={hosH / 2 + 4} fontSize={11} fill={GL.text} pointerEvents="none">{label}</text>}
                  </g>
                );
              })}
            </g>
          </>
        )}

        {/* axes */}
        {yticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={yS(t)} y2={yS(t)} stroke={t === 0 && !unit ? GL.muted : GL.border} />
            <text x={m.l - 8} y={yS(t) + 4} textAnchor="end" fontSize={11} fill={GL.muted}>{unit ? t.toFixed(2) : t.toFixed(1)}</text>
          </g>
        ))}
        <text x={14} y={chartT + chartH / 2} fontSize={11} fill={GL.muted} textAnchor="middle"
          transform={`rotate(-90 14 ${chartT + chartH / 2})`}>{meta.higher === "better" ? "↑ better" : "↑ worse"}</text>
        {xticks.map((t) => <text key={t} x={x(t + 0.5)} y={chartT + chartH + 18} textAnchor="middle" fontSize={11} fill={GL.muted}>{t}</text>)}
        {regs.filter((r) => r.y0 > from).map((r) => (
          <line key={`b${r.id}-${r.y0}`} x1={x(r.y0)} x2={x(r.y0)} y1={0} y2={chartT + chartH} stroke={GL.muted} strokeWidth={1} />
        ))}

        {/* benchmarks under the focus series */}
        {shown.map((id) => {
          const s = ser(id), c = COLORS[id] ?? GL.purple;
          return (
            <g key={id}>
              <path d={area(s)} fill={c} fillOpacity={0.12} />
              <path d={line(s)} fill="none" stroke={c} strokeWidth={2} />
            </g>
          );
        })}
        <path d={area(fs)} fill={FOCUS_COLOR} fillOpacity={0.15} />
        <path d={line(fs)} fill="none" stroke={FOCUS_COLOR} strokeWidth={2.4} />
        {regs.map((r) => {
          const rm = regMean(r, fs);
          if (rm == null) return null;
          return <line key={`m${r.id}-${r.y0}`} x1={x(Math.max(r.y0, from)) + 2} x2={x(Math.min(r.y1, to) + 1) - 2} y1={yS(rm)} y2={yS(rm)}
            stroke={FOCUS_COLOR} strokeWidth={1.5} strokeDasharray="5 4" />;
        })}

        {hover != null && <line x1={x(hover + 0.5)} x2={x(hover + 0.5)} y1={chartT} y2={chartT + chartH} stroke={GL.muted} />}
        <rect x={m.l} width={W - m.l - m.r} y={chartT} height={chartH} fill="transparent"
          onMouseMove={(e) => {
            const px = e.clientX - e.currentTarget.getBoundingClientRect().left + m.l;
            const yr = Math.floor(xInv(px));
            if (yr < from || yr > to) return;
            setHover(yr);
            const rg = regOfYear(yr), row = rowOfYear(yr);
            show(e, (
              <>
                <b>{yr}</b>{rg && ` · ${rg.name}`}{row && govHead(row) && <><br />{govHead(row)}</>}
                {ids.map((id) => {
                  const s = ser(id), i = idx(yr);
                  return (
                    <span key={id}><br />{doc.series[id].name}: {fmt(s.v[i], unit)}
                      {s.lo[i] != null && <span className="opacity-75"> ({fmt(s.lo[i], unit)} to {fmt(s.hi[i], unit)})</span>}
                    </span>
                  );
                })}
              </>
            ));
          }}
          onMouseLeave={() => { setHover(null); hide(); }} />
      </svg>
    </div>
  );
}

function RegimeTable({ doc, focusId, benchIds, meta, reg, from }: {
  doc: Doc; focusId: string; benchIds: string[]; meta: VarMeta; reg: RegimeCountry; from: number;
}) {
  const unit = meta.scale === "unit";
  const ids = [focusId, ...benchIds];
  const regs = reg.regimes.filter((r) => r.y1 >= from && r.y0 <= doc.y1);
  const avg = (id: string, a: number, b: number) => {
    const s = doc.series[id].vars[meta.tag];
    const v: (number | null)[] = [];
    for (let y = Math.max(a, doc.y0); y <= Math.min(b, doc.y1); y++) v.push(s.v[y - doc.y0]);
    return mean(v);
  };
  return (
    <div className="overflow-x-auto rounded border border-gl-border bg-white">
      <table className="w-full text-sm">
        <caption className="px-3 pt-2 text-left text-xs font-semibold uppercase tracking-wide text-gl-muted">
          Mean {meta.name.replace(/ \(reversed.*\)$/, "").toLowerCase()} within each {doc.series[focusId].name} regime (benchmarks over the same years)
        </caption>
        <thead>
          <tr className="border-b border-gl-border text-left text-xs text-gl-muted">
            <th className="px-3 py-2 font-semibold">Regime</th>
            <th className="px-3 py-2 font-semibold">Years</th>
            {ids.map((id) => <th key={id} className="px-3 py-2 text-right font-semibold">{doc.series[id].name}</th>)}
          </tr>
        </thead>
        <tbody>
          {regs.map((r) => (
            <tr key={`${r.id}-${r.y0}`} className="border-b border-gl-border last:border-0">
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5 tabular-nums text-gl-muted">{yrs(r.y0, r.y1)}</td>
              {ids.map((id) => (
                <td key={id} className={`px-3 py-1.5 text-right tabular-nums ${id === focusId ? "font-semibold" : ""}`}>
                  {fmt(avg(id, r.y0, r.y1), unit)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
