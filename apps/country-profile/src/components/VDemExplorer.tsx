import { useEffect, useMemo, useState } from "react";
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
import type {
  Country,
  GrowthRecord,
  ScalarPoint,
  VDemIndicator,
  VDemIndicatorRegistry,
} from "../types";
import { GL, GL_PEER_PALETTE } from "../lib/glTokens";
import { useChartZoom } from "../lib/useChartZoom";
import { useVdemExplorer } from "../lib/useVdemExplorer";
import { ZoomResetButton } from "./charts/ZoomResetButton";

type Props = {
  focus: Country;
  peers: { iso3: string; name: string }[];
  growthRecord: GrowthRecord | null;
  defaultCollapsed?: boolean;
};

type ChartRow = { year: number } & Record<string, number | null>;

const DEFAULT_DOMAIN: [number, string] = [1940, "dataMax"];

export function VDemExplorer({ focus, peers, growthRecord, defaultCollapsed = false }: Props) {
  const [registry, setRegistry] = useState<VDemIndicatorRegistry | null>(null);
  const [tag, setTag] = useState<string>("");
  const [showPeers, setShowPeers] = useState(false);

  const explorer = useVdemExplorer(true);

  useEffect(() => {
    fetch("/vdem_indicators.json")
      .then((r) => r.json() as Promise<VDemIndicatorRegistry>)
      .then(setRegistry);
  }, []);

  const indicator: VDemIndicator | undefined = useMemo(
    () => registry?.indicators.find((i) => i.tag === tag),
    [registry, tag],
  );

  const isos = useMemo(
    () => (showPeers ? [focus.iso3, ...peers.map((p) => p.iso3)] : [focus.iso3]),
    [showPeers, focus.iso3, peers],
  );

  const rows: ChartRow[] = useMemo(() => {
    if (explorer.status !== "ready" || !tag) return [];
    const series: { iso3: string; points: ScalarPoint[] }[] = isos.map((iso3) => ({
      iso3,
      points: explorer.getSeries(tag, iso3),
    }));
    const yearSet = new Set<number>();
    const byIso = new Map<string, Map<number, number>>();
    for (const { iso3, points } of series) {
      const m = new Map<number, number>();
      for (const p of points) {
        m.set(p.year, p.value);
        yearSet.add(p.year);
      }
      byIso.set(iso3, m);
    }
    return [...yearSet]
      .sort((a, b) => a - b)
      .map((y) => {
        const row: ChartRow = { year: y };
        for (const iso3 of isos) {
          const v = byIso.get(iso3)?.get(y);
          row[iso3] = v === undefined ? null : v;
        }
        return row;
      });
  }, [explorer, tag, isos]);

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (rows.length === 0) return undefined;
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      for (const iso3 of isos) {
        const v = r[iso3];
        if (typeof v === "number") {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!isFinite(lo)) return undefined;
    // Always include 0 if values are nonneg-ish, otherwise auto. V-Dem D
    // indices live on [0,1]; many C-type variables also fit. For others,
    // pad 5% on each side.
    if (lo >= 0 && hi <= 1) return [0, 1];
    const pad = (hi - lo) * 0.05 || 0.1;
    return [lo - pad, hi + pad];
  }, [rows, isos]);

  const zoom = useChartZoom(DEFAULT_DOMAIN);
  const breakYears = growthRecord?.breaks?.years;

  const groupedIndicators = useMemo(() => {
    if (!registry) return [] as { category: string; items: VDemIndicator[] }[];
    return registry.categories.map((category) => ({
      category,
      items: registry.indicators
        .filter((i) => i.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [registry]);

  const subtitle = (
    <>
      Pick from the full V-Dem codebook (vartype C + D,{" "}
      {registry ? `${registry.indicators.length} indicators` : "loading…"}).
    </>
  );

  const body = (
    <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 rounded border border-gl-border bg-white px-3 py-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="font-medium">Indicator:</span>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                disabled={!registry}
                className="min-w-[280px] rounded border border-gl-border bg-white px-2 py-1 text-xs"
              >
                <option value="">
                  {registry ? "Select an indicator…" : "Loading catalog…"}
                </option>
                {groupedIndicators.map(({ category, items }) => (
                  <optgroup key={category} label={category}>
                    {items.map((i) => (
                      <option key={i.tag} value={i.tag}>
                        {i.name} ({i.tag})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showPeers}
                onChange={(e) => setShowPeers(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span>Overlay peers ({peers.length})</span>
            </label>
            {explorer.status === "loading" && (
              <span className="text-xs text-gl-muted">Loading panel…</span>
            )}
            {explorer.status === "error" && (
              <span className="text-xs text-red-600">
                Failed to load: {explorer.error.message}
              </span>
            )}
          </div>

          {/* Legend */}
          {tag && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-5"
                  style={{ background: GL.blue }}
                />
                <span className="font-medium">{focus.name}</span>
              </span>
              {showPeers &&
                peers.map((p, i) => (
                  <span key={p.iso3} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-0.5 w-5 opacity-60"
                      style={{
                        background: GL_PEER_PALETTE[i % GL_PEER_PALETTE.length],
                      }}
                    />
                    <span className="text-gl-muted">{p.name}</span>
                  </span>
                ))}
            </div>
          )}

          {/* Chart + description */}
          {tag && indicator && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded border border-gl-border bg-white p-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-base font-semibold">{indicator.name}</h3>
                  <span className="font-mono text-[11px] text-gl-muted">
                    {indicator.tag}
                  </span>
                </div>
                <p className="mb-2 text-[11px] text-gl-muted">
                  {indicator.category} · vartype {indicator.vartype}
                </p>
                <div className="relative h-72 w-full">
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
                        domain={yDomain ?? [0, 1]}
                        tick={{ fontSize: 10, fill: GL.muted }}
                        tickLine={false}
                        width={36}
                        tickFormatter={(v) =>
                          typeof v === "number" ? v.toFixed(2) : String(v)
                        }
                      />
                      <Tooltip
                        formatter={(v, name) => [
                          v === null ? "—" : (v as number).toFixed(3),
                          name as string,
                        ]}
                        labelFormatter={(y) => `Year ${y}`}
                        contentStyle={{ fontSize: 11 }}
                      />
                      {breakYears?.map((y) => (
                        <ReferenceLine
                          key={`brk-${y}`}
                          x={y}
                          stroke={GL.muted}
                          strokeDasharray="3 3"
                          strokeWidth={1}
                        />
                      ))}
                      {showPeers &&
                        peers.map((p, i) => (
                          <Line
                            key={p.iso3}
                            name={p.name}
                            type="monotone"
                            dataKey={p.iso3}
                            stroke={
                              GL_PEER_PALETTE[i % GL_PEER_PALETTE.length]
                            }
                            strokeOpacity={0.6}
                            strokeWidth={1.2}
                            dot={false}
                            activeDot={{ r: 3 }}
                            isAnimationActive={false}
                            connectNulls={false}
                          />
                        ))}
                      <Line
                        name={focus.name}
                        type="monotone"
                        dataKey={focus.iso3}
                        stroke={GL.blue}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
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
                </div>
                {rows.length === 0 && explorer.status === "ready" && (
                  <p className="mt-2 px-1 text-[11px] text-gl-muted">
                    No data for {focus.name}
                    {showPeers ? " or overlaid peers" : ""}.
                  </p>
                )}
              </div>

              <div className="rounded border border-gl-border bg-white p-3 text-sm leading-snug">
                {indicator.question && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gl-muted">
                    Question
                    <span className="mt-1 block text-sm normal-case tracking-normal text-gl-text">
                      <em>{indicator.question}</em>
                    </span>
                  </p>
                )}
                {indicator.description && (
                  <p className="mb-3 text-sm">{indicator.description}</p>
                )}
                {indicator.responses && (
                  <details className="mb-3 text-xs text-gl-muted">
                    <summary className="cursor-pointer font-medium uppercase tracking-wide">
                      Response options
                    </summary>
                    <p className="mt-1">{indicator.responses}</p>
                  </details>
                )}
                {indicator.scale && (
                  <p className="text-[11px] text-gl-muted">
                    <span className="font-medium uppercase tracking-wide">
                      Scale:
                    </span>{" "}
                    {indicator.scale}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
  );

  if (defaultCollapsed) {
    return (
      <details className="group mt-12">
        <summary className="cursor-pointer list-none">
          <div className="flex items-baseline gap-2">
            <h2 className="text-xl font-semibold">Explore any V-Dem indicator</h2>
            <span className="text-xs text-gl-muted transition-transform group-open:rotate-90">
              ▸
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gl-muted">{subtitle}</p>
        </summary>
        <div className="mt-6">{body}</div>
      </details>
    );
  }

  return (
    <section className="mt-12 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Explore any V-Dem indicator</h2>
        <p className="mt-0.5 text-xs text-gl-muted">{subtitle}</p>
      </div>
      {body}
    </section>
  );
}
