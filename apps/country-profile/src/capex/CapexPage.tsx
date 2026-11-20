import { useEffect, useRef, useState, type ReactNode } from "react";
import { GL } from "../lib/glTokens";
import { Figure } from "./ui";
import { LocalDrivers, useDrivers } from "./LocalDrivers";
import { CompareChart, FederalLevels, GapBars, ProgrammeTable, SectorBars, useFederal } from "./FederalCapex";

// Nepal fork: capital budget execution, federal (Red Books, FY 2012/13 onward) and local (OAG audits, FY 2017/18 onward).
// Data: public/nepal/local_capex.json, written by scripts/export_local_capex.R from the OAG audit panel.

type Year = {
  year: number; fy_bs: string; fy_ad: string; n: number; n_cap: number;
  available_bn: number; income_bn: number; carryover_bn: number; spent_bn: number; capital_bn: number;
  current_bn: number; remaining_bn: number;
  unspent: number; unspent_med: number; unspent_p25: number; unspent_p75: number;
  cap_unspent: number; cap_unspent_med: number; cap_unspent_p25: number; cap_unspent_p75: number;
  cap_share_spent: number;
};
type Doc = { built: string; source: string; units: string; n_units: number; years: Year[] };

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
  const fed = useFederal();
  const drv = useDrivers();
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
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gl-blue">Nepal · Federal and local governments</p>
        <h1 className="mt-1 text-2xl font-semibold">Capital expenditure: how much of the budget goes unspent?</h1>
        <p className="mt-2 max-w-3xl text-sm text-gl-muted">
          The federal government spent about 60–64% of its original capital budget in FY 2021/22–2024/25, down from
          about 80% before federalism. Local governments spend most of the new money they receive each year, but built
          up an idle balance of over NRs 100 billion during their first term. Below: where the federal shortfall
          sits, and what does and does not explain local under-spending.
        </p>
      </header>

      {fed && (
        <>
          <Figure label="Figure 1" title="The federal government spends about 60–64% of its capital budget; local governments spend most of each year's new money."
            subtitle="Share of capital spent, by fiscal year. Federal: actual ÷ approved budget (Red Books). Local: audited accounts of 753 local governments, against the whole unspent balance (dashed) or only this year's new under-spend (solid). Local approved budgets are not in the audit data."
            source={`${fed.source}; ${doc.source}. The two measures differ in denominator (see notes).`}>
            <CompareChart fed={fed} local={ys.map((y) => ({ fy_ad: y.fy_ad, fy_bs: y.fy_bs, cap_spent_share: 1 - y.cap_unspent,
              flow: drv?.national.find((n) => n.fy_ad === y.fy_ad)?.exec_flow ?? null }))} show={show} hide={hide} />
          </Figure>

          <h2 className="pt-2 text-xl font-semibold">Federal government</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(() => {
              const done = fed.years.filter((y) => y.exec_budget != null);
              const l = done[done.length - 1], f0 = done[0];
              const p = fed.periods;
              const fedEra = p[p.length - 1];
              return (
                <>
                  <Kpi label={`Capital budget spent, FY ${l.fy_ad}`} value={pct(l.exec_budget)} sub={`${bn(l.actual)} of ${bn(l.budget)} budgeted`} color={UNSPENT} />
                  <Kpi label={`Capital budget spent, ${f0.fy_ad} → ${l.fy_ad}`} value={`${pct(f0.exec_budget)} → ${pct(l.exec_budget)}`} sub="Actual ÷ original budget" color={UNSPENT} />
                  <Kpi label="Cut at mid-year revision" value={pct(fedEra.planning_gap)} sub={`${fedEra.period}, pooled; about the same before federalism`} color={NAT} />
                  <Kpi label="Unspent after revision" value={pct(fedEra.impl_gap)} sub={`Of budget, ${fedEra.period.toLowerCase()} (before federalism: ${pct(p[0].impl_gap)})`} color={NAT} />
                </>
              );
            })()}
          </div>

          <Figure label="Figure 2" title="The federal capital budget has grown about five-fold since 2012/13; actual spending has flattened since 2019/20."
            subtitle={`Federal capital expenditure, ${fed.units}. Gaps are Red Books that are not published or not machine-readable.`}
            source={fed.source}>
            <FederalLevels fed={fed} show={show} hide={hide} />
          </Figure>

          <Figure label="Figure 3" title="The mid-year cut is a steady quarter of the budget; the federal-era drop is money unspent after revision."
            subtitle="Original federal capital budget split into amount spent, planning gap (budget − revised) and implementation gap (revised − actual)"
            source={fed.source}>
            <GapBars fed={fed} show={show} hide={hide} />
          </Figure>

          <Figure label="Figure 4" title="Roads and transport hold over 40% of the unspent federal capital budget."
            subtitle={`Original budget minus actual, NRs billion, FY 2078/79–2081/82 pooled. Excludes Ministry of Finance lump-sum lines (NRs ${fed.mof_lump_sum_budget.toFixed(0)} bn budgeted, moved to ministries during the year).`}
            source={fed.source}>
            <SectorBars fed={fed} show={show} hide={hide} />
          </Figure>

          <ProgrammeTable fed={fed} />

          <h2 className="pt-2 text-xl font-semibold">Local governments</h2>
        </>
      )}

      <section>
        <p className="max-w-3xl text-sm text-gl-muted">
          Nepal's {doc.n_units} local governments (municipalities and rural municipalities) have managed their own budgets
          since the first local elections in 2017. Their audited accounts report income, spending and the balance left
          at year end, but not how much of the <em>capital</em> budget went unused. We estimate it from the unspent
          balance, assuming recurrent items such as salaries are largely spent, so that what remains is mostly capital.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={`Budget left unspent, FY ${last.fy_ad}`} value={pct(last.unspent)} sub={`${bn(last.remaining_bn)} of ${bn(last.available_bn)} available`} color={UNSPENT} />
        <Kpi label="Implied share of capital budget unspent" value={pct(last.cap_unspent)} sub={`Median local government: ${pct(last.cap_unspent_med)}`} color={UNSPENT} />
        <Kpi label="Capital spending actually made" value={bn(last.capital_bn)} sub={`${pct(last.cap_share_spent)} of all spending`} color={NAT} />
        <Kpi label={`Capital share of spending, ${ys[0].fy_ad} → ${last.fy_ad}`} value={`${pct(ys[0].cap_share_spent)} → ${pct(last.cap_share_spent)}`} sub="Capital as a share of all local spending" color={NAT} />
      </div>

      <Figure label="Figure 5" title={`Local governments leave ${range(ys, "unspent")} of their available budget unspent each year.`}
        subtitle="Remaining balance as a share of available funds (income plus carry-over from the previous year), by fiscal year"
        source={doc.source}>
        <ShareChart ys={ys} v="unspent" med="unspent_med" lo="unspent_p25" hi="unspent_p75" show={show} hide={hide}
          name="Unspent share of budget" />
      </Figure>

      <Figure label="Figure 6" title={`If the unspent balance is capital, ${range(ys, "cap_unspent")} of the capital budget goes unused.`}
        subtitle="Implied unspent capital share = remaining balance ÷ (capital spending + remaining balance)"
        source={`${doc.source}. Assumes the whole unspent balance belonged to the capital budget.`}>
        <ShareChart ys={ys} v="cap_unspent" med="cap_unspent_med" lo="cap_unspent_p25" hi="cap_unspent_p75" show={show} hide={hide}
          name="Implied unspent capital share" />
      </Figure>

      <Figure label="Figure 7" title="Capital spent versus left unspent, in rupees."
        subtitle={`Capital spending and unspent balance summed across local governments (${doc.units})`}
        source={doc.source}>
        <StackChart ys={ys} show={show} hide={hide} />
      </Figure>

      <DataTable ys={ys} />

      {drv && <LocalDrivers doc={drv} show={show} hide={hide} />}

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Method and caveats</h2>
        <ul className="list-disc space-y-1 pl-5 text-gl-muted">
          <li><b>Available funds</b> = the year's total income (federal and provincial transfers, revenue sharing and own revenue) plus the balance carried over from the previous year. The accounts satisfy: available − total spending = remaining balance.</li>
          <li><b>Unspent share</b> = remaining balance ÷ available funds. The <b>national</b> line pools all local governments (equivalently, weights by budget size); the <b>median</b> line and the band (middle 50% of local governments) describe the typical unit.</li>
          <li><b>Implied unspent capital share</b> assumes the entire remaining balance was capital budget. It is an upper-bound style estimate: if some recurrent budget also went unspent, the true capital figure is lower.</li>
          <li>Fiscal years run mid-July to mid-July; FY 2074/75 = 2017/18. Amounts are nominal (not inflation-adjusted). Local governments with missing or zero income in a year are excluded from that year (count shown in the table).</li>
          <li><b>Federal execution</b> = actual capital expenditure ÷ original capital budget (the capital split of each programme). Each Red Book prints the budget for its year, the revised estimate for the year before and actual spending for two years before, so the budget for FY t comes from book t and the actual from book t+2. Federal figures exclude fiscal transfers to provinces and local governments. Red Books for FY 2073/74–2077/78 actuals are missing or not machine-readable (no MoF upload for FY 2075/76; scanned or legacy-font books for FY 2076/77–2077/78), hence the gaps.</li>
          <li><b>Federal vs local</b>: the federal measure divides by the approved budget; the local measure divides by capital spent plus the unspent balance, i.e. funds actually available. Local approved budgets are typically larger than funds received, so local execution against the approved budget would be lower. Read Figure 1 as a comparison of orders of magnitude, not of exact levels.</li>
          <li><b>Federal sectors</b>: Ministry of Finance lump-sum lines (contingency, "miscellaneous") are budgeted centrally and moved to line ministries during the year; they are excluded from the sector chart. Foreign-aid payments made directly to contractors are often recorded late, which may understate execution of donor-financed projects.</li>
          <li><b>Two local measures.</b> Each year's unspent balance is carried into the next year (the opening balance matches the previous closing balance). The whole-balance measure (Figures 1, 6, 8 dashed) counts money left over from earlier years as unspent again each year; the flow measure counts only the year's new under-spend (income − spending, floored at zero). Both assume unspent money is capital.</li>
          <li><b>Drivers (Figures 10–11).</b> Panel of local governments FY 2074/75–2081/82 from the audit reports, merged with the 2017 and 2022 local election results (mayor/chair winner, party, winning margin; re-election from a candidate panel matched across elections). Alignment = share of the fiscal year in which the prime minister came from the mayor's party (UML and Maoist Centre counted together while merged as the NCP, May 2018–March 2021). {drv?.duplicate_note} Own-revenue data start in FY 2076/77. Party and margin are not randomly assigned: the estimates show associations, not causal effects; the within-local-government alignment and re-election estimates are closer to causal but still descriptive.</li>
          <li>Coverage begins in FY 2017/18 because local governments under the 2015 constitution were first elected in 2017.</li>
        </ul>
        <p className="text-xs text-gl-muted">Local data exported {doc.built}{fed ? `; federal data exported ${fed.built}` : ""}{drv ? `; drivers analysis ${drv.built}` : ""}.</p>
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


type ShareKey = "unspent" | "unspent_med" | "unspent_p25" | "unspent_p75" | "cap_unspent" | "cap_unspent_med" | "cap_unspent_p25" | "cap_unspent_p75";

function frame(W: number, n: number) {
  const m = { l: 56, r: 16, t: 28, b: 34 }, H = 300;
  const band = (W - m.l - m.r) / n;
  const cx = (i: number) => m.l + band * (i + 0.5);
  return { m, H, band, cx };
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
        <path d={area} fill={NAT} fillOpacity={0.15} />
        <path d={path(med)} fill="none" stroke={NAT} strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path(v)} fill="none" stroke={NAT} strokeWidth={2.4} strokeLinejoin="round" />
        {ys.map((y, i) => (
          <g key={y.year}>
            <circle cx={cx(i)} cy={yS(y[v])} r={4} fill={NAT} stroke={NAT} strokeWidth={1.5} />
            <text x={cx(i)} y={yS(y[v]) - 9} textAnchor="middle" fontSize={11} fontWeight={600} fill={GL.text} className="tabular-nums">{pct(y[v])}</text>
            <text x={cx(i)} y={H - m.b + 16} textAnchor="middle" fontSize={11} fill={GL.text}>{y.fy_ad}</text>
            <text x={cx(i)} y={H - m.b + 29} textAnchor="middle" fontSize={10} fill={GL.muted}>{y.fy_bs}</text>
            <rect x={cx(i) - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent"
              onMouseMove={(e) => show(e, (
                <>
                  <b>FY {y.fy_ad}</b> ({y.fy_bs})
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
        {ys.map((y, i) => (
          <g key={y.year} onMouseMove={(e) => show(e, (
            <>
              <b>FY {y.fy_ad}</b> ({y.fy_bs})
              <br />Capital spending: {bn(y.capital_bn)}
              <br />Unspent balance: {bn(y.remaining_bn)}
              <br />Implied capital budget: {bn(tot(y))}
              <br /><span className="opacity-75">Total spending: {bn(y.spent_bn)} · available funds: {bn(y.available_bn)}</span>
            </>
          ))} onMouseLeave={hide}>
            <rect x={cx(i) - bw / 2} y={yS(y.capital_bn)} width={bw} height={yS(0) - yS(y.capital_bn)} fill={NAT} />
            <rect x={cx(i) - bw / 2} y={yS(tot(y))} width={bw} height={yS(y.capital_bn) - yS(tot(y)) - 1} fill={UNSPENT} />
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
            <tr key={y.year} className="border-b border-gl-border last:border-0">
              <td className="px-3 py-1.5">{y.fy_ad} <span className="text-xs text-gl-muted">({y.fy_bs})</span></td>
              {cols.map(([h, f]) => <td key={h} className="px-3 py-1.5 text-right tabular-nums">{f(y)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
