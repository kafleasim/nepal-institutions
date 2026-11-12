import { useEffect, useRef, useState, type ReactNode } from "react";
import { GL } from "../lib/glTokens";

// Nepal fork: local-government budget execution, FY 2017/18 onward.
// Data: public/nepal/local_capex.json, written by scripts/export_local_capex.R from the OAG audit panel.

type Year = {
  year: number; fy_bs: string; fy_ad: string; n: number; n_cap: number;
  available_bn: number; income_bn: number; carryover_bn: number; spent_bn: number; capital_bn: number;
  current_bn: number; remaining_bn: number;
  unspent: number; unspent_med: number; unspent_p25: number; unspent_p75: number;
  cap_unspent: number; cap_unspent_med: number; cap_unspent_p25: number; cap_unspent_p75: number;
  cap_share_spent: number; flag_duplicate: boolean;
};
type Doc = { built: string; source: string; units: string; n_units: number; duplicate_note?: string; years: Year[] };

const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
const bn = (v: number | null | undefined) => (v == null ? "–" : `NRs ${v.toFixed(1)} bn`);
const NAT = GL.blue, UNSPENT = GL.highlight;
/** "13–19%" from the national series, so titles stay true when the data changes. */
const range = (ys: { unspent: number; cap_unspent: number }[], k: "unspent" | "cap_unspent") => {
  const v = ys.map((y) => y[k]).filter((x) => x != null);
  return `${Math.round(Math.min(...v) * 100)}–${Math.round(Math.max(...v) * 100)}%`;
};

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

type Tip = { x: number; y: number; body: ReactNode } | null;
function TipLayer({ tip }: { tip: Tip }) {
  if (!tip) return null;
  const left = tip.x + 14 + 300 > window.innerWidth ? tip.x - 14 - 300 : tip.x + 14;
  return (
    <div className="pointer-events-none fixed z-50 max-w-[300px] rounded bg-gl-text px-2.5 py-2 text-xs leading-snug text-white shadow"
      style={{ left: Math.max(8, left), top: tip.y + 14 }}>{tip.body}</div>
  );
}
type ShowFn = (ev: { clientX: number; clientY: number }, body: ReactNode) => void;

export function CapexPage() {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined);
  const [tip, setTip] = useState<Tip>(null);
  useEffect(() => {
    fetch("/nepal/local_capex.json").then((r) => (r.ok ? r.json() : null)).then(setDoc).catch(() => setDoc(null));
  }, []);
  const show: ShowFn = (ev, body) => setTip({ x: ev.clientX, y: ev.clientY, body });
  const hide = () => setTip(null);

  if (doc === undefined) return <p className="p-6 text-sm text-gl-muted">Loading…</p>;
  if (!doc) return <p className="p-6 text-sm text-gl-muted">Capital expenditure data could not be loaded.</p>;
  const ys = doc.years;
  const last = ys[ys.length - 1];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gl-blue">Nepal · Local governments</p>
        <h1 className="mt-1 text-2xl font-semibold">Capital expenditure: how much local budget goes unspent?</h1>
        <p className="mt-2 max-w-3xl text-sm text-gl-muted">
          Nepal's {doc.n_units} local governments (municipalities and rural municipalities) have managed their own budgets
          since the first local elections in 2017. Their audited accounts report income, spending and the balance left
          at year end, but not how much of the <em>capital</em> budget went unused. We estimate it from the unspent
          balance, assuming recurrent items such as salaries are largely spent, so that what remains is mostly capital.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Budget left unspent, FY ${last.fy_ad}`} value={pct(last.unspent)} sub={`${bn(last.remaining_bn)} of ${bn(last.available_bn)} available`} color={UNSPENT} />
        <Kpi label="Implied share of capital budget unspent" value={pct(last.cap_unspent)} sub={`Median local government: ${pct(last.cap_unspent_med)}`} color={UNSPENT} />
        <Kpi label="Capital spending actually made" value={bn(last.capital_bn)} sub={`${pct(last.cap_share_spent)} of all spending`} color={NAT} />
        <Kpi label={`Capital share of spending, ${ys[0].fy_ad} → ${last.fy_ad}`} value={`${pct(ys[0].cap_share_spent)} → ${pct(last.cap_share_spent)}`} sub="Capital as a share of all local spending" color={NAT} />
      </div>

      {doc.duplicate_note && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Data under review:</b> {doc.duplicate_note} These years are shaded and drawn with hollow markers below.
        </div>
      )}

      <Figure label="Figure 1" title={`Local governments leave ${range(ys, "unspent")} of their available budget unspent each year.`}
        subtitle="Remaining balance as a share of available funds (income plus carry-over from the previous year), by fiscal year"
        source={doc.source}>
        <ShareChart ys={ys} v="unspent" med="unspent_med" lo="unspent_p25" hi="unspent_p75" show={show} hide={hide}
          name="Unspent share of budget" />
      </Figure>

      <Figure label="Figure 2" title={`If the unspent balance is capital, ${range(ys, "cap_unspent")} of the capital budget goes unused.`}
        subtitle="Implied unspent capital share = remaining balance ÷ (capital spending + remaining balance)"
        source={`${doc.source}. Assumes the whole unspent balance belonged to the capital budget.`}>
        <ShareChart ys={ys} v="cap_unspent" med="cap_unspent_med" lo="cap_unspent_p25" hi="cap_unspent_p75" show={show} hide={hide}
          name="Implied unspent capital share" />
      </Figure>

      <Figure label="Figure 3" title="Capital spent versus left unspent, in rupees."
        subtitle={`Capital spending and unspent balance summed across local governments (${doc.units})`}
        source={doc.source}>
        <StackChart ys={ys} show={show} hide={hide} />
      </Figure>

      <DataTable ys={ys} />

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Method and caveats</h2>
        <ul className="list-disc space-y-1 pl-5 text-gl-muted">
          <li><b>Available funds</b> = the year's total income (federal and provincial transfers, revenue sharing and own revenue) plus the balance carried over from the previous year. The accounts satisfy: available − total spending = remaining balance.</li>
          <li><b>Unspent share</b> = remaining balance ÷ available funds. The <b>national</b> line pools all local governments (equivalently, weights by budget size); the <b>median</b> line and the band (middle 50% of local governments) describe the typical unit.</li>
          <li><b>Implied unspent capital share</b> assumes the entire remaining balance was capital budget. It is an upper-bound style estimate: if some recurrent budget also went unspent, the true capital figure is lower.</li>
          <li>Fiscal years run mid-July to mid-July; FY 2074/75 = 2017/18. Amounts are nominal (not inflation-adjusted). Local governments with missing or zero income in a year are excluded from that year (count shown in the table).</li>
          <li>Coverage begins in FY 2017/18 because local governments under the 2015 constitution were first elected in 2017.</li>
        </ul>
        <p className="text-xs text-gl-muted">Data exported {doc.built}.</p>
      </section>
      <TipLayer tip={tip} />
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded border border-gl-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gl-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color }}>{value}</p>
      <p className="mt-1 text-xs text-gl-muted">{sub}</p>
    </div>
  );
}

function Figure({ label, title, subtitle, source, children }: { label: string; title: string; subtitle: string; source: string; children: ReactNode }) {
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

type ShareKey = "unspent" | "unspent_med" | "unspent_p25" | "unspent_p75" | "cap_unspent" | "cap_unspent_med" | "cap_unspent_p25" | "cap_unspent_p75";

function frame(W: number, n: number) {
  const m = { l: 56, r: 16, t: 28, b: 34 }, H = 300;
  const band = (W - m.l - m.r) / n;
  const cx = (i: number) => m.l + band * (i + 0.5);
  return { m, H, band, cx };
}

function DupShade({ ys, cx, band, top, bottom }: { ys: Year[]; cx: (i: number) => number; band: number; top: number; bottom: number }) {
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id="dup-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={GL.border} strokeWidth="3" />
        </pattern>
      </defs>
      {ys.map((y, i) => y.flag_duplicate && (
        <g key={y.year}>
          <rect x={cx(i) - band / 2} y={top} width={band} height={bottom - top} fill="url(#dup-hatch)" opacity={0.6} />
          <text x={cx(i)} y={top - 6} textAnchor="middle" fontSize={10} fill={GL.muted}>under review</text>
        </g>
      ))}
    </g>
  );
}

function ShareChart({ ys, v, med, lo, hi, name, show, hide }: {
  ys: Year[]; v: ShareKey; med: ShareKey; lo: ShareKey; hi: ShareKey; name: string; show: ShowFn; hide: () => void;
}) {
  const [ref, W] = useWidth();
  const { m, H, band, cx } = frame(W, ys.length);
  const max = Math.min(1, Math.ceil(Math.max(...ys.map((y) => Math.max(y[v], y[hi]))) * 10) / 10 + 0.05);
  const yS = (p: number) => H - m.b - (p / max) * (H - m.t - m.b);
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += max > 0.5 ? 0.1 : 0.05) ticks.push(+t.toFixed(2));
  const path = (k: ShareKey) => ys.map((y, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${yS(y[k]).toFixed(1)}`).join("");
  const area = "M" + ys.map((y, i) => `${cx(i)},${yS(y[hi])}`).join("L") + "L" + [...ys].reverse().map((y, j) => `${cx(ys.length - 1 - j)},${yS(y[lo])}`).join("L") + "Z";

  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: NAT }} />National (pooled)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: NAT }} />Median local government</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: NAT, opacity: 0.15 }} />Middle 50% of local governments</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={`${name} by fiscal year`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={yS(t)} y2={yS(t)} stroke={t === 0 ? GL.text : GL.border} />
            <text x={m.l - 8} y={yS(t) + 4} textAnchor="end" fontSize={11} fill={GL.muted} className="tabular-nums">{pct(t)}</text>
          </g>
        ))}
        <DupShade ys={ys} cx={cx} band={band} top={m.t} bottom={H - m.b} />
        <path d={area} fill={NAT} fillOpacity={0.15} />
        <path d={path(med)} fill="none" stroke={NAT} strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path(v)} fill="none" stroke={NAT} strokeWidth={2.4} strokeLinejoin="round" />
        {ys.map((y, i) => (
          <g key={y.year}>
            <circle cx={cx(i)} cy={yS(y[v])} r={4} fill={y.flag_duplicate ? "#fff" : NAT} stroke={NAT} strokeWidth={1.5} />
            <text x={cx(i)} y={yS(y[v]) - 9} textAnchor="middle" fontSize={11} fontWeight={600} fill={GL.text} className="tabular-nums">{pct(y[v])}</text>
            <text x={cx(i)} y={H - m.b + 16} textAnchor="middle" fontSize={11} fill={GL.text}>{y.fy_ad}</text>
            <text x={cx(i)} y={H - m.b + 29} textAnchor="middle" fontSize={10} fill={GL.muted}>{y.fy_bs}</text>
            <rect x={cx(i) - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent"
              onMouseMove={(e) => show(e, (
                <>
                  <b>FY {y.fy_ad}</b> ({y.fy_bs}){y.flag_duplicate && <> · <i>under review</i></>}
                  <br />{name}: {pct(y[v], 1)} national
                  <br />Median local government: {pct(y[med], 1)}
                  <br /><span className="opacity-75">Middle 50%: {pct(y[lo], 1)} to {pct(y[hi], 1)} · {y.n} local governments</span>
                </>
              ))} onMouseLeave={hide} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function StackChart({ ys, show, hide }: { ys: Year[]; show: ShowFn; hide: () => void }) {
  const [ref, W] = useWidth();
  const { m, H, band, cx } = frame(W, ys.length);
  const tot = (y: Year) => y.capital_bn + y.remaining_bn;
  const max = Math.ceil(Math.max(...ys.map(tot)) / 50) * 50;
  const yS = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += 50) ticks.push(t);
  const bw = Math.min(56, band * 0.6);
  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: NAT }} />Capital spending made</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: UNSPENT }} />Unspent balance (assumed capital)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Capital spent and unspent balance by fiscal year">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={yS(t)} y2={yS(t)} stroke={t === 0 ? GL.text : GL.border} />
            <text x={m.l - 8} y={yS(t) + 4} textAnchor="end" fontSize={11} fill={GL.muted} className="tabular-nums">{t}</text>
          </g>
        ))}
        <text x={14} y={(m.t + H - m.b) / 2} fontSize={11} fill={GL.muted} textAnchor="middle" transform={`rotate(-90 14 ${(m.t + H - m.b) / 2})`}>NRs billion</text>
        <DupShade ys={ys} cx={cx} band={band} top={m.t} bottom={H - m.b} />
        {ys.map((y, i) => (
          <g key={y.year} onMouseMove={(e) => show(e, (
            <>
              <b>FY {y.fy_ad}</b> ({y.fy_bs}){y.flag_duplicate && <> · <i>under review</i></>}
              <br />Capital spending: {bn(y.capital_bn)}
              <br />Unspent balance: {bn(y.remaining_bn)}
              <br />Implied capital budget: {bn(tot(y))}
              <br /><span className="opacity-75">Total spending: {bn(y.spent_bn)} · available funds: {bn(y.available_bn)}</span>
            </>
          ))} onMouseLeave={hide}>
            <rect x={cx(i) - bw / 2} y={yS(y.capital_bn)} width={bw} height={yS(0) - yS(y.capital_bn)} fill={NAT} opacity={y.flag_duplicate ? 0.55 : 1} />
            <rect x={cx(i) - bw / 2} y={yS(tot(y))} width={bw} height={yS(y.capital_bn) - yS(tot(y)) - 1} fill={UNSPENT} opacity={y.flag_duplicate ? 0.55 : 1} />
            <text x={cx(i)} y={yS(tot(y)) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={GL.text} className="tabular-nums">{tot(y).toFixed(0)}</text>
            <text x={cx(i)} y={H - m.b + 16} textAnchor="middle" fontSize={11} fill={GL.text}>{y.fy_ad}</text>
            <text x={cx(i)} y={H - m.b + 29} textAnchor="middle" fontSize={10} fill={GL.muted}>{y.fy_bs}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DataTable({ ys }: { ys: Year[] }) {
  const cols: [string, (y: Year) => string][] = [
    ["Local govts", (y) => String(y.n)],
    ["Available (bn)", (y) => y.available_bn.toFixed(1)],
    ["Total spent (bn)", (y) => y.spent_bn.toFixed(1)],
    ["Capital spent (bn)", (y) => y.capital_bn.toFixed(1)],
    ["Unspent (bn)", (y) => y.remaining_bn.toFixed(1)],
    ["Unspent share", (y) => pct(y.unspent, 1)],
    ["Median unspent", (y) => pct(y.unspent_med, 1)],
    ["Implied unspent capital", (y) => pct(y.cap_unspent, 1)],
    ["Capital share of spending", (y) => pct(y.cap_share_spent, 1)],
  ];
  return (
    <div className="overflow-x-auto rounded border border-gl-border bg-white">
      <table className="w-full text-sm">
        <caption className="px-3 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-gl-muted">All figures (NRs billion, nominal)</caption>
        <thead>
          <tr className="border-b border-gl-border text-xs text-gl-muted">
            <th className="px-3 py-2 text-left font-semibold">Fiscal year</th>
            {cols.map(([h]) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {ys.map((y) => (
            <tr key={y.year} className={`border-b border-gl-border last:border-0 ${y.flag_duplicate ? "bg-amber-50" : ""}`}>
              <td className="px-3 py-1.5">{y.fy_ad} <span className="text-xs text-gl-muted">({y.fy_bs})</span>{y.flag_duplicate && <span className="ml-1 text-xs text-amber-800">under review</span>}</td>
              {cols.map(([h, f]) => <td key={h} className="px-3 py-1.5 text-right tabular-nums">{f(y)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
