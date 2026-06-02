import { useEffect, useMemo, useState } from "react";
import type {
  Country,
  GrowthRecord,
  IndicatorSeriesRecord,
  PillarSpec,
  PillarsRecord,
} from "../types";
import { GL, GL_PEER_PALETTE } from "../lib/glTokens";
import { HSComponentChart } from "./charts/HSComponentChart";
import { PILLAR_STYLE } from "./charts/PillarsOverviewChart";

// Synthetic tag for the pillar's percentile score, surfaced as the first option
// in the indicator picker so it renders through HSComponentChart like any other
// series (the percentile lives under record.pillars, the raw series under
// record.series — we merge them into one IndicatorSeriesRecord).
const PCT_TAG = "__pct";

type Props = {
  spec: PillarSpec;
  records: Record<string, PillarsRecord>;
  focus: Country;
  peers: { iso3: string; name: string }[];
  growthRecord: GrowthRecord | null;
  showPeers: boolean;
};

// Merge pillars[key] (percentile) + series (raw) into one flat indicator record
// that HSComponentChart understands.
function asIndicatorRecord(
  rec: PillarsRecord | undefined,
  pillarKey: PillarSpec["key"],
): IndicatorSeriesRecord | undefined {
  if (!rec) return undefined;
  const pct = rec.pillars[pillarKey];
  return {
    iso3: rec.iso3,
    series: pct ? { [PCT_TAG]: pct, ...rec.series } : rec.series,
  };
}

export function PillarDrilldown({
  spec,
  records,
  focus,
  peers,
  growthRecord,
  showPeers,
}: Props) {
  const [tag, setTag] = useState(PCT_TAG);
  useEffect(() => {
    setTag(PCT_TAG);
  }, [spec.key]);

  const focusRecord = asIndicatorRecord(records[focus.iso3], spec.key);
  const peerSeries = showPeers
    ? peers.map((p) => ({
        iso3: p.iso3,
        name: p.name,
        record: asIndicatorRecord(records[p.iso3], spec.key),
      }))
    : [];

  const selected = spec.indicators.find((i) => i.tag === tag);
  const breakYears = growthRecord?.breaks?.years;
  const accent = PILLAR_STYLE[spec.key].color;

  const detail = useMemo(() => {
    if (tag === PCT_TAG) {
      return {
        label: "Pillar score — within-year percentile (0–100)",
        description: `${spec.signal}. Scored as this country's rank among all countries with data that year, 0 (lowest) to 100 (highest). 50 = the world median.`,
        source: "Derived",
        unit: "percentile",
      };
    }
    return selected
      ? {
          label: selected.label,
          description: selected.description,
          source: selected.source,
          unit: selected.unit,
        }
      : null;
  }, [tag, selected, spec.signal]);

  return (
    <details className="group rounded border border-gl-border bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: accent }}
        />
        <span className="text-sm font-semibold">{spec.label}</span>
        <span className="ml-auto text-xs text-gl-muted transition-transform group-open:rotate-90">
          ▸
        </span>
      </summary>

      <div className="space-y-3 border-t border-gl-border px-3 py-3">
        <p className="text-xs text-gl-muted">{spec.description}</p>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-gl-muted">View</span>
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="rounded border border-gl-border bg-white px-2 py-1 text-xs"
            >
              <option value={PCT_TAG}>Pillar score (percentile)</option>
              <optgroup label="Underlying indicators (native units)">
                {spec.indicators.map((i) => (
                  <option key={i.tag} value={i.tag}>
                    {i.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {detail && (
            <span className="text-[10px] text-gl-muted">
              {detail.source} · {detail.unit}
              {selected?.direction === "negative" && (
                <span className="ml-1 text-gl-highlight">↓ inverse signal</span>
              )}
            </span>
          )}
        </div>

        {detail && (
          <p className="px-1 text-[11px] leading-snug text-gl-muted">
            <em>{detail.label}.</em> {detail.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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

        <HSComponentChart
          tag={tag}
          focus={{ iso3: focus.iso3, name: focus.name, record: focusRecord }}
          peers={peerSeries}
          breakYears={breakYears}
        />
      </div>
    </details>
  );
}
