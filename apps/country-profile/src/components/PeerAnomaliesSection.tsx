import { useEffect, useMemo, useState } from "react";
import type { Country, VDemIndicator, VDemIndicatorRegistry } from "../types";
import { CountryPicker } from "./CountryPicker";
import { useFingerprints } from "../lib/useFingerprints";
import { GL } from "../lib/glTokens";

type Props = {
  focus: Country;
  countries: Country[];
  // Selected comparator (lifted to the page so a click in PeerSection can
  // drive it). Null while waiting for the initial peer list.
  selectedIso: string | null;
  onSelect: (iso3: string) => void;
  // Cross-section year for z-score lookup. Null until fingerprints load.
  year: number | null;
};

const TOP_N = 10;

// Top N indicators by z_focus * z_peer — features where both countries are
// anomalous in the same direction. These are what makes them peers vs. a
// random pair.
export function PeerAnomaliesSection({
  focus,
  countries,
  selectedIso,
  onSelect,
  year,
}: Props) {
  const fps = useFingerprints();
  const [registry, setRegistry] = useState<VDemIndicatorRegistry | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    fetch("/vdem_indicators.json")
      .then((r) => r.json() as Promise<VDemIndicatorRegistry>)
      .then(setRegistry);
  }, []);

  const labelByTag = useMemo(() => {
    const m = new Map<string, VDemIndicator>();
    registry?.indicators.forEach((i) => m.set(i.tag, i));
    return m;
  }, [registry]);

  const compareCountry = useMemo(
    () => countries.find((c) => c.iso3 === selectedIso) ?? null,
    [countries, selectedIso],
  );

  const items = useMemo(() => {
    if (fps.status !== "ready" || !selectedIso || year === null) return null;
    const f = fps.index.get(year, focus.iso3);
    const p = fps.index.get(year, selectedIso);
    if (!f || !p) return null;
    const rows: AnomalyRow[] = [];
    for (const [tag, zf] of f) {
      const zp = p.get(tag);
      if (zp === undefined) continue;
      rows.push({ tag, zf, zp, score: zf * zp });
    }
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, TOP_N);
  }, [fps, focus.iso3, selectedIso, year]);

  // Keep the highlighted indicator stable across comparison-country changes
  // if it stays in the top list; otherwise fall back to the new top row.
  useEffect(() => {
    if (!items || items.length === 0) {
      setSelectedTag(null);
      return;
    }
    setSelectedTag((prev) =>
      prev && items.some((r) => r.tag === prev) ? prev : items[0].tag,
    );
  }, [items]);

  const selectedIndicator = selectedTag
    ? labelByTag.get(selectedTag)
    : undefined;

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Why this peer?</h2>
          <p className="mt-0.5 text-xs text-gl-muted">
            V-Dem indicators where {focus.name} and the selected country are
            both anomalous in the same direction (large |z| on each side, same
            sign). These features pull the pair together in the z-score
            Euclidean distance that defines institutional peers. 0 ={" "}
            {year ?? "—"} world average; ±1 = one SD from it. Click a row for
            the codebook entry.
          </p>
        </div>
        <div className="w-64">
          <CountryPicker
            countries={countries}
            value={selectedIso}
            exclude={[focus.iso3]}
            placeholder="Pick country to compare…"
            onChange={onSelect}
          />
        </div>
      </div>

      {!compareCountry ? (
        <p className="text-sm text-gl-muted">Pick a country to compare.</p>
      ) : fps.status === "loading" || !registry ? (
        <p className="text-sm text-gl-muted">Loading fingerprints…</p>
      ) : fps.status === "error" ? (
        <p className="text-sm text-gl-highlight">
          Failed to load fingerprints: {fps.error.message}
        </p>
      ) : !items ? (
        <p className="text-sm text-gl-muted">
          {focus.name} or {compareCountry.name} is not in the {year ?? "—"}{" "}
          fingerprint matrix.
        </p>
      ) : (
        <div className="space-y-3">
          <AnomalyChart
            items={items}
            focus={focus}
            compare={compareCountry}
            labelByTag={labelByTag}
            selectedTag={selectedTag}
            onSelect={setSelectedTag}
            year={year}
          />
          <IndicatorPanel indicator={selectedIndicator} />
        </div>
      )}
    </section>
  );
}

type AnomalyRow = { tag: string; zf: number; zp: number; score: number };

type ChartProps = {
  items: AnomalyRow[];
  focus: Country;
  compare: Country;
  labelByTag: Map<string, VDemIndicator>;
  selectedTag: string | null;
  onSelect: (tag: string) => void;
  year: number | null;
};

const LABEL_W = 240;
const ROW_H = 30;
const MARGIN = { top: 28, right: 24, bottom: 8, left: 14 };

function AnomalyChart({
  items,
  focus,
  compare,
  labelByTag,
  selectedTag,
  onSelect,
  year,
}: ChartProps) {
  // Symmetric z-axis bounded by the extreme of any row (round up to nearest
  // 0.5), with a floor of ±2.0 so the world-average line never gets crowded
  // out when everything sits close to ±1.
  const maxAbs = Math.max(
    2,
    ...items.flatMap((r) => [Math.abs(r.zf), Math.abs(r.zp)]),
  );
  const xMax = Math.ceil(maxAbs * 2) / 2;
  const ticks = [-xMax, -xMax / 2, 0, xMax / 2, xMax];

  const onRowKey = (e: React.KeyboardEvent<SVGGElement>, idx: number) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? Math.min(items.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      onSelect(items[next].tag);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(items[idx].tag);
    }
  };

  return (
    <div className="rounded border border-gl-border bg-white px-3 py-3">
      {/* Legend */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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
            style={{ background: GL.highlight }}
          />
          <span className="font-medium">{compare.name}</span>
        </span>
        <span className="text-gl-muted">
          Z-score on V-Dem indicator (vs. {year ?? "—"} world average).
        </span>
      </div>

      <svg
        viewBox={`0 0 800 ${MARGIN.top + items.length * ROW_H + MARGIN.bottom}`}
        className="w-full"
        role="img"
        aria-label={`Top ${items.length} shared anomalies between ${focus.name} and ${compare.name}`}
      >
        {(() => {
          const innerLeft = MARGIN.left + LABEL_W;
          const innerRight = 800 - MARGIN.right;
          const innerWidth = innerRight - innerLeft;
          const xOf = (z: number) =>
            innerLeft + ((z + xMax) / (2 * xMax)) * innerWidth;

          return (
            <>
              {/* Axis ticks at the top */}
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={xOf(t)}
                    x2={xOf(t)}
                    y1={MARGIN.top - 6}
                    y2={MARGIN.top + items.length * ROW_H}
                    stroke={t === 0 ? GL.muted : GL.border}
                    strokeWidth={t === 0 ? 1 : 0.5}
                    strokeDasharray={t === 0 ? undefined : "2 3"}
                  />
                  <text
                    x={xOf(t)}
                    y={MARGIN.top - 10}
                    textAnchor="middle"
                    fontSize={10}
                    fill={GL.muted}
                  >
                    {t > 0 ? `+${t}` : t}
                  </text>
                </g>
              ))}
              <text
                x={xOf(0)}
                y={14}
                textAnchor="middle"
                fontSize={10}
                fill={GL.muted}
              >
                world avg
              </text>

              {/* Rows */}
              {items.map((row, i) => {
                const y = MARGIN.top + i * ROW_H;
                const yMid = y + ROW_H / 2;
                const meta = labelByTag.get(row.tag);
                const label = meta?.name ?? row.tag;
                const category = meta?.category;
                const x1 = xOf(Math.min(row.zf, row.zp));
                const x2 = xOf(Math.max(row.zf, row.zp));
                const isSelected = row.tag === selectedTag;
                return (
                  <g
                    key={row.tag}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${label}${
                      category ? `, ${category}` : ""
                    }. ${focus.name} z=${row.zf.toFixed(
                      2,
                    )}, ${compare.name} z=${row.zp.toFixed(2)}`}
                    onClick={() => onSelect(row.tag)}
                    onKeyDown={(e) => onRowKey(e, i)}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    {/* Hit target + selection background, painted under content */}
                    <rect
                      x={0}
                      y={y}
                      width={800}
                      height={ROW_H}
                      fill={isSelected ? GL.bg : "transparent"}
                    />
                    {isSelected && (
                      <rect
                        x={0}
                        y={y}
                        width={3}
                        height={ROW_H}
                        fill={GL.blue}
                      />
                    )}

                    {/* Label */}
                    <text
                      x={MARGIN.left}
                      y={yMid - 2}
                      fontSize={12}
                      fill={GL.text}
                      fontWeight={isSelected ? 600 : 400}
                    >
                      {truncate(label, 34)}
                      <title>
                        {label}
                        {category ? ` (${category})` : ""} — {row.tag}
                      </title>
                    </text>
                    {category && (
                      <text
                        x={MARGIN.left}
                        y={yMid + 11}
                        fontSize={9}
                        fill={GL.muted}
                      >
                        {truncate(category, 30)}
                      </text>
                    )}

                    {/* Dumbbell connector */}
                    <line
                      x1={x1}
                      x2={x2}
                      y1={yMid}
                      y2={yMid}
                      stroke={GL.border}
                      strokeWidth={2}
                    />
                    {/* Peer dot first so focus paints on top when they overlap */}
                    <circle
                      cx={xOf(row.zp)}
                      cy={yMid}
                      r={5}
                      fill={GL.highlight}
                    />
                    <circle cx={xOf(row.zf)} cy={yMid} r={5} fill={GL.blue} />
                  </g>
                );
              })}
            </>
          );
        })()}
      </svg>
    </div>
  );
}

type PanelProps = {
  indicator: VDemIndicator | undefined;
};

function IndicatorPanel({ indicator }: PanelProps) {
  if (!indicator) {
    return (
      <div className="rounded border border-gl-border bg-white p-3 text-sm text-gl-muted">
        Click a row to see the V-Dem codebook entry.
      </div>
    );
  }
  return (
    <div className="rounded border border-gl-border bg-white p-3 text-sm leading-snug">
      <h3 className="text-base font-semibold">{indicator.name}</h3>
      <p className="mb-3 text-[11px] text-gl-muted">
        {indicator.category} · vartype {indicator.vartype} ·{" "}
        <span className="font-mono">{indicator.tag}</span>
      </p>

      {indicator.question && (
        <p className="mb-2 text-sm italic">{indicator.question}</p>
      )}
      {indicator.responses && (
        <details className="text-xs text-gl-muted">
          <summary className="cursor-pointer font-medium uppercase tracking-wide">
            Response options
          </summary>
          <p className="mt-1">{indicator.responses}</p>
        </details>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
