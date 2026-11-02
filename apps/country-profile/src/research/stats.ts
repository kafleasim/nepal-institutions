// Small numerical helpers used by the research views. Everything here runs
// in the browser on a few hundred to a few thousand numbers, so plain loops
// are fine and nothing is imported.

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const sd = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

/** Mulberry32: a seedable generator so permutation tests are reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type OlsFit = {
  coef: number[]; // intercept first
  se: number[];
  r2: number;
  n: number;
  names: string[];
};

/**
 * Ordinary least squares with an intercept added in front of `X`. Solves the
 * normal equations by Gaussian elimination with partial pivoting; the
 * standard errors are the classical ones (homoskedastic), which is enough
 * for reading which cluster means differ once income is held fixed.
 */
export function ols(y: number[], X: number[][], names: string[]): OlsFit {
  const n = y.length;
  const p = (X[0]?.length ?? 0) + 1;
  const rows = X.map((r) => [1, ...r]);
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += rows[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += rows[i][a] * rows[i][b];
    }
  }
  const inv = invert(XtX);
  const coef = inv.map((r) => r.reduce((s, v, j) => s + v * Xty[j], 0));
  let rss = 0;
  let tss = 0;
  const ybar = mean(y);
  for (let i = 0; i < n; i++) {
    const yhat = rows[i].reduce((s, v, j) => s + v * coef[j], 0);
    rss += (y[i] - yhat) ** 2;
    tss += (y[i] - ybar) ** 2;
  }
  const sigma2 = rss / Math.max(n - p, 1);
  const se = inv.map((r, j) => Math.sqrt(Math.max(r[j] * sigma2, 0)));
  return { coef, se, r2: tss > 0 ? 1 - rss / tss : NaN, n, names: ["intercept", ...names] };
}

function invert(A: number[][]): number[][] {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}

export type PairValue = { a: string; b: string; v: number };

/**
 * Within-minus-between test. The statistic is the mean of `v` over pairs
 * whose two countries share a label minus the mean over pairs that do not.
 * The null shuffles the labels across countries (not across pairs, which
 * would break the dependence between pairs sharing a country) and recomputes
 * the statistic; the p-value is the share of shuffles at least as large.
 * With `strata`, labels are shuffled only among countries in the same stratum
 * (a region, say), so the null keeps each stratum's mix of clusters.
 */
export function withinBetweenTest(
  pairs: PairValue[],
  label: Map<string, number>,
  nPerm = 500,
  seed = 7,
  strata?: Map<string, string>,
): { observed: number; within: number; between: number; nWithin: number; nBetween: number; nullDist: number[]; p: number } {
  const isos = [...label.keys()];
  const stat = (lab: Map<string, number>) => {
    let sw = 0, nw = 0, sb = 0, nb = 0;
    for (const p of pairs) {
      const la = lab.get(p.a);
      const lb = lab.get(p.b);
      if (la === undefined || lb === undefined) continue;
      if (la === lb) { sw += p.v; nw++; } else { sb += p.v; nb++; }
    }
    return { within: nw ? sw / nw : NaN, between: nb ? sb / nb : NaN, nw, nb };
  };
  const obs = stat(label);
  const observed = obs.within - obs.between;
  const rng = seeded(seed);
  const labels = isos.map((i) => label.get(i)!);
  // Index positions grouped by stratum; one group when unstratified.
  const groups: number[][] = [];
  if (strata) {
    const byS = new Map<string, number[]>();
    isos.forEach((iso, i) => {
      const key = strata.get(iso) ?? "?";
      if (!byS.has(key)) byS.set(key, []);
      byS.get(key)!.push(i);
    });
    groups.push(...byS.values());
  } else {
    groups.push(isos.map((_, i) => i));
  }
  const nullDist: number[] = [];
  let count = 0;
  for (let s = 0; s < nPerm; s++) {
    // Fisher-Yates within each group of positions.
    const sh = [...labels];
    for (const g of groups) {
      for (let a = g.length - 1; a > 0; a--) {
        const b = Math.floor(rng() * (a + 1));
        [sh[g[a]], sh[g[b]]] = [sh[g[b]], sh[g[a]]];
      }
    }
    const m = new Map<string, number>();
    isos.forEach((iso, i) => m.set(iso, sh[i]));
    const r = stat(m);
    const d = r.within - r.between;
    nullDist.push(d);
    if (d >= observed) count++;
  }
  return { observed, within: obs.within, between: obs.between, nWithin: obs.nw, nBetween: obs.nb, nullDist, p: (count + 1) / (nPerm + 1) };
}

export const fmt = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : v.toFixed(d);
export const fmtPct = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : `${(100 * v).toFixed(d)}%`;
