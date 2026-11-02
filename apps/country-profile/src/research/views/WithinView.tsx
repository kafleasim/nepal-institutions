import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterColor } from "../names";
import { Scatter, type ScatterPoint } from "../components/Scatter";
import { Ctrl, Formula, MethodBlock, Seg } from "../components/ui";
import { fmt, mean, sd } from "../stats";

const stars = (p: number) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "");

export function WithinView({ data, k }: Ctx) {
  const { within, withinResults: R, annual } = data;
  const [rule, setRule] = useState<"A" | "B">("A");
  const [m, setM] = useState<string>("v2stfisccap");
  const [country, setCountry] = useState<string>("IDN");
  const col = `ward_k${k}`;
  const measures = Object.keys(R.measures);
  const res = R.results.filter((r) => r.rule === rule);
  const cur = res.find((r) => r.measure === m);
  const names = useMemo(() => { const mm = new Map<string, string>(); for (const a of annual) mm.set(a.iso3, a.country_name); return mm; }, [annual]);
  const clusterAt = useMemo(() => { const mm = new Map<string, number>(); for (const a of annual) mm.set(`${a.iso3}|${a.year}`, a[col] as number); return mm; }, [annual, col]);

  // Two-way demeaned scatter (country and year means removed once each).
  const scatter = useMemo(() => {
    const rows = within.filter((r) => (rule === "A" ? r.nA : r.nB) >= 2 && r[m] !== null && r.lgdp !== null && (rule === "A" ? r.tiltA : r.tiltB) !== null);
    if (rows.length < 10) return null;
    const x = rows.map((r) => r[m] as number), y = rows.map((r) => (rule === "A" ? r.tiltA : r.tiltB) as number);
    const sx = sd(x);
    const demean = (v: number[]) => {
      const byC = new Map<string, number[]>(), byY = new Map<number, number[]>();
      rows.forEach((r, i) => { (byC.get(r.iso3) ?? byC.set(r.iso3, []).get(r.iso3)!).push(v[i]); (byY.get(r.year) ?? byY.set(r.year, []).get(r.year)!).push(v[i]); });
      const mc = new Map([...byC].map(([k2, v2]) => [k2, mean(v2)])), my = new Map([...byY].map(([k2, v2]) => [k2, mean(v2)])), g = mean(v);
      return v.map((vi, i) => vi - mc.get(rows[i].iso3)! - my.get(rows[i].year)! + g);
    };
    const X = demean(x).map((v) => v / sx), Y = demean(y);
    const pts: ScatterPoint[] = rows.map((r, i) => ({ x: X[i], y: Y[i], label: `${names.get(r.iso3) ?? r.iso3} ${r.year}`, color: clusterColor(clusterAt.get(`${r.iso3}|${r.year}`) ?? 1), r: 3 }));
    const xlo = Math.min(...X), xhi = Math.max(...X);
    const line = cur ? [{ x1: xlo, y1: cur.fe_est * xlo, x2: xhi, y2: cur.fe_est * xhi, color: "#333" }] : [];
    return { pts, line, n: rows.length };
  }, [within, rule, m, cur, names, clusterAt]);

  // Country paths.
  const path = useMemo(() => within.filter((r) => r.iso3 === country).sort((a, b) => a.year - b.year), [within, country]);
  const W = 640, H = 300, left = 46, right = W - 46, top = 14, bottom = H - 30;
  const yrs = path.map((r) => r.year);
  const X = (yr: number) => left + ((yr - 2003) / 20) * (right - left);
  const fv = path.map((r) => r[m] as number | null).filter((v): v is number => v !== null);
  const tv = path.map((r) => (rule === "A" ? r.tiltA : r.tiltB)).filter((v): v is number => v !== null);
  const flo = fv.length ? Math.min(...fv) : 0, fhi = fv.length ? Math.max(...fv) : 1, tlo = tv.length ? Math.min(...tv, 0) : -1, thi = tv.length ? Math.max(...tv, 0) : 1;
  const YF = (v: number) => bottom - ((v - flo) / (fhi - flo || 1)) * (bottom - top);
  const YT = (v: number) => bottom - ((v - tlo) / (thi - tlo || 1)) * (bottom - top);

  return (
    <div>
      <p className="finding">
        The fiscal-base indicator survived the cross-sectional screen. The stricter question is whether a country whose fiscal base changes also changes the complexity of what it newly exports, with everything constant about the country and everything common to the year taken out. That uses only within-country movement, which for the V-Dem indicator is {cur ? Math.round(100 * cur.within_share) : "–"}% of its variance in this panel.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="New export"><Seg value={rule} options={[{ value: "A" as const, label: "Sustained" }, { value: "B" as const, label: "Consolidated" }]} onChange={setRule} /></Ctrl>
        <Ctrl label="Measure"><Seg value={m} options={measures.map((x) => ({ value: x, label: R.measures[x].replace(" (V-Dem)", "").replace(" (IMF WoRLD)", "").replace("V-Dem ", "") }))} onChange={setM} /></Ctrl>
      </div>
      <p className="stat">{rule === "A" ? R.rules.A : R.rules.B}. Pooled entry rate {(100 * R.pooled[rule].rate).toFixed(2)}% of {R.n_candidates.toLocaleString()} candidate country-product-years.</p>

      <div className="row section">
        <div className="col">
          <h3>Within-country: {R.measures[m]} against the PCI tilt of new exports</h3>
          {scatter ? (
            <>
              <Scatter points={scatter.pts} lines={scatter.line} xLabel={`${R.measures[m]}, country and year means removed, in SD`} yLabel="PCI tilt of new exports, country and year means removed" formatX={(v) => v.toFixed(1)} formatY={(v) => v.toFixed(2)} height={360} />
              <p className="caption">{scatter.n} country-years with at least two new exports. Both axes have the country's own mean and the year's mean subtracted, so a dot is a deviation from the country's usual level in a year that was itself average. The line is the two-way fixed-effects slope from the table.</p>
            </>
          ) : <p className="stat">Too few observations.</p>}
        </div>
        <div className="col-narrow">
          <h3>Slopes, per SD of the measure</h3>
          {cur ? (
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Countries · country-years</td><td className="num">{cur.n_countries} · {cur.n_obs}</td></tr>
                  <tr><td>Share of variance that is within-country</td><td className="num">{fmt(cur.within_share, 2)}</td></tr>
                  <tr><td>Between (year FE, with income)</td><td className="num">{fmt(cur.btw_est, 3)} ± {fmt(cur.btw_se, 3)}{stars(cur.btw_p)}</td></tr>
                  <tr><td><strong>Within</strong> (country + year FE, with income)</td><td className="num"><strong>{fmt(cur.fe_est, 3)} ± {fmt(cur.fe_se, 3)}{stars(cur.fe_p)}</strong></td></tr>
                  <tr><td>Within, measure lagged three years</td><td className="num">{fmt(cur.fel_est, 3)} ± {fmt(cur.fel_se, 3)}{stars(cur.fel_p)}</td></tr>
                  <tr><td>Within, on mean PCI of new exports</td><td className="num">{fmt(cur.fep_est, 3)} ± {fmt(cur.fep_se, 3)}{stars(cur.fep_p)}</td></tr>
                  <tr><td>Within, on log number of new exports</td><td className="num">{fmt(cur.fen_est, 3)} ± {fmt(cur.fen_se, 3)}{stars(cur.fen_p)}</td></tr>
                </tbody>
              </table>
            </div>
          ) : <p className="stat">Not estimated (too few countries with this measure).</p>}
          <p className="caption">Standard errors clustered by country. The between row is the cross-sectional slope for comparison; the within rows use only movement inside countries over time.</p>
        </div>
      </div>

      <div className="section">
        <h3>All measures, {rule === "A" ? "sustained" : "consolidated"} rule</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Measure</th><th className="num">Countries</th><th className="num">Within share</th><th className="num">Between</th><th className="num">Within</th><th className="num">Within, lag 3</th><th className="num">On PCI of entries</th><th className="num">On log n entries</th></tr></thead>
            <tbody>
              {res.map((r) => (
                <tr key={r.measure} style={{ cursor: "pointer", fontWeight: r.measure === m ? 600 : 400 }} onClick={() => setM(r.measure)}>
                  <td>{r.label}</td><td className="num">{r.n_countries}</td><td className="num">{fmt(r.within_share, 2)}</td>
                  <td className="num">{fmt(r.btw_est, 3)}{stars(r.btw_p)}</td><td className="num">{fmt(r.fe_est, 3)}{stars(r.fe_p)}</td><td className="num">{fmt(r.fel_est, 3)}{stars(r.fel_p)}</td>
                  <td className="num">{fmt(r.fep_est, 3)}{stars(r.fep_p)}</td><td className="num">{fmt(r.fen_est, 3)}{stars(r.fen_p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row section">
        <div className="col">
          <h3>One country over time</h3>
          <div className="chips" style={{ marginBottom: 8 }}>
            {R.movers.slice(0, 16).map((mv) => (
              <button key={mv.iso3} className={`chip${mv.iso3 === country ? " is-active" : ""}`} onClick={() => setCountry(mv.iso3)} title={`range ${mv.range}`}>{names.get(mv.iso3) ?? mv.iso3}</button>
            ))}
          </div>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
            <line x1={left} x2={right} y1={YT(0)} y2={YT(0)} stroke="#ccc" />
            <polyline fill="none" stroke="#266798" strokeWidth={2} points={path.filter((r) => r[m] !== null).map((r) => `${X(r.year)},${YF(r[m] as number)}`).join(" ")} />
            {path.map((r) => { const t = rule === "A" ? r.tiltA : r.tiltB; const n = rule === "A" ? r.nA : r.nB; return t === null || n < 1 ? null : <circle key={r.year} cx={X(r.year)} cy={YT(t)} r={2.5 + Math.min(6, Math.sqrt(n))} fill="#C64646" opacity={0.6} />; })}
            {[2003, 2008, 2013, 2018, 2023].map((yr) => <text key={yr} x={X(yr)} y={H - 8} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">{yr}</text>)}
            <text x={left - 6} y={top + 4} fontSize={10} textAnchor="end" fill="#266798">{fmt(fhi, 2)}</text>
            <text x={left - 6} y={bottom} fontSize={10} textAnchor="end" fill="#266798">{fmt(flo, 2)}</text>
            <text x={right + 6} y={top + 4} fontSize={10} fill="#C64646">{fmt(thi, 1)}</text>
            <text x={right + 6} y={bottom} fontSize={10} fill="#C64646">{fmt(tlo, 1)}</text>
            <text x={left} y={top - 2} fontSize={10.5} fill="#266798">{R.measures[m]} (line, left)</text>
            <text x={right} y={top - 2} fontSize={10.5} fill="#C64646" textAnchor="end">PCI tilt of new exports (dots, right; size = count)</text>
          </svg>
          <p className="caption">{names.get(country) ?? country}: the measure as a line and each year's tilt as a dot sized by the number of new exports. Years with no new exports show no dot. Chips list the countries with the largest range on the V-Dem fiscal indicator since 2003; {yrs.length} years shown.</p>
        </div>
        <div className="col-narrow">
          <h3>Largest movers on the fiscal indicator</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Country</th><th className="num">2003</th><th className="num">2023</th><th className="num">Range</th></tr></thead>
              <tbody>
                {R.movers.slice(0, 16).map((mv) => (
                  <tr key={mv.iso3} style={{ cursor: "pointer", fontWeight: mv.iso3 === country ? 600 : 400 }} onClick={() => setCountry(mv.iso3)}>
                    <td>{names.get(mv.iso3) ?? mv.iso3}</td><td className="num">{fmt(mv.first, 2)}</td><td className="num">{fmt(mv.last, 2)}</td><td className="num">{fmt(mv.range, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <MethodBlock title="How the within-country test is built" summary="What counts as a new export, the annual tilt, two-way fixed effects, and the fiscal measures">
        <p><strong>What counts as a new export.</strong> The earlier tabs used the Atlas convention of a ten-year window: RCA below 0.5 at the start, at least 1 at the end. For an annual panel that is too coarse and too easy to satisfy by noise, so entry is dated to a year t and required to be an actual arrival and to persist. <em>Sustained</em>: RCA below 0.5 in each of t − 1, t − 2 and t − 3 (the product was absent, not flickering), RCA of at least 1 in t and in t + 1, and at least one million dollars exported in t (a product can have RCA above 1 on a trivial value in a small economy). <em>Consolidated</em> adds a third year above 1 and a ten-million-dollar floor; it is the version to prefer when the question is about capabilities rather than one-off shipments. Candidates in year t are the products absent in t − 1 to t − 3 with a density reading in t − 1.</p>
        <p><strong>The annual tilt.</strong> As before, a pooled linear probability model of entry on lagged density with year fixed effects gives every candidate a probability; the tilt for a country-year is the mean PCI of what it entered minus the probability-weighted mean PCI of its candidates. Country-years with fewer than two new exports are dropped, because a one-product mean is mostly noise.</p>
        <p><strong>The regression.</strong></p>
        <Formula html={`<math display="block"><mrow><msub><mi>tilt</mi><mrow><mi>c</mi><mi>t</mi></mrow></msub><mo>=</mo><msub><mi>α</mi><mi>c</mi></msub><mo>+</mo><msub><mi>α</mi><mi>t</mi></msub><mo>+</mo><mi>β</mi><msub><mi>m</mi><mrow><mi>c</mi><mi>t</mi></mrow></msub><mo>+</mo><mi>δ</mi><mo>log</mo><msub><mi>GDPpc</mi><mrow><mi>c</mi><mi>t</mi></mrow></msub><mo>+</mo><msub><mi>ε</mi><mrow><mi>c</mi><mi>t</mi></mrow></msub></mrow></math>`} />
        <p>The country effect α<sub>c</sub> removes everything fixed about the country (its geography, its history, its average institutions); the year effect α<sub>t</sub> removes the year's common shocks. β is then estimated only from a country departing from its own average in a year that departs from the year's average, which is what "within-country variation" means. The measure is scaled to its standard deviation so slopes are comparable across measures. A version with the measure lagged three years asks whether the fiscal change comes first; versions with the mean PCI of entries and the log count of entries as outcomes separate "more complex entries" from "more entries".</p>
        <p><strong>The fiscal measures.</strong> V-Dem's v2stfisccap asks experts where the state's revenue comes from (from none, through natural resources and aid, to taxes on economic activity), coded annually and put through the measurement model, so it is continuous and slow-moving. The IMF World Revenue Longitudinal Database gives the accounting counterpart: tax revenue and total revenue as shares of GDP, and resource revenue as a share of total revenue. The two families do not have to agree: the expert score is about the character of the fiscal base, the accounts about its size.</p>
        <p><strong>Reading it.</strong> The between row is the cross-sectional slope with income, close to the screen on the Indicators tab. If the within row is of the same sign and size, the relationship holds inside countries as they change; if it collapses, the cross-sectional association came from fixed differences between countries. The share of variance that is within-country says how much movement there is to work with: V-Dem institutional scores move slowly, so within-country estimates are less precise by construction.</p>
        <p><strong>Caveats.</strong> Fixed effects remove fixed confounders, not time-varying ones: a commodity boom moves resource revenue and the export basket at once. The lag helps with timing but not with that. The annual tilt is noisy for small exporters, which is why the count floor and the consolidated rule exist. And 2003–2023 is one cycle of commodity prices.</p>
      </MethodBlock>
    </div>
  );
}
