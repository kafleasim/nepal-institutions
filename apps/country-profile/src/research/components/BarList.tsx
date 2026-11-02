export type BarItem = { label: string; value: number; sub?: string; color?: string };
type Props = { items: BarItem[]; max?: number; format?: (v: number) => string; width?: number; rowH?: number; labelW?: number };

/** Horizontal bars from a zero line; negative values run left. */
export function BarList({ items, max, format = (v) => v.toFixed(2), width = 560, rowH = 20, labelW = 250 }: Props) {
  if (items.length === 0) return <p className="stat">Nothing to show.</p>;
  const m = max ?? Math.max(...items.map((i) => Math.abs(i.value)), 1e-9);
  const barW = width - labelW - 60;
  const zero = labelW + barW / 2;
  const scale = (v: number) => (v / m) * (barW / 2);
  const height = items.length * rowH + 6;
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      <line x1={zero} x2={zero} y1={0} y2={height} stroke="#333" strokeWidth={1} />
      {items.map((it, i) => {
        const y = i * rowH + 3;
        const w = Math.abs(scale(it.value));
        const x = it.value >= 0 ? zero : zero - w;
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + rowH / 2 + 2} fontSize={11} textAnchor="end" fill="#333">
              {it.label.length > 40 ? it.label.slice(0, 39) + "…" : it.label}
            </text>
            {it.sub && <text x={4} y={y + rowH / 2 + 2} fontSize={9.5} fill="#7c7c7c">{it.sub}</text>}
            <rect x={x} y={y + 3} width={w} height={rowH - 8} fill={it.color ?? (it.value >= 0 ? "#266798" : "#C64646")} opacity={0.85} rx={1.5} />
            <text x={it.value >= 0 ? x + w + 4 : x - 4} y={y + rowH / 2 + 2} fontSize={10.5} textAnchor={it.value >= 0 ? "start" : "end"} fill="#4f4a42">
              {format(it.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
