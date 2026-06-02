// Country-space (animated UMAP) types
export type Observation = { year: number; x: number; y: number };

export type Track = {
  name: string;
  region: string;
  observations: Observation[];
};

export type Meta = {
  year_range: [number, number];
  observation_years: number[];
  default_duration_seconds: number;
  default_fps: number;
  easing: string;
  regions: Record<string, string>;
  source: string;
  notes: string;
};

// Country profile types
export type Country = {
  iso3: string;
  name: string;
  region: string;
};

export type PeerEntry = {
  iso3: string;
  distance: number;
};

// Growth series (per ISO3, loaded from growth_series.json)
export type ScalarPoint = { year: number; value: number };
export type SectoralPoint = { year: number; agr?: number; ind?: number; srv?: number };

export type BreakPeriod = {
  start: number;
  end: number;
  avg_growth: number;
  median_growth: number;
  passes_kar: boolean | null;
};

export type GrowthRecord = {
  iso3: string;
  breaks: { years: number[]; periods: BreakPeriod[] } | null;
  gdp_per_capita: ScalarPoint[];
  growth_rate: ScalarPoint[];
  sectoral_va: SectoralPoint[];
  sectoral_productivity: SectoralPoint[];
  eci: ScalarPoint[];
};

export type GrowthIndex = Record<string, GrowthRecord>;

// V-Dem indices
export type VDemMetaIndex = {
  tag: string;
  label: string;
  group: string;
  question?: string | null;
  description?: string | null;
};
export type VDemMeta = {
  start_year: number;
  groups: string[];
  indices: VDemMetaIndex[];
};
export type VDemRecord = { iso3: string } & Record<string, ScalarPoint[]>;

// V-Dem explorer (full catalog) — registry shipped as JSON; series shipped
// as one long-format parquet read in-browser with hyparquet.
export type VDemIndicator = {
  tag: string;
  name: string;
  category: string;
  vartype: string;
  question?: string | null;
  description?: string | null;
  responses?: string | null;
  scale?: string | null;
};

export type VDemIndicatorRegistry = {
  start_year: number;
  categories: string[];
  indicators: VDemIndicator[];
};

// BdM winning-coalition (W) series — one ScalarPoint[] per ISO3.
export type BdmIndex = Record<string, ScalarPoint[]>;

// State capacity (Hanson & Sigman / QoG `lld`). One series per country with
// posterior SD packed alongside so the UI can render a ±1 SD band.
export type StateCapacityPoint = { year: number; value: number; sd: number };
export type StateCapacityRecord = {
  iso3: string;
  capacity: StateCapacityPoint[];
};
export type StateCapacityMeta = {
  start_year: number;
  end_year: number;
  source: string;
  citation: string;
  index: {
    tag: string;
    label: string;
    description: string;
  };
};

// Hanson & Sigman (2021) component indicators — the 21 series that feed
// the latent `Capacity` factor, organised into three dimensions. Per-country
// files ship a sparse map of `tag -> ScalarPoint[]` (a series is omitted
// when the country has no observations for that indicator).
export type HSDimensionKey = "extractive" | "coercive" | "administrative";

export type HSIndicator = {
  tag: string;
  label: string;
  source: string;
  description: string;
};

export type HSDimension = {
  key: HSDimensionKey;
  label: string;
  description: string;
  default: string;
  indicators: HSIndicator[];
};

export type HSComponentsMeta = {
  source: string;
  citation: string;
  start_year: number;
  end_year: number;
  dimensions: Record<HSDimensionKey, HSDimension>;
};

// Shared shape for any "wide" per-country indicator file: a sparse map of
// `tag -> ScalarPoint[]`. Used both by the H&S 21-indicator section and the
// "Explore related indicators" section.
export type IndicatorSeriesRecord = {
  iso3: string;
  series: Record<string, ScalarPoint[]>;
};

export type HSComponentsRecord = IndicatorSeriesRecord;

// "Explore related indicators" — capacity-adjacent series compiled from
// macro_df where possible and supplemented from the H&S replication archive.
export type RelatedIndicatorDirection = "positive" | "negative";

export type RelatedIndicator = {
  tag: string;
  label: string;
  source: string;
  // Verbatim description from the macro_df data dictionary (for macro_df-sourced
  // indicators) or the .dta variable label (for H&S replication-sourced
  // indicators). Treated as the authoritative attribution.
  dict_label: string;
  // Editorial expansion — scale, coverage, methodology — written for this
  // dashboard. Not verbatim from any source.
  description: string;
  group: string;
  direction: RelatedIndicatorDirection;
};

export type RelatedIndicatorsMeta = {
  source: string;
  description: string;
  default: string;
  groups: string[];
  indicators: RelatedIndicator[];
};

export type RelatedIndicatorsRecord = IndicatorSeriesRecord;

// PolSett (Political Settlements, Schulz & Kelsall 2020) — 42 Global-South
// countries × political periods. Typology axes: social foundation size
// (x; 0-100%) and power concentration (y; 0-1). `khan` is the 4-category
// Khan typology computed from the two axis dummies.
export type PolSettTypologyRow = {
  iso3: string;
  year: number;
  // Schulz-Kelsall ("book") axes
  sfs: number;             // Social foundation size, 0-100
  pc: number;              // Power concentration (mix), 0-1
  // Khan axes
  horz: number;            // Horizontal power, 1-5
  vert: number;            // Vertical power index, 0-1
  // Labels — each anchored to its own axes (sk_label from (sfs,pc) cuts;
  // khan_label straight from the dataset's `x_khansettlementype` which is
  // horizontal × vertical dummies).
  sk_code: "BC" | "NC" | "ND" | "BD";
  sk_label: string;
  khan_raw: 1 | 2 | 3 | 4 | null;
  khan_label: string | null;
  leader: string | null;
  period_start: number;
  period_end: number;
};

export type PolSettTypologySpec = {
  x_var: string;
  y_var: string;
  x_label: string;
  y_label: string;
  x_cut: number;
  y_cut: number;
  x_description: string;
  y_description: string;
};

export type PolSettMeta = {
  source: string;
  citation: string;
  year_range: [number, number];
  countries: { iso3: string; name: string }[];
  typology_sk: PolSettTypologySpec;
  typology_khan: PolSettTypologySpec;
};

export type PolSettIndicator = {
  tag: string;
  name: string;
  section: string;
  section_label: string;
  question: string | null;
  clarification: string | null;
  responses: string | null;
  construction: string | null;
  scale: string | null;
  notes: string | null;
};

export type PolSettIndicatorRegistry = {
  sections: { section: string; section_label: string }[];
  indicators: PolSettIndicator[];
};

// Pooled-panel PCA scores — one row per (ISO3, year), wide across the
// first five components. Loaded from pc_scores.parquet.
export type PCKey = "pc1" | "pc2" | "pc3" | "pc4" | "pc5";
export type PCRow = {
  iso3: string;
  year: number;
  pc1: number;
  pc2: number;
  pc3: number;
  pc4: number;
  pc5: number;
};

export type PCComponent = {
  key: PCKey;
  name: string;
  var_explained: number;
  short: string;
  positive_pole: string;
  negative_pole: string;
};

export type PCMeta = {
  source: string;
  panel_window: [number, number];
  n_country_years: number;
  n_features: number;
  components: PCComponent[];
};

// Besley & Persson "Pillars of Prosperity" — four pillars (fiscal, legal &
// collective state capacity + peace) reconstructed as annual panels. Each
// pillar is scored as a within-year percentile (0-100); raw native-unit
// underlying indicators ship alongside for drilldown.
export type PillarKey = "fiscal" | "legal" | "collective" | "peace";
export type PillarPctKey = PillarKey | "composite";

export type PillarIndicator = {
  tag: string;
  label: string;
  source: string;
  unit: string;
  direction: RelatedIndicatorDirection;
  description: string;
};

export type PillarSpec = {
  key: PillarKey;
  label: string;
  signal: string;
  description: string;
  default: string;
  indicators: PillarIndicator[];
};

export type PillarsMeta = {
  source: string;
  citation: string;
  framework: string;
  normalization: string;
  composite_year_range: [number, number];
  pillars: PillarSpec[];
};

// Per-country file. `pillars` holds the percentile (0-100) series per pillar
// plus the composite; `series` holds raw native-unit underlying indicators in
// the shared `tag -> ScalarPoint[]` shape (so it is structurally an
// IndicatorSeriesRecord and reuses HSComponentChart directly).
export type PillarsRecord = {
  iso3: string;
  pillars: Partial<Record<PillarPctKey, ScalarPoint[]>>;
  series: Record<string, ScalarPoint[]>;
};
