import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import type { CxCountry } from "../data";
import { clusterColor, clusterName, clusterShort } from "../names";
import { Strip, type StripGroup } from "../components/Strip";
import { Scatter, type ScatterPoint } from "../components/Scatter";
import { Ctrl, Formula, MethodBlock, Seg } from "../components/ui";
import { fmt, mean, ols } from "../stats";

type Outcome = "eci" | "diversity" | "basket_pci" | "coi";
const OUTCOMES: { value: Outcome; label: string; axis: string; d: number }[] = [
  { value: "eci", label: "ECI", axis: "Economic Complexity Index", d: 2 },
  { value: "diversity", label: "Diversity", axis: "Products with RCA ≥ 1", d: 0 },
  { value: "basket_pci", label: "Mean PCI", axis: "Mean PCI of the RCA ≥ 1 basket", d: 2 },
  { value: "coi", label: "COI", axis: "Complexity Outlook Index", d: 2 },
];

export function ComplexityView({ data, k }: Ctx) {
  const { cx, cxMeta } = data;
  const [year, setYear] = useState<number>(2023);
  const [outcome, setOutcome] = useState<Outcome>("eci");
  const col = `ward_k${k}`;
  const spec = OUTCOMES.find((o) => o.value === outcome)!;

  const rows = useMemo(
    () => cx.filter((r) => r.year === year && r[outcome] !== null && r.gdppc_ppp !== null) as (CxCountry & { gdppc_ppp: number })[],
    [cx, year, outcome],
  );
  const ids = useMemo(() => [...new Set(rows.map((r) => r[col] as number))].sort((a, b) => a - b), [rows, col]);

  const groups: StripGroup[] = ids.map((id) => ({
    id,
    label: clusterShort("ward", k, id),
    color: clusterColor(id),
    values: rows.filter((r) => r[col] === id).map((r) => ({ v: r[outcome] as number, label: r.country_name })),
  }));

  const pts: ScatterPoint[] = rows.map((r) => ({ x: r.gdppc_ppp, y: r[outcome] as number, label: r.country_name, color: clusterColor(r[col] as number), group: r[col] as number }));
  const means: ScatterPoint[] = ids.map((id) => {
    const g = rows.filter((r) => r[col] === id);
    return { x: Math.exp(mean(g.map((r) => Math.log(r.gdppc_ppp)))), y: mean(g.map((r) => r[outcome] as number)), label: clusterShort("ward", k, id), color: clusterColor(id) };
  });

  // Regressions. Reference cluster = the largest, so coefficients read as
  // "relative to the biggest group".
  const reg = useMemo(() => {
    if (rows.length < ids.length + 3) return null;
    const ref = ids.reduce((best, id) => (rows.filter((r) => r[col] === id).length > rows.filter((r) => r[col] === best).length ? id : best), ids[0]);
    const others = ids.filter((i) => i !== ref);
    const y = rows.map((r) => r[outcome] as number);
    const lg = rows.map((r) => [Math.log(r.gdppc_ppp)]);
    const dummies = rows.map((r) => others.map((id) => (r[col] === id ? 1 : 0)));
    const A = ols(y, dummies, others.map((id) => clusterShort("ward", k, id)));
    const B = ols(y, lg, ["log GDP per head"]);
    const C = ols(y, rows.map((_, i) => [...lg[i], ...dummies[i]]), ["log GDP per head", ...others.map((id) => clusterShort("ward", k, id))]);
    return { ref, others, A, B, C };
  }, [rows, ids, col, outcome, k]);

  return (
    <div>
      <p className="finding">
        Do the institutional clusters differ in what their economies can make? The liberal democracies have by far the highest complexity, but they are also the richest; the question is what is left once income is held fixed.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Atlas year">
          <Seg value={year} options={cxMeta.atlas_years.map((y) => ({ value: y, label: `${y} (institutions ${cxMeta.year_map[String(y)]})` }))} onChange={setYear} />
        </Ctrl>
        <Ctrl label="Outcome">
          <Seg value={outcome} options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))} onChange={setOutcome} />
        </Ctrl>
      </div>

      <div className="row section">
        <div className="col">
          <h3>{spec.axis} by cluster</h3>
          <Strip groups={groups} yLabel={spec.axis} format={(v) => v.toFixed(spec.d)} />
          <p className="caption">One dot per country; bar at the cluster mean. {rows.length} countries in the Atlas rankings with a V-Dem cluster in {cxMeta.year_map[String(year)]}.</p>
        </div>
        <div className="col">
          <h3>{spec.label} against income</h3>
          <Scatter points={pts} means={means} xLabel="GDP per head, PPP (log scale)" yLabel={spec.axis} xLog formatX={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} formatY={(v) => v.toFixed(spec.d)} />
          <p className="caption">Diamonds are cluster means (geometric mean of income). The slope within a cluster is what the regression below estimates once the cluster intercepts are taken out.</p>
        </div>
      </div>

      {reg && (
        <div className="section">
          <h3>How much the cluster adds to income</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Model</th><th className="num">R²</th><th>Coefficients (± s.e.)</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{spec.label} on cluster only</td>
                  <td className="num">{fmt(reg.A.r2, 2)}</td>
                  <td>{reg.A.names.slice(1).map((n, i) => `${n} ${fmt(reg.A.coef[i + 1], spec.d)} ± ${fmt(reg.A.se[i + 1], spec.d)}`).join("; ")}</td>
                </tr>
                <tr>
                  <td>{spec.label} on log GDP per head only</td>
                  <td className="num">{fmt(reg.B.r2, 2)}</td>
                  <td>slope {fmt(reg.B.coef[1], spec.d)} ± {fmt(reg.B.se[1], spec.d)}</td>
                </tr>
                <tr>
                  <td>{spec.label} on both</td>
                  <td className="num">{fmt(reg.C.r2, 2)}</td>
                  <td>slope {fmt(reg.C.coef[1], spec.d)} ± {fmt(reg.C.se[1], spec.d)}; {reg.C.names.slice(2).map((n, i) => `${n} ${fmt(reg.C.coef[i + 2], spec.d)} ± ${fmt(reg.C.se[i + 2], spec.d)}`).join("; ")}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="caption">
            Cluster coefficients are relative to {clusterName("ward", k, reg.ref)}, the largest cluster. A coefficient in the third row is the gap in {spec.label} between that cluster and the reference at the same income. Standard errors are classical; with {rows.length} countries and clusters as small as {Math.min(...groups.map((g) => g.values.length))}, treat anything under two standard errors as noise.
          </p>
        </div>
      )}

      <div className="section">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cluster</th><th className="num">n</th><th className="num">ECI</th><th className="num">Diversity</th><th className="num">Mean PCI</th><th className="num">COI</th><th className="num">GDP/head</th></tr></thead>
            <tbody>
              {ids.map((id) => {
                const g = cx.filter((r) => r.year === year && r[col] === id);
                const m = (key: string) => mean(g.map((r) => r[key] as number | null).filter((v): v is number => v !== null));
                return (
                  <tr key={id}>
                    <td><span className="swatch" style={{ background: clusterColor(id) }} />{clusterName("ward", k, id)}</td>
                    <td className="num">{g.length}</td>
                    <td className="num">{fmt(m("eci"))}</td>
                    <td className="num">{fmt(m("diversity"), 0)}</td>
                    <td className="num">{fmt(m("basket_pci"))}</td>
                    <td className="num">{fmt(m("coi"))}</td>
                    <td className="num">{fmt(Math.exp(mean(g.map((r) => r.gdppc_ppp).filter((v): v is number => v !== null).map(Math.log))), 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MethodBlock title="How complexity is related to the clusters" summary="What ECI is, how the Atlas years are matched to the institutional years, and what the three regressions say">
        <p><strong>Matching years.</strong> The Atlas panel runs 2000–2024 and the institutional benchmarks are ten years apart. Atlas 2005 is paired with the 2005 cluster, 2015 with 2015, and 2023, the latest year with settled trade data, with the 2025 cluster. Only economies in the Atlas rankings ({cxMeta.n_countries_ranked}) are used.</p>
        <p><strong>ECI.</strong> The Atlas starts from revealed comparative advantage, the share of product p in country c's exports divided by its share in world exports, and sets M<sub>cp</sub> = 1 where that ratio is at least one. Diversity is the row sum of M and ubiquity the column sum. ECI is the second eigenvector of</p>
        <Formula html={`<math display="block"><mrow><msub><mover><mi>M</mi><mo>~</mo></mover><mrow><mi>c</mi><msup><mi>c</mi><mo>′</mo></msup></mrow></msub><mo>=</mo><munder><mo>∑</mo><mi>p</mi></munder><mfrac><mrow><msub><mi>M</mi><mrow><mi>c</mi><mi>p</mi></mrow></msub><msub><mi>M</mi><mrow><msup><mi>c</mi><mo>′</mo></msup><mi>p</mi></mrow></msub></mrow><mrow><msub><mi>k</mi><mrow><mi>c</mi><mo>,</mo><mn>0</mn></mrow></msub><msub><mi>k</mi><mrow><mi>p</mi><mo>,</mo><mn>0</mn></mrow></msub></mrow></mfrac></mrow></math>`} />
        <p>standardised to mean zero and unit variance across countries each year. It ranks countries by how many products they make and how few other countries make those products, iterated. PCI is the same construction for products, and "mean PCI" here is the unweighted average PCI of a country's RCA ≥ 1 basket, a simpler measure that does not depend on the eigenvector normalisation. COI, the complexity outlook index, weights the products a country does <em>not</em> yet make by how close they are and how complex they are. All four come straight from the Atlas.</p>
        <p><strong>The regressions.</strong> Three ordinary least squares fits on the countries shown: the outcome on cluster dummies alone, on log income alone, and on both. The first R² is how much of the cross-country variation the partition accounts for; the second is what income alone accounts for; the third row's cluster coefficients are the gaps between clusters at the same income. The jump in R² from the second to the third row is the part of the institutional signal that is not just income.</p>
        <p><strong>Reading it.</strong> Institutions and income are not independent, and this cross-section cannot say which came first. What it can say is whether two countries with the same income but different institutional types export different things, which is the question the next two tabs pursue product by product.</p>
      </MethodBlock>
    </div>
  );
}
