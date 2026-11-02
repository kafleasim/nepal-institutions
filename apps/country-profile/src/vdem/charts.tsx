import { useEffect, useRef, useState, type ReactNode } from "react";
import { GL, GL_PALETTE } from "../lib/glTokens";
import { niceTicks } from "../research/components/Strip";
import { fmt, quantile, shortLabel, type Transform } from "./data";

// Hand-drawn SVG, in the manner of src/research/components: no chart library,
// every chart sized to its container so text stays at its set size.

export const INK = GL.text, MUTED = GL.muted, GRID = "#ececec", BAR = "#b9b9b9";

/** Up to 14 unordered categories: the GL palette, then softer tones of it. */
export const CAT_COLORS = [...GL_PALETTE, "#8fb8d9", "#e3a1a1", "#9fd6a9", "#f0dc8c", "#e8bf8f"];

/** Ordered categories: light to dark blue. */
export function seqColor(i: number, n: number): string {
  return shade(n <= 1 ? 1 : i / (n - 1));
}

/** Light to dark blue for t in [0, 1]. */
export function shade(t: number): string {
  const a = [222, 235, 247], b = [16, 72, 128];
  const c = a.map((x, k) => Math.round(x + (b[k] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Tip = { x: number; y: number; html: ReactNode } | null;

function TipBox({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = tip.x > width * 0.6 ? undefined : tip.x + 12;
  const right = tip.x > width * 0.6 ? width - tip.x + 12 : undefined;
  return <div className="vx-tip" style={{ left, right, top: tip.y + 12 }}>{tip.html}</div>;
}

export type Series = { iso: string; name: string; color: string; values: Float64Array; lo?: Float64Array; hi?: Float64Array };

/** Discrete axis: values and their labels, drawn as ticks in place of numbers. */
export type AxisCats = { v: number; label: string }[];

// ---------------------------------------------------------------------------

export function TimeChart({ years, series, domain, cats, t, year, onYear, height = 300 }: {
  years: number[]; series: Series[]; domain: [number, number]; cats?: AxisCats | null; t: Transform;
  year: number; onYear: (y: number) => void; height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const labelW = cats ? Math.min(190, Math.max(...cats.map((c) => shortLabel(c.label).length)) * 6.6 + 14) : 48;
  const m = { t: 12, r: 14, b: 28, l: labelW };
  const y0 = years[0], y1 = years[years.length - 1];
  const x = (yr: number) => m.l + ((yr - y0) / Math.max(1, y1 - y0)) * (W - m.l - m.r);
  const [d0, d1] = domain[0] === domain[1] ? [domain[0] - 1, domain[1] + 1] : domain;
  const pad = cats ? 0.3 : 0;
  const y = (v: number) => height - m.b - ((v - (d0 - pad)) / (d1 - d0 + 2 * pad)) * (height - m.t - m.b);
  const yt = cats ? cats.map((c) => c.v) : niceTicks(d0, d1, 5);
  const xt = niceTicks(y0, y1, Math.max(3, Math.floor(W / 90))).filter((v) => Number.isInteger(v));

  const path = (vals: Float64Array) => {
    let d = "", on = false;
    vals.forEach((v, i) => {
      if (Number.isNaN(v)) { on = false; return; }
      d += `${on ? "L" : "M"}${x(years[i]).toFixed(1)},${y(v).toFixed(1)}`;
      on = true;
    });
    return d;
  };
  const band = (lo: Float64Array, hi: Float64Array) => {
    const segs: string[] = [];
    let cur: number[] = [];
    const flush = () => {
      if (cur.length) {
        const top = cur.map((i) => `${x(years[i]).toFixed(1)},${y(hi[i]).toFixed(1)}`);
        const bot = cur.slice().reverse().map((i) => `${x(years[i]).toFixed(1)},${y(lo[i]).toFixed(1)}`);
        segs.push(`M${top.join("L")}L${bot.join("L")}Z`);
      }
      cur = [];
    };
    for (let i = 0; i < years.length; i++) { if (Number.isNaN(lo[i]) || Number.isNaN(hi[i])) flush(); else cur.push(i); }
    flush();
    return segs.join("");
  };

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const yr = Math.round(y0 + ((px - m.l) / (W - m.l - m.r)) * (y1 - y0));
    if (yr < y0 || yr > y1) return setTip(null);
    const i = yr - y0;
    const rows = series.map((s) => ({ s, v: s.values[i] })).filter((d) => !Number.isNaN(d.v)).sort((a, b) => b.v - a.v);
    setTip({
      x: px, y: e.clientY - r.top,
      html: (
        <>
          <b>{yr}</b>
          {rows.length === 0 && <div className="dim">No data</div>}
          {rows.map(({ s, v }) => (
            <div key={s.iso}><span className="vx-dot" style={{ background: s.color }} />{s.name}: <b>{fmt(v, t)}</b>
              {cats && <span className="dim"> {shortLabel(cats.find((c) => c.v === Math.round(v))?.label ?? "")}</span>}
              {s.lo && s.hi && !Number.isNaN(s.lo[i]) && <span className="dim"> ({fmt(s.lo[i], t)} to {fmt(s.hi[i], t)})</span>}
            </div>
          ))}
        </>
      ),
    });
  };

  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={height} onMouseLeave={() => setTip(null)}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="vx-tick">
              {cats ? shortLabel(cats.find((c) => c.v === v)?.label ?? String(v)) : fmt(v, t)}
            </text>
          </g>
        ))}
        {d0 < 0 && d1 > 0 && !cats && <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth={1} />}
        {xt.map((v) => <text key={v} x={x(v)} y={height - 8} textAnchor="middle" className="vx-tick">{v}</text>)}
        <line x1={x(year)} x2={x(year)} y1={m.t} y2={height - m.b} stroke={MUTED} strokeDasharray="3 3" />
        {series.map((s) => s.lo && s.hi && <path key={`b${s.iso}`} d={band(s.lo, s.hi)} fill={s.color} opacity={0.14} />)}
        {series.map((s) => <path key={s.iso} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} />)}
        {series.map((s) => {
          const v = s.values[year - y0];
          return Number.isNaN(v) ? null : <circle key={`p${s.iso}`} cx={x(year)} cy={y(v)} r={3.5} fill={s.color} stroke="#fff" />;
        })}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={height - m.t - m.b} fill="transparent" onMouseMove={onMove}
          onClick={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const yr = Math.round(y0 + ((e.clientX - r.left - m.l) / (W - m.l - m.r)) * (y1 - y0));
            if (yr >= y0 && yr <= y1) onYear(yr);
          }} style={{ cursor: "pointer" }} />
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Nominal series over time: one row per country, each year a cell coloured by category. */
export function CategoryStrip({ years, series, cats, colorOf, year, onYear }: {
  years: number[]; series: Series[]; cats: AxisCats; colorOf: (v: number) => string; year: number; onYear: (y: number) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const rowH = 24, m = { t: 6, r: 14, b: 26, l: 130 };
  const H = m.t + m.b + rowH * Math.max(1, series.length);
  const y0 = years[0], y1 = years[years.length - 1];
  const cw = (W - m.l - m.r) / years.length;
  const x = (yr: number) => m.l + (yr - y0) * cw;
  const xt = niceTicks(y0, y1, Math.max(3, Math.floor(W / 90))).filter((v) => Number.isInteger(v));
  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={H} onMouseLeave={() => setTip(null)}>
        {series.map((s, r) => (
          <g key={s.iso}>
            <text x={m.l - 8} y={m.t + r * rowH + rowH / 2 + 4} textAnchor="end" className="vx-tick">{s.name}</text>
            {Array.from(s.values).map((v, i) => Number.isNaN(v) ? null : (
              <rect key={i} x={x(years[i])} y={m.t + r * rowH + 2} width={Math.max(1, cw + 0.3)} height={rowH - 4} fill={colorOf(v)}
                onMouseMove={(e) => {
                  const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - b.left, y: e.clientY - b.top, html: <><b>{s.name}, {years[i]}</b><div>{cats.find((c) => c.v === v)?.label ?? fmt(v)}</div></> });
                }}
                onClick={() => onYear(years[i])} style={{ cursor: "pointer" }} />
            ))}
          </g>
        ))}
        <line x1={x(year) + cw / 2} x2={x(year) + cw / 2} y1={m.t} y2={H - m.b} stroke={INK} strokeDasharray="3 3" />
        {xt.map((v) => <text key={v} x={x(v) + cw / 2} y={H - 8} textAnchor="middle" className="vx-tick">{v}</text>)}
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export type Obs = { iso: string; name: string; v: number };
export type Marker = { iso: string; name: string; color: string; v: number };

/**
 * Distribution across countries (or country-years). Discrete versions get one
 * bar per coded value, labelled with its response option; continuous ones get
 * equal-width bins over a fixed domain so the axis does not move with the year.
 */
export function Histogram({ obs, domain, cats, discrete, markers, t, unit = "countries", height = 240, refLines, catColor }: {
  obs: Obs[]; domain: [number, number]; cats?: AxisCats | null; discrete: boolean; markers: Marker[]; t: Transform;
  unit?: string; height?: number; refLines?: { v: number; label: string }[]; catColor?: (v: number) => string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  if (!obs.length) return <p className="stat">No data for this selection.</p>;

  type Bin = { x0: number; x1: number; label?: string; items: Obs[]; v?: number };
  let bins: Bin[];
  if (discrete) {
    const vals = cats?.length ? cats.map((c) => c.v) : Array.from(new Set(obs.map((o) => o.v))).sort((a, b) => a - b);
    bins = vals.map((v, i) => ({ x0: i, x1: i + 1, v, label: cats?.find((c) => c.v === v)?.label, items: obs.filter((o) => o.v === v) }));
  } else {
    const [a, b] = domain[0] === domain[1] ? [domain[0] - 0.5, domain[1] + 0.5] : domain;
    const nb = 30, w = (b - a) / nb;
    bins = Array.from({ length: nb }, (_, i) => ({ x0: a + i * w, x1: a + (i + 1) * w, items: [] as Obs[] }));
    for (const o of obs) bins[Math.min(nb - 1, Math.max(0, Math.floor((o.v - a) / w)))].items.push(o);
  }
  const rotate = discrete && bins.length > 6;
  const m = { t: 22, r: 14, b: rotate ? 96 : 44, l: 48 };
  const xa = bins[0].x0, xb = bins[bins.length - 1].x1;
  const x = (v: number) => m.l + ((v - xa) / (xb - xa)) * (W - m.l - m.r);
  const maxN = Math.max(1, ...bins.map((b) => b.items.length));
  const y = (n: number) => height - m.b - (n / maxN) * (height - m.t - m.b);
  const yt = niceTicks(0, maxN, 3).filter((v) => Number.isInteger(v));
  const binOf = (v: number) => discrete ? bins.findIndex((b) => b.v === v) : bins.findIndex((b, i) => v >= b.x0 && (v < b.x1 || i === bins.length - 1));
  const xOfValue = (v: number) => {
    if (discrete) { const i = binOf(v); return i < 0 ? null : x(bins[i].x0 + 0.5); }
    return x(Math.min(xb, Math.max(xa, v)));
  };

  // Marker labels sit in rows above the bars; a label takes the first row
  // where it does not collide with one already placed.
  const placed: { mk: Marker; px: number; row: number }[] = [];
  markers.slice().sort((a, b) => a.v - b.v).forEach((mk) => {
    const px = xOfValue(mk.v);
    if (px == null) return;
    const w = mk.name.length * 7 + 10;
    let row = 0;
    while (placed.some((p) => p.row === row && Math.abs(p.px - px) < Math.max(w, p.mk.name.length * 7 + 10))) row++;
    placed.push({ mk, px, row });
  });
  const labelRows = placed.length ? Math.max(...placed.map((p) => p.row)) + 1 : 0;
  m.t += labelRows * 15;

  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={height} onMouseLeave={() => setTip(null)}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="vx-tick">{v.toLocaleString()}</text>
          </g>
        ))}
        {bins.map((b, i) => {
          const hit = markers.some((mk) => binOf(mk.v) === i);
          const fill = catColor && b.v != null ? catColor(b.v) : hit ? GL.blue : BAR;
          return (
            <rect key={i} x={x(b.x0) + 1} width={Math.max(1, x(b.x1) - x(b.x0) - 2)} y={y(b.items.length)} height={y(0) - y(b.items.length)}
              fill={fill} opacity={catColor ? (hit ? 1 : 0.8) : 1} rx={1.5}
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                const names = b.items.slice().sort((p, q) => p.name.localeCompare(q.name));
                setTip({
                  x: e.clientX - r.left, y: e.clientY - r.top,
                  html: (
                    <>
                      <b>{discrete ? (b.label ?? fmt(b.v)) : `${fmt(b.x0, t)} to ${fmt(b.x1, t)}`}</b>
                      <div>{b.items.length.toLocaleString()} {unit}</div>
                      {unit === "countries" && names.length > 0 && (
                        <div className="dim vx-tip-list">{names.slice(0, 30).map((o) => o.name).join(", ")}{names.length > 30 ? ` and ${names.length - 30} more` : ""}</div>
                      )}
                    </>
                  ),
                });
              }} />
          );
        })}
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={INK} />
        {discrete
          ? bins.map((b, i) => {
              const cx = x(b.x0 + 0.5);
              const lab = b.label ? shortLabel(b.label, rotate ? 22 : 18) : fmt(b.v);
              return rotate
                ? <text key={i} transform={`translate(${cx + 4},${height - m.b + 12}) rotate(-40)`} textAnchor="end" className="vx-tick">{lab}</text>
                : <text key={i} x={cx} y={height - m.b + 16} textAnchor="middle" className="vx-tick">{lab}</text>;
            })
          : niceTicks(xa, xb, Math.max(3, Math.floor(W / 80))).map((v) => <text key={v} x={x(v)} y={height - m.b + 16} textAnchor="middle" className="vx-tick">{fmt(v, t)}</text>)}
        {refLines?.map((r) => r.v >= xa && r.v <= xb && (
          <g key={r.label}>
            <line x1={x(r.v)} x2={x(r.v)} y1={m.t - 4} y2={y(0)} stroke={MUTED} strokeDasharray="4 3" />
            <text x={x(r.v) + 3} y={m.t - 8} className="vx-tick">{r.label}</text>
          </g>
        ))}
        {placed.map(({ mk, px, row }) => (
          <g key={mk.iso}>
            <line x1={px} x2={px} y1={m.t - 6 - (labelRows - 1 - row) * 15} y2={y(0)} stroke={mk.color} strokeWidth={2} />
            <text x={px + 4} y={m.t - 8 - (labelRows - 1 - row) * 15} className="vx-tick" fill={mk.color} style={{ fontWeight: 600, paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}>{mk.name}</text>
          </g>
        ))}
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * All countries over all years. Continuous: the 10th-90th and 25th-75th
 * percentile bands and the median across countries, each year, with the
 * selected countries on top. Discrete: the share of countries in each coded
 * value, stacked to 100% each year.
 */
export function DistOverTime({ years, all, series, domain, cats, discrete, colorOf, t, year, onYear, height = 280 }: {
  years: number[]; all: Float64Array[]; series: Series[]; domain: [number, number]; cats?: AxisCats | null; discrete: boolean;
  colorOf: (v: number) => string; t: Transform; year: number; onYear: (y: number) => void; height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const m = { t: 12, r: 14, b: 28, l: 48 };
  const y0 = years[0], y1 = years[years.length - 1];
  const x = (yr: number) => m.l + ((yr - y0) / Math.max(1, y1 - y0)) * (W - m.l - m.r);
  const xt = niceTicks(y0, y1, Math.max(3, Math.floor(W / 90))).filter((v) => Number.isInteger(v));
  const cols = years.map((_, i) => all.map((a) => a[i]).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b));

  const hover = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const yr = Math.round(y0 + ((px - m.l) / (W - m.l - m.r)) * (y1 - y0));
    if (yr < y0 || yr > y1) return setTip(null);
    const c = cols[yr - y0];
    let body: ReactNode;
    if (!c.length) body = <div className="dim">No data</div>;
    else if (discrete) {
      const vals = cats?.length ? cats.map((k) => k.v) : Array.from(new Set(c));
      body = vals.map((v) => {
        const n = c.filter((z) => z === v).length;
        return n ? <div key={v}><span className="vx-dot" style={{ background: colorOf(v) }} />{shortLabel(cats?.find((k) => k.v === v)?.label ?? fmt(v), 40)}: <b>{n}</b> ({Math.round((100 * n) / c.length)}%)</div> : null;
      });
    } else {
      body = <>
        <div>90th percentile <b>{fmt(quantile(c, 0.9), t)}</b></div>
        <div>75th <b>{fmt(quantile(c, 0.75), t)}</b></div>
        <div>Median <b>{fmt(quantile(c, 0.5), t)}</b></div>
        <div>25th <b>{fmt(quantile(c, 0.25), t)}</b></div>
        <div>10th <b>{fmt(quantile(c, 0.1), t)}</b></div>
      </>;
    }
    setTip({ x: px, y: e.clientY - r.top, html: <><b>{yr}</b> · {c.length} countries{body}</> });
  };

  let body: ReactNode;
  if (discrete) {
    const vals = cats?.length ? cats.map((k) => k.v) : Array.from(new Set(cols.flat())).sort((a, b) => a - b);
    const y = (s: number) => height - m.b - s * (height - m.t - m.b);
    const bw = Math.max(1, (W - m.l - m.r) / years.length + 0.3);
    body = (
      <>
        {[0, 0.25, 0.5, 0.75, 1].map((s) => (
          <g key={s}><line x1={m.l} x2={W - m.r} y1={y(s)} y2={y(s)} stroke={GRID} /><text x={m.l - 6} y={y(s) + 4} textAnchor="end" className="vx-tick">{s * 100}%</text></g>
        ))}
        {cols.map((c, i) => {
          if (!c.length) return null;
          let acc = 0;
          return vals.map((v) => {
            const n = c.filter((z) => z === v).length;
            if (!n) return null;
            const s0 = acc; acc += n / c.length;
            return <rect key={`${i}-${v}`} x={x(years[i]) - bw / 2} width={bw} y={y(acc)} height={y(s0) - y(acc)} fill={colorOf(v)} />;
          });
        })}
      </>
    );
  } else {
    const [d0, d1] = domain[0] === domain[1] ? [domain[0] - 1, domain[1] + 1] : domain;
    const y = (v: number) => height - m.b - ((v - d0) / (d1 - d0)) * (height - m.t - m.b);
    const area = (p: number, q: number) => {
      const idx = cols.map((c, i) => (c.length >= 3 ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return "";
      const top = idx.map((i) => `${x(years[i]).toFixed(1)},${y(quantile(cols[i], q)).toFixed(1)}`);
      const bot = idx.slice().reverse().map((i) => `${x(years[i]).toFixed(1)},${y(quantile(cols[i], p)).toFixed(1)}`);
      return `M${top.join("L")}L${bot.join("L")}Z`;
    };
    const line = (vals: (number | null)[]) => {
      let d = "", on = false;
      vals.forEach((v, i) => { if (v == null || Number.isNaN(v)) { on = false; return; } d += `${on ? "L" : "M"}${x(years[i]).toFixed(1)},${y(v).toFixed(1)}`; on = true; });
      return d;
    };
    body = (
      <>
        {niceTicks(d0, d1, 5).map((v) => (
          <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="vx-tick">{fmt(v, t)}</text></g>
        ))}
        {d0 < 0 && d1 > 0 && <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke={INK} />}
        <path d={area(0.1, 0.9)} fill={MUTED} opacity={0.16} />
        <path d={area(0.25, 0.75)} fill={MUTED} opacity={0.24} />
        <path d={line(cols.map((c) => (c.length >= 3 ? quantile(c, 0.5) : null)))} fill="none" stroke={MUTED} strokeWidth={1.5} />
        {series.map((s) => <path key={s.iso} d={line(Array.from(s.values))} fill="none" stroke={s.color} strokeWidth={2} />)}
      </>
    );
  }

  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={height} onMouseLeave={() => setTip(null)}>
        {body}
        {xt.map((v) => <text key={v} x={x(v)} y={height - 8} textAnchor="middle" className="vx-tick">{v}</text>)}
        <line x1={x(year)} x2={x(year)} y1={m.t} y2={height - m.b} stroke={INK} strokeDasharray="3 3" />
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={height - m.t - m.b} fill="transparent" onMouseMove={hover}
          onClick={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const yr = Math.round(y0 + ((e.clientX - r.left - m.l) / (W - m.l - m.r)) * (y1 - y0));
            if (yr >= y0 && yr <= y1) onYear(yr);
          }} style={{ cursor: "pointer" }} />
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Multiple-selection question for one country: options down, years across, cell shade = share of coders ticking it. */
export function OptionHeat({ years, options, get, year, onYear }: {
  years: number[]; options: { k: string; label: string }[]; get: (k: string) => Float64Array | undefined; year: number; onYear: (y: number) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const rowH = 20, m = { t: 6, r: 14, b: 26, l: Math.min(300, Math.max(...options.map((o) => shortLabel(o.label, 44).length)) * 6.4 + 12) };
  const H = m.t + m.b + rowH * options.length;
  const live = years.map((_, i) => options.some((o) => !Number.isNaN(get(o.k)?.[i] ?? NaN)));
  const first = live.indexOf(true), last = live.lastIndexOf(true);
  if (first < 0) return <p className="stat">No data for this country.</p>;
  const ys = years.slice(first, last + 1);
  const cw = (W - m.l - m.r) / ys.length;
  const x = (yr: number) => m.l + (yr - ys[0]) * cw;
  const xt = niceTicks(ys[0], ys[ys.length - 1], Math.max(3, Math.floor(W / 90))).filter((v) => Number.isInteger(v));
  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={H} onMouseLeave={() => setTip(null)}>
        {options.map((o, r) => {
          const a = get(o.k);
          return (
            <g key={o.k}>
              <text x={m.l - 8} y={m.t + r * rowH + rowH / 2 + 4} textAnchor="end" className="vx-tick"><title>{o.label}</title>{shortLabel(o.label, 44)}</text>
              {a && ys.map((yr, j) => {
                const v = a[yr - years[0]];
                if (Number.isNaN(v)) return null;
                return (
                  <rect key={yr} x={x(yr)} y={m.t + r * rowH + 1} width={Math.max(1, cw + 0.3)} height={rowH - 2} fill={v > 0 ? shade(0.12 + 0.88 * v) : "#f7f7f7"}
                    onMouseMove={(e) => {
                      const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setTip({ x: e.clientX - b.left, y: e.clientY - b.top, html: <><b>{yr}</b><div>{o.label}</div><div>{Math.round(v * 100)}% of coders ticked this</div></> });
                    }}
                    onClick={() => onYear(yr)} style={{ cursor: "pointer" }} data-j={j} />
                );
              })}
            </g>
          );
        })}
        {year >= ys[0] && year <= ys[ys.length - 1] && <line x1={x(year) + cw / 2} x2={x(year) + cw / 2} y1={m.t} y2={H - m.b} stroke={INK} strokeDasharray="3 3" />}
        {xt.map((v) => <text key={v} x={x(v) + cw / 2} y={H - 8} textAnchor="middle" className="vx-tick">{v}</text>)}
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}

/** Multiple-selection question, one year, all countries: per option, how many countries' coders mostly ticked it. */
export function OptionBars({ options, rows, markers }: {
  options: { k: string; label: string }[];
  rows: { k: string; shares: Obs[] }[];
  markers: { iso: string; name: string; color: string; shares: Record<string, number> }[];
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const rowH = 24, m = { t: 22, r: 50, b: 8, l: Math.min(300, Math.max(...options.map((o) => shortLabel(o.label, 44).length)) * 6.4 + 12) };
  const H = m.t + m.b + rowH * options.length;
  const total = Math.max(1, ...rows.map((r) => r.shares.length));
  const x = (s: number) => m.l + s * (W - m.l - m.r);
  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={H} onMouseLeave={() => setTip(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((s) => (
          <g key={s}><line x1={x(s)} x2={x(s)} y1={m.t - 4} y2={H - m.b} stroke={GRID} /><text x={x(s)} y={m.t - 8} textAnchor="middle" className="vx-tick">{s * 100}%</text></g>
        ))}
        {options.map((o, r) => {
          const row = rows.find((q) => q.k === o.k);
          const yes = (row?.shares ?? []).filter((d) => d.v >= 0.5);
          const share = yes.length / total;
          const cy = m.t + r * rowH + rowH / 2;
          return (
            <g key={o.k}>
              <text x={m.l - 8} y={cy + 4} textAnchor="end" className="vx-tick"><title>{o.label}</title>{shortLabel(o.label, 44)}</text>
              <rect x={x(0)} y={cy - 7} width={x(share) - x(0)} height={14} fill={BAR} rx={1.5}
                onMouseMove={(e) => {
                  const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  const names = yes.map((d) => d.name).sort();
                  setTip({ x: e.clientX - b.left, y: e.clientY - b.top, html: <><b>{o.label}</b><div>{yes.length} of {total} countries (at least half of coders ticked it)</div><div className="dim vx-tip-list">{names.slice(0, 40).join(", ")}{names.length > 40 ? ` and ${names.length - 40} more` : ""}</div></> });
                }} />
              <text x={x(share) + 4} y={cy + 4} className="vx-tick">{yes.length}</text>
              {markers.map((mk) => {
                const v = mk.shares[o.k];
                return v == null || Number.isNaN(v) ? null : (
                  <circle key={mk.iso} cx={x(v)} cy={cy} r={4.5} fill={mk.color} stroke="#fff" strokeWidth={1}
                    onMouseMove={(e) => {
                      const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setTip({ x: e.clientX - b.left, y: e.clientY - b.top, html: <><b>{mk.name}</b><div>{o.label}</div><div>{Math.round(v * 100)}% of coders ticked this</div></> });
                    }} />
                );
              })}
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Two versions of the same variable against each other, every country in one year. */
export function VersionScatter({ pts, xLabel, yLabel, cats }: {
  pts: { iso: string; name: string; x: number; y: number; color?: string }[]; xLabel: string; yLabel: string; cats?: AxisCats | null;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(400);
  const [tip, setTip] = useState<Tip>(null);
  if (pts.length < 3) return <p className="stat">Too few countries with both versions this year.</p>;
  const H = 300, m = { t: 12, r: 14, b: 40, l: 52 };
  const ext = (f: (p: (typeof pts)[number]) => number) => { const v = pts.map(f); const a = Math.min(...v), b = Math.max(...v); const p = (b - a) * 0.05 || 0.5; return [a - p, b + p]; };
  const [xa, xb] = ext((p) => p.x), [ya, yb] = ext((p) => p.y);
  const x = (v: number) => m.l + ((v - xa) / (xb - xa)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - ya) / (yb - ya)) * (H - m.t - m.b);
  const xt = cats?.length ? cats.map((c) => c.v).filter((v) => v >= xa && v <= xb) : niceTicks(xa, xb, 5);
  const ordered = pts.slice().sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0));
  return (
    <div ref={ref} className="vx-chart">
      <svg width={W} height={H} onMouseLeave={() => setTip(null)}>
        {niceTicks(ya, yb, 5).map((v) => <g key={v}><line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} /><text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="vx-tick">{fmt(v)}</text></g>)}
        {xt.map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke={GRID} /><text x={x(v)} y={H - m.b + 16} textAnchor="middle" className="vx-tick">{fmt(v)}</text></g>)}
        {ordered.map((p) => (
          <circle key={p.iso} cx={x(p.x)} cy={y(p.y)} r={p.color ? 5 : 3.5} fill={p.color ?? BAR} stroke={p.color ? "#fff" : "none"} opacity={p.color ? 1 : 0.8}
            onMouseMove={(e) => {
              const b = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setTip({ x: e.clientX - b.left, y: e.clientY - b.top, html: <><b>{p.name}</b><div>{xLabel}: {fmt(p.x)}</div><div>{yLabel}: {fmt(p.y)}</div></> });
            }} />
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="vx-axis">{xLabel}</text>
        <text transform={`translate(13,${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" className="vx-axis">{yLabel}</text>
      </svg>
      <TipBox tip={tip} width={W} />
    </div>
  );
}
