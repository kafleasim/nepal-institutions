import { useEffect, useState } from "react";
import type { PillarsRecord } from "../types";

// Mirrors useStateCapacity / useHSComponents: tiny per-country files, hot path
// for focus + peer overlays, so we keep a module-level cache and de-duplicate
// in-flight fetches.
const cache = new Map<string, PillarsRecord | null>();
const inflight = new Map<string, Promise<PillarsRecord | null>>();

async function fetchOne(iso3: string): Promise<PillarsRecord | null> {
  if (cache.has(iso3)) return cache.get(iso3)!;
  const existing = inflight.get(iso3);
  if (existing) return existing;
  const p = fetch(`/pillars/${iso3}.json`)
    .then((r) => (r.ok ? (r.json() as Promise<PillarsRecord>) : null))
    .catch(() => null)
    .then((rec) => {
      cache.set(iso3, rec);
      inflight.delete(iso3);
      return rec;
    });
  inflight.set(iso3, p);
  return p;
}

export function usePillars(isos: string[]): Record<string, PillarsRecord> {
  const [records, setRecords] = useState<Record<string, PillarsRecord>>(() => {
    const init: Record<string, PillarsRecord> = {};
    for (const iso of isos) {
      const cached = cache.get(iso);
      if (cached) init[iso] = cached;
    }
    return init;
  });

  useEffect(() => {
    let cancelled = false;
    const missing = isos.filter((iso) => !cache.get(iso));
    const collect = () => {
      const next: Record<string, PillarsRecord> = {};
      for (const iso of isos) {
        const r = cache.get(iso);
        if (r) next[iso] = r;
      }
      setRecords(next);
    };
    if (missing.length === 0) {
      collect();
      return;
    }
    Promise.all(missing.map(fetchOne)).then(() => {
      if (!cancelled) collect();
    });
    return () => {
      cancelled = true;
    };
  }, [isos.join(",")]);

  return records;
}
