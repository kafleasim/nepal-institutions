import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  Country,
  GrowthRecord,
  PolSettMeta,
  PolSettTypologyRow,
  PolSettTypologySpec,
} from "../types";
import { GL } from "../lib/glTokens";
import { usePolSettTypology } from "../lib/usePolSett";
import {
  SocialFoundationDecomp,
  VerticalPowerDecomp,
} from "./PolSettDecompositions";
import { PolSettGrowthTimeline } from "./PolSettGrowthTimeline";

type Props = {
  focus: Country;
  peers: { iso3: string; name: string }[];
  growthRecord: GrowthRecord | null;
};

// Quadrant labels rendered at the four corners of each chart. The ESID
// (Schulz & Kelsall) and Khan typologies share axis directions (broad/high
// to the right, concentrated/high at the top) but use different naming
// conventions, so each chart gets its own label set.
type QuadrantLabels = {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
};

const SK_QUADRANTS: QuadrantLabels = {
  topLeft: "Narrow-Concentrated",
  topRight: "Broad-Concentrated",
  bottomLeft: "Narrow-Dispersed",
  bottomRight: "Broad-Dispersed",
};

const KHAN_QUADRANTS: QuadrantLabels = {
  topLeft: "Vulnerable-Authoritarian",
  topRight: "Strong-Dominant",
  bottomLeft: "Competitive-Clientelist",
  bottomRight: "Weak-Dominant",
};

type ChartConfig = {
  spec: PolSettTypologySpec;
  xKey: "sfs" | "horz";
  yKey: "pc" | "vert";
  labelKey: "sk_label" | "khan_label";
  quadrants: QuadrantLabels;
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  xAxisCaption: string;
  yAxisCaption: string;
};

export function PolSettTypologySection({ focus, peers, growthRecord }: Props) {
  const state = usePolSettTypology();
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const [highlightPeers, setHighlightPeers] = useState(false);

  // Build the unique-period list for the focus country. Each PolSett row is
  // a country-year inside a political period, with values held constant
  // within the period — so de-dupe on (period_start, period_end).
  const focusPeriods = useMemo(() => {
    if (state.status !== "ready") return [];
    const rows = state.bundle.byIso.get(focus.iso3) ?? [];
    const seen = new Map<string, PolSettTypologyRow>();
    for (const r of rows) {
      const key = `${r.period_start}-${r.period_end}`;
      if (!seen.has(key)) seen.set(key, r);
    }
    return [...seen.values()].sort(
      (a, b) => a.period_start - b.period_start,
    );
  }, [state, focus.iso3]);

  // Default to the most recent settlement.
  const effectivePeriodKey =
    periodKey ?? (focusPeriods.length > 0
      ? `${focusPeriods[focusPeriods.length - 1].period_start}-${focusPeriods[focusPeriods.length - 1].period_end}`
      : null);

  // The selected period defines a year — any year inside it works since
  // values are constant within a period. We pick period_start.
  const selectedRow = useMemo(() => {
    if (!effectivePeriodKey) return null;
    return (
      focusPeriods.find(
        (p) => `${p.period_start}-${p.period_end}` === effectivePeriodKey,
      ) ?? null
    );
  }, [focusPeriods, effectivePeriodKey]);

  const selectedYear = selectedRow?.period_start ?? null;

  // Slice: all PolSett countries' rows for the selected year.
  const slice = useMemo(() => {
    if (state.status !== "ready" || selectedYear == null) return [];
    return state.bundle.byYear.get(selectedYear) ?? [];
  }, [state, selectedYear]);

  const countryNameMap = useMemo(() => {
    if (state.status !== "ready") return new Map<string, string>();
    return new Map(state.bundle.meta.countries.map((c) => [c.iso3, c.name]));
  }, [state]);

  if (state.status === "loading" || state.status === "idle") {
    return (
      <section className="mt-12">
        <Header />
        <p className="text-xs text-gl-muted">Loading Political Settlement data…</p>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="mt-12">
        <Header />
        <p className="text-xs text-red-600">
          Failed to load: {state.error.message}
        </p>
      </section>
    );
  }

  const meta: PolSettMeta = state.bundle.meta;

  // Common chart configs.
  const skCfg: ChartConfig = {
    spec: meta.typology_sk,
    xKey: "sfs",
    yKey: "pc",
    labelKey: "sk_label",
    quadrants: SK_QUADRANTS,
    xDomain: [0, 90],
    yDomain: [0, 1],
    xTicks: [0, 20, 40, 60, 80],
    yTicks: [0, 0.25, 0.5, 0.75, 1],
    xFormat: (v) => `${v}%`,
    yFormat: (v) => v.toFixed(2),
    xAxisCaption: "Social foundation size — narrow ← → broad",
    yAxisCaption: "Power concentration — dispersed ↓ ↑ concentrated",
  };

  const khanCfg: ChartConfig = {
    spec: meta.typology_khan,
    xKey: "horz",
    yKey: "vert",
    labelKey: "khan_label",
    quadrants: KHAN_QUADRANTS,
    xDomain: [1, 5],
    yDomain: [0, 1],
    xTicks: [1, 2, 3, 4, 5],
    yTicks: [0, 0.25, 0.5, 0.75, 1],
    // Integer-valued ticks (1..5) render as "3"; data values like 3.397
    // keep two decimals so the tooltip matches the dot position.
    xFormat: (v) => (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)),
    yFormat: (v) => v.toFixed(2),
    xAxisCaption: "Horizontal power — OB-dominant ← → coalition-dominant",
    yAxisCaption: "Vertical power — dispersed ↓ ↑ leader-dominated",
  };

  // Status sub-line printed once at the top.
  const inPolSett = meta.countries.some((c) => c.iso3 === focus.iso3);

  return (
    <section className="mt-12 space-y-4">
      <Header />

      <p className="text-sm text-gl-muted">
        Two complementary typologies of political settlements. Both are
        period-coded — values stay constant inside a political period
        (bounded by leadership change) and step at period breaks. Sample: 42
        Global-South countries, {meta.year_range[0]}–{meta.year_range[1]}.
      </p>

      {/* Orientation timeline — GDP + settlements over time. Bands are
          clickable and drive the period selection below. */}
      <PolSettGrowthTimeline
        focus={focus}
        periods={focusPeriods.map((p) => ({
          start: p.period_start,
          end: p.period_end,
          leader: p.leader,
          sk_label: p.sk_label,
          sk_code: p.sk_code,
          khan_label: p.khan_label,
        }))}
        growthRecord={growthRecord}
        selectedKey={effectivePeriodKey}
        onSelectPeriod={(key) => setPeriodKey(key)}
      />

      {/* Settlement selector */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-gl-border bg-white px-3 py-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="font-medium">Political settlement:</span>
          <select
            value={effectivePeriodKey ?? ""}
            onChange={(e) => setPeriodKey(e.target.value || null)}
            disabled={focusPeriods.length === 0}
            className="min-w-[320px] rounded border border-gl-border bg-white px-2 py-1 text-xs"
          >
            {focusPeriods.length === 0 && (
              <option value="">
                {focus.name} is not in the Political Settlement sample
              </option>
            )}
            {focusPeriods.map((p) => {
              const key = `${p.period_start}-${p.period_end}`;
              const leader = p.leader ?? "—";
              return (
                <option key={key} value={key}>
                  {p.period_start}–{p.period_end} · {leader}
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={highlightPeers}
            onChange={(e) => setHighlightPeers(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span>Highlight peers ({peers.length})</span>
        </label>
        {!inPolSett && (
          <span className="text-xs text-red-600">
            {focus.name} is not in the 42-country Political Settlement sample.
          </span>
        )}
      </div>

      {/* ESID typology (book) */}
      <div className="space-y-2">
        <div>
          <h3 className="text-base font-semibold">
            ESID typology: social foundation × power concentration
          </h3>
          <p className="text-xs text-gl-muted">
            {meta.typology_sk.x_label.toLowerCase()} ({meta.typology_sk.x_description.toLowerCase().split(".")[0]})
            {" "}vs{" "}{meta.typology_sk.y_label.toLowerCase()}{" "}
            ({meta.typology_sk.y_description.toLowerCase().split(".")[0]}).
          </p>
        </div>
        <TypologyChart
          cfg={skCfg}
          slice={slice}
          focus={focus}
          peers={peers}
          selectedRow={selectedRow}
          highlightPeers={highlightPeers}
          countryNameMap={countryNameMap}
        />
        <ESIDQuadrantNotes />
      </div>

      {/* Khan typology */}
      <div className="space-y-2 pt-6">
        <div>
          <h3 className="text-base font-semibold">
            Khan typology: horizontal × vertical power
          </h3>
          <p className="text-sm text-gl-muted">
            Mushtaq Khan&rsquo;s classical typology decomposes the ESID
            <em> power concentration</em> axis into two parts.{" "}
            <b>Horizontal power</b> is how strong the governing coalition is
            vis-à-vis the excluded opposition (the LB + CLB versus the OB).{" "}
            <b>Vertical power</b> is how concentrated power is within the
            coalition itself — i.e., whether the leader&rsquo;s bloc dominates
            its allies (LB versus CLB). The four resulting types —
            Strong-Dominant, Vulnerable-Authoritarian, Weak-Dominant,
            Competitive-Clientelist — anchor much of the political-settlements
            literature.{" "}
            <em>
              Labels here come from <code>x_khansettlementype</code> in the
              dataset (codebook 4.1.11).
            </em>
          </p>
        </div>
        <TypologyChart
          cfg={khanCfg}
          slice={slice}
          focus={focus}
          peers={peers}
          selectedRow={selectedRow}
          highlightPeers={highlightPeers}
          countryNameMap={countryNameMap}
        />
      </div>

      {/* Vertical-power decomposition (Khan's y-axis, broken down further) */}
      <div className="pt-4">
        <VerticalPowerDecomp
          focus={focus}
          selectedYear={selectedYear}
          focusLabel={selectedRow?.leader ?? null}
        />
      </div>

      {/* Social-foundation decomposition (ESID's x-axis, broken down further) */}
      <div className="pt-4">
        <SocialFoundationDecomp
          focus={focus}
          selectedYear={selectedYear}
          focusLabel={selectedRow?.leader ?? null}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Four-quadrant interpretation cards for the ESID typology. Laid out as a
// 2x2 grid that mirrors the chart's quadrant positions.
function ESIDQuadrantNotes() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
      <QuadrantNote
        title="Narrow-Concentrated"
        position="top-left of chart"
        body="Only a thin slice of the powerful population is co-opted into the settlement, and one bloc clearly dominates the governing coalition. Capable of decisive action but vulnerable to elite defection and popular pressure — classic personalist or authoritarian patterns."
      />
      <QuadrantNote
        title="Broad-Concentrated"
        position="top-right of chart"
        body="A wide cross-section of socially powerful groups is included, and a single bloc dominates. Long-horizon policymaking is possible; the leader's bloc carries heavy expectations from a broad constituency. Includes most developmental and hegemonic-party regimes."
      />
      <QuadrantNote
        title="Narrow-Dispersed"
        position="bottom-left of chart"
        body="Narrow social base AND fragmented governing camp. The most volatile quadrant — competitive clientelism, frequent leadership turnover, weak central authority. Reforms tend to be short-horizon and reversible."
      />
      <QuadrantNote
        title="Broad-Dispersed"
        position="bottom-right of chart"
        body="A wide social coalition, but power split across competing factions within the governing camp. Compromise-heavy and slow-moving; large pluralist democracies and consociational systems often sit here."
      />
    </div>
  );
}

function QuadrantNote({
  title,
  position,
  body,
}: {
  title: string;
  position: string;
  body: string;
}) {
  return (
    <div className="rounded border border-gl-border bg-white p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gl-text">{title}</span>
        <span className="text-[10px] text-gl-muted">{position}</span>
      </div>
      <p className="mt-1 text-gl-muted">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Header() {
  return (
    <div>
      <h2 className="text-xl font-semibold">
        Political Settlement typology
      </h2>
      <p className="mt-0.5 text-xs text-gl-muted">
        Schulz &amp; Kelsall 2020 · ESID Working Paper 165
      </p>
    </div>
  );
}

type ChartProps = {
  cfg: ChartConfig;
  slice: PolSettTypologyRow[];
  focus: Country;
  peers: { iso3: string; name: string }[];
  selectedRow: PolSettTypologyRow | null;
  highlightPeers: boolean;
  countryNameMap: Map<string, string>;
};

type Point = PolSettTypologyRow & { name?: string };

function TypologyChart({
  cfg,
  slice,
  focus,
  peers,
  selectedRow,
  highlightPeers,
  countryNameMap,
}: ChartProps) {
  const peerIsoSet = useMemo(
    () => new Set(peers.map((p) => p.iso3)),
    [peers],
  );

  const { focusPts, peerPts, otherPts } = useMemo(() => {
    const focusPts: Point[] = [];
    const peerPts: Point[] = [];
    const otherPts: Point[] = [];
    for (const row of slice) {
      const name = countryNameMap.get(row.iso3) ?? row.iso3;
      const p: Point = { ...row, name };
      if (row.iso3 === focus.iso3) focusPts.push(p);
      else if (peerIsoSet.has(row.iso3)) peerPts.push(p);
      else otherPts.push(p);
    }
    return { focusPts, peerPts, otherPts };
  }, [slice, focus.iso3, peerIsoSet, countryNameMap]);

  const focusOnAxes = focusPts[0];
  const xCut = cfg.spec.x_cut;
  const yCut = cfg.spec.y_cut;
  const [xMin, xMax] = cfg.xDomain;
  const [yMin, yMax] = cfg.yDomain;

  return (
    <div className="rounded border border-gl-border bg-white p-3">
      <div className="mb-2 px-1 text-xs text-gl-muted">
        {focusOnAxes ? (
          <>
            <span className="font-medium text-gl-text">{focus.name}:</span>{" "}
            {focusOnAxes[cfg.labelKey] ?? "—"} · {cfg.spec.x_label.toLowerCase()}{" "}
            = {cfg.xFormat(focusOnAxes[cfg.xKey] as number)} ·{" "}
            {cfg.spec.y_label.toLowerCase()} ={" "}
            {cfg.yFormat(focusOnAxes[cfg.yKey] as number)}
            {selectedRow?.leader && (
              <>
                {" "}· leader{" "}
                <span className="italic">{selectedRow.leader}</span>
              </>
            )}
          </>
        ) : selectedRow ? (
          <>
            <span className="font-medium text-gl-text">{focus.name}:</span>{" "}
            missing values for these axes in the selected settlement
          </>
        ) : (
          <span className="text-gl-muted">
            Select a political settlement above to position {focus.name}.
          </span>
        )}
      </div>

      <div className="relative h-[420px] w-full">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
            <CartesianGrid stroke={GL.border} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey={cfg.xKey}
              domain={cfg.xDomain}
              tick={{ fontSize: 10, fill: GL.muted }}
              tickLine={false}
              ticks={cfg.xTicks}
              tickFormatter={cfg.xFormat}
              label={{
                value: cfg.xAxisCaption,
                position: "insideBottom",
                offset: -20,
                style: { fontSize: 11, fill: GL.muted },
              }}
            />
            <YAxis
              type="number"
              dataKey={cfg.yKey}
              domain={cfg.yDomain}
              tick={{ fontSize: 10, fill: GL.muted }}
              tickLine={false}
              width={50}
              ticks={cfg.yTicks}
              tickFormatter={cfg.yFormat}
              label={{
                value: cfg.yAxisCaption,
                angle: -90,
                position: "insideLeft",
                offset: 10,
                style: {
                  fontSize: 11,
                  fill: GL.muted,
                  textAnchor: "middle",
                },
              }}
            />
            <ZAxis range={[60, 60]} />

            <ReferenceLine x={xCut} stroke={GL.muted} strokeDasharray="2 4" />
            <ReferenceLine y={yCut} stroke={GL.muted} strokeDasharray="2 4" />

            <ReferenceArea
              x1={xMin} x2={xCut} y1={yCut} y2={yMax}
              fill="transparent"
              label={{
                value: cfg.quadrants.topLeft,
                position: "insideTopLeft",
                fontSize: 10,
                fill: GL.muted,
                offset: 8,
              }}
            />
            <ReferenceArea
              x1={xCut} x2={xMax} y1={yCut} y2={yMax}
              fill="transparent"
              label={{
                value: cfg.quadrants.topRight,
                position: "insideTopRight",
                fontSize: 10,
                fill: GL.muted,
                offset: 8,
              }}
            />
            <ReferenceArea
              x1={xMin} x2={xCut} y1={yMin} y2={yCut}
              fill="transparent"
              label={{
                value: cfg.quadrants.bottomLeft,
                position: "insideBottomLeft",
                fontSize: 10,
                fill: GL.muted,
                offset: 8,
              }}
            />
            <ReferenceArea
              x1={xCut} x2={xMax} y1={yMin} y2={yCut}
              fill="transparent"
              label={{
                value: cfg.quadrants.bottomRight,
                position: "insideBottomRight",
                fontSize: 10,
                fill: GL.muted,
                offset: 8,
              }}
            />

            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<TypologyTooltip cfg={cfg} />}
            />

            <Scatter
              name="Other countries"
              data={otherPts}
              fill={GL.muted}
              fillOpacity={0.25}
              stroke="none"
            />
            <Scatter
              name="Peers"
              data={peerPts}
              fill={GL.highlight}
              fillOpacity={highlightPeers ? 0.95 : 0.3}
              stroke={highlightPeers ? GL.highlight : "none"}
              strokeWidth={highlightPeers ? 1.5 : 0}
            />
            <Scatter
              name={focus.name}
              data={focusPts}
              fill={GL.blue}
              fillOpacity={1}
              stroke="white"
              strokeWidth={2}
              shape={(props: {
                cx?: number;
                cy?: number;
                payload?: Point;
              }) => {
                const { cx, cy, payload } = props;
                if (cx == null || cy == null) return <g />;
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill={GL.blue}
                      stroke="white"
                      strokeWidth={2}
                    />
                    <text
                      x={cx + 12}
                      y={cy + 4}
                      fontSize={11}
                      fontWeight={600}
                      fill={GL.text}
                    >
                      {payload?.name ?? focus.name}
                    </text>
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: GL.blue }}
          />
          <span className="font-medium">{focus.name}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background: GL.highlight,
              opacity: highlightPeers ? 0.95 : 0.3,
            }}
          />
          <span className="text-gl-muted">peers</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full opacity-25"
            style={{ background: GL.muted }}
          />
          <span className="text-gl-muted">other Global-South countries</span>
        </span>
      </div>
    </div>
  );
}

function TypologyTooltip({
  active,
  payload,
  cfg,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  cfg: ChartConfig;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-gl-border bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-medium">{p.name}</div>
      <div className="text-gl-muted">
        {cfg.spec.x_label} {cfg.xFormat(p[cfg.xKey] as number)} ·{" "}
        {cfg.spec.y_label} {cfg.yFormat(p[cfg.yKey] as number)}
        {p[cfg.labelKey] ? ` · ${p[cfg.labelKey]}` : ""}
      </div>
      {p.leader && (
        <div className="text-gl-muted italic">
          {p.leader} ({p.period_start}–{p.period_end})
        </div>
      )}
    </div>
  );
}
