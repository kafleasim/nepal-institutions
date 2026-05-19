import { useEffect, useMemo, useState } from "react";
import type { Country, GrowthRecord, VDemMeta } from "../types";
import { useVdem } from "../lib/useVdem";
import { GL, GL_PEER_PALETTE } from "../lib/glTokens";
import { VDemChart } from "./charts/VDemChart";

type Props = {
  focus: Country;
  peers: { iso3: string; name: string }[];
  growthRecord: GrowthRecord | null;
  defaultCollapsed?: boolean;
};

export function VDemSection({ focus, peers, growthRecord, defaultCollapsed = false }: Props) {
  const [meta, setMeta] = useState<VDemMeta | null>(null);
  const [showPeers, setShowPeers] = useState(false);

  useEffect(() => {
    fetch("/vdem_meta.json")
      .then((r) => r.json() as Promise<VDemMeta>)
      .then(setMeta);
  }, []);

  // Fetch the focus country always; fetch peers only when overlay is on.
  const isos = useMemo(
    () => (showPeers ? [focus.iso3, ...peers.map((p) => p.iso3)] : [focus.iso3]),
    [focus.iso3, peers, showPeers],
  );
  const records = useVdem(isos);

  const focusRecord = records[focus.iso3];
  const peerSeries = showPeers
    ? peers.map((p) => ({
        iso3: p.iso3,
        name: p.name,
        record: records[p.iso3],
      }))
    : [];

  const breakYears = growthRecord?.breaks?.years;

  if (!meta) {
    return (
      <section className="mt-12">
        <h2 className="text-xl font-semibold">Varieties of Democracy</h2>
        <p className="mt-2 text-sm text-gl-muted">Loading…</p>
      </section>
    );
  }

  const indicesByGroup = meta.groups.map((g) => ({
    group: g,
    indices: meta.indices.filter((i) => i.group === g),
  }));

  const subtitle = (
    <>
      Aggregate (vartype = D) indices, all scaled to [0, 1]. Vertical dashes
      mark {focus.name}'s growth-break years.
    </>
  );
  const overlayToggle = (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
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
      {/* Legend */}
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

      {indicesByGroup.map(({ group, indices }) => (
        <div key={group}>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gl-muted">
            {group}
          </h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2">
            {indices.map((idx) => (
              <VDemChart
                key={idx.tag}
                tag={idx.tag}
                label={idx.label}
                question={idx.question}
                description={idx.description}
                focus={{
                  iso3: focus.iso3,
                  name: focus.name,
                  record: focusRecord,
                }}
                peers={peerSeries}
                breakYears={breakYears}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );

  if (defaultCollapsed) {
    return (
      <details className="group mt-12">
        <summary className="cursor-pointer list-none">
          <div className="flex items-baseline gap-2">
            <h2 className="text-xl font-semibold">Varieties of Democracy</h2>
            <span className="text-xs text-gl-muted transition-transform group-open:rotate-90">
              ▸
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gl-muted">{subtitle}</p>
        </summary>
        <div className="mt-6 space-y-8">
          <div className="flex justify-end">{overlayToggle}</div>
          {body}
        </div>
      </details>
    );
  }

  return (
    <section className="mt-12 space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Varieties of Democracy</h2>
          <p className="mt-0.5 text-xs text-gl-muted">{subtitle}</p>
        </div>
        {overlayToggle}
      </div>
      {body}
    </section>
  );
}
