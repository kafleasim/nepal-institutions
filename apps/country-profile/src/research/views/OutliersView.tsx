import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterColor, clusterShort } from "../names";
import { Scatter, type ScatterPoint } from "../components/Scatter";
import { Ctrl, MethodBlock, Seg } from "../components/ui";
import { fmt, mean } from "../stats";

/**
 * Countries whose institutional cluster differs from most of their
 * geographic neighbours (Atlas subregion). Geography and institutions are
 * usually confounded; these are the cases where they come apart, so whether
 * their baskets look like their neighbours' or like their cluster-mates' is
 * informative about which one travels with the basket.
 */
export function OutliersView({ data, k }: Ctx) {
  const { cx, pairs, subregions } = data;
  const col = `ward_k${k}`;
  const [threshold, setThreshold] = useState<number>(0.75);
  const rows = useMemo(() => cx.filter((r) => r.year === 2023 && subregions[r.iso3]), [cx, subregions]);
  const sub = (iso: string) => subregions[iso];

  // Residual overlap (observed minus BiCM expectation) for each pair, keyed both ways.
  const resid = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pairs) {
      if (p.overlap_obs === null || p.overlap_exp === null) continue;
      const v = p.overlap_obs - p.overlap_exp;
      m.set(`${p.a}|${p.b}`, v);
      m.set(`${p.b}|${p.a}`, v);
    }
    return m;
  }, [pairs]);

  const table = useMemo(() => {
    return rows.map((r) => {
      const own = r[col] as number;
      const neigh = rows.filter((o) => o.iso3 !== r.iso3 && sub(o.iso3) === sub(r.iso3));
      const counts = new Map<number, number>();
      for (const n of neigh) counts.set(n[col] as number, (counts.get(n[col] as number) ?? 0) + 1);
      const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? own;
      const shareDiff = neigh.length ? neigh.filter((n) => n[col] !== own).length / neigh.length : NaN;
      const mates = rows.filter((o) => o.iso3 !== r.iso3 && (o[col] as number) === own && sub(o.iso3) !== sub(r.iso3));
      const rn = neigh.map((n) => resid.get(`${r.iso3}|${n.iso3}`)).filter((v): v is number => v !== undefined);
      const rm = mates.map((n) => resid.get(`${r.iso3}|${n.iso3}`)).filter((v): v is number => v !== undefined);
      const eciN = neigh.map((n) => n.eci).filter((v): v is number => v !== null);
      const eciM = mates.map((n) => n.eci).filter((v): v is number => v !== null);
      return {
        iso3: r.iso3, name: r.country_name, subregion: sub(r.iso3), own, modal, nNeigh: neigh.length, shareDiff,
        eci: r.eci, eciVsNeigh: r.eci === null || !eciN.length ? null : r.eci - mean(eciN),
        eciVsMates: r.eci === null || !eciM.length ? null : r.eci - mean(eciM),
        residNeigh: rn.length ? mean(rn) : null, residMates: rm.length ? mean(rm) : null,
        outlier: neigh.length >= 3 && shareDiff >= threshold && modal !== own,
      };
    });
  }, [rows, col, resid, threshold]);
  const outliers = table.filter((t) => t.outlier).sort((a, b) => b.shareDiff - a.shareDiff || a.name.localeCompare(b.name));
  const others = table.filter((t) => !t.outlier && t.nNeigh >= 3);
  const summ = (xs: typeof table, key: "residNeigh" | "residMates" | "eciVsNeigh" | "eciVsMates") => mean(xs.map((t) => t[key]).filter((v): v is number => v !== null));

  const pts: ScatterPoint[] = table
    .filter((t) => t.residNeigh !== null && t.residMates !== null && t.nNeigh >= 3)
    .map((t) => ({ x: t.residNeigh!, y: t.residMates!, label: t.name, color: clusterColor(t.own), r: t.outlier ? 5 : 3 }));

  return (
    <div>
      <p className="finding">
        Institutions and geography usually travel together, which is why the earlier tabs had to control for region. Here are the countries where they come apart: those in a different cluster from at least {Math.round(threshold * 100)}% of their subregion. For each, the question is whether its export basket resembles its neighbours or its institutional cluster-mates elsewhere, once size is netted out with the BiCM null.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Neighbours in another cluster">
          <Seg value={threshold} options={[{ value: 0.6, label: "≥ 60%" }, { value: 0.75, label: "≥ 75%" }, { value: 0.9, label: "≥ 90%" }]} onChange={setThreshold} />
        </Ctrl>
      </div>

      <div className="row section">
        <div className="col">
          <h3>Whom do their baskets resemble?</h3>
          <Scatter
            points={pts}
            xLabel="Mean residual overlap with subregion neighbours (products beyond BiCM expectation)"
            yLabel="Mean residual overlap with cluster-mates elsewhere"
            formatX={(v) => v.toFixed(0)}
            formatY={(v) => v.toFixed(0)}
            lines={[{ x1: -20, y1: -20, x2: 30, y2: 30, color: "#bbb", dashed: true }]}
            dim={(p) => !(p.r === 5)}
          />
          <p className="caption">Large dots are the outliers; small faint dots everyone else. Above the diagonal a country shares more products (beyond what its size predicts) with its cluster-mates than with its neighbours.</p>
        </div>
        <div className="col-narrow">
          <h3>On average</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th className="num">Outliers ({outliers.length})</th><th className="num">Others ({others.length})</th></tr></thead>
              <tbody>
                <tr><td>Residual overlap with neighbours</td><td className="num">{fmt(summ(outliers, "residNeigh"), 1)}</td><td className="num">{fmt(summ(others, "residNeigh"), 1)}</td></tr>
                <tr><td>Residual overlap with cluster-mates</td><td className="num">{fmt(summ(outliers, "residMates"), 1)}</td><td className="num">{fmt(summ(others, "residMates"), 1)}</td></tr>
                <tr><td>ECI minus neighbours' mean</td><td className="num">{fmt(summ(outliers, "eciVsNeigh"), 2)}</td><td className="num">{fmt(summ(others, "eciVsNeigh"), 2)}</td></tr>
                <tr><td>ECI minus cluster-mates' mean</td><td className="num">{fmt(summ(outliers, "eciVsMates"), 2)}</td><td className="num">{fmt(summ(others, "eciVsMates"), 2)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="caption">"Others" are countries with at least three subregion neighbours that are not outliers; for them neighbours and cluster-mates overlap heavily, so the two columns are the baseline.</p>
        </div>
      </div>

      <div className="section">
        <h3>The outliers at k = {k}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Country</th><th>Subregion</th><th>Own cluster</th><th>Neighbours' modal cluster</th><th className="num">Neighbours elsewhere</th><th className="num">ECI</th><th className="num">vs neighbours</th><th className="num">vs cluster</th><th className="num">Overlap: neighbours</th><th className="num">Overlap: cluster</th></tr>
            </thead>
            <tbody>
              {outliers.map((t) => (
                <tr key={t.iso3}>
                  <td>{t.name}</td>
                  <td>{t.subregion}</td>
                  <td><span className="swatch" style={{ background: clusterColor(t.own) }} />{clusterShort("ward", k, t.own)}</td>
                  <td><span className="swatch" style={{ background: clusterColor(t.modal) }} />{clusterShort("ward", k, t.modal)}</td>
                  <td className="num">{Math.round(100 * t.shareDiff)}% of {t.nNeigh}</td>
                  <td className="num">{fmt(t.eci)}</td>
                  <td className="num">{fmt(t.eciVsNeigh)}</td>
                  <td className="num">{fmt(t.eciVsMates)}</td>
                  <td className="num">{fmt(t.residNeigh, 1)}</td>
                  <td className="num">{fmt(t.residMates, 1)}</td>
                </tr>
              ))}
              {outliers.length === 0 && <tr><td colSpan={10} className="stat">No country meets the threshold at this k.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="caption">ECI columns: the country's 2023 ECI minus the mean of its subregion neighbours, and minus the mean of its cluster-mates outside the subregion. Overlap columns: products in common beyond the BiCM expectation, averaged over neighbours and over cluster-mates elsewhere.</p>
      </div>

      <MethodBlock title="How the outliers are found and read" summary="Subregions, the outlier rule, and the two comparisons">
        <p><strong>Neighbours.</strong> The Atlas assigns each economy to one of twenty UN subregions (South America, Western Asia, South-eastern Asia, and so on); a country's neighbours are the other ranked economies in its subregion. Subregions with fewer than three other members (Melanesia, Northern America, Australia and New Zealand) cannot produce an outlier.</p>
        <p><strong>The rule.</strong> A country is an outlier at the current k if at least the chosen share of its neighbours are in a different Ward cluster and the neighbours' most common cluster is not its own. Chile among the South American electoral democracies, Israel in Western Asia, Cambodia among the South-east Asian party-states and electoral regimes are the cases that motivated the tab; the rule finds them and others.</p>
        <p><strong>The two comparisons.</strong> For each country two reference groups are formed: its neighbours, and its cluster-mates outside its subregion. Against each, two quantities: the gap in ECI, and the mean residual overlap of baskets, which is the observed number of products both export with RCA ≥ 1 minus the number the bipartite configuration model expects from the two countries' diversification alone (Product space tab). A residual of +5 with neighbours and −2 with cluster-mates says the basket is a regional basket; the reverse says it travels with the institutions.</p>
        <p><strong>What this can and cannot show.</strong> The outliers are few and each has its own history, so the averages are indicative, not a test. But they are the only observations in which the institutional and the geographic explanation for a basket make different predictions, and the scatter shows which prediction wins case by case.</p>
      </MethodBlock>
    </div>
  );
}
