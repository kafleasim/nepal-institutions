import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterColor, clusterName, clusterShort } from "../names";
import { Heatmap } from "../components/Heatmap";
import { BarList } from "../components/BarList";
import { Formula, MethodBlock, Seg, Ctrl } from "../components/ui";
import { Scatter, type ScatterPoint } from "../components/Scatter";
import { mean, sd } from "../stats";

const stars = (p: number) => (p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "");

export function MechanismsView({ data, k }: Ctx) {
  const { mechanisms: M, tilt } = data;
  const byK = M.by_k.find((b) => b.k === k)!;
  const [axis, setAxis] = useState<"complexity" | "differentiation">("complexity");
  const [cm, setCm] = useState<string>("v2x_rule");
  const [partial, setPartial] = useState(false);
  const col = `ward_k${k}`;
  const ids = useMemo(() => [...new Set(byK.relative.map((r) => r.cluster!))].sort((a, b) => a - b), [byK]);
  const classes = axis === "complexity" ? ["low PCI", "mid PCI", "high PCI"] : ["homogeneous or reference-priced", "differentiated"];
  const rel = (cluster: number, cls: string) => byK.relative.find((r) => r.cluster === cluster && r.axis === axis && r.class === cls);
  const relPc1 = (g: string, cls: string) => M.pc1_terciles.find((r) => r.group === g && r.axis === axis && r.class === cls);
  const pc1Groups = ["Least liberal third", "Middle third", "Most liberal third"];

  const measures = Object.keys(M.measures);
  const coef = (m: string, term: string) => M.continuous.find((c) => c.measure === m && c.term === term);

  return (
    <div>
      <p className="finding">
        Relatedness predicts what a country enters next, but not everything equally. Here the entry model is asked whether institutions tilt entry toward more complex products, or toward the differentiated goods that depend on contracts, holding the country's relatedness to each product fixed. Raw, every institutional measure tilts entry toward complexity and none acts through differentiation. Once income is held fixed, most of the complexity tilt turns out to be income: it survives, at about a third of its size, only in the country-level formulation at the bottom of the page.
      </p>

      <div className="section">
        <h3>Entries relative to what relatedness predicts, by product class</h3>
        <div className="global-controls" style={{ paddingTop: 0 }}>
          <Ctrl label="Product classes">
            <Seg value={axis} options={[{ value: "complexity" as const, label: "PCI terciles" }, { value: "differentiation" as const, label: "Rauch differentiation" }]} onChange={setAxis} />
          </Ctrl>
        </div>
        <div className="row">
          <div className="col">
            <Heatmap
              rows={ids.map((id) => ({ id: String(id), label: clusterName("ward", k, id), color: clusterColor(id) }))}
              cols={classes.map((c) => ({ id: c, label: c }))}
              value={(r, c) => { const x = rel(Number(r), c); return x ? x.ratio - 1 : null; }}
              format={(v) => (v + 1).toFixed(2)}
              domain={[-1, 1]}
              cellW={78}
            />
            <p className="caption">By institutional cluster at the start of each window. Cell = products entered ÷ entries the pooled density model predicts for those candidates; 1.00 means as many as relatedness alone implies, 0.50 half as many.</p>
          </div>
          <div className="col">
            <Heatmap
              rows={pc1Groups.map((g) => ({ id: g, label: g }))}
              cols={classes.map((c) => ({ id: c, label: c }))}
              value={(r, c) => { const x = relPc1(r, c); return x ? x.ratio - 1 : null; }}
              format={(v) => (v + 1).toFixed(2)}
              domain={[-1, 1]}
              cellW={78}
            />
            <p className="caption">The same, by thirds of the liberal-democracy component (PC1) rather than by cluster, so the reading does not depend on the partition.</p>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Institutions × product traits in the entry model</h3>
        <div className="row">
          <div className="col">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Institutional measure m (z-scored)</th><th className="num">density × m</th><th className="num">PCI × m</th><th className="num">differentiation × m</th></tr></thead>
                <tbody>
                  {measures.map((m) => (
                    <tr key={m}>
                      <td>{M.measures[m]}</td>
                      {["density0:m", "m:pci_z", "m:diff_c"].map((t) => {
                        const c = coef(m, t);
                        return <td key={t} className="num">{c ? `${(100 * c.est).toFixed(2)} ± ${(100 * c.se).toFixed(2)}${stars(c.p)}` : "–"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">Coefficients in percentage points of entry probability per standard deviation of m, per unit of density, per standard deviation of PCI, and per unit (0 to 1) of the differentiated share. Country × window and product fixed effects; standard errors clustered by country. {M.n_candidates.toLocaleString()} candidates, {M.n_countries} countries, {M.n_products} products. *** p&lt;0.001, ** p&lt;0.01, * p&lt;0.05.</p>
          </div>
          <div className="col-narrow">
            <h3>PCI × m</h3>
            <BarList items={measures.map((m) => ({ label: M.measures[m], value: 100 * (coef(m, "m:pci_z")?.est ?? 0) }))} format={(v) => v.toFixed(2)} labelW={200} width={460} />
            <p className="caption">Raw: every pro-institution measure raises entry into complex products conditional on relatedness; corruption, coded the other way, lowers it. See the continuous section below for what remains once income is held fixed.</p>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>By cluster, relative to {clusterName("ward", k, byK.ref)}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cluster</th><th className="num">density slope</th><th className="num">PCI × cluster</th><th className="num">differentiation × cluster</th></tr></thead>
            <tbody>
              {ids.map((id) => {
                const g = (v: "density" | "diff" | "pci") => byK.coefs.find((c) => c.cluster === id && c.var === v);
                return (
                  <tr key={id}>
                    <td><span className="swatch" style={{ background: clusterColor(id) }} />{clusterShort("ward", k, id)}{id === byK.ref ? " (reference)" : ""}</td>
                    <td className="num">{g("density") ? `${(100 * g("density")!.est).toFixed(2)} ± ${(100 * g("density")!.se).toFixed(2)}${stars(g("density")!.p)}` : "–"}</td>
                    <td className="num">{id === byK.ref ? "0" : g("pci") ? `${(100 * g("pci")!.est).toFixed(2)} ± ${(100 * g("pci")!.se).toFixed(2)}${stars(g("pci")!.p)}` : "–"}</td>
                    <td className="num">{id === byK.ref ? "0" : g("diff") ? `${(100 * g("diff")!.est).toFixed(2)} ± ${(100 * g("diff")!.se).toFixed(2)}${stars(g("diff")!.p)}` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="caption">Product traits are absorbed by the product fixed effect, so their interactions with cluster are differences from the reference cluster (the largest). Density varies within a product, so each cluster has its own slope. Clusters with fewer than 500 candidates are omitted.</p>
      </div>

      <div className="section">
        <h2>Continuous: the complexity of what gets entered</h2>
        <p className="stat">Per country and window, the mean PCI of the products entered minus the PCI relatedness alone would have delivered (candidates' PCI weighted by the density model's entry probabilities). {M.tilt_n} country-windows with at least three entries.</p>
        <div className="global-controls" style={{ paddingTop: 0 }}>
          <Ctrl label="Institutional measure">
            <Seg value={cm} options={measures.map((m) => ({ value: m, label: M.measures[m].replace("V-Dem ", "").replace(" index", "") }))} onChange={setCm} />
          </Ctrl>
          <Ctrl label="Income">
            <Seg value={partial ? "p" : "r"} options={[{ value: "r", label: "Raw" }, { value: "p", label: "Partial out log GDP per head" }]} onChange={(v) => setPartial(v === "p")} />
          </Ctrl>
        </div>
        {(() => {
          const rows = tilt.filter((t) => t[cm] !== null && t.lgdp !== null);
          const xs = rows.map((t) => t[cm] as number), ys = rows.map((t) => t.tilt), ls = rows.map((t) => t.lgdp);
          const mx = mean(xs), sx = sd(xs);
          // Frisch–Waugh: residualise both x and y on log income when partialling.
          const resid = (v: number[]) => {
            const ml = mean(ls), mv = mean(v);
            let sxy = 0, sxx = 0;
            for (let i = 0; i < v.length; i++) { sxy += (ls[i] - ml) * (v[i] - mv); sxx += (ls[i] - ml) ** 2; }
            const b = sxx ? sxy / sxx : 0;
            return v.map((vi, i) => vi - b * (ls[i] - ml) );
          };
          const X = partial ? resid(xs.map((x) => (x - mx) / sx)) : xs.map((x) => (x - mx) / sx);
          const Y = partial ? resid(ys) : ys;
          const pts: ScatterPoint[] = rows.map((t, i) => ({ x: X[i], y: Y[i], label: `${t.iso3} ${t.window}`, color: clusterColor(t[col] as number) }));
          const c = M.continuous_pci.find((r) => r.measure === cm && r.model === (partial ? "tilt_income" : "tilt") && r.term === "m");
          const xlo = Math.min(...X), xhi = Math.max(...X);
          const my = mean(Y), mX = mean(X);
          const line = c ? [{ x1: xlo, y1: my + c.est * (xlo - mX), x2: xhi, y2: my + c.est * (xhi - mX), color: "#333" }] : [];
          return (
            <div className="row">
              <div className="col">
                <Scatter points={pts} lines={line} xLabel={`${M.measures[cm]} (standard deviations${partial ? ", net of log income" : ""})`} yLabel={`PCI tilt of entries${partial ? " (net of log income)" : ""}`} formatX={(v) => v.toFixed(1)} formatY={(v) => v.toFixed(2)} height={360} />
                <p className="caption">One dot per country and window, coloured by the country's cluster at the window's start. The line is the regression slope from the table{c ? ` (${c.est.toFixed(3)} ± ${c.se.toFixed(3)} PCI per standard deviation)` : ""}, with a window fixed effect, drawn through the means.</p>
              </div>
              <div className="col-narrow">
                <h3>Slopes on {M.measures[cm]}</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Specification</th><th className="num">Raw</th><th className="num">With log GDP per head</th></tr></thead>
                    <tbody>
                      {([
                        ["PCI of each entered product, on density + m", "entry_pci", "entry_pci_income"],
                        ["Country tilt, on m", "tilt", "tilt_income"],
                        ["Entry model, PCI × m (fixed effects)", "entry_fe", "entry_fe_income"],
                      ] as [string, string, string][]).map(([lab, a, b]) => {
                        const ra = M.continuous_pci.find((r) => r.measure === cm && r.model === a && (r.term === "m" || r.term === "pci_z:m"));
                        const rb = M.continuous_pci.find((r) => r.measure === cm && r.model === b && (r.term === "m" || r.term === "pci_z:m"));
                        const f = (r?: typeof ra) => (r ? `${(a === "entry_fe" ? 100 * r.est : r.est).toFixed(a === "entry_fe" ? 2 : 3)} ± ${(a === "entry_fe" ? 100 * r.se : r.se).toFixed(a === "entry_fe" ? 2 : 3)}${stars(r.p)}` : "–");
                        return <tr key={a}><td>{lab}</td><td className="num">{f(ra)}</td><td className="num">{f(rb)}</td></tr>;
                      })}
                      {(() => { const r = M.continuous_pci.find((x) => x.measure === cm && x.model === "entry_fe_income" && x.term === "pci_z:lgdp_z"); return r ? <tr><td>Entry model, PCI × log GDP per head</td><td className="num">–</td><td className="num">{(100 * r.est).toFixed(2)} ± {(100 * r.se).toFixed(2)}{stars(r.p)}</td></tr> : null; })()}
                    </tbody>
                  </table>
                </div>
                <p className="caption">First two rows in PCI units per standard deviation of the measure; the last two in percentage points of entry probability per SD of PCI per SD of the measure (or of log income). Window fixed effects throughout; standard errors clustered by country.</p>
              </div>
            </div>
          );
        })()}
      </div>

      <MethodBlock title="How the mechanism test is built" summary="Product traits, the fixed-effects entry model, and why differentiation rather than Nunn's contract intensity">
        <p><strong>The question.</strong> The Diversification tab showed that entry follows relatedness in every cluster. This tab asks whether institutions change <em>which</em> related products get entered. Two product traits are used: the Atlas product complexity index (PCI) in the window's end year, and Rauch's (1999) classification of the product as differentiated, reference-priced or traded on an organised exchange, expressed as the share of the HS4 product's SITC rev. 2 lines that are differentiated (conservative classification; concordances from the R package <code>concordance</code>).</p>
        <p><strong>Why not Nunn's measure directly.</strong> Nunn (2007) measures an industry's contract intensity as the share of its <em>inputs</em> that are differentiated in Rauch's sense, weighted by the 1997 US input-output table. His file sits behind a browser check on his data page and was not fetched; if it is placed at <code>data/nunn/contract_intensity_io1997.dta</code> the pipeline will prefer it. Meanwhile the product's own differentiation is the ingredient of his measure, and is the classification Berkowitz, Moenius and Pistor (2006) use for institution-sensitive goods. {M.diff_source} is what the tables above use.</p>
        <p><strong>The model.</strong> On the same candidate pairs as the Diversification tab (RCA below 0.5 at the start of a window, {M.n_candidates.toLocaleString()} of them, entry rate {(100 * M.entry_rate).toFixed(1)}%),</p>
        <Formula html={`<math display="block"><mrow><msub><mi>entry</mi><mrow><mi>c</mi><mi>p</mi><mi>w</mi></mrow></msub><mo>=</mo><msub><mi>α</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>α</mi><mi>p</mi></msub><mo>+</mo><mi>β</mi><msub><mi>ω</mi><mrow><mi>c</mi><mi>p</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>γ</mi><mn>1</mn></msub><msub><mi>ω</mi><mrow><mi>c</mi><mi>p</mi><mi>w</mi></mrow></msub><msub><mi>m</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>γ</mi><mn>2</mn></msub><msub><mi>PCI</mi><mrow><mi>p</mi><mi>w</mi></mrow></msub><msub><mi>m</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>γ</mi><mn>3</mn></msub><msub><mi>diff</mi><mi>p</mi></msub><msub><mi>m</mi><mrow><mi>c</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>ε</mi><mrow><mi>c</mi><mi>p</mi><mi>w</mi></mrow></msub></mrow></math>`} />
        <p>where m is an institutional measure at the window's start (a pooled-PCA score or a V-Dem index, z-scored), ω is density, α<sub>cw</sub> a country × window fixed effect and α<sub>p</sub> a product fixed effect. The country effect absorbs everything about how much a country diversifies; the product effect absorbs everything about how often a product is entered. What remains identified is whether, within a country, the products it enters are more complex or more differentiated the more liberal (or law-bound, or clean) its institutions, at the same relatedness. This is the Rajan–Zingales design of Nunn (2007) and Levchenko (2007), applied to entry rather than to export levels.</p>
        <p><strong>Reading γ<sub>2</sub>.</strong> A coefficient of 0.5 (in the table's units) says that one standard deviation more of m raises the entry probability of a product one standard deviation above the mean PCI by half a percentage point, against a base rate of about {(100 * M.entry_rate).toFixed(1)}%. That is a large tilt: the least liberal third of countries enter high-PCI candidates at about a third of what their relatedness predicts, the most liberal third at about nine-tenths.</p>
        <p><strong>The continuous formulation.</strong> Three regressions put the same question in continuous terms. (a) On entered country-product pairs only, the PCI of the product on the country's density for it, the institutional measure and, in the second column, log GDP per head: the coefficient on m is the extra complexity of an entered product per standard deviation of institutions at the same relatedness and income. (b) A country-level version: for each country and window, the mean PCI of what it entered minus the PCI it would have entered if only relatedness mattered, which is the candidates' PCI weighted by the pooled density model's entry probabilities; that tilt on m, with and without income. (c) The fixed-effects model above with a PCI × log-income interaction added beside PCI × m. V-Dem indices run from 0 to 1, so a log would not mean much; the measures are standardised instead, and "per standard deviation" is the unit throughout.</p>
        <p><strong>What income does to it.</strong> Adding log GDP per head removes almost all of the institutional tilt in (a) and in (c): the PCI × income term takes the whole effect and the PCI × institutions term falls to zero. In (b), the country-level tilt, a coefficient about a third of the raw size survives for rule of law, liberal democracy, property rights and corruption. So the defensible statement is that richer countries enter more complex products given relatedness, and that among countries of the same income the ones with better institutions do so slightly more, with the evidence for the second part resting on one of the three specifications.</p>
        <p><strong>The cluster version.</strong> The same model with the cluster factor in place of m. Because PCI and differentiation are product-level and absorbed by α<sub>p</sub>, their cluster interactions are identified only as differences from a reference cluster, which is set to the largest.</p>
        <p><strong>The binned tables.</strong> For each institutional group and product class, the ratio of entries to the entries predicted by the pooled density model of the Diversification tab. It is the same content as the regressions, without the functional form: it shows where in the product space each type of regime actually goes when it diversifies.</p>
        <p><strong>Caveats.</strong> PCI is itself a function of who exports what, so rich liberal democracies partly define what "complex" means. The differentiation share is coarse (three classes at the SITC 4-digit level) and its null result may be a measurement result. And the institutional measure is taken once per window, at the start.</p>
      </MethodBlock>
    </div>
  );
}
