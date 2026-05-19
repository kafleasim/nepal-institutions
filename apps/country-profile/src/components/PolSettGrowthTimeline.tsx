import { useMemo } from "react";
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Country, GrowthRecord, PolSettTypologyRow } from "../types";
import { GL } from "../lib/glTokens";

// Period bands are tinted by SK quadrant code so a country's settlement
// history reads as a coloured strip across the chart.
const SK_BAND_COLOR: Record<string, string> = {
  BC: GL.green,
  NC: GL.highlight,
  BD: GL.cyan,
  ND: GL.orange,
};

// Map sk_code → canonical Schulz-Kelsall quadrant name (matches
// SK_QUADRANTS in PolSettTypologySection). The dataset's `sk_label` field
// carries Khan-style names ("Strong-Dominant" etc.) by historical
// convention; for the ESID/SK band labels we want the SK names.
const SK_QUADRANT_NAME: Record<string, string> = {
  BC: "Broad-Concentrated",
  NC: "Narrow-Concentrated",
  BD: "Broad-Dispersed",
  ND: "Narrow-Dispersed",
};

type Period = {
  start: number;
  end: number;
  leader: string | null;
  sk_label: string | null;
  sk_code: PolSettTypologyRow["sk_code"] | null;
  khan_label: string | null;
};

type Props = {
  focus: Country;
  // Period-deduped settlement list for this country (one entry per unique
  // start-end pair, ordered chronologically).
  periods: Period[];
  growthRecord: GrowthRecord | null;
  // Currently-selected period (matched on start-end).
  selectedKey: string | null;
  onSelectPeriod: (key: string) => void;
};

const fmtUsd = (v: number) =>
  v >= 10000
    ? `$${(v / 1000).toFixed(1)}k`
    : v >= 1000
      ? `$${(v / 1000).toFixed(1)}k`
      : `$${v.toFixed(0)}`;

export function PolSettGrowthTimeline({
  focus,
  periods,
  growthRecord,
  selectedKey,
  onSelectPeriod,
}: Props) {
  // Only consider years that fall inside the PolSett period range; PolSett
  // is period-coded 1945-2019, GDP from PWT typically 1950-2023. The
  // timeline reads better when we trim to the overlap window plus a bit.
  const data = useMemo(() => {
    if (!growthRecord || growthRecord.gdp_per_capita.length === 0) return [];
    return growthRecord.gdp_per_capita.filter((p) => p.value > 0);
  }, [growthRecord]);

  if (!data.length) {
    return (
      <div className="rounded border border-gl-border bg-white p-3">
        <h3 className="text-base font-semibold">
          GDP per capita &amp; political settlements over time
        </h3>
        <p className="mt-1 text-xs text-gl-muted">
          No GDP per capita data for {focus.name}.
        </p>
      </div>
    );
  }
  if (!periods.length) {
    return (
      <div className="rounded border border-gl-border bg-white p-3">
        <h3 className="text-base font-semibold">
          GDP per capita &amp; political settlements over time
        </h3>
        <p className="mt-1 text-xs text-gl-muted">
          {focus.name} is not in the 42-country Political Settlement sample.
        </p>
      </div>
    );
  }

  const breaks = growthRecord?.breaks?.years ?? [];

  return (
    <div className="rounded border border-gl-border bg-white p-3">
      <div className="mb-2">
        <h3 className="text-base font-semibold">
          GDP per capita &amp; political settlements over time
        </h3>
        <p className="mt-0.5 text-xs text-gl-muted">
          GDP per capita (PWT, log scale) with growth-break years as dashed
          lines. Background bands show {focus.name}&rsquo;s political
          settlements; click a band to select that settlement and update the
          rest of the section.
        </p>
      </div>

      <div className="relative h-80 w-full">
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{ top: 36, right: 16, left: 4, bottom: 4 }}
          >
            <CartesianGrid stroke={GL.border} strokeDasharray="3 3" />

            {/* Background bands — rendered first so the line + breaks sit on top. */}
            {periods.map((p) => {
              const key = `${p.start}-${p.end}`;
              const isSelected = key === selectedKey;
              const color = p.sk_code
                ? SK_BAND_COLOR[p.sk_code] ?? GL.muted
                : GL.muted;
              return (
                <ReferenceArea
                  key={`band-${key}`}
                  x1={p.start}
                  x2={p.end}
                  fill={color}
                  fillOpacity={isSelected ? 0.28 : 0.12}
                  stroke={isSelected ? color : "none"}
                  strokeOpacity={isSelected ? 0.9 : 0}
                  strokeWidth={isSelected ? 1.5 : 0}
                  onClick={() => onSelectPeriod(key)}
                  style={{ cursor: "pointer" }}
                  ifOverflow="hidden"
                >
                  <Label
                    content={(props) => (
                      <BandLabel
                        viewBox={
                          props.viewBox as {
                            x?: number;
                            y?: number;
                            width?: number;
                            height?: number;
                          }
                        }
                        leader={p.leader}
                        skCode={p.sk_code}
                        bold={isSelected}
                      />
                    )}
                  />
                </ReferenceArea>
              );
            })}

            {/* Growth-break vertical lines */}
            {breaks.map((y) => (
              <ReferenceLine
                key={`brk-${y}`}
                x={y}
                stroke={GL.muted}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            ))}

            <XAxis
              dataKey="year"
              type="number"
              domain={["dataMin", "dataMax"]}
              allowDataOverflow
              tick={{ fontSize: 11, fill: GL.muted }}
              tickLine={false}
            />
            <YAxis
              scale="log"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: GL.muted }}
              tickLine={false}
              tickFormatter={fmtUsd}
              width={56}
            />
            <Tooltip
              formatter={(v) => fmtUsd(v as number)}
              labelFormatter={(y) => `Year ${y}`}
              contentStyle={{ fontSize: 12 }}
            />

            <Line
              type="monotone"
              dataKey="value"
              stroke={GL.blue}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Legend />
    </div>
  );
}

// Two-line band label rendered as raw SVG so we can measure the band's
// pixel width and hide / truncate the label when the band is too narrow
// to display the full text without colliding with its neighbours.
function BandLabel({
  viewBox,
  leader,
  skCode,
  bold,
}: {
  viewBox: { x?: number; y?: number; width?: number; height?: number };
  leader: string | null;
  skCode: string | null;
  bold: boolean;
}) {
  const x = viewBox.x ?? 0;
  const y = viewBox.y ?? 0;
  const w = viewBox.width ?? 0;
  if (w < 26) return null; // band too narrow for any label at all

  const cx = x + w / 2;
  const skName = skCode ? SK_QUADRANT_NAME[skCode] ?? null : null;

  // Approximate truncation by character budget — at fontSize 10 each char
  // is ~5.5px wide. Leave a small horizontal pad so adjacent labels do
  // not collide at band borders.
  const charBudget = Math.max(0, Math.floor((w - 8) / 5.5));
  const leaderText = truncate(leader ?? "—", charBudget);
  const showSk = w >= 60 && skName != null;
  const skText = showSk ? truncate(skName!, charBudget) : null;

  return (
    <g pointerEvents="none">
      <text
        x={cx}
        y={y + 10}
        textAnchor="middle"
        fontSize={10}
        fontWeight={bold ? 700 : 600}
        fill={GL.text}
      >
        {leaderText}
      </text>
      {skText && (
        <text
          x={cx}
          y={y + 22}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={bold ? 600 : 400}
          fill={GL.muted}
        >
          {skText}
        </text>
      )}
    </g>
  );
}

function truncate(s: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (s.length <= maxChars) return s;
  if (maxChars <= 1) return "…";
  return s.slice(0, maxChars - 1) + "…";
}

function Legend() {
  const items: Array<{ code: string; label: string }> = [
    { code: "BC", label: "Broad-Concentrated" },
    { code: "NC", label: "Narrow-Concentrated" },
    { code: "BD", label: "Broad-Dispersed" },
    { code: "ND", label: "Narrow-Dispersed" },
  ];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gl-muted">
      {items.map((i) => (
        <span key={i.code} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3.5 rounded-sm"
            style={{ background: SK_BAND_COLOR[i.code], opacity: 0.4 }}
          />
          <span>
            <span className="font-mono">{i.code}</span> {i.label}
          </span>
        </span>
      ))}
    </div>
  );
}
