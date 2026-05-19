import type { FingerprintIndex } from "./useFingerprints";
import type { PeerEntry } from "../types";

// Compute the Euclidean-distance peer ranking for one focus country in one
// cross-section year. Mirrors the R-side calculation in
// scripts/export_fingerprints.R: distance is the L2 norm of the difference
// of z-scored indicator vectors, ignoring any tag missing on either side
// (V-Dem cells are dense within a year, so this rarely drops anything).
export function derivePeers(
  index: FingerprintIndex,
  year: number,
  focusIso: string,
  k: number,
): PeerEntry[] {
  const yearMap = index.byYear(year);
  const focusRow = yearMap?.get(focusIso);
  if (!yearMap || !focusRow) return [];

  const out: PeerEntry[] = [];
  for (const [iso3, row] of yearMap) {
    if (iso3 === focusIso) continue;
    let sum = 0;
    let n = 0;
    for (const [tag, zf] of focusRow) {
      const zp = row.get(tag);
      if (zp === undefined) continue;
      const d = zf - zp;
      sum += d * d;
      n++;
    }
    if (n === 0) continue;
    out.push({ iso3, distance: Math.sqrt(sum) });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, k);
}
