import { useEffect, useMemo, useState } from "react";
import type {
  Country,
  GrowthRecord,
  HSComponentsMeta,
  HSDimensionKey,
} from "../types";
import { useHSComponents } from "../lib/useHSComponents";
import { GL, GL_PEER_PALETTE } from "../lib/glTokens";
import { HSComponentChart } from "./charts/HSComponentChart";

type Props = {
  dimension: HSDimensionKey;
  meta: HSComponentsMeta;
  focus: Country;
  peers: { iso3: string; name: string }[];
  growthRecord: GrowthRecord | null;
  defaultCollapsed?: boolean;
};

export function HSDimensionSection({
  dimension,
  meta,
  focus,
  peers,
  growthRecord,
  defaultCollapsed = false,
}: Props) {
  const dim = meta.dimensions[dimension];
  const [tag, setTag] = useState(dim.default);
  const [showPeers, setShowPeers] = useState(false);

  // When the dimension's default changes (e.g. meta reload) re-seed the
  // selection — but otherwise let user override persist across focus changes.
  useEffect(() => {
    setTag(dim.default);
  }, [dim.default]);

  const isos = useMemo(
    () => (showPeers ? [focus.iso3, ...peers.map((p) => p.iso3)] : [focus.iso3]),
    [focus.iso3, peers, showPeers],
  );
  const records = useHSComponents(isos);

  const focusRecord = records[focus.iso3];
  const peerSeries = showPeers
    ? peers.map((p) => ({ iso3: p.iso3, name: p.name, record: records[p.iso3] }))
    : [];

  const selected = dim.indicators.find((i) => i.tag === tag) ?? dim.indicators[0];
  const breakYears = growthRecord?.breaks?.years;

  const overlayToggle = (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={showPeers}
        onChange={(e) => setShowPeers(e.target.checked)}
        className="h-3.5 w-3.5"
      />
      <span>Overlay peers</span>
    </label>
  );

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded border border-gl-border bg-white px-3 py-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-gl-muted">Indicator</span>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="rounded border border-gl-border bg-white px-2 py-1 text-xs"
          >
            {dim.indicators.map((i) => (
              <option key={i.tag} value={i.tag}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-[10px] text-gl-muted">
          {selected.tag}
        </span>
        <span className="text-[10px] text-gl-muted">· {selected.source}</span>
      </div>

      <details className="group px-1 text-[11px] leading-snug text-gl-muted">
        <summary className="cursor-pointer list-none select-none hover:text-gl-text">
          <span className="inline-block w-2 group-open:hidden">▸</span>
          <span className="hidden w-2 group-open:inline-block">▾</span>{" "}
          <em>{selected.label}</em>
        </summary>
        <p className="mt-1 pl-3">{selected.description}</p>
      </details>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-gl-border bg-white px-3 py-2 text-xs">
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
        {!showPeers && (
          <span className="text-gl-muted">
            Toggle "Overlay peers" to compare across {peers.length} peers.
          </span>
        )}
      </div>

      <HSComponentChart
        tag={tag}
        focus={{ iso3: focus.iso3, name: focus.name, record: focusRecord }}
        peers={peerSeries}
        breakYears={breakYears}
      />
    </>
  );

  if (defaultCollapsed) {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold">{dim.label}</h3>
            <span className="text-xs text-gl-muted transition-transform group-open:rotate-90">
              ▸
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gl-muted">{dim.description}</p>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="flex justify-end">{overlayToggle}</div>
          {body}
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{dim.label}</h3>
          <p className="mt-0.5 text-xs text-gl-muted">{dim.description}</p>
        </div>
        {overlayToggle}
      </div>
      {body}
    </div>
  );
}
