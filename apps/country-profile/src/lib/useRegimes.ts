import { useEffect, useState } from "react";

// V-Dem regime survey per country, written by
// analyses/polsett-proxies/export_regimes.R to public/regimes/<ISO>.json.
// Repeated rows and strings are stored as 1 and restored here by carrying the
// previous value forward.

export type Regime = {
  id: number;
  name: string;
  start: string | null;
  end: string | null;
  endtype: number | null;
  y0: number;
  y1: number;
};

export type GovParty = {
  y: number;
  role: number; // 0 senior partner, 1 junior partner
  name: string;
  short: string | null;
  vote: number | null;
  seat: number | null;
  disa: number | null;
  ind: number | null;
  act: number | null;
  loc: number | null;
  groups: number[];
};

export type RegimeYear = {
  y: number;
  rid: number | null;
  int: number | null;
  sup: number | null;
  supl: number | null;
  suph: number | null;
  opp: number | null;
  oppl: number | null;
  opph: number | null;
  imp: number | null;
  impo: number | null;
  pow: number | null;
  pro: number | null;
  anti: number | null;
  sloc: number | null;
  oloc: number | null;
  hos: string | null;
  hosp: string | null;
  hog: string | null;
  path: number | null;
  sn: number | null; // experts answering the support-group question
  on: number | null;
  an: number | null;
  sg: number[] | null;
  og: number[] | null;
  oa: number[] | null;
};

export type RegimeCountry = {
  name: string;
  y0: number;
  regimes: Regime[];
  parties: GovParty[];
  rows: RegimeYear[];
};

export type RegimeDoc = { tag: string; name: string; question: string; clarification: string | null };
export type RegimeMeta = { built: string; years: [number, number]; docs: Record<string, RegimeDoc> };

type Raw = Record<string, unknown> & { name: string; y0: number; regimes: Regime[]; parties?: GovParty[] };

const NUM_KEYS = ["rid", "int", "sup", "supl", "suph", "opp", "oppl", "opph", "imp", "impo", "pow", "pro", "anti",
  "sloc", "oloc", "path", "sn", "on", "an"] as const;
const CARRY_KEYS = ["hos", "hosp", "hog", "sg", "og", "oa"] as const;

function decode(raw: Raw): RegimeCountry {
  const cols = raw as unknown as Record<string, unknown[]>;
  for (const k of CARRY_KEYS) {
    const a = cols[k];
    for (let i = 1; i < a.length; i++) if (a[i] === 1) a[i] = a[i - 1];
  }
  const n = cols.rid.length;
  const rows: RegimeYear[] = [];
  for (let i = 0; i < n; i++) {
    const r: Record<string, unknown> = { y: raw.y0 + i };
    for (const k of NUM_KEYS) r[k] = cols[k][i] ?? null;
    for (const k of CARRY_KEYS) r[k] = cols[k][i] ?? null;
    rows.push(r as RegimeYear);
  }
  // A one-element list can arrive as a bare number from older exports.
  const parties = (raw.parties ?? []).map((p) => ({
    ...p,
    groups: Array.isArray(p.groups) ? p.groups : typeof p.groups === "number" ? [p.groups] : [],
  }));
  return { name: raw.name, y0: raw.y0, regimes: raw.regimes, parties, rows };
}

const cache = new Map<string, RegimeCountry | null>();
let metaPromise: Promise<RegimeMeta | null> | null = null;

export function useRegimes(iso3: string) {
  const [data, setData] = useState<RegimeCountry | null | undefined>(() => cache.get(iso3));
  const [meta, setMeta] = useState<RegimeMeta | null>(null);

  useEffect(() => {
    metaPromise ??= fetch("/regimes/meta.json")
      .then((r) => (r.ok ? (r.json() as Promise<RegimeMeta>) : null))
      .catch(() => null);
    metaPromise.then(setMeta);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (cache.has(iso3)) {
      setData(cache.get(iso3));
      return;
    }
    setData(undefined);
    fetch(`/regimes/${iso3}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Raw>) : null))
      .catch(() => null)
      .then((raw) => {
        const rec = raw ? decode(raw) : null;
        cache.set(iso3, rec);
        if (!cancelled) setData(rec);
      });
    return () => {
      cancelled = true;
    };
  }, [iso3]);

  return { data, meta };
}
