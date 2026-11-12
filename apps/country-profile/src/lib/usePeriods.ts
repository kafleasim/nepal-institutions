import { useEffect, useState } from "react";
import { GL } from "./glTokens";

// Nepal fork: country-specific political periods and regime notes, edited by hand in
// public/nepal/periods.json (keyed by ISO3). Countries without an entry get null.

export type Period = {
  id: string;
  label: string;
  start: string; // YYYY-MM-DD
  end: string | null; // null = ongoing
  startLabel: string;
  endLabel: string;
  color: keyof typeof GL;
  summary: string;
  dynamics: string;
};
export type CountryPeriods = { credit: string; periods: Period[]; regimeNotes: Record<string, string> };

let promise: Promise<Record<string, CountryPeriods> | null> | null = null;

export function usePeriods(iso3: string): CountryPeriods | null {
  const [all, setAll] = useState<Record<string, CountryPeriods> | null>(null);
  useEffect(() => {
    promise ??= fetch("/nepal/periods.json")
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, CountryPeriods>>) : null))
      .catch(() => null);
    let alive = true;
    promise.then((d) => alive && setAll(d));
    return () => { alive = false; };
  }, []);
  return all?.[iso3] ?? null;
}

/** Fractional year for chart placement: 2015-09-20 -> ~2015.72. */
export function toYear(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, 0, 1), next = Date.UTC(y + 1, 0, 1);
  return y + (Date.UTC(y, (m ?? 1) - 1, d ?? 1) - start) / (next - start);
}

/** Start/end of a period in fractional years; an open period runs to the end of `to`. */
export function periodSpan(p: Period, to: number): [number, number] {
  return [toYear(p.start), p.end ? toYear(p.end) : to + 1];
}

/** Last calendar year any period reaches (open periods: current year). */
export function periodsLastYear(ps: Period[] | undefined | null): number {
  if (!ps?.length) return -Infinity;
  const now = new Date().getFullYear();
  return Math.max(...ps.map((p) => (p.end ? Math.floor(toYear(p.end)) : now)));
}

export const periodColor = (p: Period) => GL[p.color] ?? GL.greyDeep;
