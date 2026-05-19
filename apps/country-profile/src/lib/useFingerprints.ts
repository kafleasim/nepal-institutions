import { useEffect, useState } from "react";
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

// fingerprints_by_year.parquet is long-format: year, iso3, tag, z — one row
// per (year, country, indicator) z-score. We fetch the whole file once and
// build a nested index Map<year, Map<iso3, Map<tag, z>>> for O(1) lookup.
//
// This drives two consumers:
//   - PeerSection / usePeers: derives Euclidean-distance peer rankings per
//     (year, focus country) in-browser.
//   - PeerAnomaliesSection: pairwise z-score chart for the chosen year.

type FingerprintRow = { year: number; iso3: string; tag: string; z: number };

export type FingerprintIndex = {
  years: number[];                                  // sorted asc
  get: (year: number, iso3: string) => Map<string, number> | undefined;
  byYear: (year: number) => Map<string, Map<string, number>> | undefined;
};

let cache: FingerprintIndex | null = null;
let inflight: Promise<FingerprintIndex> | null = null;

async function loadIndex(): Promise<FingerprintIndex> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const file = await asyncBufferFromUrl({
      url: "/fingerprints_by_year.parquet",
    });
    const rows = (await parquetReadObjects({ file })) as FingerprintRow[];
    const byYear = new Map<number, Map<string, Map<string, number>>>();
    for (const r of rows) {
      let y = byYear.get(r.year);
      if (!y) {
        y = new Map();
        byYear.set(r.year, y);
      }
      let row = y.get(r.iso3);
      if (!row) {
        row = new Map();
        y.set(r.iso3, row);
      }
      row.set(r.tag, r.z);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    cache = {
      years,
      get: (year, iso3) => byYear.get(year)?.get(iso3),
      byYear: (year) => byYear.get(year),
    };
    return cache;
  })();
  return inflight;
}

export type FingerprintsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; index: FingerprintIndex }
  | { status: "error"; error: Error };

export function useFingerprints(enabled = true): FingerprintsState {
  const [state, setState] = useState<FingerprintsState>(
    cache ? { status: "ready", index: cache } : { status: "idle" },
  );

  useEffect(() => {
    if (!enabled) return;
    if (cache) {
      setState({ status: "ready", index: cache });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    loadIndex()
      .then((idx) => {
        if (alive) setState({ status: "ready", index: idx });
      })
      .catch((err: Error) => {
        if (alive) setState({ status: "error", error: err });
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return state;
}
