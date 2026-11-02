import { useMemo, useState } from "react";
import type { Ctx } from "../ctx";
import type { Point } from "../data";
import { clusterColor, clusterName, clusterShort } from "../names";
import { Heatmap } from "../components/Heatmap";
import { Ctrl, MethodBlock, Seg } from "../components/ui";

export function TrajectoriesView({ data, k }: Ctx) {
  const { meta, points } = data;
  const years = meta.years;
  const [step, setStep] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(["Cambodia", "Pakistan", "Poland", "Venezuela", "South Korea"]);
  const col = `ward_k${k}`;
  const ids = useMemo(() => [...new Set(points.map((p) => p[col] as number))].sort((a, b) => a - b), [points, col]);

  const byCountry = useMemo(() => {
    const m = new Map<string, Point[]>();
    for (const p of points) {
      if (!m.has(p.country_name)) m.set(p.country_name, []);
      m.get(p.country_name)!.push(p);
    }
    for (const v of m.values()) v.sort((a, b) => a.year - b.year);
    return m;
  }, [points]);

  // Transition counts between consecutive benchmark years.
  const trans = useMemo(() => {
    const m = new Map<string, number>();
    let moves = 0, stays = 0;
    for (const series of byCountry.values()) {
      for (let i = 1; i < series.length; i++) {
        const a = series[i - 1], b = series[i];
        if (years.indexOf(b.year) !== years.indexOf(a.year) + 1) continue; // only adjacent benchmarks
        if (step !== "all" && a.year !== step) continue;
        const key = `${a[col]}|${b[col]}`;
        m.set(key, (m.get(key) ?? 0) + 1);
        if (a[col] === b[col]) stays++; else moves++;
      }
    }
    return { m, moves, stays };
  }, [byCountry, years, step, col]);

  const movers = useMemo(() => {
    const out: { name: string; n: number; path: string }[] = [];
    for (const [name, series] of byCountry) {
      const path = series.map((p) => p[col] as number);
      let changes = 0;
      for (let i = 1; i < path.length; i++) if (path[i] !== path[i - 1]) changes++;
      out.push({ name, n: changes, path: series.map((p) => `${clusterShort("ward", k, p[col] as number)} ${p.year}`).join(" → ") });
    }
    return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [byCountry, col, k]);

  const names = useMemo(() => [...byCountry.keys()].sort(), [byCountry]);
  const matches = query.length >= 2 ? names.filter((n) => n.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];

  // Lines chart: x = year, y = cluster row.
  const W = 760, H = 60 + ids.length * 34;
  const left = 120, right = W - 110, top = 24;
  const X = (y: number) => left + (years.indexOf(y) / (years.length - 1)) * (right - left);
  const Y = (c: number) => top + ids.indexOf(c) * 34 + 14;

  return (
    <div>
      <p className="finding">
        Because the partition is fitted on all six years at once, a country has a cluster in each year and can move between them. Most do not: across the {trans.moves + trans.stays} adjacent-year transitions{step === "all" ? "" : ` from ${step}`}, {trans.stays} stay and {trans.moves} move.
      </p>
      <div className="global-controls" style={{ paddingTop: 0 }}>
        <Ctrl label="Transition">
          <Seg value={step} options={[{ value: "all" as number | "all", label: "All steps" }, ...years.slice(0, -1).map((y, i) => ({ value: y as number | "all", label: `${y}→${years[i + 1]}` }))]} onChange={setStep} />
        </Ctrl>
      </div>
      <div className="row section">
        <div className="col">
          <h3>Where countries go</h3>
          <Heatmap
            rows={ids.map((id) => ({ id: String(id), label: clusterName("ward", k, id), color: clusterColor(id) }))}
            cols={ids.map((id) => ({ id: String(id), label: clusterShort("ward", k, id) }))}
            value={(r, c) => trans.m.get(`${r}|${c}`) ?? 0}
            format={(v) => (v === 0 ? "" : String(v))}
            diverging={false}
            cellW={52}
          />
          <p className="caption">Rows: cluster at the start of a ten-year step; columns: cluster at the end. Counts of country-steps. The diagonal is persistence.</p>
        </div>
        <div className="col-narrow">
          <h3>Most mobile countries</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Country</th><th className="num">Moves</th></tr></thead>
              <tbody>
                {movers.slice(0, 18).map((m) => (
                  <tr key={m.name} style={{ cursor: "pointer" }} onClick={() => setPicked((p) => (p.includes(m.name) ? p : [...p, m.name]))} title={m.path}>
                    <td>{m.name}</td><td className="num">{m.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="caption">Number of cluster changes across the six benchmark years. Click to add to the chart.</p>
        </div>
      </div>

      <div className="section">
        <h3>Paths through the clusters</h3>
        <div className="global-controls" style={{ paddingTop: 0 }}>
          <Ctrl label="Add a country">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a name" />
            {matches.length > 0 && (
              <div className="chips">
                {matches.map((m) => (
                  <button key={m} className="chip" onClick={() => { setPicked((p) => (p.includes(m) ? p : [...p, m])); setQuery(""); }}>{m}</button>
                ))}
              </div>
            )}
          </Ctrl>
          <Ctrl label="Shown">
            <div className="chips">
              {picked.map((n) => (
                <button key={n} className="chip is-active" onClick={() => setPicked((p) => p.filter((x) => x !== n))}>{n} ×</button>
              ))}
            </div>
          </Ctrl>
        </div>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
          {ids.map((id) => (
            <g key={id}>
              <line x1={left} x2={right} y1={Y(id)} y2={Y(id)} stroke="#eee" />
              <text x={left - 10} y={Y(id) + 4} fontSize={11} textAnchor="end" fill={clusterColor(id)} fontWeight={600}>{clusterShort("ward", k, id)}</text>
            </g>
          ))}
          {years.map((y) => (
            <text key={y} x={X(y)} y={H - 8} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">{y}</text>
          ))}
          {[...byCountry.values()].map((series, i) => (
            <polyline key={i} fill="none" stroke="#bbb" strokeWidth={0.6} opacity={0.35} points={series.map((p) => `${X(p.year)},${Y(p[col] as number) + ((i % 9) - 4) * 1.2}`).join(" ")} />
          ))}
          {picked.map((name, i) => {
            const series = byCountry.get(name);
            if (!series) return null;
            const color = ["#266798", "#C64646", "#36B250", "#D1852A", "#A42DE2", "#7C6760", "#52A0A0"][i % 7];
            return (
              <g key={name}>
                <polyline fill="none" stroke={color} strokeWidth={2.2} points={series.map((p) => `${X(p.year)},${Y(p[col] as number) + (i - picked.length / 2) * 2.5}`).join(" ")} />
                {series.map((p) => (
                  <circle key={p.year} cx={X(p.year)} cy={Y(p[col] as number) + (i - picked.length / 2) * 2.5} r={3.5} fill={color} stroke="white" strokeWidth={1} />
                ))}
                <text x={X(series[series.length - 1].year) + 6} y={Y(series[series.length - 1][col] as number) + (i - picked.length / 2) * 2.5 + 4} fontSize={10.5} fill={color} fontWeight={600} style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>{name}</text>
              </g>
            );
          })}
        </svg>
        <p className="caption">Every country's path in grey; the chosen countries in colour. Vertical order of the rows is the cluster id, not a ranking.</p>
      </div>

      <MethodBlock title="How movement is measured" summary="Membership per year from one pooled partition; what a move means and what it does not">
        <p>The clustering in the first tab treats each country-year as its own row, so Poland 1985 and Poland 2025 are two rows that may fall in different clusters. Nothing links a country's rows to each other during the fit; the trajectory is read off afterwards by lining up its six rows.</p>
        <p>A move therefore means that the country's indicator vector shifted far enough, in the Euclidean metric of the first tab, to cross from one Ward cluster into another. Ward clusters are not spheres around a centre, so the boundary is not a fixed distance; but because Ward minimises within-cluster variance, a country in cluster A is in practice closer to A's mean than to any other cluster's mean for all but a few boundary cases.</p>
        <p>Two things this does not measure. First, small movements: a country that moves a long way inside its cluster shows nothing here; the country page's peer-distance chart is the place for that. Second, direction of causation: the transition matrix is a description of where regimes went, and the later tabs ask whether that had anything to do with what they export.</p>
        <p>The benchmark years are ten years apart, so a regime that collapsed and recovered within a decade is invisible; V-Dem's annual data could be scored against the same partition if that mattered.</p>
      </MethodBlock>
    </div>
  );
}
