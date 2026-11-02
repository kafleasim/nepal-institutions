import { useEffect, useState } from "react";

// Data for /vdem. index.json is small and loaded once; each variable's file
// (every version of the series for every country-year) is fetched when the
// variable is opened and kept in memory. The variable files are gzipped on
// disk because the host serves them uncompressed; a dev server may decode
// them on the way, so the bytes are checked for the gzip magic number before
// they are inflated.

export type Kind = "ordinal" | "continuous" | "binary" | "ordinal_raw" | "nominal" | "multi";

export type VarMeta = {
  tag: string;
  name: string;
  category: string;
  vartype: string;
  kind: Kind;
  scale: string | null;
  question: string | null;
  versions: string[];
  options: { k: string; label: string }[] | null;
  values: number[] | null;
  rkey: string | null;
  y0: number;
  y1: number;
  n_countries: number;
  n_obs: number;
};

export type Country = { iso: string; name: string; y0: number; y1: number };

export type Index = {
  built: string;
  source: string;
  countries: Country[];
  categories: string[];
  variables: VarMeta[];
};

export type Response = { v: number; label: string };

export type VarFile = {
  tag: string;
  question?: string;
  clarification?: string;
  responses_raw?: string;
  responses?: Response[];
  notes?: string;
  crosscoder?: string;
  cy_aggregation?: string;
  convergence?: string;
  pm?: string;
  release?: string;
  runs: [number, number, number][];
  series: Record<string, (number | null)[]>;
};

/** One variable, unpacked: for each version, iso -> values by year (NaN = missing). */
export type VarData = {
  meta: VarMeta;
  file: VarFile;
  y0: number;
  y1: number;
  years: number[];
  isos: string[];
  get: (version: string, iso: string) => Float64Array | undefined;
};

let indexPromise: Promise<Index> | null = null;
export function useIndex() {
  const [state, setState] = useState<{ index?: Index; error?: Error }>({});
  useEffect(() => {
    indexPromise ??= fetch("/vdem-codebook/index.json").then((r) => {
      if (!r.ok) throw new Error(`index.json: HTTP ${r.status}`);
      return r.json();
    });
    let alive = true;
    indexPromise.then((index) => alive && setState({ index }), (error) => alive && setState({ error }));
    return () => { alive = false; };
  }, []);
  return state;
}

async function fetchJsonGz<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let text: string;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  return JSON.parse(text) as T;
}

const varCache = new Map<string, Promise<VarData>>();

function unpack(meta: VarMeta, file: VarFile, countries: Country[]): VarData {
  const y0 = meta.y0, y1 = meta.y1, n = y1 - y0 + 1;
  const byVersion = new Map<string, Map<string, Float64Array>>();
  const isoSet = new Set<string>();
  for (const [version, vals] of Object.entries(file.series)) {
    const m = new Map<string, Float64Array>();
    let p = 0;
    for (const [ci, ys, len] of file.runs) {
      const iso = countries[ci].iso;
      isoSet.add(iso);
      let arr = m.get(iso);
      if (!arr) { arr = new Float64Array(n).fill(NaN); m.set(iso, arr); }
      for (let j = 0; j < len; j++) {
        const v = vals[p + j];
        if (v != null) arr[ys - y0 + j] = v;
      }
      p += len;
    }
    byVersion.set(version, m);
  }
  const years = Array.from({ length: n }, (_, i) => y0 + i);
  const isos = countries.map((c) => c.iso).filter((i) => isoSet.has(i));
  return { meta, file, y0, y1, years, isos, get: (v, iso) => byVersion.get(v)?.get(iso) };
}

export function useVar(index: Index | undefined, tag: string | null) {
  const [state, setState] = useState<{ data?: VarData; error?: Error; loading: boolean }>({ loading: false });
  useEffect(() => {
    if (!index || !tag) return;
    const meta = index.variables.find((v) => v.tag === tag);
    if (!meta) { setState({ loading: false, error: new Error(`Unknown variable ${tag}`) }); return; }
    let p = varCache.get(tag);
    if (!p) {
      p = fetchJsonGz<VarFile>(`/vdem-codebook/vars/${tag}.json.gz`).then((f) => unpack(meta, f, index.countries));
      varCache.set(tag, p);
      p.catch(() => varCache.delete(tag));
    }
    let alive = true;
    setState((s) => ({ data: s.data?.meta.tag === tag ? s.data : undefined, loading: true }));
    p.then((data) => alive && setState({ data, loading: false }), (error) => alive && setState({ error, loading: false }));
    return () => { alive = false; };
  }, [index, tag]);
  return state;
}

// ---------------------------------------------------------------------------
// Versions and transforms

export type Transform = "raw" | "zpool" | "zyear" | "pctyear";

export const VERSION_LABEL: Record<string, string> = {
  point: "Model estimate",
  osp: "Original scale",
  ord: "Ordinal category",
  mean: "Coder mean",
  nr: "Number of coders",
};

export function versionLabel(meta: VarMeta, v: string): string {
  if (meta.kind === "multi") return meta.options?.find((o) => o.k === v)?.label ?? `Option ${v}`;
  if (v === "point" && meta.kind === "nominal") return "Category";
  if (v === "point" && meta.vartype !== "C" && !meta.versions.includes("osp")) return "As published";
  return VERSION_LABEL[v] ?? v;
}

/** Versions a reader would choose between (the intervals ride along). */
export function selectableVersions(meta: VarMeta): string[] {
  if (meta.kind === "multi") return meta.versions;
  return meta.versions.filter((v) => !v.includes("code"));
}

export function bandFor(version: string): [string, string] | null {
  if (version === "point") return ["codelow", "codehigh"];
  if (version === "osp") return ["osp_codelow", "osp_codehigh"];
  return null;
}

/** True when the selected version, before any transform, takes a small set of coded values. */
export function isDiscrete(meta: VarMeta, version: string): boolean {
  if (meta.kind === "multi") return false;
  if (version === "ord") return true;
  if (version === "point" && (meta.kind === "nominal" || meta.kind === "binary" || meta.kind === "ordinal_raw")) return true;
  return false;
}

/** Version is on the response scale, so the response labels can annotate the axis. */
export function onResponseScale(meta: VarMeta, version: string): boolean {
  if (meta.kind === "multi") return false;
  if (version === "osp" || version === "ord" || version === "mean") return true;
  return version === "point" && meta.kind !== "ordinal" && meta.kind !== "continuous";
}

export type Transformed = {
  /** iso -> values by year (index = year - y0) */
  values: Map<string, Float64Array>;
  lo?: Map<string, Float64Array>;
  hi?: Map<string, Float64Array>;
};

function stats(xs: number[]) {
  const n = xs.length;
  if (n === 0) return { mu: NaN, sd: NaN };
  const mu = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, n - 1));
  return { mu, sd };
}

export function transform(data: VarData, version: string, t: Transform): Transformed {
  const base = new Map<string, Float64Array>();
  for (const iso of data.isos) { const a = data.get(version, iso); if (a) base.set(iso, a); }
  const band = bandFor(version);
  const loB = new Map<string, Float64Array>(), hiB = new Map<string, Float64Array>();
  if (band && data.meta.versions.includes(band[0])) {
    for (const iso of base.keys()) {
      const l = data.get(band[0], iso), h = data.get(band[1], iso);
      if (l && h) { loB.set(iso, l); hiB.set(iso, h); }
    }
  }
  const hasBand = loB.size > 0;
  const n = data.years.length;

  if (t === "raw") return { values: base, lo: hasBand ? loB : undefined, hi: hasBand ? hiB : undefined };

  const affine = (src: Map<string, Float64Array>, mu: (i: number) => number, sd: (i: number) => number) => {
    const out = new Map<string, Float64Array>();
    for (const [iso, a] of src) {
      const b = new Float64Array(n);
      for (let i = 0; i < n; i++) b[i] = (a[i] - mu(i)) / sd(i);
      out.set(iso, b);
    }
    return out;
  };

  if (t === "zpool") {
    const all: number[] = [];
    for (const a of base.values()) for (const v of a) if (!Number.isNaN(v)) all.push(v);
    const { mu, sd } = stats(all);
    const s = sd > 0 ? sd : 1;
    return {
      values: affine(base, () => mu, () => s),
      lo: hasBand ? affine(loB, () => mu, () => s) : undefined,
      hi: hasBand ? affine(hiB, () => mu, () => s) : undefined,
    };
  }

  // within-year
  const mus = new Float64Array(n), sds = new Float64Array(n);
  const cols: number[][] = Array.from({ length: n }, () => []);
  for (const a of base.values()) for (let i = 0; i < n; i++) if (!Number.isNaN(a[i])) cols[i].push(a[i]);
  if (t === "zyear") {
    cols.forEach((c, i) => { const s = stats(c); mus[i] = s.mu; sds[i] = s.sd > 0 ? s.sd : NaN; });
    return {
      values: affine(base, (i) => mus[i], (i) => sds[i]),
      lo: hasBand ? affine(loB, (i) => mus[i], (i) => sds[i]) : undefined,
      hi: hasBand ? affine(hiB, (i) => mus[i], (i) => sds[i]) : undefined,
    };
  }
  // percentile within year: share of countries strictly below plus half the ties, x 100
  const sorted = cols.map((c) => c.slice().sort((a, b) => a - b));
  const out = new Map<string, Float64Array>();
  for (const [iso, a] of base) {
    const b = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      const v = a[i];
      if (Number.isNaN(v)) continue;
      const s = sorted[i];
      const below = lowerBound(s, v), upto = upperBound(s, v);
      b[i] = s.length > 1 ? (100 * (below + (upto - below - 1) / 2)) / (s.length - 1) : 50;
    }
    out.set(iso, b);
  }
  return { values: out };
}

function lowerBound(s: number[], v: number) { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo; }
function upperBound(s: number[], v: number) { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; } return lo; }

export const TRANSFORM_LABEL: Record<Transform, string> = {
  raw: "As coded",
  zpool: "z-score, all country-years",
  zyear: "z-score within year",
  pctyear: "Percentile within year",
};

// ---------------------------------------------------------------------------
// Response labels

/** A short form of a response label for axis ticks: the text up to the first full stop, if short. */
export function shortLabel(label: string, max = 34): string {
  const m = label.match(/^(.{2,60}?)[.:;(]/);
  const s = (m ? m[1] : label).trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function labelFor(file: VarFile | undefined, v: number): string | undefined {
  return file?.responses?.find((r) => r.v === v)?.label;
}

export function fmt(v: number | undefined | null, t: Transform = "raw"): string {
  if (v == null || Number.isNaN(v)) return "–";
  if (t === "pctyear") return `${Math.round(v)}`;
  const a = Math.abs(v);
  if (a >= 10000) return Math.round(v).toLocaleString();
  if (a >= 100) return v.toFixed(0);
  if (Number.isInteger(v)) return String(v);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export const KIND_LABEL: Record<Kind, string> = {
  ordinal: "Expert-coded, ordinal",
  continuous: "Continuous",
  binary: "Binary",
  ordinal_raw: "Discrete",
  nominal: "Nominal (unordered)",
  multi: "Multiple selection",
};

export const VARTYPE_LABEL: Record<string, string> = {
  A: "A — factual, coded by research assistants",
  "A,C": "A,C — factual, partly expert-coded",
  C: "C — expert-coded component",
  D: "D — derived index",
  E: "E — external source",
};

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
