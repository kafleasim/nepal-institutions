import { useState } from "react";
import { mean, seeded } from "../stats";

export type StripGroup = { id: number; label: string; color: string; values: { v: number; label: string }[] };
type Props = { groups: StripGroup[]; yLabel: string; format?: (v: number) => string; width?: number; height?: number; zeroLine?: boolean };

/** One column per group; every member a dot with a small deterministic jitter; a bar at the mean. */
export function Strip({ groups, yLabel, format = (v) => v.toFixed(2), width = 640, height = 320, zeroLine = true }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const all = groups.flatMap((g) => g.values.map((v) => v.v));
  if (all.length === 0) return <p className="stat">No data.</p>;
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const top = 12, bottom = height - 44, left = 48, right = width - 12;
  const y = (v: number) => bottom - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (bottom - top);
  const colW = (right - left) / groups.length;
  const rng = seeded(11);
  const ticks = niceTicks(lo - pad, hi + pad, 5);
  return (
    <div className="chart-box">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={right} y1={y(t)} y2={y(t)} stroke="#eee" />
            <text x={left - 6} y={y(t) + 3.5} fontSize={10} textAnchor="end" fill="#7c7c7c">{format(t)}</text>
          </g>
        ))}
        {zeroLine && lo < 0 && hi > 0 && <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#333" strokeWidth={1} />}
        {groups.map((g, gi) => {
          const cx = left + colW * (gi + 0.5);
          const m = mean(g.values.map((v) => v.v));
          return (
            <g key={g.id}>
              {g.values.map((v, i) => {
                const jx = cx + (rng() - 0.5) * Math.min(colW * 0.55, 46);
                return (
                  <circle key={i} cx={jx} cy={y(v.v)} r={3.6} fill={g.color} opacity={0.75} stroke="white" strokeWidth={0.6}
                    onMouseEnter={() => setHover({ x: jx, y: y(v.v), text: `${v.label}: ${format(v.v)}` })} />
                );
              })}
              {g.values.length > 0 && <line x1={cx - Math.min(colW * 0.32, 28)} x2={cx + Math.min(colW * 0.32, 28)} y1={y(m)} y2={y(m)} stroke="#333" strokeWidth={2} />}
              <text x={cx} y={bottom + 14} fontSize={10.5} textAnchor="middle" fill="#333" fontWeight={600}>{g.label}</text>
              <text x={cx} y={bottom + 27} fontSize={10} textAnchor="middle" fill="#7c7c7c">n = {g.values.length} · mean {format(m)}</text>
            </g>
          );
        })}
        <text transform={`translate(12, ${(top + bottom) / 2}) rotate(-90)`} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">{yLabel}</text>
        {hover && (
          <text x={hover.x + 8} y={hover.y - 6} fontSize={11.5} fill="#333" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3.5 }}>{hover.text}</text>
        )}
      </svg>
    </div>
  );
}

export function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Number(t.toFixed(10)));
  return out;
}
