import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterColor, clusterShort, PS_COLORS } from "../names";
import { Strip, type StripGroup } from "../components/Strip";
import { Scatter } from "../components/Scatter";
import { Ctrl, Formula, MethodBlock, Seg } from "../components/ui";
import { fmt, withinBetweenTest, type PairValue } from "../stats";

export function DiversificationView({ data, k }: Ctx) {
  const { cx, entries, cxMeta, pairs } = data;
  const col = `ward_k${k}`;
  const [win, setWin] = useState<1 | 2>(2);
  const [sel, setSel] = useState<number>(2);
  const byK = entries.by_k.find((b) => b.k === k)!;
  const instYear = win === 1 ? 2005 : 2015;
  const prefix = win === 1 ? "e1" : "e2";

  const rows = useMemo(() => cx.filter((r) => r.year === instYear && r[`${prefix}_entries`] !== null), [cx, instYear, prefix]);
  const ids = useMemo(() => [...new Set(rows.map((r) => r[col] as number))].sort((a, b) => a - b), [rows, col]);
  const cur = ids.includes(sel) ? sel : ids[0];

  const groupsOf = (f: (r: Record<string, number | string | null>) => number | null): StripGroup[] =>
    ids.map((id) => ({
      id,
      label: clusterShort("ward", k, id),
      color: clusterColor(id),
      values: rows
        .filter((r) => r[col] === id)
        .map((r) => ({ v: f(r), label: r.country_name }))
        .filter((v): v is { v: number; label: string } => v.v !== null && !Number.isNaN(v.v)),
    }));

  const ratioGroups = groupsOf((r) => {
    const a = r[`${prefix}_entries`] as number | null, e = r[`${prefix}_expected`] as number | null;
    return a === null || e === null || e === 0 ? null : a / e;
  });
  const pciGroups = groupsOf((r) => r[`${prefix}_pci`] as number | null);
  const countGroups = groupsOf((r) => r[`${prefix}_entries`] as number | null);

  // Gradient lines from the R fit: p(entry) = rate + slope * (density - mean density).
  const lines = byK.gradients.map((g) => ({
    x1: 0.02,
    y1: g.entry_rate + g.slope * (0.02 - g.candidate_density),
    x2: 0.45,
    y2: g.entry_rate + g.slope * (0.45 - g.candidate_density),
    color: clusterColor(g.cluster),
  }));
  const pooledLine = { x1: 0.02, y1: entries.pooled.entry_rate + entries.pooled.slope * (0.02 - 0.14), x2: 0.45, y2: entries.pooled.entry_rate + entries.pooled.slope * (0.45 - 0.14), color: "#333", label: "all", dashed: true };

  // Co-entry similarity, 2013->2023 window, labels at 2015.
  const label2015 = useMemo(() => new Map(cx.filter((r) => r.year === 2015).map((r) => [r.iso3, r[col] as number])), [cx, col]);
  const coTest = useMemo(() => {
    const pv: PairValue[] = pairs.filter((p) => p.jaccard_entry !== null).map((p) => ({ a: p.a, b: p.b, v: p.jaccard_entry as number }));
    return withinBetweenTest(pv, label2015, 500, 13);
  }, [pairs, label2015]);

  const common = byK.common[String(cur)] ?? [];

  return (
    <div>
      <p className="finding">
        Diversification in the Atlas sense is entering products a country did not export before, and the strongest regularity is that entry follows relatedness: products close to the current basket are entered far more often. The question here is whether that gradient, and what is entered along it, differs by institutional cluster.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Window">
          <Seg value={win} options={[{ value: 1 as const, label: "2003 → 2013 (institutions 2005)" }, { value: 2 as const, label: "2013 → 2023 (institutions 2015)" }]} onChange={setWin} />
        </Ctrl>
      </div>

      <div className="section">
        <h3>Entry against relatedness, by cluster</h3>
        <div className="row">
          <div className="col">
            <Scatter points={[]} lines={[pooledLine, ...lines]} xLabel="Density at the start of the window (share of related products already in the basket)" yLabel="Probability of entry over ten years" formatX={(v) => v.toFixed(2)} formatY={(v) => `${(100 * v).toFixed(0)}%`} height={330} />
            <p className="caption">Linear probability fits of entry on density, one per cluster, both windows pooled with a window fixed effect; the dashed line is the fit on all countries. Lines are drawn through each cluster's mean density and entry rate; colours follow the table.</p>
          </div>
          <div className="col">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cluster</th><th className="num">Countries</th><th className="num">Entry rate</th><th className="num">Slope ± s.e.</th><th className="num">Actual / expected</th><th className="num">PCI of entries</th></tr></thead>
                <tbody>
                  {byK.gradients.map((g) => (
                    <tr key={g.cluster}>
                      <td><span className="swatch" style={{ background: clusterColor(g.cluster) }} />{clusterShort("ward", k, g.cluster)}</td>
                      <td className="num">{g.n_countries}</td>
                      <td className="num">{(100 * g.entry_rate).toFixed(1)}%</td>
                      <td className="num">{fmt(g.slope, 3)} ± {fmt(g.slope_se, 3)}</td>
                      <td className="num">{fmt(g.actual_over_expected, 2)}</td>
                      <td className="num">{fmt(g.entered_pci, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="caption">
              Wald test that the slopes are equal across clusters: F = {byK.slope_test.stat}, p = {byK.slope_test.p}. That the intercepts are equal: F = {byK.intercept_test.stat}, p = {byK.intercept_test.p}. Pooled slope {entries.pooled.slope} ± {entries.pooled.se} over {entries.pooled.n.toLocaleString()} country-product candidates.
            </p>
          </div>
        </div>
      </div>

      <div className="row section">
        <div className="col">
          <h3>Entries relative to what density predicts</h3>
          <Strip groups={ratioGroups} yLabel="Actual entries / expected from density" format={(v) => v.toFixed(2)} height={300} />
          <p className="caption">Per country: products entered over the window divided by the sum of entry probabilities the pooled density model assigns to its candidate products. 1 means as many entries as relatedness alone predicts.</p>
        </div>
        <div className="col">
          <h3>Complexity of what was entered</h3>
          <Strip groups={pciGroups} yLabel="Mean PCI of entered products" format={(v) => v.toFixed(2)} height={300} />
          <p className="caption">Per country: mean product complexity index (in the end year) of the products it entered. Countries with no entries are absent.</p>
        </div>
      </div>
      <div className="section">
        <h3>Number of entries</h3>
        <Strip groups={countGroups} yLabel="Products entered over the window" format={(v) => v.toFixed(0)} height={260} zeroLine={false} />
      </div>

      <div className="row section">
        <div className="col">
          <h3>Products entered in common, 2013 → 2023</h3>
          <div className="chips" style={{ marginBottom: 8 }}>
            {ids.map((id) => (
              <button key={id} className={`chip${id === cur ? " is-active" : ""}`} style={id === cur ? { background: clusterColor(id), borderColor: clusterColor(id) } : {}} onClick={() => setSel(id)}>{clusterShort("ward", k, id)}</button>
            ))}
          </div>
          {common.length === 0 ? (
            <p className="stat">Too few members for this cluster.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>Community</th><th className="num">Entered by</th><th className="num">World</th></tr></thead>
                <tbody>
                  {common.map((c) => (
                    <tr key={c.product}>
                      <td>{c.product} {c.name_short}</td>
                      <td><span className="swatch" style={{ background: PS_COLORS[String(c.ps ?? "NA")] }} />{c.ps === null ? "–" : cxMeta.ps_names[String(c.ps)]}</td>
                      <td className="num">{c.n_entered} of {c.n} ({(100 * c.share).toFixed(0)}%)</td>
                      <td className="num">{(100 * c.world_share).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="caption">Among the cluster's members for which the product was a candidate (RCA below 0.5 in 2013), the share that had entered it by 2023, against the same share among all ranked economies. Sorted by the gap; at least two entrants.</p>
        </div>
        <div className="col-narrow">
          <h3>Do cluster-mates enter the same products?</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>Mean Jaccard of entry sets, same 2015 cluster</td><td className="num">{fmt(coTest.within, 4)}</td></tr>
                <tr><td>Different clusters</td><td className="num">{fmt(coTest.between, 4)}</td></tr>
                <tr><td>Difference</td><td className="num"><strong>{fmt(coTest.observed, 4)}</strong></td></tr>
                <tr><td>Permutation p-value</td><td className="num">{fmt(coTest.p, 3)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="caption">Overlap of the sets of products two countries entered between 2013 and 2023, within and between clusters. Entry is rare (about {(100 * entries.pooled.entry_rate).toFixed(1)}% of candidates), so the overlaps are small; what matters is the gap and its p-value.</p>
        </div>
      </div>

      <MethodBlock title="How diversification is measured" summary="Entry, density, the linear probability model with clustered errors, expected entries, and the co-entry test">
        <p><strong>Entry.</strong> For each country and each HS4 product, the product is a candidate at the start of a window if the country's RCA is below 0.5 ({entries.candidate_rule}); it has been entered if RCA is at least 1 at the end of the window and in the year before ({entries.entry_rule}), the second condition dropping one-year blips. Two windows: 2003–2013, paired with the 2005 institutional cluster, and 2013–2023, paired with 2015. That gives {entries.pooled.n.toLocaleString()} country-product candidates of which {(100 * entries.pooled.entry_rate).toFixed(1)}% were entered.</p>
        <p><strong>Density.</strong> The Atlas measure of how related a product is to what a country already exports,</p>
        <Formula html={`<math display="block"><mrow><msub><mi>ω</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>=</mo><mfrac><mrow><munder><mo>∑</mo><msup><mi>p</mi><mo>′</mo></msup></munder><msub><mi>φ</mi><mrow><mi>p</mi><msup><mi>p</mi><mo>′</mo></msup></mrow></msub><msub><mi>M</mi><mrow><mi>c</mi><msup><mi>p</mi><mo>′</mo></msup></mrow></msub></mrow><mrow><munder><mo>∑</mo><msup><mi>p</mi><mo>′</mo></msup></munder><msub><mi>φ</mi><mrow><mi>p</mi><msup><mi>p</mi><mo>′</mo></msup></mrow></msub></mrow></mfrac></mrow></math>`} />
        <p>where φ<sub>pp′</sub> is the proximity between two products (the minimum of the two conditional probabilities that a country with RCA in one has RCA in the other) and M<sub>cp′</sub> marks the country's current basket. It is between 0 and 1: the share of a product's proximity-weighted neighbours the country already makes. The Atlas ships it as 1 − distance and it is used here as given, at the start of each window.</p>
        <p><strong>The model.</strong> A linear probability model,</p>
        <Formula html={`<math display="block"><mrow><mi>Pr</mi><mo>(</mo><msub><mi>entry</mi><mrow><mi>c</mi><mi>p</mi><mi>w</mi></mrow></msub><mo>)</mo><mo>=</mo><msub><mi>α</mi><mrow><mi>g</mi><mo>(</mo><mi>c</mi><mo>)</mo></mrow></msub><mo>+</mo><msub><mi>β</mi><mrow><mi>g</mi><mo>(</mo><mi>c</mi><mo>)</mo></mrow></msub><msub><mi>ω</mi><mrow><mi>c</mi><mi>p</mi><mi>w</mi></mrow></msub><mo>+</mo><msub><mi>γ</mi><mi>w</mi></msub></mrow></math>`} />
        <p>with an intercept α and a density slope β for each institutional cluster g(c) and a fixed effect γ for the window. Standard errors are clustered by country, because a country's candidates are not independent draws. The "slope" column is β<sub>g</sub>: how many percentage points of entry probability a one-unit rise in density buys in that cluster. The Wald tests ask whether the β<sub>g</sub> are all equal, and separately whether the α<sub>g</sub> are.</p>
        <p><strong>Expected entries.</strong> The same model fitted with one α and one β for all countries gives every candidate a predicted probability. Summing those over a country's candidates gives the number of entries relatedness alone would predict; the ratio of actual to expected is a country-level score of over- or under-diversification given its starting position. Averaging by cluster asks whether some institutional types diversify more than their product space would suggest.</p>
        <p><strong>Complexity of entries.</strong> The mean PCI (end-year) of the products a country entered. Relatedness pulls entries toward the current basket; a cluster whose entries are more complex than its density would suggest is moving up the space, not just across it.</p>
        <p><strong>Co-entry.</strong> The same Jaccard-and-permutation test as the product-space tab, applied to the sets of products entered between 2013 and 2023, with clusters taken at 2015. This is the closest thing here to "co-movement": whether countries of the same institutional type diversified into the same things over the same decade. The products-in-common table is the descriptive side of the same question.</p>
        <p><strong>Caveats.</strong> Entry is rare and lumpy; the linear model can predict probabilities below zero for very isolated products (they are floored at zero when computing expected entries); and institutional cluster is measured once, at the start of the window, while regimes can change within it.</p>
      </MethodBlock>
    </div>
  );
}
