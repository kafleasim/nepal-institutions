import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import { clusterColor, clusterName, clusterShort, PS_COLORS } from "../names";
import { Heatmap } from "../components/Heatmap";
import { Ctrl, Formula, MethodBlock, Seg } from "../components/ui";
import { fmt, mean, withinBetweenTest, type PairValue } from "../stats";

type Metric = "jaccard" | "mcc" | "residual" | "z";
const METRICS: { value: Metric; label: string; axis: string; d: number; blurb: string }[] = [
  { value: "jaccard", label: "Jaccard", axis: "Jaccard index", d: 3, blurb: "share of the union both export" },
  { value: "mcc", label: "MCC", axis: "Matthews correlation", d: 3, blurb: "correlation of the two 0/1 vectors" },
  { value: "residual", label: "Overlap − expected", axis: "Products in common beyond the BiCM expectation", d: 1, blurb: "observed minus expected shared products" },
  { value: "z", label: "Overlap z-score", axis: "Overlap z-score under the BiCM", d: 2, blurb: "the same, in null standard deviations" },
];

export function ProductSpaceView({ data, k }: Ctx) {
  const { cx, cxMeta, pairs, rca, nullProducts, nullMeta } = data;
  const col = `ward_k${k}`;
  const [measure, setMeasure] = useState<"share_n" | "share_val">("share_n");
  const [relative, setRelative] = useState(false);
  const [sel, setSel] = useState<number>(3);
  const [matched, setMatched] = useState(false);
  const [metric, setMetric] = useState<Metric>("jaccard");
  const [shuffle, setShuffle] = useState<"all" | "region">("all");
  const [mapMode, setMapMode] = useState<"raw" | "null">("raw");

  const rows = useMemo(() => cx.filter((r) => r.year === 2023), [cx]);
  const ids = useMemo(() => [...new Set(rows.map((r) => r[col] as number))].sort((a, b) => a - b), [rows, col]);
  const cur = ids.includes(sel) ? sel : ids[0];
  const psIds = [...Object.keys(cxMeta.ps_names), "NA"];
  const psLabel = (id: string) => (id === "NA" ? "Not in product space" : cxMeta.ps_names[id]);

  const share = (id: number | "world", ps: string) => {
    const g = id === "world" ? rows : rows.filter((r) => r[col] === id);
    const v = g.map((r) => r[`${measure}_ps${ps}`] as number | null).filter((x): x is number => x !== null);
    return v.length ? mean(v) : null;
  };
  const world = new Map(psIds.map((ps) => [ps, share("world", ps)]));

  // Product-level occupancy: share of members with RCA >= 1, per cluster and world.
  const label = useMemo(() => new Map(rows.map((r) => [r.iso3, r[col] as number])), [rows, col]);
  const occupancy = useMemo(() => {
    const byProduct = new Map<string, { world: number; cl: Map<number, number> }>();
    for (const r of rca) {
      const c = label.get(r.iso3);
      if (c === undefined) continue;
      const e = byProduct.get(r.product) ?? { world: 0, cl: new Map() };
      e.world++;
      e.cl.set(c, (e.cl.get(c) ?? 0) + 1);
      byProduct.set(r.product, e);
    }
    return byProduct;
  }, [rca, label]);
  const nIn = rows.filter((r) => r[col] === cur).length;
  const nAll = rows.length;

  // Null-model rows for the current cut and cluster.
  const nullByProduct = useMemo(() => {
    const m = new Map<string, (typeof nullProducts)[number]>();
    for (const r of nullProducts) if (r.k === k && r.cluster === cur) m.set(r.product, r);
    return m;
  }, [nullProducts, k, cur]);
  const validated = useMemo(() => {
    const sig = [...nullByProduct.values()].filter((r) => r.sig !== 0).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    return sig;
  }, [nullByProduct]);
  const nSpec = validated.filter((r) => r.sig === 1).length;
  const nAvoid = validated.filter((r) => r.sig === -1).length;
  const prodByCode = useMemo(() => new Map(cxMeta.products.map((p) => [p.product, p])), [cxMeta]);

  const products = cxMeta.products.filter((p) => p.ps_x !== null && p.ps_y !== null);
  const xs = products.map((p) => p.ps_x!), ys = products.map((p) => p.ps_y!);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 640, H = 520;
  const X = (v: number) => 14 + ((v - x0) / (x1 - x0)) * (W - 28);
  const Y = (v: number) => H - 14 - ((v - y0) / (y1 - y0)) * (H - 28);
  const lift = (code: string) => {
    const e = occupancy.get(code);
    if (!e) return 0;
    return (e.cl.get(cur) ?? 0) / nIn - e.world / nAll;
  };
  const [hoverP, setHoverP] = useState<string | null>(null);
  const topLift = useMemo(
    () =>
      cxMeta.products
        .map((p) => ({ p, l: lift(p.product), n: occupancy.get(p.product)?.cl.get(cur) ?? 0 }))
        .filter((x) => x.n >= 2)
        .sort((a, b) => b.l - a.l)
        .slice(0, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cxMeta, occupancy, cur, nIn, nAll],
  );

  // Similarity test.
  const valueOf = (p: (typeof pairs)[number]): number | null => {
    switch (metric) {
      case "jaccard": return p.jaccard_basket;
      case "mcc": return p.mcc;
      case "residual": return p.overlap_obs === null || p.overlap_exp === null ? null : p.overlap_obs - p.overlap_exp;
      case "z": return p.overlap_obs === null || p.overlap_exp === null || !p.overlap_sd ? null : (p.overlap_obs - p.overlap_exp) / p.overlap_sd;
    }
  };
  const regionOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pairs) {
      if (p.region_a) m.set(p.a, p.region_a);
      if (p.region_b) m.set(p.b, p.region_b);
    }
    return m;
  }, [pairs]);
  const test = useMemo(() => {
    const pv: PairValue[] = pairs
      .filter((p) => !matched || (p.tercile_a !== null && p.tercile_a === p.tercile_b))
      .map((p) => ({ a: p.a, b: p.b, v: valueOf(p) }))
      .filter((p): p is PairValue => p.v !== null && !Number.isNaN(p.v));
    return withinBetweenTest(pv, label, 500, 7, shuffle === "region" ? regionOf : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, label, matched, metric, shuffle, regionOf]);
  const spec = METRICS.find((m) => m.value === metric)!;
  const perCluster = ids.map((id) => {
    const v = pairs
      .filter((p) => label.get(p.a) === id && label.get(p.b) === id && (!matched || (p.tercile_a !== null && p.tercile_a === p.tercile_b)))
      .map(valueOf)
      .filter((x): x is number => x !== null && !Number.isNaN(x));
    return { id, m: v.length ? mean(v) : NaN, n: v.length };
  });
  const hist = useMemo(() => {
    const lo = Math.min(...test.nullDist, test.observed), hi = Math.max(...test.nullDist, test.observed);
    const nb = 30;
    const bins = Array(nb).fill(0) as number[];
    for (const v of test.nullDist) bins[Math.min(nb - 1, Math.floor(((v - lo) / (hi - lo || 1)) * nb))]++;
    return { lo, hi, bins, nb };
  }, [test]);

  return (
    <div>
      <p className="finding">
        Do countries with the same institutions sit in the same parts of the product space? Two readings: the share of each cluster's export baskets that falls in each product-space community, and whether two countries in the same cluster have more similar baskets than two countries in different clusters. Each can be read raw or against a null model that fixes how diversified every country is and how common every product is.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Basket measure">
          <Seg value={measure} options={[{ value: "share_n" as const, label: "Share of RCA ≥ 1 products" }, { value: "share_val" as const, label: "Share of export value" }]} onChange={setMeasure} />
        </Ctrl>
        <Ctrl label="Show">
          <Seg value={relative ? "rel" : "abs"} options={[{ value: "abs", label: "Levels" }, { value: "rel", label: "Difference from world" }]} onChange={(v) => setRelative(v === "rel")} />
        </Ctrl>
      </div>

      <div className="section">
        <h3>Where each cluster's baskets sit, 2023</h3>
        <Heatmap
          rows={[...ids.map((id) => ({ id: String(id), label: clusterName("ward", k, id), color: clusterColor(id) })), { id: "world", label: "All ranked economies" }]}
          cols={psIds.map((ps) => ({ id: ps, label: psLabel(ps) }))}
          value={(r, c) => {
            const v = r === "world" ? world.get(c) ?? null : share(Number(r), c);
            if (v === null) return null;
            return relative && r !== "world" ? v - (world.get(c) ?? 0) : v;
          }}
          format={(v) => `${(100 * v).toFixed(relative ? 1 : 0)}${relative ? "" : "%"}`}
          diverging={relative}
          cellW={62}
        />
        <p className="caption">
          Mean over the cluster's countries of the {measure === "share_n" ? "share of its RCA ≥ 1 products" : "share of its export value"} in each Atlas product-space community. "Not in product space" collects the {cxMeta.products.filter((p) => p.ps === null).length} HS4 products without coordinates.
        </p>
      </div>

      <div className="section">
        <h3>What a cluster specialises in</h3>
        <div className="global-controls" style={{ paddingTop: 0 }}>
          <Ctrl label="Cluster">
            <div className="chips">
              {ids.map((id) => (
                <button key={id} className={`chip${id === cur ? " is-active" : ""}`} style={id === cur ? { background: clusterColor(id), borderColor: clusterColor(id) } : {}} onClick={() => setSel(id)}>{clusterShort("ward", k, id)}</button>
              ))}
            </div>
          </Ctrl>
          <Ctrl label="Against">
            <Seg value={mapMode} options={[{ value: "raw" as const, label: "The world average" }, { value: "null" as const, label: "The BiCM null" }]} onChange={setMapMode} />
          </Ctrl>
        </div>
        <div className="row">
          <div className="col">
            <div className="chart-box">
              <svg className="chart" viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHoverP(null)}>
                <rect width={W} height={H} fill="#fafafa" rx={4} />
                {products.map((p) => {
                  let fill = "#d8d8d8", r = 2;
                  if (mapMode === "raw") {
                    const l = lift(p.product);
                    const mag = Math.min(1, Math.abs(l) / 0.35);
                    fill = l > 0.02 ? `rgba(38,103,152,${0.25 + 0.75 * mag})` : l < -0.02 ? `rgba(198,70,70,${0.25 + 0.75 * mag})` : "#d8d8d8";
                    r = Math.abs(l) > 0.02 ? 3 + 4 * mag : 2;
                  } else {
                    const n = nullByProduct.get(p.product);
                    if (n) {
                      const mag = Math.min(1, Math.abs(n.z) / 4);
                      if (n.sig !== 0) {
                        fill = n.sig > 0 ? `rgba(38,103,152,${0.55 + 0.45 * mag})` : `rgba(198,70,70,${0.55 + 0.45 * mag})`;
                        r = 4 + 4 * mag;
                      } else if (Math.abs(n.z) > 1) {
                        fill = n.z > 0 ? "rgba(38,103,152,0.22)" : "rgba(198,70,70,0.22)";
                        r = 2.5 + 1.5 * mag;
                      }
                    }
                  }
                  return <circle key={p.product} cx={X(p.ps_x!)} cy={Y(p.ps_y!)} r={r} fill={fill} stroke="white" strokeWidth={0.5} onMouseEnter={() => setHoverP(p.product)} />;
                })}
                {hoverP && (() => {
                  const p = products.find((q) => q.product === hoverP)!;
                  const n = nullByProduct.get(hoverP);
                  const text = mapMode === "raw"
                    ? `${p.product} ${p.name_short}: ${fmt(100 * lift(hoverP), 0)} pts vs world (${psLabel(String(p.ps ?? "NA"))})`
                    : `${p.product} ${p.name_short}: ${n?.n_obs ?? 0} of ${nIn} hold it, ${fmt(n?.expected, 1)} expected, z = ${fmt(n?.z, 1)}${n && n.sig !== 0 ? " ✓" : ""}`;
                  return (
                    <text x={X(p.ps_x!) > W / 2 ? X(p.ps_x!) - 8 : X(p.ps_x!) + 8} y={Y(p.ps_y!) - 6} fontSize={11.5} fill="#333" textAnchor={X(p.ps_x!) > W / 2 ? "end" : "start"} style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3.5 }}>
                      {text}
                    </text>
                  );
                })()}
              </svg>
            </div>
            <p className="caption">
              {mapMode === "raw"
                ? `The Atlas product space, one dot per HS4 product. Blue: a larger share of ${clusterName("ward", k, cur)} members export it with RCA ≥ 1 than of all ranked economies; red: smaller. Size follows the gap.`
                : `Same map, coloured by the z-score of the number of ${clusterName("ward", k, cur)} members holding the product against the BiCM expectation. Solid dots pass a 10% false-discovery threshold (${nSpec} specialisations, ${nAvoid} avoidances); faint dots have |z| > 1 but do not.`}
            </p>
          </div>
          <div className="col-narrow">
            {mapMode === "raw" ? (
              <>
                <h3>Largest gaps</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th className="num">Cluster</th><th className="num">World</th></tr></thead>
                    <tbody>
                      {topLift.map(({ p, n }) => (
                        <tr key={p.product}>
                          <td><span className="swatch" style={{ background: PS_COLORS[String(p.ps ?? "NA")] }} />{p.name_short}</td>
                          <td className="num">{Math.round((100 * n) / nIn)}%</td>
                          <td className="num">{Math.round((100 * (occupancy.get(p.product)?.world ?? 0)) / nAll)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="caption">Share of countries with RCA ≥ 1 in 2023, in the cluster ({nIn} countries) and among all ranked economies ({nAll}).</p>
              </>
            ) : (
              <>
                <h3>Validated against the null</h3>
                {validated.length === 0 ? (
                  <p className="note">No product is held by significantly more or fewer members of this cluster than its members' diversification and the products' ubiquity predict. Whatever looks distinctive in the raw view is explained by how diversified these economies are.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Product</th><th className="num">Hold it</th><th className="num">Expected</th><th className="num">z</th></tr></thead>
                      <tbody>
                        {validated.slice(0, 16).map((r) => {
                          const p = prodByCode.get(r.product);
                          return (
                            <tr key={r.product} style={{ color: r.sig < 0 ? "#C64646" : undefined }}>
                              <td><span className="swatch" style={{ background: PS_COLORS[String(p?.ps ?? "NA")] }} />{p?.name_short ?? r.product}</td>
                              <td className="num">{r.n_obs} of {r.n}</td>
                              <td className="num">{fmt(r.expected, 1)}</td>
                              <td className="num">{fmt(r.z, 1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="caption">Products where the count of members with RCA ≥ 1 is outside what the BiCM predicts, Benjamini–Hochberg at 10% within the cluster. Red rows are avoidances (held by fewer than expected).</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Are baskets more alike within a cluster?</h3>
        <div className="global-controls" style={{ paddingTop: 0 }}>
          <Ctrl label="Similarity">
            <Seg value={metric} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} onChange={setMetric} />
          </Ctrl>
          <Ctrl label="Pairs">
            <Seg value={matched ? "m" : "a"} options={[{ value: "a", label: "All pairs" }, { value: "m", label: "Same income tercile only" }]} onChange={(v) => setMatched(v === "m")} />
          </Ctrl>
          <Ctrl label="Shuffle labels">
            <Seg value={shuffle} options={[{ value: "all" as const, label: "Across all countries" }, { value: "region" as const, label: "Within region" }]} onChange={setShuffle} />
          </Ctrl>
        </div>
        <p className="stat">{spec.axis}: {spec.blurb}.</p>
        <div className="row">
          <div className="col-narrow">
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Mean, pairs in the same cluster</td><td className="num">{fmt(test.within, spec.d)}</td><td className="num stat">{test.nWithin} pairs</td></tr>
                  <tr><td>Mean, pairs in different clusters</td><td className="num">{fmt(test.between, spec.d)}</td><td className="num stat">{test.nBetween} pairs</td></tr>
                  <tr><td>Difference</td><td className="num"><strong>{fmt(test.observed, spec.d)}</strong></td><td className="num stat">p = {fmt(test.p, 3)}</td></tr>
                </tbody>
              </table>
            </div>
            <h3>By cluster</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cluster</th><th className="num">Within-pair mean</th><th className="num">Pairs</th></tr></thead>
                <tbody>
                  {perCluster.map((c) => (
                    <tr key={c.id}><td><span className="swatch" style={{ background: clusterColor(c.id) }} />{clusterName("ward", k, c.id)}</td><td className="num">{fmt(c.m, spec.d)}</td><td className="num">{c.n}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="col">
            <svg className="chart" viewBox="0 0 520 200">
              {hist.bins.map((b, i) => {
                const h = (b / Math.max(...hist.bins)) * 150;
                return <rect key={i} x={40 + (i / hist.nb) * 460} y={170 - h} width={460 / hist.nb - 1} height={h} fill="#c8c8c8" />;
              })}
              {(() => {
                const x = 40 + ((test.observed - hist.lo) / (hist.hi - hist.lo || 1)) * 460;
                return (
                  <g>
                    <line x1={x} x2={x} y1={12} y2={170} stroke="#C64646" strokeWidth={2} />
                    <text x={x > 400 ? x - 5 : x + 5} y={22} fontSize={11} fill="#C64646" fontWeight={600} textAnchor={x > 400 ? "end" : "start"}>observed</text>
                  </g>
                );
              })()}
              <line x1={40} x2={500} y1={170} y2={170} stroke="#333" />
              <text x={40} y={188} fontSize={10} fill="#7c7c7c">{fmt(hist.lo, spec.d)}</text>
              <text x={500} y={188} fontSize={10} fill="#7c7c7c" textAnchor="end">{fmt(hist.hi, spec.d)}</text>
              <text x={270} y={188} fontSize={10} fill="#7c7c7c" textAnchor="middle">within − between, under 500 random relabellings{shuffle === "region" ? " within region" : ""}</text>
            </svg>
            <p className="caption">
              The grey histogram is the difference under {shuffle === "region" ? "relabellings that keep each region's mix of clusters" : "random relabellings of the countries"}; the red line is the observed difference. The p-value is the share of relabellings that reach it.
            </p>
          </div>
        </div>
      </div>

      <MethodBlock title="How basket similarity is tested" summary="RCA, the communities, four similarity measures, the BiCM null, and a permutation test that keeps the pairs' dependence">
        <p><strong>Baskets.</strong> A country's basket in 2023 is the set of HS4 products it exports with revealed comparative advantage of at least one,</p>
        <Formula html={`<math display="block"><mrow><msub><mi>RCA</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>=</mo><mfrac><mrow><msub><mi>x</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>/</mo><msub><mo>∑</mo><mi>p</mi></msub><msub><mi>x</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub></mrow><mrow><msub><mo>∑</mo><mi>c</mi></msub><msub><mi>x</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>/</mo><msub><mo>∑</mo><mrow><mi>c</mi><mi>p</mi></mrow></msub><msub><mi>x</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub></mrow></mfrac></mrow></math>`} />
        <p>the product's share in the country's exports over its share in world exports. Counting products rather than dollars is deliberate: oil or copper can be nine-tenths of a country's export value while being one product, and the question here is about the range of capabilities, not their weight.</p>
        <p><strong>Communities.</strong> The Atlas groups the 865 products that have product-space coordinates into eight communities by the proximity network. The heatmap's first reading is coarse on purpose: it says which regions of the space a cluster's economies occupy, averaged over its members.</p>
        <p><strong>The null model.</strong> The bipartite configuration model (BiCM; Saracco et al. 2015) is the maximum-entropy distribution over 0/1 country × product matrices whose expected row sums (each country's diversity, k<sub>c</sub>) and column sums (each product's ubiquity, k<sub>p</sub>) equal the observed ones. Under it every cell is an independent Bernoulli,</p>
        <Formula html={`<math display="block"><mrow><msub><mi>P</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>=</mo><mfrac><mrow><msub><mi>x</mi><mi>c</mi></msub><msub><mi>y</mi><mi>p</mi></msub></mrow><mrow><mn>1</mn><mo>+</mo><msub><mi>x</mi><mi>c</mi></msub><msub><mi>y</mi><mi>p</mi></msub></mrow></mfrac><mo>,</mo><mspace width="1.5em"/><munder><mo>∑</mo><mi>p</mi></munder><msub><mi>P</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>=</mo><msub><mi>k</mi><mi>c</mi></msub><mo>,</mo><mspace width="1em"/><munder><mo>∑</mo><mi>c</mi></munder><msub><mi>P</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><mo>=</mo><msub><mi>k</mi><mi>p</mi></msub></mrow></math>`} />
        <p>with one fitness x<sub>c</sub> per country and y<sub>p</sub> per product, found by fixed-point iteration ({nullMeta.iterations} iterations here, margins matched to {nullMeta.max_margin_error}). It is the answer to "what would this matrix look like if the only structure were how diversified each country is and how common each product is". The {nullMeta.n_countries} ranked economies and the {nullMeta.n_products} products anyone holds are used; matrix density {(100 * nullMeta.density).toFixed(1)}%.</p>
        <p><strong>Validated specialisations.</strong> For a cluster with members g and a product p, the number of members holding p is, under the null, a sum of independent Bernoullis with probabilities P<sub>cp</sub>, c ∈ g: a Poisson-binomial with mean Σ<sub>c</sub> P<sub>cp</sub> and variance Σ<sub>c</sub> P<sub>cp</sub>(1 − P<sub>cp</sub>). Its exact distribution is computed by convolution, giving a right-tail p-value (more members hold it than expected: specialisation) and a left-tail one (fewer: avoidance). Within each cluster the p-values are corrected with Benjamini–Hochberg at a 10% false-discovery rate, as on the cities site. This is where the raw "held more often than the world" list gets disciplined: a diversified cluster holds more of everything, and the null expects that.</p>
        <p><strong>Four similarity measures.</strong> For two countries with baskets A and B over a universe of N products:</p>
        <Formula html={`<math display="block"><mrow><mi>J</mi><mo>=</mo><mfrac><mrow><mo>|</mo><mi>A</mi><mo>∩</mo><mi>B</mi><mo>|</mo></mrow><mrow><mo>|</mo><mi>A</mi><mo>∪</mo><mi>B</mi><mo>|</mo></mrow></mfrac><mo>,</mo><mspace width="2em"/><mi>MCC</mi><mo>=</mo><mfrac><mrow><msub><mi>n</mi><mn>11</mn></msub><msub><mi>n</mi><mn>00</mn></msub><mo>−</mo><msub><mi>n</mi><mn>10</mn></msub><msub><mi>n</mi><mn>01</mn></msub></mrow><msqrt><mrow><mo>|</mo><mi>A</mi><mo>|</mo><mo>·</mo><mo>|</mo><mi>B</mi><mo>|</mo><mo>·</mo><mo>(</mo><mi>N</mi><mo>−</mo><mo>|</mo><mi>A</mi><mo>|</mo><mo>)</mo><mo>·</mo><mo>(</mo><mi>N</mi><mo>−</mo><mo>|</mo><mi>B</mi><mo>|</mo><mo>)</mo></mrow></msqrt></mfrac></mrow></math>`} />
        <p>Jaccard is the share of the products either exports that both export; it ignores shared absences and two large baskets overlap more than two small ones even at random. The Matthews correlation coefficient is the Pearson correlation of the two 0/1 vectors (n<sub>11</sub> products both hold, n<sub>00</sub> neither, n<sub>10</sub> and n<sub>01</sub> one only); it is zero when the baskets are independent given their sizes and counts shared absences, which with {nullMeta.universe_products} products and baskets of about 130 makes it mostly a statement about the presences anyway. The two null-adjusted measures take the observed overlap |A ∩ B| and subtract its BiCM expectation Σ<sub>p</sub> P<sub>ap</sub> P<sub>bp</sub>, either in products or divided by the null standard deviation. These are the cleanest: they are zero on average for any pair of countries whose only resemblance is size, so a within-cluster excess cannot come from the liberal democracies all being diversified.</p>
        <p><strong>The test.</strong> Pairs that share a country are not independent, so the usual t-test is wrong. Instead the cluster labels are shuffled across countries 500 times, the within-minus-between difference recomputed each time, and the p-value is the share of shuffles that reach the observed difference. "Within region" shuffles labels only among countries of the same V-Dem region, so the null keeps each region's mix of clusters: it asks whether cluster-mates in the same part of the world are more alike than region-mates in different clusters, which removes geography as the explanation. "Same income tercile only" keeps only pairs whose two countries fall in the same third of the 2023 GDP-per-head distribution.</p>
        <p><strong>Reading the four together.</strong> If the raw Jaccard gap survives income matching, region-restricted shuffling and the switch to a null-adjusted overlap, the clusters carry information about baskets that is not income, not geography and not diversification. If it survives some of those but not others, the ones that kill it name the confound.</p>
      </MethodBlock>
    </div>
  );
}
