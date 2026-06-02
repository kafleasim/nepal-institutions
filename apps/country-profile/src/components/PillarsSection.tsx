import { useEffect, useMemo, useState } from "react";
import type { Country, GrowthRecord, PillarsMeta } from "../types";
import { usePillars } from "../lib/usePillars";
import { PillarsOverviewChart, PILLAR_STYLE } from "./charts/PillarsOverviewChart";
import { PillarDrilldown } from "./PillarDrilldown";

type Props = {
  focus: Country;
  peers: { iso3: string; name: string }[];
  growthRecord: GrowthRecord | null;
};

const ORDER = ["composite", "fiscal", "legal", "collective", "peace"] as const;

export function PillarsSection({ focus, peers, growthRecord }: Props) {
  const [meta, setMeta] = useState<PillarsMeta | null>(null);
  const [showPeers, setShowPeers] = useState(false);

  useEffect(() => {
    fetch("/pillars_meta.json")
      .then((r) => r.json() as Promise<PillarsMeta>)
      .then(setMeta);
  }, []);

  const isos = useMemo(
    () => (showPeers ? [focus.iso3, ...peers.map((p) => p.iso3)] : [focus.iso3]),
    [focus.iso3, peers, showPeers],
  );
  const records = usePillars(isos);
  const focusRecord = records[focus.iso3];
  const breakYears = growthRecord?.breaks?.years;

  // Latest available value per pillar for the focus country (for the chips).
  const latest = useMemo(() => {
    const out: Record<string, { year: number; value: number } | null> = {};
    for (const key of ORDER) {
      const pts = focusRecord?.pillars?.[key];
      out[key] = pts && pts.length ? pts[pts.length - 1] : null;
    }
    return out;
  }, [focusRecord]);

  if (!meta) {
    return <p className="mt-2 text-sm text-gl-muted">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">
            The four pillars over time
          </h3>
          <p className="mt-0.5 text-xs text-gl-muted">
            Each pillar is {focus.name}'s within-year percentile (0–100) among
            all countries with data — its global standing that year. 50 = the
            world median (grey line). The bold dark line is the composite —
            the average of all four pillars, drawn only across 1980–2016 where
            all four are observed. Vertical dashes mark growth-break years.
            Individual pillars run wider: legal deepest (V-Dem), fiscal
            1980–2024, collective ~1960; peace uses Besley &amp; Persson's own
            civil-war/repression metric and ends 2016.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showPeers}
            onChange={(e) => setShowPeers(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span>Overlay peers (in drilldowns)</span>
        </label>
      </div>

      {/* Latest-value chips */}
      <div className="flex flex-wrap gap-2">
        {ORDER.map((key) => {
          const v = latest[key];
          const st = PILLAR_STYLE[key];
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded border border-gl-border bg-white px-2.5 py-1.5 text-xs"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: st.color }}
              />
              <span className="font-medium capitalize">{key}</span>
              <span className="font-mono text-gl-muted">
                {v ? `${v.value.toFixed(0)}` : "—"}
              </span>
              {v && (
                <span className="text-[10px] text-gl-muted">’{String(v.year).slice(2)}</span>
              )}
            </div>
          );
        })}
      </div>

      <PillarsOverviewChart
        record={focusRecord}
        focusName={focus.name}
        breakYears={breakYears}
      />

      <details className="group px-1 text-[11px] leading-snug text-gl-muted">
        <summary className="cursor-pointer list-none select-none hover:text-gl-text">
          <span className="inline-block w-2 group-open:hidden">▸</span>
          <span className="hidden w-2 group-open:inline-block">▾</span> How these
          pillars are built &amp; normalised
        </summary>
        <p className="mt-1 pl-3">{meta.framework}</p>
        <p className="mt-1 pl-3">{meta.normalization}</p>
        <p className="mt-1 pl-3 text-gl-muted">Sources: {meta.source}</p>
        <p className="mt-1 pl-3 text-gl-muted">{meta.citation}</p>
      </details>

      <div>
        <h4 className="text-sm font-semibold">Inside each pillar</h4>
        <p className="mt-0.5 mb-3 text-xs text-gl-muted">
          Expand a pillar to see its percentile score for {focus.name}
          {showPeers ? " and peers" : ""}, then switch to any underlying
          indicator in native units (tax %, V-Dem index, years, …).
        </p>
        <div className="space-y-2">
          {meta.pillars.map((p) => (
            <PillarDrilldown
              key={p.key}
              spec={p}
              records={records}
              focus={focus}
              peers={peers}
              growthRecord={growthRecord}
              showPeers={showPeers}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
