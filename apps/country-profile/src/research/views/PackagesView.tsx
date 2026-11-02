import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterBlurb, clusterColor, clusterName, clusterShort } from "../names";
import { BarList } from "../components/BarList";
import { Heatmap } from "../components/Heatmap";
import { TreeRules } from "../components/TreeRules";
import { Formula, MethodBlock, Seg, Ctrl } from "../components/ui";
import { fmt } from "../stats";

export function PackagesView({ data, k }: Ctx) {
  const { meta, profiles, points, tree } = data;
  const rows = useMemo(() => profiles.filter((r) => r.k === k), [profiles, k]);
  const ids = useMemo(() => [...new Set(rows.map((r) => r.cluster))].sort((a, b) => a - b), [rows]);
  const [sel, setSel] = useState<number>(ids[0] ?? 1);
  const [against, setAgainst] = useState<number | "rest">("rest");
  const cur = ids.includes(sel) ? sel : ids[0];
  const indByTag = useMemo(() => new Map(meta.indicators.map((i) => [i.tag, i])), [meta]);
  const categories = useMemo(() => [...new Set(meta.indicators.map((i) => i.category))].sort(), [meta]);

  const mine = useMemo(() => rows.filter((r) => r.cluster === cur), [rows, cur]);
  const other = useMemo(() => (against === "rest" ? null : new Map(rows.filter((r) => r.cluster === against).map((r) => [r.tag, r]))), [rows, against]);

  // Items for the bar lists: d against the rest, or the difference in mean z
  // against one other cluster.
  const items = useMemo(
    () =>
      mine
        .map((r) => ({
          tag: r.tag,
          label: indByTag.get(r.tag)?.name ?? r.tag,
          sub: indByTag.get(r.tag)?.category ?? "",
          value: other ? r.mean_z - (other.get(r.tag)?.mean_z ?? 0) : r.d,
        }))
        .sort((a, b) => b.value - a.value),
    [mine, other, indByTag],
  );
  const high = items.slice(0, 12);
  const low = items.slice(-12).reverse();

  const identifying = useMemo(
    () =>
      mine
        .filter((r) => r.auc >= 0.9 || r.auc <= 0.1)
        .sort((a, b) => Math.abs(b.auc - 0.5) - Math.abs(a.auc - 0.5))
        .slice(0, 15),
    [mine],
  );

  const catMean = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of ids) {
      for (const cat of categories) {
        const rs = rows.filter((r) => r.cluster === id && indByTag.get(r.tag)?.category === cat);
        m.set(`${id}|${cat}`, rs.length ? rs.reduce((s, r) => s + r.mean_z, 0) / rs.length : NaN);
      }
    }
    return m;
  }, [rows, ids, categories, indByTag]);

  const n2025 = (id: number) => points.filter((p) => p.year === 2025 && p[`ward_k${k}`] === id).length;
  const nAll = (id: number) => points.filter((p) => p[`ward_k${k}`] === id).length;

  return (
    <div>
      <p className="finding">
        A cluster is a bundle of institutional scores that travel together. For each cluster, the indicators on which its members differ most from everyone else, the categories they lean on, and, for the six-cluster cut, a short set of rules that reproduces the partition.
      </p>
      <div className="chips">
        {ids.map((id) => (
          <button key={id} className={`chip${id === cur ? " is-active" : ""}`} style={id === cur ? { background: clusterColor(id), borderColor: clusterColor(id) } : {}} onClick={() => setSel(id)}>
            {clusterName("ward", k, id)}
          </button>
        ))}
      </div>
      <h2 style={{ color: clusterColor(cur) }}>{clusterName("ward", k, cur)}</h2>
      <p className="stat">{nAll(cur)} country-years, {n2025(cur)} countries in 2025.</p>
      {clusterBlurb("ward", k, cur) && <p className="note">{clusterBlurb("ward", k, cur)}</p>}

      <div className="global-controls" style={{ paddingTop: 4 }}>
        <Ctrl label="Compare with">
          <Seg
            value={against}
            options={[{ value: "rest" as number | "rest", label: "All other clusters" }, ...ids.filter((i) => i !== cur).map((i) => ({ value: i as number | "rest", label: clusterShort("ward", k, i) }))]}
            onChange={setAgainst}
          />
        </Ctrl>
      </div>

      <div className="row section">
        <div className="col">
          <h3>Where members score higher</h3>
          <BarList items={high} max={Math.max(...items.map((i) => Math.abs(i.value)))} />
        </div>
        <div className="col">
          <h3>Where members score lower</h3>
          <BarList items={low} max={Math.max(...items.map((i) => Math.abs(i.value)))} />
        </div>
      </div>
      <p className="caption">
        {other
          ? `Difference in mean z-score between ${clusterName("ward", k, cur)} and ${clusterName("ward", k, against as number)}, in pooled standard deviations.`
          : "Cohen's d: the gap between the cluster's mean and the mean of all other country-years, in pooled standard deviations. Remember V-Dem's direction: for most indicators higher means more liberal or less of the bad thing."}
      </p>

      {!other && (
        <div className="section">
          <h3>Indicators that identify the cluster on their own</h3>
          {identifying.length === 0 ? (
            <p className="stat">No single indicator separates this cluster from the rest with AUC ≥ 0.9.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Indicator</th><th>Category</th><th className="num">AUC</th><th className="num">Mean z</th></tr></thead>
                <tbody>
                  {identifying.map((r) => (
                    <tr key={r.tag}>
                      <td>{indByTag.get(r.tag)?.name ?? r.tag} <span className="stat">{r.tag}</span></td>
                      <td>{indByTag.get(r.tag)?.category}</td>
                      <td className="num">{fmt(r.auc, 2)}</td>
                      <td className="num">{fmt(r.mean_z, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="caption">AUC is the probability that a randomly drawn member scores above a randomly drawn non-member on the indicator. 0.5 is no separation; 1 (or 0) is perfect.</p>
        </div>
      )}

      <div className="section">
        <h2>All clusters by V-Dem category</h2>
        <Heatmap
          rows={ids.map((id) => ({ id: String(id), label: clusterName("ward", k, id), color: clusterColor(id) }))}
          cols={categories.map((c) => ({ id: c, label: c }))}
          value={(r, c) => {
            const v = catMean.get(`${r}|${c}`);
            return v === undefined || Number.isNaN(v) ? null : v;
          }}
          cellW={58}
        />
        <p className="caption">Mean z-score of the cluster's country-years, averaged over the indicators in each V-Dem category. Blue above the pooled average, red below.</p>
      </div>

      {k === tree.k && (
        <div className="section">
          <h2>The partition as rules</h2>
          <p className="stat">
            A classification tree fitted to the six-cluster labels: {tree.n_leaves} leaves, {Math.round(tree.accuracy * 100)}% of country-years placed in their cluster (about {Math.round(tree.cv_accuracy * 100)}% under cross-validation).
          </p>
          <TreeRules tree={tree} nameOf={(id) => clusterName("ward", k, id)} colorOf={clusterColor} />
          <p className="caption">Thresholds are on the z-scored indicator. The first split is on barriers to parties: whether opposition parties can exist and compete decides the top of the tree, and only then do repression, corruption and mobilisation separate the branches.</p>
        </div>
      )}

      <MethodBlock title="How the packages are read" summary="Cohen's d, AUC, category means, and a tree that turns the partition into rules">
        <p><strong>Cohen's d.</strong> For cluster c and indicator j, with n<sub>c</sub> members and n<sub>¬c</sub> non-members,</p>
        <Formula html={`<math display="block"><mrow><msub><mi>d</mi><mrow><mi>c</mi><mi>j</mi></mrow></msub><mo>=</mo><mfrac><mrow><msub><mover><mi>z</mi><mo>¯</mo></mover><mrow><mi>c</mi><mi>j</mi></mrow></msub><mo>−</mo><msub><mover><mi>z</mi><mo>¯</mo></mover><mrow><mo>¬</mo><mi>c</mi><mo>,</mo><mi>j</mi></mrow></msub></mrow><msub><mi>s</mi><mrow><mi>c</mi><mi>j</mi></mrow></msub></mfrac><mo>,</mo><mspace width="1em"/><msubsup><mi>s</mi><mrow><mi>c</mi><mi>j</mi></mrow><mn>2</mn></msubsup><mo>=</mo><mfrac><mrow><mo>(</mo><msub><mi>n</mi><mi>c</mi></msub><mo>−</mo><mn>1</mn><mo>)</mo><msubsup><mi>s</mi><mrow><mi>c</mi></mrow><mn>2</mn></msubsup><mo>+</mo><mo>(</mo><msub><mi>n</mi><mrow><mo>¬</mo><mi>c</mi></mrow></msub><mo>−</mo><mn>1</mn><mo>)</mo><msubsup><mi>s</mi><mrow><mo>¬</mo><mi>c</mi></mrow><mn>2</mn></msubsup></mrow><mrow><msub><mi>n</mi><mi>c</mi></msub><mo>+</mo><msub><mi>n</mi><mrow><mo>¬</mo><mi>c</mi></mrow></msub><mo>−</mo><mn>2</mn></mrow></mfrac></mrow></math>`} />
        <p>the gap between the two means in units of the pooled within-group standard deviation. Unlike the raw mean z, it rewards indicators on which the cluster is not only different but internally consistent. |d| above 0.8 is conventionally a large effect; the liberal-democracy cluster reaches 2 on administrative impartiality and corruption, the party-states reach −2.5 on state ownership and property rights.</p>
        <p><strong>AUC.</strong> The rank-based counterpart: rank all country-years on the indicator and compute the probability that a member outranks a non-member (the Mann–Whitney statistic divided by n<sub>c</sub>·n<sub>¬c</sub>). It does not depend on the scale and is robust to outliers. An indicator with AUC ≥ 0.9 identifies the cluster by itself; the list above is the package in the strictest sense.</p>
        <p><strong>Contrast with one cluster.</strong> Switching the comparison to a single other cluster replaces d with the plain difference in mean z, which is what a country near the boundary between the two would need to move on.</p>
        <p><strong>Category means.</strong> Each V-Dem indicator belongs to a family by its code prefix (v2el elections, v2cl civil liberties, v2ju judiciary, and so on). The heatmap averages the cluster's mean z over the indicators in each family. It is coarse by design: it shows which parts of the institutional order a cluster is built on.</p>
        <p><strong>The tree.</strong> A classification tree (<code>rpart</code>, minimum leaf 15 country-years, depth ≤ 5) is fitted with the six cluster labels as the target and the {meta.n_indicators} z-scored indicators as candidates. At each node it picks the single indicator and threshold that best separates the labels, so the result is a short list of rules that recovers the partition from a handful of variables. It is a description of the clusters, not the way they were made: the accuracy tells how much of the partition those few rules carry.</p>
      </MethodBlock>
    </div>
  );
}
