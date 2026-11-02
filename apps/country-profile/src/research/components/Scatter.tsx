import { useState } from "react";
import { niceTicks } from "./Strip";

export type ScatterPoint = { x: number; y: number; label: string; color: string; group?: number; r?: number };
type Line = { x1: number; y1: number; x2: number; y2: number; color: string; label?: string; dashed?: boolean };
type Props = {
  points: ScatterPoint[];
  means?: ScatterPoint[];
  lines?: Line[];
  xLabel: string;
  yLabel: string;
  xLog?: boolean;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  width?: number;
  height?: number;
  dim?: (p: ScatterPoint) => boolean;
};

export function Scatter({ points, means = [], lines = [], xLabel, yLabel, xLog, formatX = (v) => String(v), formatY = (v) => v.toFixed(1), width = 640, height = 380, dim }: Props) {
  const [hover, setHover] = useState<ScatterPoint | null>(null);
  const tx = (v: number) => (xLog ? Math.log10(v) : v);
  const xsAll = [...points, ...means].map((p) => tx(p.x)).concat(lines.flatMap((l) => [tx(l.x1), tx(l.x2)]));
  const ysAll = [...points, ...means].map((p) => p.y).concat(lines.flatMap((l) => [l.y1, l.y2]));
  if (xsAll.length === 0) return <p className="stat">No data.</p>;
  const xlo = Math.min(...xsAll), xhi = Math.max(...xsAll), ylo = Math.min(...ysAll), yhi = Math.max(...ysAll);
  const px = (xhi - xlo) * 0.06 || 1, py = (yhi - ylo) * 0.08 || 1;
  const top = 12, bottom = height - 40, left = 52, right = width - 14;
  const X = (v: number) => left + ((tx(v) - (xlo - px)) / (xhi - xlo + 2 * px)) * (right - left);
  const Y = (v: number) => bottom - ((v - (ylo - py)) / (yhi - ylo + 2 * py)) * (bottom - top);
  const xt = xLog ? logTicks(xlo - px, xhi + px) : niceTicks(xlo - px, xhi + px, 6);
  const yt = niceTicks(ylo - py, yhi + py, 5);
  return (
    <div className="chart-box">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} onMouseLeave={() => setHover(null)}>
        {yt.map((t) => (
          <g key={`y${t}`}>
            <line x1={left} x2={right} y1={Y(t)} y2={Y(t)} stroke="#eee" />
            <text x={left - 6} y={Y(t) + 3.5} fontSize={10} textAnchor="end" fill="#7c7c7c">{formatY(t)}</text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={`x${t}`}>
            <line y1={top} y2={bottom} x1={X(t)} x2={X(t)} stroke="#eee" />
            <text y={bottom + 14} x={X(t)} fontSize={10} textAnchor="middle" fill="#7c7c7c">{formatX(t)}</text>
          </g>
        ))}
        {ylo < 0 && yhi > 0 && <line x1={left} x2={right} y1={Y(0)} y2={Y(0)} stroke="#333" strokeWidth={1} />}
        {lines.map((l, i) => (
          <g key={`l${i}`}>
            <line x1={X(l.x1)} y1={Y(l.y1)} x2={X(l.x2)} y2={Y(l.y2)} stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? "4 3" : undefined} />
            {l.label && <text x={X(l.x2) + 4} y={Y(l.y2) + 4} fontSize={10.5} fill={l.color} fontWeight={600}>{l.label}</text>}
          </g>
        ))}
        {points.map((p, i) => {
          const dimmed = dim ? dim(p) : false;
          return (
            <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={hover === p ? 6 : p.r ?? 3.8} fill={p.color} opacity={dimmed ? 0.15 : 0.75} stroke="white" strokeWidth={0.6}
              onMouseEnter={() => setHover(p)} />
          );
        })}
        {means.map((m, i) => (
          <g key={`m${i}`}>
            <rect x={X(m.x) - 6} y={Y(m.y) - 6} width={12} height={12} fill={m.color} stroke="#333" strokeWidth={1.2} transform={`rotate(45 ${X(m.x)} ${Y(m.y)})`} />
            <text x={X(m.x) + 10} y={Y(m.y) + 4} fontSize={10.5} fontWeight={600} fill={m.color} style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>{m.label}</text>
          </g>
        ))}
        <text x={(left + right) / 2} y={height - 6} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">{xLabel}</text>
        <text transform={`translate(12, ${(top + bottom) / 2}) rotate(-90)`} fontSize={10.5} textAnchor="middle" fill="#7c7c7c">{yLabel}</text>
        {hover && (
          <text x={X(hover.x) + 8} y={Y(hover.y) - 8} fontSize={11.5} fill="#333" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3.5 }}>
            {hover.label} ({formatX(hover.x)}, {formatY(hover.y)})
          </text>
        )}
      </svg>
    </div>
  );
}

function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (Math.log10(v) >= lo && Math.log10(v) <= hi) out.push(v);
    }
  }
  return out;
}
