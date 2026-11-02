// Data for the /research route. Everything is produced by the R pipeline in
// analyses/research/ and shipped under public/research/. The parquet files
// are read in-browser with hyparquet, as the rest of the app does.
import { useEffect, useState } from "react";
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

export type Method = "ward" | "kmeans" | "louvain";

export type Point = {
  country_name: string;
  iso3: string | null;
  year: number;
  region: string;
  x: number;
  y: number;
  pc1: number;
  pc2: number;
  pc3: number;
  louvain: number;
} & Record<string, number | string | null>;

export function clusterOf(p: Point, method: Method, k: number): number {
  if (method === "louvain") return p.louvain;
  return p[`${method}_k${k}`] as number;
}

export type Indicator = { tag: string; name: string; category: string };
export type Diagnostic = {
  k: number;
  silhouette: number;
  silhouette_kmeans: number;
  ch: number;
  ch_kmeans: number;
  stability: number;
  ari_ward_kmeans: number;
  within_ss: number;
  smallest: number;
};
export type Merge = { k_from: number; k_to: number; a: number; b: number; into: number; height: number };
export type ClusterMeta = {
  years: number[];
  n_country_years: number;
  n_countries: number;
  n_indicators: number;
  n_imputed_cells: number;
  k_max: number;
  knn_k: number;
  bootstrap_draws: number;
  bootstrap_share: number;
  louvain_k: number;
  louvain_modularity: number;
  pc_var_explained: number[];
  indicators: Indicator[];
  diagnostics: Diagnostic[];
  merges: Merge[];
  top_height: number;
  source: string;
};

export type ProfileRow = {
  k: number;
  cluster: number;
  tag: string;
  mean_z: number;
  mean_z_2025: number | null;
  d: number;
  auc: number;
};

export type CxCountry = {
  iso3: string;
  year: number;
  inst_year: number;
  country_name: string;
  eci: number | null;
  coi: number | null;
  diversity: number | null;
  export_value: number | null;
  gdppc_ppp: number | null;
  population: number | null;
  basket_pci: number | null;
  n_rca: number | null;
} & Record<string, number | string | null>;

export type Pair = {
  a: string;
  b: string;
  jaccard_basket: number | null;
  jaccard_entry: number | null;
  tercile_a: number | null;
  tercile_b: number | null;
  // From the BiCM null (04_null_model.R): observed overlap of the two RCA >= 1
  // baskets, its expectation and standard deviation under the null, the
  // Matthews correlation of the two basket vectors, and the V-Dem regions.
  overlap_obs: number | null;
  overlap_exp: number | null;
  overlap_sd: number | null;
  mcc: number | null;
  region_a: string | null;
  region_b: string | null;
};

// One row per (Ward cut, cluster, product): how many members hold the product
// against the Poisson-binomial null from the BiCM; sig is +1 for a validated
// specialisation, -1 for a validated avoidance (BH, 10% FDR), 0 otherwise.
export type NullProduct = {
  k: number;
  cluster: number;
  product: string;
  n: number;
  n_obs: number;
  expected: number;
  sd: number;
  z: number;
  p_right: number;
  p_left: number;
  sig: number;
};
export type NullMeta = {
  n_countries: number;
  n_products: number;
  density: number;
  iterations: number;
  max_margin_error: number;
  fdr_alpha: number;
  universe_products: number;
};

export type RcaRow = { iso3: string; product: string; value: number };

export type EntryGradient = {
  cluster: number;
  n_countries: number;
  n_candidates: number;
  entry_rate: number;
  slope: number;
  slope_se: number;
  entered_pci: number;
  entered_density: number;
  candidate_density: number;
  actual_over_expected: number;
};
export type CommonEntry = {
  product: string;
  name_short: string;
  ps: number | null;
  share: number;
  world_share: number;
  lift: number;
  n_entered: number;
  n: number;
};
export type EntriesByK = {
  k: number;
  gradients: EntryGradient[];
  slope_test: { stat: number; p: number };
  intercept_test: { stat: number; p: number };
  common: Record<string, CommonEntry[]>;
};
export type Entries = {
  windows: string[];
  candidate_rule: string;
  entry_rule: string;
  pooled: { slope: number; se: number; n: number; entry_rate: number; r2: number };
  by_k: EntriesByK[];
};

export type Product = {
  product: string;
  name_short: string;
  sector: string;
  ps: number | null;
  ps_x: number | null;
  ps_y: number | null;
};
export type CxMeta = {
  ps_names: Record<string, string>;
  atlas_years: number[];
  year_map: Record<string, number>;
  n_countries_ranked: number;
  products: Product[];
  source: string;
};

export type TreeNode = {
  id: number;
  leaf: boolean;
  n: number;
  class: number;
  purity: number;
  var?: string;
  name?: string;
  threshold?: number;
  left_is_lower?: boolean;
};
export type Tree = { k: number; accuracy: number; cv_accuracy: number; n_leaves: number; nodes: TreeNode[] };

// Annual cluster membership 1990-2025 by k-NN vote against the benchmark rows.
export type AnnualRow = { iso3: string; country_name: string; year: number; pc1: number } & Record<string, number | string | null>;
export type CxAnnual = { iso3: string; year: number; eci: number | null; diversity: number | null; coi: number | null; export_value: number | null; gdppc_ppp: number | null };
export type EventsMeta = { agreement_knn: Record<string, number>; agreement_centroid: Record<string, number>; knn: number; years: [number, number]; n_countries: number };

export type MechCoef = { measure: string; label: string; term: string; est: number; se: number; p: number; n: number };
export type MechClusterCoef = { cluster: number; var: "density" | "diff" | "pci"; est: number; se: number; p: number };
export type MechRelative = { cluster?: number; g?: number; group?: string; class: string; n: number; entered: number; expected: number; axis: "differentiation" | "complexity"; ratio: number };
export type MechPciCoef = { measure: string; label: string; model: "entry_pci" | "entry_pci_income" | "tilt" | "tilt_income" | "entry_fe" | "entry_fe_income"; term: string; est: number; se: number; p: number; n: number };
// One row per country x entry window with at least three entries: the mean
// PCI of what was entered, the PCI relatedness alone would have delivered,
// their difference (tilt), institutional measures and log income.
export type TiltRow = { iso3: string; window: string; inst_year: number; n_entries: number; pci_entered: number; pci_expected: number; density_entered: number; tilt: number; lgdp: number } & Record<string, number | string | null>;
export type Mechanisms = {
  measures: Record<string, string>;
  continuous: MechCoef[];
  continuous_pci: MechPciCoef[];
  tilt_n: number;
  by_k: { k: number; ref: number; coefs: MechClusterCoef[]; relative: MechRelative[]; n: number }[];
  pc1_terciles: MechRelative[];
  n_candidates: number;
  n_countries: number;
  entry_rate: number;
  diff_source: string;
  n_products: number;
};

// One row per V-Dem indicator from the backward screen (07_indicator_screen.R).
export type ScreenRow = {
  tag: string; name: string; category: string; cor_income: number; sd_within: number;
  a_est: number; a_se: number; a_p: number; a_q: number; a_raw_est: number; a_raw_p: number;
  a_w1_est: number; a_w1_p: number; a_w2_est: number; a_w2_p: number;
  b_est: number; b_se: number; b_p: number; b_q: number;
  c_est: number; c_se: number; c_p: number; c_q: number;
};
export type ScreenMeta = { n_indicators: number; n_country_windows: number; n_entered: number; n_candidates: number; pass_a: number; pass_b: number; pass_c: number; pass_all: number };
export type TiltZ = { iso3: string; window: string; tag: string; z: number };

// Annual within-country panel (08_within.R): entries by two rules, tilts,
// fiscal and institutional measures, income.
export type WithinRow = { iso3: string; year: number; n_cand: number; nA: number; pciA: number | null; expA: number | null; densA: number | null; nB: number; pciB: number | null; expB: number | null; tiltA: number | null; tiltB: number | null; lgdp: number | null; eci: number | null; pc1: number | null } & Record<string, number | string | null>;
export type WithinResult = {
  measure: string; label: string; rule: "A" | "B"; n_obs: number; n_countries: number; within_share: number; sd: number;
  fe_est: number; fe_se: number; fe_p: number; fel_est: number; fel_se: number; fel_p: number;
  fep_est: number; fep_se: number; fep_p: number; fen_est: number; fen_se: number; fen_p: number;
  btw_est: number; btw_se: number; btw_p: number;
};
export type WithinResults = {
  rules: Record<"A" | "B", string>;
  pooled: Record<"A" | "B", { slope: number; rate: number }>;
  n_candidates: number; years: [number, number]; measures: Record<string, string>;
  results: WithinResult[];
  movers: { iso3: string; first: number; last: number; change: number; range: number; n: number }[];
};

export type ResearchData = {
  meta: ClusterMeta;
  points: Point[];
  profiles: ProfileRow[];
  cx: CxCountry[];
  pairs: Pair[];
  rca: RcaRow[];
  entries: Entries;
  cxMeta: CxMeta;
  tree: Tree;
  nullProducts: NullProduct[];
  nullMeta: NullMeta;
  annual: AnnualRow[];
  cxAnnual: CxAnnual[];
  subregions: Record<string, string>;
  eventsMeta: EventsMeta;
  mechanisms: Mechanisms;
  tilt: TiltRow[];
  screen: ScreenRow[];
  screenMeta: ScreenMeta;
  tiltZ: TiltZ[];
  within: WithinRow[];
  withinResults: WithinResults;
};

async function parquet<T>(url: string): Promise<T[]> {
  const file = await asyncBufferFromUrl({ url });
  const rows = (await parquetReadObjects({ file })) as Record<string, unknown>[];
  // hyparquet leaves missing cells undefined; NaN comes back as NaN. Normalise
  // both to null so the views can test one thing.
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const key of Object.keys(r)) {
      const v = r[key];
      o[key] = v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : v;
    }
    return o as T;
  });
}
const json = <T,>(url: string) => fetch(url).then((r) => r.json() as Promise<T>);

let cache: ResearchData | null = null;
let inflight: Promise<ResearchData> | null = null;

function load(): Promise<ResearchData> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = (async () => {
    const [meta, points, profiles, cx, pairs, rca, entries, cxMeta, tree, nullProducts, nullMeta, annual, cxAnnual, subregions, eventsMeta, mechanisms, tilt, screen, screenMeta, tiltZ, within, withinResults] = await Promise.all([
      json<ClusterMeta>("/research/cluster_meta.json"),
      parquet<Point>("/research/points.parquet"),
      parquet<ProfileRow>("/research/profiles.parquet"),
      parquet<CxCountry>("/research/cx_country.parquet"),
      parquet<Pair>("/research/cx_pairs.parquet"),
      parquet<RcaRow>("/research/cx_rca.parquet"),
      json<Entries>("/research/entries.json"),
      json<CxMeta>("/research/cx_meta.json"),
      json<Tree>("/research/tree_k6.json"),
      parquet<NullProduct>("/research/null_products.parquet"),
      json<NullMeta>("/research/null_meta.json"),
      parquet<AnnualRow>("/research/annual_membership.parquet"),
      parquet<CxAnnual>("/research/cx_annual.parquet"),
      json<Record<string, string>>("/research/subregions.json"),
      json<EventsMeta>("/research/events_meta.json"),
      json<Mechanisms>("/research/mechanisms.json"),
      parquet<TiltRow>("/research/tilt.parquet"),
      parquet<ScreenRow>("/research/indicator_screen.parquet"),
      json<ScreenMeta>("/research/indicator_screen_meta.json"),
      parquet<TiltZ>("/research/tilt_z.parquet"),
      parquet<WithinRow>("/research/within_panel.parquet"),
      json<WithinResults>("/research/within_results.json"),
    ]);
    cache = { meta, points, profiles, cx, pairs, rca, entries, cxMeta, tree, nullProducts, nullMeta, annual, cxAnnual, subregions, eventsMeta, mechanisms, tilt, screen, screenMeta, tiltZ, within, withinResults };
    return cache;
  })();
  return inflight;
}

export function useResearchData(): { data: ResearchData | null; error: Error | null } {
  const [data, setData] = useState<ResearchData | null>(cache);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true;
    load()
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, []);
  return { data, error };
}
