type Cell = { r: number; c: number; v: number | null };
type Props = {
  rows: { id: string; label: string; color?: string }[];
  cols: { id: string; label: string }[];
  value: (r: string, c: string) => number | null;
  format?: (v: number) => string;
  diverging?: boolean; // centred on zero
  domain?: [number, number];
  cellW?: number;
  cellH?: number;
  labelW?: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: [number, number, number], c2: [number, number, number], t: number) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}
const WHITE: [number, number, number] = [255, 255, 255];
const BLUE: [number, number, number] = [38, 103, 152];
const RED: [number, number, number] = [198, 70, 70];

/** A small heat table. Diverging: blue above zero, red below; sequential: white to blue. */
export function Heatmap({ rows, cols, value, format = (v) => v.toFixed(2), diverging = true, domain, cellW = 64, cellH = 26, labelW = 190 }: Props) {
  const cells: Cell[] = [];
  let lo = Infinity, hi = -Infinity;
  rows.forEach((r, ri) =>
    cols.forEach((c, ci) => {
      const v = value(r.id, c.id);
      cells.push({ r: ri, c: ci, v });
      if (v !== null) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }),
  );
  const [d0, d1] = domain ?? (diverging ? [-Math.max(Math.abs(lo), Math.abs(hi)), Math.max(Math.abs(lo), Math.abs(hi))] : [Math.min(0, lo), hi]);
  const fill = (v: number) => {
    if (diverging) {
      const t = Math.min(1, Math.abs(v) / Math.max(Math.abs(d0), Math.abs(d1), 1e-9));
      return v >= 0 ? mix(WHITE, BLUE, t) : mix(WHITE, RED, t);
    }
    const t = Math.min(1, Math.max(0, (v - d0) / (d1 - d0 || 1)));
    return mix(WHITE, BLUE, t);
  };
  const headerH = 64;
  const width = labelW + cols.length * cellW + 8;
  const height = headerH + rows.length * cellH + 4;
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      {cols.map((c, ci) => (
        <text key={c.id} transform={`translate(${labelW + ci * cellW + cellW / 2}, ${headerH - 6}) rotate(-35)`} fontSize={10.5} fill="#4f4a42" textAnchor="start">
          {c.label}
        </text>
      ))}
      {rows.map((r, ri) => (
        <g key={r.id}>
          {r.color && <rect x={0} y={headerH + ri * cellH + 6} width={4} height={cellH - 12} fill={r.color} />}
          <text x={10} y={headerH + ri * cellH + cellH / 2 + 4} fontSize={11.5} fill="#333">
            {r.label.length > 30 ? r.label.slice(0, 29) + "…" : r.label}
          </text>
        </g>
      ))}
      {cells.map((cell) => (
        <g key={`${cell.r}-${cell.c}`}>
          <rect x={labelW + cell.c * cellW} y={headerH + cell.r * cellH} width={cellW - 2} height={cellH - 2} fill={cell.v === null ? "#f3f3f3" : fill(cell.v)} rx={2} />
          {cell.v !== null && (
            <text x={labelW + cell.c * cellW + (cellW - 2) / 2} y={headerH + cell.r * cellH + cellH / 2 + 3.5} fontSize={10.5} textAnchor="middle" fill={Math.abs(cell.v) / Math.max(Math.abs(d0), Math.abs(d1), 1e-9) > 0.55 ? "white" : "#333"}>
              {format(cell.v)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
