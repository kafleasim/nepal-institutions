import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Ctx } from "../ctx";
import { clusterOf, type Point } from "../data";
import { clusterBlurb, clusterColor, clusterName, clusterShort } from "../names";
import { ClusterMap } from "../components/ClusterMap";
import { Dendrogram } from "../components/Dendrogram";
import { Ctrl, Formula, MethodBlock, Seg } from "../components/ui";
import { fmt } from "../stats";
import { GL } from "../../lib/glTokens";

export function ClustersView({ data, k, method }: Ctx) {
  const { meta, points } = data;
  const [year, setYear] = useState<number | "all">(2025);
  const [selected, setSelected] = useState<number | null>(null);
  const [labels, setLabels] = useState(false);

  const shown = useMemo(() => (year === "all" ? points : points.filter((p) => p.year === year)), [points, year]);
  const backdrop = useMemo(() => (year === "all" ? [] : points.filter((p) => p.year !== year)), [points, year]);
  const ids = useMemo(() => [...new Set(shown.map((p) => clusterOf(p, method, k)))].sort((a, b) => a - b), [shown, method, k]);
  const counts = useMemo(() => {
    const m = new Map<number, Point[]>();
    for (const p of shown) {
      const c = clusterOf(p, method, k);
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(p);
    }
    return m;
  }, [shown, method, k]);
  const labelled = useMemo(() => new Set(labels ? shown.map((p) => p.country_name) : []), [labels, shown]);
  const diag = meta.diagnostics;
  const kEff = method === "louvain" ? meta.louvain_k : k;

  return (
    <div>
      <p className="finding">
        The map is the country space the tool already draws: every country in six benchmark years, laid out by UMAP from the same z-scored V-Dem indicators that rank peers. The colours are a partition of those country-years into {kEff} groups, fitted in the indicator space itself, not on the picture.
      </p>

      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Year">
          <Seg value={year} options={[...meta.years.map((y) => ({ value: y as number | "all", label: String(y) })), { value: "all" as const, label: "All" }]} onChange={setYear} />
        </Ctrl>
        <Ctrl label="Labels">
          <Seg value={labels ? "on" : "off"} options={[{ value: "off", label: "Hover" }, { value: "on", label: "All" }]} onChange={(v) => setLabels(v === "on")} />
        </Ctrl>
      </div>

      <div className="row section">
        <div className="col">
          <ClusterMap
            points={shown}
            backdrop={backdrop}
            colorOf={(p) => clusterColor(clusterOf(p, method, k))}
            labelOf={(p) => clusterName(method, kEff, clusterOf(p, method, k))}
            labelled={labelled}
            highlight={selected === null ? undefined : (p) => clusterOf(p, method, k) === selected}
          />
          <p className="caption">
            Joint UMAP of {meta.n_country_years} country-years ({meta.n_countries} countries, {meta.years.join(", ")}) on {meta.n_indicators} indicators. Grey dots are the other years. Axes are UMAP units and mean nothing beyond nearness.
          </p>
        </div>
        <div className="col-narrow">
          <div className="legend">
            {ids.map((id) => (
              <div key={id} className={`legend-item${selected === id ? " is-active" : ""}`} onClick={() => setSelected(selected === id ? null : id)}>
                <span className="swatch" style={{ background: clusterColor(id) }} />
                <span>{clusterName(method, kEff, id)}</span>
                <span className="legend-n">{counts.get(id)?.length ?? 0}</span>
              </div>
            ))}
          </div>
          {selected !== null && (
            <div className="section">
              {clusterBlurb(method, kEff, selected) && <p className="note">{clusterBlurb(method, kEff, selected)}</p>}
              <p className="members">
                {(counts.get(selected) ?? [])
                  .map((p) => (year === "all" ? `${p.country_name} ${p.year}` : p.country_name))
                  .sort()
                  .join(" · ")}
              </p>
            </div>
          )}
          {method !== "ward" && (
            <p className="note">
              {method === "kmeans"
                ? "k-means partitions are not nested: moving k re-fits everything. Names exist only for the Ward cut, so clusters are numbered."
                : `Louvain chooses its own number of communities (${meta.louvain_k} here, modularity ${meta.louvain_modularity}); the k slider does not apply.`}
            </p>
          )}
        </div>
      </div>

      {method === "ward" && (
        <div className="section">
          <h2>How the partition nests</h2>
          <Dendrogram merges={meta.merges} points={points} kMax={meta.k_max} k={k} colorAtK={clusterColor} nameAtK={(id) => clusterShort("ward", k, id)} />
          <p className="caption">
            The top of the Ward tree, from k = {meta.k_max} leaves (sizes below each) up to one root. Each horizontal bar is a merge, drawn at its cost, the increase in within-cluster sum of squares, on a log scale. The dashed line is the current cut. The root split separates the consolidated liberal democracies from everyone else; the next separates the electoral regimes (contested and open) from the closed ones, and within the closed branch the party-states and the monarchies are the last to be absorbed.
          </p>
        </div>
      )}

      <div className="row section">
        <div className="col">
          <h2>Choosing k</h2>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={diag} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={GL.border} strokeDasharray="3 3" />
                <XAxis dataKey="k" tick={{ fontSize: 11, fill: GL.muted }} tickLine={false} />
                <YAxis domain={[0, 0.8]} tick={{ fontSize: 11, fill: GL.muted }} tickLine={false} width={36} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => fmt(v as number, 3)} />
                <ReferenceLine x={kEff} stroke={GL.text} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="stability" name="Bootstrap stability (ARI)" stroke={GL.blue} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="silhouette" name="Mean silhouette" stroke={GL.highlight} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="ari_ward_kmeans" name="Ward vs k-means agreement (ARI)" stroke={GL.muted} strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="caption">
            Blue: how much of the partition survives refitting on 80% subsamples ({meta.bootstrap_draws} draws, adjusted Rand index). Red: mean silhouette in the indicator space. Grey: agreement between Ward and k-means at the same k.
          </p>
        </div>
        <div className="col-narrow">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>k</th><th className="num">Silh.</th><th className="num">Stab.</th><th className="num">CH</th><th className="num">Smallest</th></tr>
              </thead>
              <tbody>
                {diag.map((d) => (
                  <tr key={d.k} style={{ fontWeight: d.k === kEff ? 600 : 400 }}>
                    <td>{d.k}</td>
                    <td className="num">{fmt(d.silhouette, 3)}</td>
                    <td className="num">{fmt(d.stability, 2)}</td>
                    <td className="num">{fmt(d.ch, 0)}</td>
                    <td className="num">{d.smallest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="note">
        Why six. Silhouettes are low at every k, which says the clusters are regions of a continuum rather than islands (see the method note). Stability is the more useful guide: it peaks at k = 4 and stays above 0.6 through k = 6, then falls. k = 4 folds the party-states and the monarchies into one closed-regime group with the repressive personalist regimes; k = 5 separates them as one group; k = 6 separates them from each other, and the two are institutionally distinct in ways that matter for the complexity questions (state ownership versus rentier private economies). Above six the next splits carve the large electoral clusters into pieces that do not stay put under resampling.
      </p>

      <MethodBlock title="How the clusters are formed" summary="One matrix, one distance, three partitioning rules, and how k was chosen">
        <p><strong>The matrix.</strong> The rows are country-years: every country observed in V-Dem in {meta.years.join(", ")}, giving {meta.n_country_years} rows. The columns are the {meta.n_indicators} V-Dem component indicators that clear a 50% coverage rule in every one of those years (the same rule as the animated map). Missing cells ({meta.n_imputed_cells}, about {(100 * meta.n_imputed_cells / (meta.n_country_years * meta.n_indicators)).toFixed(1)}%) are filled with the column mean. Each column is then standardised over the whole pool:</p>
        <Formula html={`<math display="block"><mrow><msub><mi>z</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>=</mo><mfrac><mrow><msub><mi>x</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>−</mo><msub><mi>μ</mi><mi>j</mi></msub></mrow><msub><mi>σ</mi><mi>j</mi></msub></mfrac></mrow></math>`} />
        <p>where <em>i</em> is a country-year and <em>j</em> an indicator. A z of +1 means one standard deviation above the pooled 1975–2025 average, so the same numbers mean the same thing in every year. V-Dem codes most indicators so that higher is more liberal or less of the bad thing (higher "public sector theft" means <em>less</em> theft), which is worth remembering when reading the profiles.</p>
        <p><strong>The distance.</strong> Two country-years are compared by Euclidean distance on their z-vectors,</p>
        <Formula html={`<math display="block"><mrow><mi>d</mi><mo>(</mo><mi>a</mi><mo>,</mo><mi>b</mi><mo>)</mo><mo>=</mo><msqrt><mrow><munder><mo>∑</mo><mi>j</mi></munder><msup><mrow><mo>(</mo><msub><mi>z</mi><mrow><mi>a</mi><mi>j</mi></mrow></msub><mo>−</mo><msub><mi>z</mi><mrow><mi>b</mi><mi>j</mi></mrow></msub><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mrow></math>`} />
        <p>which is exactly the distance that ranks institutional peers on the country page and that UMAP starts from. Nothing in the clustering uses the two-dimensional picture.</p>
        <p><strong>Ward's method</strong> (the default). Start with every country-year as its own cluster and repeatedly merge the two clusters whose union increases the total within-cluster sum of squares the least. For clusters A and B with means μ<sub>A</sub>, μ<sub>B</sub> that increase is</p>
        <Formula html={`<math display="block"><mrow><mi>Δ</mi><mo>(</mo><mi>A</mi><mo>,</mo><mi>B</mi><mo>)</mo><mo>=</mo><mfrac><mrow><mo>|</mo><mi>A</mi><mo>|</mo><mo>·</mo><mo>|</mo><mi>B</mi><mo>|</mo></mrow><mrow><mo>|</mo><mi>A</mi><mo>|</mo><mo>+</mo><mo>|</mo><mi>B</mi><mo>|</mo></mrow></mfrac><msup><mrow><mo>‖</mo><msub><mi>μ</mi><mi>A</mi></msub><mo>−</mo><msub><mi>μ</mi><mi>B</mi></msub><mo>‖</mo></mrow><mn>2</mn></msup></mrow></math>`} />
        <p>so two big clusters far apart are the most expensive merge and two tiny nearby ones the cheapest. Running the merges to the end gives a tree; cutting it at height h leaves k clusters. Because every partition at k is obtained from the partition at k + 1 by one merge, the cuts are nested, which is why the k slider reads as "one cluster splits" rather than "everything is redrawn". Implementation: <code>hclust(method = "ward.D2")</code>, which works on the distances directly.</p>
        <p><strong>k-means.</strong> Choose k centres and assign each row to the nearest; move each centre to the mean of its rows; repeat until nothing changes. This minimises</p>
        <Formula html={`<math display="block"><mrow><munder><mo>∑</mo><mi>c</mi></munder><munder><mo>∑</mo><mrow><mi>i</mi><mo>∈</mo><mi>c</mi></mrow></munder><msup><mrow><mo>‖</mo><msub><mi>z</mi><mi>i</mi></msub><mo>−</mo><msub><mi>μ</mi><mi>c</mi></msub><mo>‖</mo></mrow><mn>2</mn></msup></mrow></math>`} />
        <p>which is the same quantity Ward reduces greedily, but from random starts: 50 restarts per k, best kept. It is not nested. The grey line above is the agreement between the two methods at each k; where it is high, the partition is a property of the data rather than of the algorithm.</p>
        <p><strong>Louvain.</strong> Build the graph that connects every country-year to its {meta.knn_k} nearest neighbours (the same graph UMAP draws the map from), then find the grouping that maximises modularity,</p>
        <Formula html={`<math display="block"><mrow><mi>Q</mi><mo>=</mo><mfrac><mn>1</mn><mrow><mn>2</mn><mi>m</mi></mrow></mfrac><munder><mo>∑</mo><mrow><mi>i</mi><mi>j</mi></mrow></munder><mrow><mo>[</mo><msub><mi>A</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>−</mo><mfrac><mrow><msub><mi>k</mi><mi>i</mi></msub><msub><mi>k</mi><mi>j</mi></msub></mrow><mrow><mn>2</mn><mi>m</mi></mrow></mfrac><mo>]</mo></mrow><mi>δ</mi><mo>(</mo><msub><mi>c</mi><mi>i</mi></msub><mo>,</mo><msub><mi>c</mi><mi>j</mi></msub><mo>)</mo></mrow></math>`} />
        <p>the number of edges inside communities minus the number expected if edges were placed at random with the same degrees. Louvain picks its own number of communities ({meta.louvain_k} here). It is the method closest to "the clusters you see forming on the map", because the map and the communities come from the same neighbourhood graph; it agrees with the Ward cut at the same k with an adjusted Rand index of about 0.45.</p>
        <p><strong>Silhouette.</strong> For each row, a is its mean distance to its own cluster and b its mean distance to the nearest other cluster; s = (b − a) / max(a, b), between −1 and 1. Means of 0.06–0.22 say that most rows are only a little closer to their own cluster than to the next one. That is what a continuum looks like: regimes shade into each other along the liberal-democracy axis, and a partition draws lines across it. The lines are still informative (the profiles differ, and so do the outcomes), but a country near a line is near a line.</p>
        <p><strong>Stability.</strong> Refit Ward on a random 80% of the rows, cut at k, and compare with the full-sample cut on those rows using the adjusted Rand index (1 = identical, 0 = chance agreement); repeat {meta.bootstrap_draws} times and average. This asks whether the partition depends on which countries happen to be in the sample. At k = 2 it is low because the first split can fall on either side of the large electoral middle; from k = 3 to 6 it is 0.6–0.7.</p>
        <p><strong>Why pool the years.</strong> The partition is fitted on all six years at once, so a cluster is an institutional type that a country can enter and leave; a country's membership in 1985 and 2025 are comparable because both are measured against the same centres. Fitting 2025 alone would give a snapshot with no history.</p>
      </MethodBlock>
    </div>
  );
}
