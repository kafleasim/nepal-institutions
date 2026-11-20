import { useEffect, useState, type ReactNode } from "react";
import { GL } from "../lib/glTokens";
import { LineChart, useWidth } from "./FederalCapex";
import { Figure } from "./ui";

// Nepal fork: why do local governments leave capital unspent? Place vs institution vs politics.
// Data: public/nepal/local_drivers.json, written by 07_local_capex_drivers.R in the Growth Lab Nepal workstream
// (OAG audit panel, 753 local governments, FY 2074/75-2081/82; 2017 and 2022 local election results).
// Aggregates and regression estimates only; no candidate-level data.

type Term = { term: string; est: number; lo: number; hi: number; p: number };
type Nat = { year: number; fy_bs: string; fy_ad: string; income_bn: number; spent_bn: number; capital_bn: number;
  carryover_bn: number; balance_bn: number; net_bn: number; exec_stock: number; exec_flow: number };
export type DriversDoc = {
  built: string; source: string; n_units: number; n_obs: number; duplicate_note: string;
  national: Nat[];
  decomposition: { step: string; share: number }[]; decomposition_flow: { step: string; share: number }[];
  persistence: number;
  change_17_19: { n: number; share_fell: number; share_fell_10pp: number; median_change: number; r2_district: number; r2_province: number };
  correlates: { model: string; n: number; terms: Term[] };
  alignment: { model: string; n: number; terms: Term[]; robust_drop_both: Term[]; robust_flow: Term[] };
  reelection: { model: string; n: number; terms: Term[] };
};

type ShowFn = (ev: { clientX: number; clientY: number }, body: ReactNode) => void;
const pct = (v: number | null | undefined, d = 0) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
const LOCAL = GL.blue, HI = GL.highlight, MUTE = "#AFB5BE", MUTE_DARK = "#5F6773";

export function useDrivers() {
  const [doc, setDoc] = useState<DriversDoc | null | undefined>(undefined);
  useEffect(() => {
    fetch("/nepal/local_drivers.json").then((r) => (r.ok ? r.json() : null)).then(setDoc).catch(() => setDoc(null));
  }, []);
  return doc;
}

/** Year-end idle balance (bars) built up from each year's net under-spend. */
function BalanceBars({ nat, show, hide }: { nat: Nat[]; show: ShowFn; hide: () => void }) {
  const [ref, W] = useWidth();
  const m = { l: 56, r: 16, t: 24, b: 36 }, H = 280;
  const band = (W - m.l - m.r) / nat.length, bw = Math.min(56, band * 0.6);
  const cx = (i: number) => m.l + band * (i + 0.5);
  const max = Math.ceil(Math.max(...nat.map((n) => n.balance_bn)) / 20) * 20;
  const yS = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += 20) ticks.push(t);
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Unspent balance held by local governments at year end">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={yS(t)} y2={yS(t)} stroke={t === 0 ? GL.text : GL.border} />
            <text x={m.l - 8} y={yS(t) + 4} textAnchor="end" fontSize={11} fill={GL.muted} className="tabular-nums">{t}</text>
          </g>
        ))}
        <text x={14} y={(m.t + H - m.b) / 2} fontSize={11} fill={GL.muted} textAnchor="middle" transform={`rotate(-90 14 ${(m.t + H - m.b) / 2})`}>NRs billion</text>
        {nat.map((n, i) => (
          <g key={n.fy_bs} onMouseMove={(e) => show(e, (
            <>
              <b>FY {n.fy_ad}</b> ({n.fy_bs})
              <br />Balance at year end: NRs {n.balance_bn.toFixed(1)} bn
              <br />Carried in from last year: NRs {n.carryover_bn.toFixed(1)} bn
              <br />Income {n.income_bn.toFixed(0)} bn − spending {n.spent_bn.toFixed(0)} bn = {n.net_bn >= 0 ? "+" : ""}{n.net_bn.toFixed(1)} bn
            </>
          ))} onMouseLeave={hide}>
            <rect x={cx(i) - bw / 2} y={yS(n.balance_bn)} width={bw} height={yS(0) - yS(n.balance_bn)} fill={n.net_bn >= 0 ? HI : LOCAL} />
            <text x={cx(i)} y={yS(n.balance_bn) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={GL.text} className="tabular-nums">{n.balance_bn.toFixed(0)}</text>
            <text x={cx(i)} y={H - m.b + 16} textAnchor="middle" fontSize={11} fill={GL.text}>{n.fy_ad}</text>
            <text x={cx(i)} y={H - m.b + 29} textAnchor="middle" fontSize={10} fill={GL.muted}>{n.fy_bs}</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: HI }} />Balance grew (income &gt; spending)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: LOCAL }} />Balance drawn down (spending &gt; income)</span>
      </div>
    </div>
  );
}

/** Share of variance in execution by source, for the two measures. */
function Decomposition({ doc }: { doc: DriversDoc }) {
  const [ref, W] = useWidth();
  const rows = doc.decomposition.map((d, i) => ({ step: d.step, stock: d.share, flow: doc.decomposition_flow[i]?.share ?? 0 }));
  const lab = W < 560 ? 150 : 230, m = { l: lab, r: 40, t: 4, b: 24 }, row = 34;
  const H = m.t + m.b + row * rows.length;
  const xS = (v: number) => m.l + v * (W - m.l - m.r) / 0.8;
  const color = (s: string) => (s.startsWith("Year-to-year") ? MUTE : s.startsWith("Local government") ? LOCAL : HI);
  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: GL.text }} />Upper bar: whole unspent balance</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: GL.text, opacity: 0.4 }} />Lower bar: this year's under-spend only</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Share of variance in capital execution by source">
        {[0, 0.2, 0.4, 0.6, 0.8].map((t) => (
          <g key={t}>
            <line x1={xS(t)} x2={xS(t)} y1={m.t} y2={H - m.b} stroke={t === 0 ? GL.text : GL.border} />
            <text x={xS(t)} y={H - m.b + 15} textAnchor="middle" fontSize={11} fill={GL.muted} className="tabular-nums">{pct(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = m.t + i * row;
          return (
            <g key={r.step}>
              <text x={m.l - 8} y={y + row / 2 + 4} textAnchor="end" fontSize={11} fill={GL.text}>{r.step}</text>
              <rect x={xS(0)} y={y + 4} width={xS(r.stock) - xS(0)} height={12} fill={color(r.step)} />
              <rect x={xS(0)} y={y + 17} width={xS(r.flow) - xS(0)} height={12} fill={color(r.step)} opacity={0.4} />
              <text x={xS(r.stock) + 5} y={y + 14} fontSize={10.5} fill={MUTE_DARK} className="tabular-nums">{pct(r.stock)}</text>
              <text x={xS(r.flow) + 5} y={y + 27} fontSize={10.5} fill={MUTE_DARK} className="tabular-nums">{pct(r.flow)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type Row = { label: string; group: string; est: number; lo: number; hi: number; p: number };

/** Coefficients in percentage points of capital execution, with 95% confidence intervals. */
function CoefPlot({ rows }: { rows: Row[] }) {
  const [ref, W] = useWidth();
  const lab = W < 560 ? 170 : 300, m = { l: lab, r: 20, t: 4, b: 30 }, row = 24;
  const H = m.t + m.b + row * rows.length;
  const lim = Math.max(8, Math.ceil(Math.max(...rows.map((r) => Math.max(Math.abs(r.lo), Math.abs(r.hi))))));
  const xS = (v: number) => m.l + ((v + lim) / (2 * lim)) * (W - m.l - m.r);
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim].map((t) => Math.round(t));
  let last = "";
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Estimated effects on capital execution">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xS(t)} x2={xS(t)} y1={m.t} y2={H - m.b} stroke={t === 0 ? GL.text : GL.border} />
            <text x={xS(t)} y={H - m.b + 15} textAnchor="middle" fontSize={11} fill={GL.muted} className="tabular-nums">{t > 0 ? `+${t}` : t}</text>
          </g>
        ))}
        <text x={xS(0)} y={H - 2} textAnchor="middle" fontSize={10.5} fill={GL.muted}>Percentage points of capital execution (95% confidence interval)</text>
        {rows.map((r, i) => {
          const y = m.t + i * row + row / 2, sig = r.p < 0.05, head = r.group !== last;
          last = r.group;
          return (
            <g key={r.label}>
              {head && i > 0 && <line x1={8} x2={W - m.r} y1={y - row / 2} y2={y - row / 2} stroke={GL.border} strokeDasharray="2 3" />}
              <text x={m.l - 8} y={y + 4} textAnchor="end" fontSize={11} fill={GL.text}>{r.label}</text>
              <line x1={xS(r.lo)} x2={xS(r.hi)} y1={y} y2={y} stroke={sig ? HI : MUTE} strokeWidth={2} />
              <circle cx={xS(r.est)} cy={y} r={4} fill={sig ? HI : MUTE_DARK} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function coefRows(doc: DriversDoc): Row[] {
  const t = (arr: Term[], name: string) => arr.find((x) => x.term === name);
  const scale = (x: Term | undefined, k: number, label: string, group: string): Row[] =>
    x ? [{ label, group, est: x.est * 100 * k, lo: x.lo * 100 * k, hi: x.hi * 100 * k, p: x.p }] : [];
  const c = doc.correlates.terms;
  const party = c.filter((x) => x.term.startsWith("party::")).map((x) => ({ ...x, name: x.term.replace("party::", "") }));
  return [
    ...scale(t(doc.alignment.terms, "aligned"), 1, "PM from the mayor's party (whole year)", "Politics"),
    ...scale(doc.reelection.terms[0], 1, "Same mayor re-elected in 2022 (vs replaced)", "Politics"),
    ...party.flatMap((x) => scale(x, 1, `Mayor: ${x.name} (vs Nepali Congress)`, "Politics")),
    ...scale(t(c, "margin"), 0.1, "Mayor's winning margin (+10 points)", "Politics"),
    ...scale(t(c, "own_rev_share"), 0.1, "Own-revenue share of income (+10 points)", "Institution"),
    ...scale(t(c, "log_income"), Math.log(2), "Budget size (income doubles)", "Institution"),
    ...scale(t(c, "type3::Municipality"), 1, "Municipality (vs rural municipality)", "Institution"),
    ...scale(t(c, "type3::Metropolitan / sub-metropolitan city"), 1, "Metropolitan / sub-metropolitan city", "Institution"),
  ];
}

export function LocalDrivers({ doc, show, hide }: { doc: DriversDoc; show: ShowFn; hide: () => void }) {
  const nat = doc.national;
  const peak = nat.reduce((a, b) => (b.balance_bn > a.balance_bn ? b : a));
  const last = nat[nat.length - 1];
  const ch = doc.change_17_19;
  const al = doc.alignment.terms[0];
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Why do local governments leave capital unspent?</h2>
        <p className="mt-2 max-w-3xl text-sm text-gl-muted">
          Each year local governments spend most of the new money they receive. The unspent amount is mainly a balance
          built up during their first term (FY 2017/18–2021/22), peaking at NRs {peak.balance_bn.toFixed(0)} billion in FY {peak.fy_ad}
          and drawn down since. Differences between local governments are mostly year-to-year noise, with geography and persistent local
          differences each explaining a modest share; and we find no effect of party politics: the mayor's party, alignment with the federal prime minister,
          electoral competition and re-election all have estimates close to zero.
        </p>
      </div>

      <Figure label="Figure 8" title={`Local governments spend ${pct(nat[0].exec_flow)}–${pct(last.exec_flow)} of each year's new capital money; the gap is an old balance.`}
        subtitle="Capital execution of local governments under two measures: against the whole unspent balance (including money carried over from earlier years) and against this year's new under-spend only"
        source={doc.source}>
        <LineChart xs={nat.map((n) => n.fy_ad)} sub={nat.map((n) => n.fy_bs)} max={1.1} fmt={(v) => pct(v)} show={show} hide={hide}
          aria="Local capital execution, stock and flow measures"
          series={[
            { name: "Capital spent ÷ (capital spent + whole unspent balance)", color: LOCAL, values: nat.map((n) => n.exec_stock), width: 1.5, dash: "5 4" },
            { name: "Capital spent ÷ (capital spent + this year's new under-spend)", color: LOCAL, values: nat.map((n) => n.exec_flow), width: 2.4, labels: true },
          ]} />
      </Figure>

      <Figure label="Figure 9" title={`The idle balance built up to NRs ${peak.balance_bn.toFixed(0)} billion in the first term and is now being drawn down.`}
        subtitle="Unspent balance held by all local governments at year end, NRs billion (nominal). Each year's balance is carried into the next year."
        source={doc.source}>
        <BalanceBars nat={nat} show={show} hide={hide} />
      </Figure>

      <Figure label="Figure 10" title="Most of the variation is year-to-year noise within a local government, not geography or persistent differences."
        subtitle={`Share of the variance in capital execution across ${doc.n_units} local governments and ${doc.n_obs.toLocaleString()} local-government-years explained by each layer of fixed effects, added in order`}
        source={doc.source}>
        <Decomposition doc={doc} />
      </Figure>

      <Figure label="Figure 11" title="Party politics does not predict how much capital a local government spends."
        subtitle="Estimated difference in capital execution. Politics rows: alignment and re-election are within the same local government over time (local-government and year fixed effects); party, margin and institution rows compare local governments in the same district and year. Red = significant at 5%."
        source={`${doc.source}. Standard errors clustered by local government.`}>
        <CoefPlot rows={coefRows(doc)} />
      </Figure>

      <ul className="list-disc space-y-1 pl-5 text-sm text-gl-muted">
        <li><b>The first-term decline was widespread.</b> Between FY 2017/18 and 2019/20, {pct(ch.share_fell)} of local governments saw execution (whole-balance measure) fall, {pct(ch.share_fell_10pp)} by more than 10 points. Districts explain {pct(ch.r2_district)} of the change and provinces {pct(ch.r2_province)}, so it was not concentrated in particular regions.</li>
        <li><b>Alignment with the federal government:</b> a full year with the prime minister from the mayor's party changes execution by {(al.est * 100).toFixed(1)} points (95% CI {(al.lo * 100).toFixed(1)} to {(al.hi * 100).toFixed(1)}). The estimate is unchanged when both duplicated years are dropped or the flow measure is used.</li>
        <li><b>Persistence:</b> a local government's execution in one year correlates {doc.persistence.toFixed(2)} with the next, partly because the same carried-over balance enters both years.</li>
      </ul>
    </section>
  );
}
