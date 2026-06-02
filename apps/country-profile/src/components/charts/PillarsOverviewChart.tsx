import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PillarsRecord, PillarPctKey } from "../../types";
import { useChartZoom } from "../../lib/useChartZoom";
import { GL } from "../../lib/glTokens";
import { ZoomResetButton } from "./ZoomResetButton";

const DEFAULT_X_DOMAIN: [number, string] = [1960, "dataMax"];

// One colour per pillar; composite is the bold dark line.
export const PILLAR_STYLE: Record<
  PillarPctKey,
  { color: string; label: string; width: number }
> = {
  composite: { color: GL.text, label: "Composite", width: 2.6 },
  fiscal: { color: GL.blue, label: "Fiscal", width: 1.6 },
  legal: { color: GL.green, label: "Legal", width: 1.6 },
  collective: { color: GL.orange, label: "Collective", width: 1.6 },
  peace: { color: GL.purple, label: "Peace", width: 1.6 },
};

const ORDER: PillarPctKey[] = [
  "fiscal",
  "legal",
  "collective",
  "peace",
  "composite",
];

type Row = { year: number } & Partial<Record<PillarPctKey, number | null>>;

function buildRows(record: PillarsRecord | undefined): Row[] {
  if (!record) return [];
  const yearSet = new Set<number>();
  const maps = new Map<PillarPctKey, Map<number, number>>();
  for (const key of ORDER) {
    const pts = record.pillars[key];
    if (!pts) continue;
    const m = new Map<number, number>();
    for (const p of pts) {
      m.set(p.year, p.value);
      yearSet.add(p.year);
    }
    maps.set(key, m);
  }
  return [...yearSet]
    .sort((a, b) => a - b)
    .map((y) => {
      const row: Row = { year: y };
      for (const key of ORDER) {
        const v = maps.get(key)?.get(y);
        row[key] = v === undefined ? null : v;
      }
      return row;
    });
}

type Props = {
  record: PillarsRecord | undefined;
  focusName: string;
  breakYears: number[] | undefined;
};

export function PillarsOverviewChart({ record, focusName, breakYears }: Props) {
  const rows = useMemo(() => buildRows(record), [record]);
  const zoom = useChartZoom(DEFAULT_X_DOMAIN);
  const hasData = (record?.pillars?.composite?.length ?? 0) > 0;

  return (
    <div className="relative h-80 w-full">
      <ZoomResetButton show={zoom.isZoomed} onReset={zoom.reset} />
      <ResponsiveContainer>
        <LineChart
          data={rows}
          margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
          onMouseDown={zoom.onMouseDown}
          onMouseMove={zoom.onMouseMove}
          onMouseUp={zoom.onMouseUp}
          onMouseLeave={zoom.onMouseLeave}
          onDoubleClick={zoom.reset}
        >
          <CartesianGrid stroke={GL.border} strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            type="number"
            domain={zoom.xDomain}
            allowDataOverflow
            tick={{ fontSize: 10, fill: GL.muted }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 10, fill: GL.muted }}
            tickLine={false}
            width={28}
          />
          <Tooltip
            formatter={(v, name) => [
              v === null ? "—" : (v as number).toFixed(0),
              name as string,
            ]}
            labelFormatter={(y) => `Year ${y}`}
            contentStyle={{ fontSize: 11 }}
          />
          {/* Median reference: percentile 50 = the world's middle each year. */}
          <ReferenceLine y={50} stroke={GL.muted} strokeOpacity={0.4} />
          {breakYears?.map((y) => (
            <ReferenceLine
              key={`brk-${y}`}
              x={y}
              stroke={GL.muted}
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ))}
          {ORDER.map((key) => {
            const st = PILLAR_STYLE[key];
            const isComposite = key === "composite";
            return (
              <Line
                key={key}
                name={st.label}
                type="monotone"
                dataKey={key}
                stroke={st.color}
                strokeWidth={st.width}
                strokeOpacity={isComposite ? 1 : 0.75}
                dot={false}
                activeDot={{ r: isComposite ? 4 : 3 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            );
          })}
          {zoom.refLeft !== null && zoom.refRight !== null && (
            <ReferenceArea
              x1={zoom.refLeft}
              x2={zoom.refRight}
              strokeOpacity={0.3}
              fill={GL.blue}
              fillOpacity={0.1}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {!hasData && (
        <p className="absolute inset-x-0 bottom-0 px-1 text-[11px] text-gl-muted">
          No pillars data for {focusName}.
        </p>
      )}
    </div>
  );
}
