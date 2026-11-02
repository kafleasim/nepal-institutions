import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterColor, clusterShort } from "../names";
import { Ctrl, MethodBlock, Seg } from "../components/ui";
import { fmt, mean, quantile, seeded } from "../stats";

type Outcome = "eci" | "ldiv" | "coi" | "lexp";
const OUTCOMES: { value: Outcome; label: string; axis: string; d: number }[] = [
  { value: "eci", label: "ECI", axis: "Change in ECI since t − 1", d: 2 },
  { value: "ldiv", label: "Diversity", axis: "Change in log diversity since t − 1", d: 2 },
  { value: "coi", label: "COI", axis: "Change in COI since t − 1", d: 2 },
  { value: "lexp", label: "Exports", axis: "Change in log exports since t − 1", d: 2 },
];
const H0 = -5, H1 = 8;

type Event = { iso3: string; name: string; year: number; from: number; to: number; dPc1: number; path: (number | null)[]; ctrlPath: (number | null)[]; nCtrl: number };

export function EventsView({ data, k }: Ctx) {
  const { annual, cxAnnual, eventsMeta } = data;
  const col = `ward_k${k}`;
  const [persist, setPersist] = useState<number>(4);
  const [outcome, setOutcome] = useState<Outcome>("eci");
  const [dir, setDir] = useState<"all" | "up" | "down">("all");

  const spec = OUTCOMES.find((o) => o.value === outcome)!;
  const val = (r: (typeof cxAnnual)[number]): number | null => {
    switch (outcome) {
      case "eci": return r.eci;
      case "coi": return r.coi;
      case "ldiv": return r.diversity && r.diversity > 0 ? Math.log(r.diversity) : null;
      case "lexp": return r.export_value && r.export_value > 0 ? Math.log(r.export_value) : null;
    }
  };
  const y = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of cxAnnual) { const v = val(r); if (v !== null) m.set(`${r.iso3}|${r.year}`, v); }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cxAnnual, outcome]);
  const lab = useMemo(() => {
    const m = new Map<string, number>();
    const pc = new Map<string, number>();
    const names = new Map<string, string>();
    for (const r of annual) { m.set(`${r.iso3}|${r.year}`, r[col] as number); pc.set(`${r.iso3}|${r.year}`, r.pc1); names.set(r.iso3, r.country_name); }
    return { m, pc, names };
  }, [annual, col]);
  const isos = useMemo(() => [...new Set(cxAnnual.map((r) => r.iso3))].filter((i) => lab.names.has(i)), [cxAnnual, lab]);
  const L = (iso: string, yr: number) => lab.m.get(`${iso}|${yr}`);

  const events = useMemo<Event[]>(() => {
    const out: Event[] = [];
    for (const iso of isos) {
      for (let t = 2001; t <= 2024 - 1; t++) {
        const from = L(iso, t - 1), to = L(iso, t);
        if (from === undefined || to === undefined || from === to) continue;
        let ok = true;
        for (let s = 1; s <= persist; s++) if (L(iso, t - s) !== from) ok = false;
        for (let s = 0; s < persist; s++) if (L(iso, t + s) !== to) ok = false;
        if (!ok) continue;
        const base = y.get(`${iso}|${t - 1}`);
        if (base === undefined) continue;
        const pre = mean([1, 2, 3].map((s) => lab.pc.get(`${iso}|${t - s}`)).filter((v): v is number => v !== undefined));
        const post = mean([0, 1, 2].map((s) => lab.pc.get(`${iso}|${t + s}`)).filter((v): v is number => v !== undefined));
        // controls: same origin cluster at t-1, no change over the window
        const ctrls = isos.filter((c) => {
          if (c === iso) return false;
          const c0 = L(c, t - 1);
          if (c0 !== from) return false;
          for (let h = H0; h <= H1; h++) { const l = L(c, t + h); if (l !== undefined && l !== c0) return false; }
          return y.get(`${c}|${t - 1}`) !== undefined;
        });
        const path: (number | null)[] = [], ctrlPath: (number | null)[] = [];
        for (let h = H0; h <= H1; h++) {
          const v = y.get(`${iso}|${t + h}`);
          path.push(v === undefined ? null : v - base);
          const cv = ctrls.map((c) => { const a = y.get(`${c}|${t + h}`), b = y.get(`${c}|${t - 1}`)!; return a === undefined ? null : a - b; }).filter((v): v is number => v !== null);
          ctrlPath.push(cv.length ? mean(cv) : null);
        }
        out.push({ iso3: iso, name: lab.names.get(iso)!, year: t, from, to, dPc1: post - pre, path, ctrlPath, nCtrl: ctrls.length });
      }
    }
    return out.sort((a, b) => a.year - b.year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isos, persist, y, lab, col]);

  const shown = events.filter((e) => dir === "all" || (dir === "up" ? e.dPc1 > 0 : e.dPc1 < 0));
  const did = (e: Event, i: number) => (e.path[i] === null || e.ctrlPath[i] === null ? null : e.path[i]! - e.ctrlPath[i]!);
  const hs = Array.from({ length: H1 - H0 + 1 }, (_, i) => H0 + i);
  const meanPath = hs.map((_, i) => { const v = shown.map((e) => did(e, i)).filter((x): x is number => x !== null); return v.length ? mean(v) : null; });
  const nPath = hs.map((_, i) => shown.filter((e) => did(e, i) !== null).length);
  const band = useMemo(() => {
    const rng = seeded(21);
    const B = 200;
    const lo: (number | null)[] = [], hi: (number | null)[] = [];
    for (let i = 0; i < hs.length; i++) {
      const vals = shown.map((e) => did(e, i)).filter((x): x is number => x !== null);
      if (vals.length < 3) { lo.push(null); hi.push(null); continue; }
      const ms: number[] = [];
      for (let b = 0; b < B; b++) { let s = 0; for (let j = 0; j < vals.length; j++) s += vals[Math.floor(rng() * vals.length)]; ms.push(s / vals.length); }
      lo.push(quantile(ms, 0.05)); hi.push(quantile(ms, 0.95));
    }
    return { lo, hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, outcome]);

  // Chart
  const W = 640, Hh = 340, left = 52, right = W - 16, top = 14, bottom = Hh - 36;
  const allVals = shown.flatMap((e) => hs.map((_, i) => did(e, i))).filter((v): v is number => v !== null).concat(band.lo.filter((v): v is number => v !== null), band.hi.filter((v): v is number => v !== null));
  const ylo = allVals.length ? Math.min(...allVals, 0) : -1, yhi = allVals.length ? Math.max(...allVals, 0) : 1;
  const pad = (yhi - ylo) * 0.08 || 0.1;
  const X = (h: number) => left + ((h - H0) / (H1 - H0)) * (right - left);
  const Y = (v: number) => bottom - ((v - (ylo - pad)) / (yhi - ylo + 2 * pad)) * (bottom - top);
  const line = (vals: (number | null)[]) => vals.map((v, i) => (v === null ? null : `${X(hs[i])},${Y(v)}`)).filter((s): s is string => s !== null).join(" ");
  const bandPath = (() => {
    const up = hs.map((h, i) => (band.hi[i] === null ? null : `${X(h)},${Y(band.hi[i]!)}`)).filter((s): s is string => s !== null);
    const dn = hs.map((h, i) => (band.lo[i] === null ? null : `${X(h)},${Y(band.lo[i]!)}`)).filter((s): s is string => s !== null).reverse();
    return up.length && dn.length ? `M ${[...up, ...dn].join(" L ")} Z` : "";
  })();
  const at = (e: Event, h: number) => did(e, h - H0);

  return (
    <div>
      <p className="finding">
        A country that changes cluster is the closest thing here to an experiment. With annual membership from 1990 (a k-nearest-neighbour vote against the benchmark rows, {Math.round(100 * (eventsMeta.agreement_knn[`k${k}`] ?? 0))}% agreement with the Ward labels at this k), a transition is dated to the year, and the country's complexity afterwards is compared with countries that started in the same cluster and stayed.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Outcome"><Seg value={outcome} options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))} onChange={setOutcome} /></Ctrl>
        <Ctrl label="Persistence (years before and after)"><Seg value={persist} options={[3, 4, 5, 6].map((p) => ({ value: p, label: String(p) }))} onChange={setPersist} /></Ctrl>
        <Ctrl label="Direction (PC1)"><Seg value={dir} options={[{ value: "all" as const, label: "All" }, { value: "up" as const, label: "Toward liberal" }, { value: "down" as const, label: "Away" }]} onChange={setDir} /></Ctrl>
      </div>

      <div className="row section">
        <div className="col">
          <h3>{spec.axis}, event minus matched stayers</h3>
          <svg className="chart" viewBox={`0 0 ${W} ${Hh}`}>
            <line x1={left} x2={right} y1={Y(0)} y2={Y(0)} stroke="#333" />
            <line x1={X(-0.5)} x2={X(-0.5)} y1={top} y2={bottom} stroke="#999" strokeDasharray="4 3" />
            {shown.map((e) => (
              <polyline key={`${e.iso3}${e.year}`} fill="none" stroke={clusterColor(e.to)} strokeWidth={1} opacity={0.35} points={line(hs.map((_, i) => did(e, i)))} />
            ))}
            {bandPath && <path d={bandPath} fill="#266798" opacity={0.15} />}
            <polyline fill="none" stroke="#266798" strokeWidth={2.5} points={line(meanPath)} />
            {hs.map((h) => (
              <text key={h} x={X(h)} y={bottom + 14} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">{h >= 0 ? `+${h}` : h}</text>
            ))}
            {[ylo, 0, yhi].map((v, i) => (
              <text key={i} x={left - 6} y={Y(v) + 3.5} fontSize={10} textAnchor="end" fill="#7c7c7c">{fmt(v, spec.d)}</text>
            ))}
            <text x={(left + right) / 2} y={Hh - 4} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">Years since the transition</text>
          </svg>
          <p className="caption">Thin lines: each event's difference from its stayers, coloured by destination cluster. Thick line: the mean over events; band: 90% bootstrap interval over events. n per horizon: {nPath[0]} at {H0}, {nPath[hs.indexOf(0)]} at 0, {nPath[hs.length - 1]} at +{H1}.</p>
        </div>
        <div className="col-narrow">
          <h3>Mean difference at horizons</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>h</th><th className="num">Mean</th><th className="num">90% band</th><th className="num">n</th></tr></thead>
              <tbody>
                {[-3, 0, 2, 4, 6, 8].map((h) => { const i = h - H0; return (
                  <tr key={h}><td>{h >= 0 ? `+${h}` : h}</td><td className="num">{fmt(meanPath[i], spec.d)}</td><td className="num">{fmt(band.lo[i], spec.d)} to {fmt(band.hi[i], spec.d)}</td><td className="num">{nPath[i]}</td></tr>
                ); })}
              </tbody>
            </table>
          </div>
          <p className="caption">Pre-transition horizons test whether movers were already diverging from their stayers.</p>
        </div>
      </div>

      <div className="section">
        <h3>{shown.length} transitions ({events.length} in total at this persistence)</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Country</th><th className="num">Year</th><th>From</th><th>To</th><th className="num">ΔPC1</th><th className="num">Stayers</th><th className="num">at +4</th><th className="num">at +8</th></tr></thead>
            <tbody>
              {shown.map((e) => (
                <tr key={`${e.iso3}${e.year}`}>
                  <td>{e.name}</td><td className="num">{e.year}</td>
                  <td><span className="swatch" style={{ background: clusterColor(e.from) }} />{clusterShort("ward", k, e.from)}</td>
                  <td><span className="swatch" style={{ background: clusterColor(e.to) }} />{clusterShort("ward", k, e.to)}</td>
                  <td className="num">{fmt(e.dPc1, 1)}</td><td className="num">{e.nCtrl}</td>
                  <td className="num">{fmt(at(e, 4), spec.d)}</td><td className="num">{fmt(at(e, 8), spec.d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">ΔPC1 is the mean liberal-democracy score over the three years after the transition minus the three years before, in pooled standard deviations. Columns at +4 and +8 are the event's change since t − 1 minus the stayers' mean change.</p>
      </div>

      <MethodBlock title="How the event study is built" summary="Annual membership, the persistence rule, matched stayers, and what the band means">
        <p><strong>Annual membership.</strong> The Ward partition exists only for six benchmark years. To date transitions, every V-Dem country-year from {eventsMeta.years[0]} to {eventsMeta.years[1]} is scored on the same {data.meta.n_indicators} indicators with the same pooled means and standard deviations, and labelled by a majority vote of its {eventsMeta.knn} nearest benchmark country-years (Euclidean distance, the metric used everywhere on this page). On the benchmark rows themselves this rule reproduces the Ward label {Math.round(100 * (eventsMeta.agreement_knn[`k${k}`] ?? 0))}% of the time at k = {k} (leave-one-out); a nearest-centroid rule does worse ({Math.round(100 * (eventsMeta.agreement_centroid[`k${k}`] ?? 0))}%) because Ward clusters are not spheres.</p>
        <p><strong>A transition</strong> is a year t at which the label differs from the year before, after the old label had held for the chosen number of years and the new label goes on to hold for as many. The persistence control removes flickers at cluster boundaries; raising it removes short-lived regimes too. Only transitions from 2001 onward can be studied, because the Atlas panel starts in 2000 and a pre-period is needed.</p>
        <p><strong>Stayers.</strong> For each event, the comparison group is every ranked economy in the same cluster as the mover in the year before the transition that keeps that label for the whole window from t − 5 to t + 8. The plotted quantity for an event is its change in the outcome since t − 1 minus the mean change of its stayers over the same calendar years, so world-wide movements in ECI or trade cancel out.</p>
        <p><strong>Direction.</strong> Transitions are split by the change in the liberal-democracy component: the mean PC1 over the three years after minus the three years before. "Toward liberal" and "away" pool transitions between different pairs of clusters, which is coarse but is what a sample of a few dozen events can support.</p>
        <p><strong>The band</strong> is a 90% bootstrap interval from resampling events with replacement, 200 draws. It reflects the small number of events, not uncertainty in any one country's series. Pre-transition horizons matter: if movers were already pulling away from their stayers before the transition, the post-transition gap is not the transition's doing.</p>
        <p><strong>Caveats.</strong> Regime transitions are not random, they often coincide with wars, commodity booms and busts, and sanctions, all of which move exports directly; and the matching is on institutional origin only, not on income or region. The design shows what happened to movers relative to comparable non-movers; it does not, on its own, show why.</p>
      </MethodBlock>
    </div>
  );
}
