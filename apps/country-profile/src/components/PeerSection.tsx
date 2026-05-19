import { useMemo, useState } from "react";
import type { Country, PeerEntry } from "../types";
import { CountryPicker } from "./CountryPicker";

type Props = {
  focus: Country;
  countries: Country[];
  // Top-K peer ranking for the currently selected year, computed upstream
  // from the fingerprints matrix.
  focusPeers: PeerEntry[];
  // Currently visible peer set (ISO3s in display order). Lifted to parent so
  // other sections can read it.
  peerIsos: string[];
  onChange: (peerIsos: string[]) => void;
  // Active comparator highlighted in the row list; clicking a row updates it
  // and drives the "Why this peer?" chart.
  selectedIso: string | null;
  onSelect: (iso3: string) => void;
  // Year selector.
  years: number[];
  year: number | null;
  onYearChange: (year: number) => void;
  // Loading state for the upstream fingerprints fetch.
  fpsStatus: "idle" | "loading" | "ready" | "error";
  fpsError: Error | null;
};

const DEFAULT_N = 5;

export function PeerSection({
  focus,
  countries,
  focusPeers,
  peerIsos,
  onChange,
  selectedIso,
  onSelect,
  years,
  year,
  onYearChange,
  fpsStatus,
  fpsError,
}: Props) {
  const [adding, setAdding] = useState(false);

  const distanceByIso = useMemo(() => {
    const m = new Map<string, number>();
    focusPeers.forEach((p) => m.set(p.iso3, p.distance));
    return m;
  }, [focusPeers]);

  const countryByIso = useMemo(() => {
    const m = new Map<string, Country>();
    countries.forEach((c) => m.set(c.iso3, c));
    return m;
  }, [countries]);

  const remove = (iso3: string) => onChange(peerIsos.filter((i) => i !== iso3));
  const add = (iso3: string) => {
    if (peerIsos.includes(iso3) || iso3 === focus.iso3) return;
    onChange([...peerIsos, iso3]);
    setAdding(false);
  };

  const showMore = () => {
    const next = focusPeers.find(
      (p) => !peerIsos.includes(p.iso3) && p.iso3 !== focus.iso3,
    );
    if (next) onChange([...peerIsos, next.iso3]);
  };

  const reset = () =>
    onChange(focusPeers.slice(0, DEFAULT_N).map((p) => p.iso3));

  const focusInYear = focusPeers.length > 0;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Institutional peers</h2>
          <p className="mt-0.5 text-xs text-gl-muted">
            Closest countries by Euclidean distance on z-scored V-Dem indicators
            {year !== null && (
              <>
                {" "}
                (<span className="font-mono">{year}</span> cross-section)
              </>
            )}
            .
          </p>
        </div>
        <button
          onClick={reset}
          className="text-xs text-gl-muted hover:text-gl-text"
        >
          Reset
        </button>
      </div>

      {years.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gl-muted">
            Year
          </span>
          <div
            role="radiogroup"
            aria-label="Peer-distance reference year"
            className="inline-flex overflow-hidden rounded border border-gl-border bg-white"
          >
            {years.map((y) => {
              const active = y === year;
              return (
                <button
                  key={y}
                  role="radio"
                  aria-checked={active}
                  onClick={() => onYearChange(y)}
                  className={
                    "cursor-pointer px-2.5 py-1 font-mono text-xs transition-colors " +
                    (active
                      ? "bg-gl-blue text-white"
                      : "text-gl-text hover:bg-gl-bg")
                  }
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fpsStatus === "loading" || fpsStatus === "idle" ? (
        <p className="text-sm text-gl-muted">Loading fingerprints…</p>
      ) : fpsStatus === "error" ? (
        <p className="text-sm text-gl-highlight">
          Failed to load fingerprints
          {fpsError ? `: ${fpsError.message}` : ""}.
        </p>
      ) : !focusInYear ? (
        <p className="rounded border border-gl-border bg-white px-3 py-3 text-sm text-gl-muted">
          {focus.name} has no V-Dem fingerprint in{" "}
          <span className="font-mono">{year}</span>. Pick a different year.
        </p>
      ) : (
        <ul className="divide-y divide-gl-border rounded border border-gl-border bg-white">
          {peerIsos.map((iso, idx) => {
            const c = countryByIso.get(iso);
            if (!c) return null;
            const d = distanceByIso.get(iso);
            const isSelected = iso === selectedIso;
            return (
              <li
                key={iso}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => onSelect(iso)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(iso);
                  }
                }}
                className={
                  "flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors " +
                  (isSelected ? "bg-gl-bg" : "hover:bg-gl-bg/60")
                }
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={
                      "h-4 w-0.5 " +
                      (isSelected ? "bg-gl-blue" : "bg-transparent")
                    }
                  />
                  <span className="w-5 text-right font-mono text-xs text-gl-muted">
                    {idx + 1}
                  </span>
                  <span
                    className={isSelected ? "font-semibold" : "font-medium"}
                  >
                    {c.name}
                  </span>
                  <span className="font-mono text-xs text-gl-muted">
                    {c.iso3}
                  </span>
                  <span className="text-xs text-gl-muted">{c.region}</span>
                </div>
                <div className="flex items-center gap-3">
                  {d !== undefined && (
                    <span className="font-mono text-xs text-gl-muted">
                      d = {d.toFixed(2)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(iso);
                    }}
                    className="cursor-pointer text-xs text-gl-muted hover:text-gl-highlight"
                    aria-label={`Remove ${c.name}`}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {focusInYear && (
        <div className="mt-3 flex items-center gap-3">
          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="rounded border border-gl-border bg-white px-2.5 py-1 text-xs hover:border-gl-blue"
            >
              + Add country
            </button>
          ) : (
            <div className="w-72">
              <CountryPicker
                countries={countries}
                value={null}
                exclude={[focus.iso3, ...peerIsos]}
                placeholder="Search to add…"
                onChange={add}
              />
            </div>
          )}
          {focusPeers.length > peerIsos.length && (
            <button
              onClick={showMore}
              className="text-xs text-gl-muted hover:text-gl-text"
            >
              + Show next closest
            </button>
          )}
        </div>
      )}
    </section>
  );
}
