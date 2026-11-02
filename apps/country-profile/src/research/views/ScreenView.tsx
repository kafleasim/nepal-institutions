import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import type { ScreenRow } from "../data";
import { clusterColor } from "../names";
import { Scatter, type ScatterPoint } from "../components/Scatter";
import { Ctrl, Formula, MethodBlock, Seg } from "../components/ui";
import { fmt, mean, sd } from "../stats";

const CAT_COLORS: Record<string, string> = {
  "State capacity": "#266798", "Political parties": "#C64646", Executive: "#D1852A", "Civil liberties": "#36B250",
  Deliberation: "#A42DE2", "Civil society": "#52A0A0", Legislature: "#7C6760", Judiciary: "#EAC218",
  "Political equality": "#5B8E7D", Elections: "#B56576", Media: "#6D597A", "Mobilisation & academia": "#757777",
};
const catColor = (c: string) => CAT_COLORS[c] ?? "#999";
const stars = (p: number) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "");

export function ScreenView({ data, k }: Ctx) {
  const { screen, screenMeta, tilt, tiltZ } = data;
  const [sortBy, setSortBy] = useState<"a" | "b" | "c" | "cor">("a");
  const [onlyPass, setOnlyPass] = useState(true);
  const [sel, setSel] = useState<string>("v2stfisccap");
  const col = `ward_k${k}`;

  const rows = useMemo(() => {
    const r = onlyPass ? screen.filter((x) => x.a_q <= 0.1) : screen;
    const key = (x: ScreenRow) => (sortBy === "a" ? Math.abs(x.a_est) : sortBy === "b" ? Math.abs(x.b_est) : sortBy === "c" ? Math.abs(x.c_est) : -Math.abs(x.cor_income));
    return [...r].sort((p, q) => key(q) - key(p));
  }, [screen, sortBy, onlyPass]);
  const cur = screen.find((x) => x.tag === sel) ?? screen[0];

  const pts: ScatterPoint[] = screen.map((x) => ({ x: x.cor_income, y: x.a_est, label: x.name, color: catColor(x.category), r: x.a_q <= 0.1 ? 4.5 : 2.5 }));
  const robust = screen.filter((x) => x.a_q <= 0.1 && x.b_q <= 0.1 && x.c_p <= 0.05);

  // Indicator scatter: tilt vs z, both partialled on log income.
  const ind = useMemo(() => {
    const z = new Map(tiltZ.filter((t) => t.tag === cur.tag).map((t) => [`${t.iso3}|${t.window}`, t.z]));
    const rows = tilt.filter((t) => z.has(`${t.iso3}|${t.window}`) && t.lgdp !== null);
    const xs = rows.map((t) => z.get(`${t.iso3}|${t.window}`)!), ys = rows.map((t) => t.tilt), ls = rows.map((t) => t.lgdp);
    const resid = (v: number[]) => { const ml = mean(ls), mv = mean(v); let sxy = 0, sxx = 0; for (let i = 0; i < v.length; i++) { sxy += (ls[i] - ml) * (v[i] - mv); sxx += (ls[i] - ml) ** 2; } const b = sxx ? sxy / sxx : 0; return v.map((vi, i) => vi - b * (ls[i] - ml)); };
    const X = resid(xs), Y = resid(ys);
    const points: ScatterPoint[] = rows.map((t, i) => ({ x: X[i], y: Y[i], label: `${t.iso3} ${t.window}`, color: clusterColor(t[col] as number) }));
    const mx = mean(X), my = mean(Y), xlo = Math.min(...X), xhi = Math.max(...X);
    return { points, line: [{ x1: xlo, y1: my + cur.a_est * (xlo - mx), x2: xhi, y2: my + cur.a_est * (xhi - mx), color: "#333" }], sdx: sd(xs) };
  }, [tiltZ, tilt, cur, col]);

  return (
    <div>
      <p className="finding">
        Working backwards. Instead of asking whether the institutional bundle predicts the complexity of what gets entered, each of the {screenMeta.n_indicators} V-Dem indicators in the country space is tried on its own, with relatedness and log income held fixed. {screenMeta.pass_a} clear a 10% false-discovery threshold at the country level; {robust.length} also hold at the product level and in the fixed-effects model. The ones that survive are not the liberal-democracy indicators that track income, but a small set on how the state is funded and staffed and how parties are organised.
      </p>

      <div className="row section">
        <div className="col">
          <h3>Every indicator: income-controlled effect against correlation with income</h3>
          <Scatter points={pts} xLabel="Correlation of the indicator with log GDP per head across country-windows" yLabel="Effect on the PCI tilt of entries per SD, income held fixed" formatX={(v) => v.toFixed(1)} formatY={(v) => v.toFixed(2)} height={380} />
          <p className="caption">One dot per indicator, coloured by V-Dem category; large dots pass the 10% false-discovery threshold in the country-level specification. Indicators to the right are nearly collinear with income and their effects are hard to tell from it; the interesting region is the upper left.</p>
          <div className="chips" style={{ marginTop: 6 }}>
            {Object.entries(CAT_COLORS).map(([c, colr]) => (
              <span key={c} className="chip" style={{ borderColor: colr, color: colr }}>{c}</span>
            ))}
          </div>
        </div>
        <div className="col-narrow">
          <h3>Survive all three specifications</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Indicator</th><th className="num">Income corr.</th><th className="num">Tilt / SD</th></tr></thead>
              <tbody>
                {robust.sort((a, b) => Math.abs(b.a_est) - Math.abs(a.a_est)).map((x) => (
                  <tr key={x.tag} style={{ cursor: "pointer", fontWeight: x.tag === cur.tag ? 600 : 400 }} onClick={() => setSel(x.tag)}>
                    <td>{x.name} <span className="stat">{x.tag}</span></td><td className="num">{fmt(x.cor_income, 2)}</td><td className="num">{fmt(x.a_est, 3)}{stars(x.a_p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="caption">Country-level q ≤ 0.1, product-level q ≤ 0.1, and p ≤ 0.05 in the fixed-effects entry model. Click a row to see it below.</p>
        </div>
      </div>

      <div className="section">
        <h3>{cur.name} <span className="stat">{cur.tag} · {cur.category}</span></h3>
        <div className="row">
          <div className="col">
            <Scatter points={ind.points} lines={ind.line} xLabel={`${cur.name}, pooled z-score, net of log income`} yLabel="PCI tilt of entries, net of log income" formatX={(v) => v.toFixed(1)} formatY={(v) => v.toFixed(2)} height={340} />
            <p className="caption">Country-windows with at least three entries, both axes residualised on log GDP per head; colour is the cluster at the window's start. Slope {fmt(cur.a_est, 3)} ± {fmt(cur.a_se, 3)} PCI per pooled standard deviation of the indicator.</p>
          </div>
          <div className="col-narrow">
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Correlation with log income</td><td className="num">{fmt(cur.cor_income, 2)}</td></tr>
                  <tr><td>Country tilt, raw</td><td className="num">{fmt(cur.a_raw_est, 3)}{stars(cur.a_raw_p)}</td></tr>
                  <tr><td>Country tilt, with income</td><td className="num">{fmt(cur.a_est, 3)} ± {fmt(cur.a_se, 3)}{stars(cur.a_p)} (q {fmt(cur.a_q, 3)})</td></tr>
                  <tr><td>… 2003–2013 window only</td><td className="num">{fmt(cur.a_w1_est, 3)}{stars(cur.a_w1_p)}</td></tr>
                  <tr><td>… 2013–2023 window only</td><td className="num">{fmt(cur.a_w2_est, 3)}{stars(cur.a_w2_p)}</td></tr>
                  <tr><td>PCI of entered products, with income</td><td className="num">{fmt(cur.b_est, 3)} ± {fmt(cur.b_se, 3)}{stars(cur.b_p)} (q {fmt(cur.b_q, 3)})</td></tr>
                  <tr><td>Fixed-effects entry model, PCI × indicator (pp)</td><td className="num">{fmt(100 * cur.c_est, 2)} ± {fmt(100 * cur.c_se, 2)}{stars(cur.c_p)} (q {fmt(cur.c_q, 3)})</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>All indicators</h3>
        <div className="global-controls" style={{ paddingTop: 0 }}>
          <Ctrl label="Sort by"><Seg value={sortBy} options={[{ value: "a" as const, label: "Country tilt" }, { value: "b" as const, label: "Product PCI" }, { value: "c" as const, label: "FE entry model" }, { value: "cor" as const, label: "Least income-bound" }]} onChange={setSortBy} /></Ctrl>
          <Ctrl label="Show"><Seg value={onlyPass ? "p" : "a"} options={[{ value: "p", label: "Passing q ≤ 0.1 (country tilt)" }, { value: "a", label: "All" }]} onChange={(v) => setOnlyPass(v === "p")} /></Ctrl>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Indicator</th><th>Category</th><th className="num">Income corr.</th><th className="num">Tilt, raw</th><th className="num">Tilt, with income</th><th className="num">W1 / W2</th><th className="num">Product PCI</th><th className="num">FE model (pp)</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.tag} style={{ cursor: "pointer", fontWeight: x.tag === cur.tag ? 600 : 400 }} onClick={() => setSel(x.tag)}>
                  <td>{x.name} <span className="stat">{x.tag}</span></td>
                  <td><span className="swatch" style={{ background: catColor(x.category) }} />{x.category}</td>
                  <td className="num">{fmt(x.cor_income, 2)}</td>
                  <td className="num">{fmt(x.a_raw_est, 3)}{stars(x.a_raw_p)}</td>
                  <td className="num">{fmt(x.a_est, 3)}{stars(x.a_p)}{x.a_q <= 0.1 ? " ✓" : ""}</td>
                  <td className="num">{fmt(x.a_w1_est, 2)} / {fmt(x.a_w2_est, 2)}</td>
                  <td className="num">{fmt(x.b_est, 3)}{stars(x.b_p)}{x.b_q <= 0.1 ? " ✓" : ""}</td>
                  <td className="num">{fmt(100 * x.c_est, 2)}{stars(x.c_p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">Stars are per-test p-values; ✓ marks a Benjamini–Hochberg q ≤ 0.1 across the {screenMeta.n_indicators} indicators within that specification. V-Dem codes most indicators so that higher is more liberal or less of the bad thing; "HOS appoints cabinet in practice" runs the other way (higher = the head of state decides alone).</p>
      </div>

      <MethodBlock title="How the screen is run" summary="Three specifications per indicator, income in all of them, false-discovery control, and what the survivors have in common">
        <p><strong>The unit.</strong> Each indicator enters as its pooled z-score (the same standardisation as the country space) at the start of an entry window, 2005 for 2003–2013 and 2015 for 2013–2023. The outcome is the PCI tilt of the Mechanisms tab: the mean PCI of the products a country entered over the window minus the PCI it would have entered if only relatedness mattered. {screenMeta.n_country_windows} country-windows with at least three entries.</p>
        <p><strong>Specification (a), country level.</strong></p>
        <Formula html={`<math display="block"><mrow><msub><mi>tilt</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub><mo>=</mo><msub><mi>α</mi><mi>w</mi></msub><mo>+</mo><mi>β</mi><msub><mi>z</mi><mrow><mi>j</mi><mi>c</mi><mi>w</mi></mrow></msub><mo>+</mo><mi>δ</mi><mo>log</mo><msub><mi>GDPpc</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>ε</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub></mrow></math>`} />
        <p>β is the extra complexity of entries per standard deviation of the indicator at the same income; it is also estimated without income, and in each window alone, to see whether the two decades agree. <strong>(b), product level:</strong> on entered country-product pairs, the product's PCI on the country's density for it, the indicator and log income, so countries with many entries weigh more. <strong>(c), fixed effects:</strong> the entry model with country × window and product effects, the indicator interacted with density and with PCI, and log income interacted with both; the coefficient shown is PCI × indicator. Standard errors are clustered by country throughout.</p>
        <p><strong>False discovery.</strong> With {screenMeta.n_indicators} indicators, several will look significant by chance. Within each specification the p-values are corrected with Benjamini–Hochberg; the ✓ marks q ≤ 0.1, meaning that among the marked indicators about one in ten is expected to be a false positive. The fixed-effects specification is the most demanding and no indicator clears q ≤ 0.1 there; the "survive all three" list therefore uses an uncorrected p ≤ 0.05 for (c), and should be read as the shortlist, not as a proof.</p>
        <p><strong>Reading the scatter.</strong> The horizontal axis is how correlated the indicator is with log income across the same country-windows. Indicators on the right (health equality, corruption, impartial administration) are the liberal-democracy bundle that the earlier tab found to be mostly income; their income-controlled effects are estimated from little independent variation. The indicators that both pass and sit at moderate correlation are the informative ones.</p>
        <p><strong>What survives.</strong> At the default cut three families: how the state raises revenue (v2stfisccap: taxes on economic activity rather than natural resources or aid), meritocratic appointment in the administration and the armed forces (v2stcritrecadm, v2stcritapparm), and party organisation (permanent party organisations and local branches, v2psorgs and v2psprbrch), with the head of state appointing the cabinet alone (v2exdfcbhs) on the negative side. The fiscal indicator is the strongest single candidate: it clears every threshold, agrees across the two windows, and is only moderately income-bound. It is also the closest V-Dem gets to the resource-curse mechanism, now expressed as a within-income effect on what gets entered.</p>
        <p><strong>Caveats.</strong> A screen across 139 correlated indicators finds the family of the true signal, not its member; the state-capacity and party indicators move together. The sample is 145 economies over two decades, and PCI is defined by who exports what. This is a shortlist for a designed test, such as the fiscal indicator in an event study or with region fixed effects, not a finding on its own.</p>
      </MethodBlock>
    </div>
  );
}
