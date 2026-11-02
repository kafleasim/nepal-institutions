import { useMemo, useState } from "react";
import type { Point } from "../data";

type Props = {
  points: Point[]; // drawn in colour
  backdrop?: Point[]; // drawn faint, behind
  colorOf: (p: Point) => string;
  labelOf?: (p: Point) => string;
  labelled?: Set<string>; // country names always labelled
  onHover?: (p: Point | null) => void;
  highlight?: (p: Point) => boolean;
  width?: number;
  height?: number;
};

/**
 * The country space as the tool draws it: the joint-UMAP coordinates, every
 * country-year a dot. Axes are the raw UMAP units; they carry no meaning
 * beyond nearness, so no ticks are drawn.
 */
export function ClusterMap({ points, backdrop = [], colorOf, labelOf, labelled, onHover, highlight, width = 640, height = 520 }: Props) {
  const [hover, setHover] = useState<Point | null>(null);
  const all = useMemo(() => [...backdrop, ...points], [backdrop, points]);
  const scale = useMemo(() => {
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const pad = 0.05;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const dx = (x1 - x0) * pad, dy = (y1 - y0) * pad;
    return {
      x: (v: number) => 12 + ((v - x0 + dx) / (x1 - x0 + 2 * dx)) * (width - 24),
      y: (v: number) => height - 12 - ((v - y0 + dy) / (y1 - y0 + 2 * dy)) * (height - 24),
    };
  }, [all, width, height]);

  const set = (p: Point | null) => {
    setHover(p);
    onHover?.(p);
  };

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} onMouseLeave={() => set(null)}>
      <rect x={0} y={0} width={width} height={height} fill="#fafafa" rx={4} />
      {backdrop.map((p, i) => (
        <circle key={`b${i}`} cx={scale.x(p.x)} cy={scale.y(p.y)} r={2} fill="#d0d0d0" opacity={0.6} />
      ))}
      {points.map((p, i) => {
        const hi = highlight ? highlight(p) : true;
        return (
          <circle
            key={i}
            cx={scale.x(p.x)}
            cy={scale.y(p.y)}
            r={hover === p ? 6 : hi ? 4.2 : 3}
            fill={colorOf(p)}
            opacity={hi ? 0.85 : 0.18}
            stroke={hover === p ? "#333" : "white"}
            strokeWidth={hover === p ? 1.5 : 0.6}
            onMouseEnter={() => set(p)}
            style={{ cursor: "default" }}
          />
        );
      })}
      {labelled &&
        points
          .filter((p) => labelled.has(p.country_name))
          .map((p, i) => (
            <text key={`l${i}`} x={scale.x(p.x) + 6} y={scale.y(p.y) + 4} fontSize={10.5} fill="#333" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>
              {p.country_name}
            </text>
          ))}
      {hover && (
        <g>
          <text x={scale.x(hover.x) + 8} y={scale.y(hover.y) - 8} fontSize={12} fontWeight={600} fill="#333" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3.5 }}>
            {hover.country_name} {hover.year}
          </text>
          {labelOf && (
            <text x={scale.x(hover.x) + 8} y={scale.y(hover.y) + 6} fontSize={11} fill="#555" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3.5 }}>
              {labelOf(hover)}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
