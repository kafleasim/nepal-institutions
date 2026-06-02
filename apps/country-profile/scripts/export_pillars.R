#!/usr/bin/env Rscript
# Export Besley & Persson "Pillars of Prosperity" pillars for the country-profile app.
#
# Besley & Persson (2011, Pillars of Prosperity; 2021 ten-year update) frame
# development as resting on Adam Smith's two drivers — STATE CAPACITY and PEACE.
# State capacity has three dimensions (fiscal, legal, collective). We reconstruct
# all four pillars as ANNUAL panels (B-P's own dataset is mostly cross-sectional),
# operationalising each pillar with the time-varying series B-P themselves use,
# extended with the best-coverage equivalents in our data.
#
# NORMALISATION — faithful to B-P's own method. Everything B-P do (min-max within
# year, normalised rank within year, per-cross-section PCA) is RELATIVE TO THE
# WORLD IN THAT YEAR. We translate that to a time series with WITHIN-YEAR
# PERCENTILE RANK (0-100) — exactly their Doing Business normalised-rank method,
# robust to outliers over a long panel. Each pillar's percentile is the rank of
# its directionally-correct signal among all countries present that year.
# Composite = mean of the available pillar percentiles (B-P average available
# components); we require >= 2 pillars present so the composite is never a single
# pillar in disguise.
#
# Pillar signals (the variable whose within-year percentile = the pillar score):
#   Fiscal     income-tax share of total tax        (IMF WoRLD,  1980-2024)
#   Legal      V-Dem property rights v2xcl_prpty     (V-Dem)
#   Collective mean(pctile life-exp, pctile human-capital)  (macro_df / WDI+PWT)
#   Peace      mean(pctile freedom-from-killing, freedom-from-torture)  (V-Dem)
#
# Each pillar also ships its underlying RAW (native-unit) series for drilldown.
#
# Output:
#   apps/country-profile/public/pillars/{ISO3}.json   (per country)
#   apps/country-profile/public/pillars_meta.json     (catalogue)

suppressMessages({
  library(tidyverse)
  library(arrow)
  library(readxl)
  library(haven)
  library(jsonlite)
})

setwd("/home/taimur/dev/institutional-complexity")

MACRO  <- "~/dev/shared-data/growth-lab/glmacro_master_alldata.parquet"
WORLD  <- "~/dev/shared-data/world-imf2026.xlsx"
VDEM   <- "~/dev/shared-data/vdem/vdem.parquet"
BP     <- "notes/literature/pillars-of-prosperity/Pillars 2.dta"
OUT    <- "apps/country-profile/public/pillars"
META   <- "apps/country-profile/public/pillars_meta.json"

target <- fromJSON("apps/country-profile/public/countries.json")$iso3

# ---------------------------------------------------------------------------
# 1. FISCAL — IMF World Revenue Longitudinal Database (WoRLD). TaxRev/TaxInc/
#    TaxTra are already % of GDP; B-P's fiscal signal is income-tax SHARE OF
#    TOTAL TAX (income tax requires capacity; trade tax is the "easy" base).
# ---------------------------------------------------------------------------
message("Fiscal: IMF WoRLD …")
fiscal <- read_excel(WORLD, sheet = "Data") |>
  transmute(
    iso3 = ISO3, year = as.integer(year),
    taxgdp = TaxRev,
    inctax_share   = ifelse(TaxRev > 0, 100 * TaxInc / TaxRev, NA_real_),
    tradetax_share = ifelse(TaxRev > 0, 100 * TaxTra / TaxRev, NA_real_)
  ) |>
  mutate(taxbias = inctax_share - tradetax_share) |>
  filter(!is.na(iso3))

# ---------------------------------------------------------------------------
# 2. LEGAL — V-Dem property rights + horizontal constraints; Fraser legal.
# ---------------------------------------------------------------------------
message("Legal: V-Dem + Fraser …")
vd <- read_parquet(VDEM, col_select = c(
  "country_text_id", "year",
  "v2xcl_prpty", "v2x_jucon", "v2xlg_legcon",   # legal
  "v2clkill", "v2cltort"                          # peace
)) |>
  rename(iso3 = country_text_id) |>
  mutate(year = as.integer(year))

fraser <- read_parquet(MACRO,
    col_select = c("countrycodeiso", "year", "qog_fi_legprop")) |>
  transmute(iso3 = countrycodeiso, year = as.integer(year),
            fraser_leg = qog_fi_legprop)

legal <- vd |>
  select(iso3, year, v_prpty = v2xcl_prpty, v_jucon = v2x_jucon,
         v_legcon = v2xlg_legcon) |>
  full_join(fraser, by = c("iso3", "year"))

# ---------------------------------------------------------------------------
# 3. COLLECTIVE — health + education (B-P coll_cap = avg of normalised
#    life-exp + normalised schooling). Annual coverage via WDI life-exp and
#    PWT human-capital; schooling / mortality / spend shipped as raw context.
# ---------------------------------------------------------------------------
message("Collective: macro_df (WDI + PWT) …")
coll <- read_parquet(MACRO, col_select = c(
  "countrycodeiso", "year",
  "wdi_sp_dyn_le00_in", "pwt_hc", "qog_bl_asymf",
  "wdi_sp_dyn_imrt_in", "wdi_se_xpd_totl_gd_zs", "wdi_sh_xpd_ghed_gd_zs"
)) |>
  transmute(
    iso3 = countrycodeiso, year = as.integer(year),
    lifeexp   = wdi_sp_dyn_le00_in,
    humancap  = pwt_hc,
    schooling = qog_bl_asymf,
    infmort   = wdi_sp_dyn_imrt_in,
    eduexp    = wdi_se_xpd_totl_gd_zs,
    healthexp = wdi_sh_xpd_ghed_gd_zs
  )

# ---------------------------------------------------------------------------
# 4. PEACE — absence of state violence (V-Dem physical integrity) drives the
#    annual signal (through 2025); B-P's UCDP civil-war + repression incidence
#    shipped as raw context (through 2016).
# ---------------------------------------------------------------------------
message("Peace: Besley-Persson civil-war + repression metric …")
bp_raw <- read_dta(BP) |>
  transmute(iso3 = ccode, year = as.integer(year),
            civilwar = as.numeric(wardum),
            repression = as.numeric(repressiondum)) |>
  filter(!is.na(iso3), !is.na(year)) |>
  group_by(iso3, year) |>
  summarise(civilwar = max(civilwar, na.rm = TRUE),
            repression = max(repression, na.rm = TRUE), .groups = "drop") |>
  mutate(across(c(civilwar, repression), ~ ifelse(is.infinite(.), NA_real_, .)))

# B-P's peace metric: 0.5*repression + civilwar, measured as the cumulative
# share of years spent in conflict/repression over a window starting 1975.
# Their published index uses the full 1975-2016 average (avg_repression75 /
# avg_civilwar75); the expanding mean below reproduces that exactly at 2016
# while giving a year-by-year trajectory. Higher peace_bp = more peace.
bp_peace <- bp_raw |>
  filter(year >= 1975, !is.na(civilwar), !is.na(repression)) |>
  arrange(iso3, year) |>
  group_by(iso3) |>
  mutate(peace_bp = -cummean(0.5 * repression + civilwar)) |>
  ungroup() |>
  select(iso3, year, peace_bp)

# V-Dem physical integrity kept as raw context (for a future "our own
# improvement" peace measure); civil-war/repression dummies as raw context too.
peace <- vd |>
  select(iso3, year, v_kill = v2clkill, v_tort = v2cltort) |>
  full_join(bp_raw, by = c("iso3", "year")) |>
  full_join(bp_peace, by = c("iso3", "year"))

# ---------------------------------------------------------------------------
# 5. Master frame + within-year percentiles.
# ---------------------------------------------------------------------------
message("Joining + computing within-year percentiles …")
master <- list(fiscal, legal, coll, peace) |>
  reduce(full_join, by = c("iso3", "year")) |>
  filter(iso3 %in% target, !is.na(year)) |>
  arrange(iso3, year)

# Within-year percentile rank (0-100) across all countries with data that year.
pct_by_year <- function(df, col) {
  df |>
    group_by(year) |>
    mutate(.p = {
      x <- .data[[col]]; n <- sum(!is.na(x))
      if (n <= 1) ifelse(is.na(x), NA_real_, 50)
      else (rank(x, ties.method = "average", na.last = "keep") - 1) / (n - 1) * 100
    }) |>
    ungroup() |>
    pull(.p)
}

master <- master |>
  mutate(
    p_inctax  = pct_by_year(master, "inctax_share"),
    p_prpty   = pct_by_year(master, "v_prpty"),
    p_lifeexp = pct_by_year(master, "lifeexp"),
    p_hc      = pct_by_year(master, "humancap"),
    p_peace   = pct_by_year(master, "peace_bp")
  )

rmean <- function(...) {
  m <- cbind(...)
  ifelse(rowSums(!is.na(m)) == 0, NA_real_, rowMeans(m, na.rm = TRUE))
}
ncomp <- function(...) rowSums(!is.na(cbind(...)))

master <- master |>
  mutate(
    fiscal_pct     = p_inctax,
    legal_pct      = p_prpty,
    collective_pct = rmean(p_lifeexp, p_hc),
    peace_pct      = p_peace,
    # Composite only where ALL FOUR pillars are observed (the full-framework
    # window, ~1980-2016) — B-P's own index requires complete data, and a
    # partial average would jump as pillars enter/exit coverage.
    composite_pct  = ifelse(
      ncomp(fiscal_pct, legal_pct, collective_pct, peace_pct) == 4,
      rmean(fiscal_pct, legal_pct, collective_pct, peace_pct),
      NA_real_
    )
  )

# ---------------------------------------------------------------------------
# 6. Catalogue (pillars + raw indicators). `col` = column in `master`.
# ---------------------------------------------------------------------------
PILLARS <- list(
  list(key = "fiscal", label = "Fiscal capacity", pct = "fiscal_pct",
       signal = "Income-tax share of total tax revenue",
       description = paste(
         "The state's ability to raise revenue from hard-to-tax bases.",
         "Besley & Persson treat the income-tax share of total tax as the",
         "signature of fiscal capacity — income taxation requires registries,",
         "monitoring and compliance, whereas trade taxes are the 'easy' base",
         "a low-capacity state falls back on. Source: IMF World Revenue",
         "Longitudinal Database (WoRLD), 1980-2024."),
       default = "fis_inctax",
       indicators = list(
         list(tag="fis_inctax", col="inctax_share", label="Income-tax share of total tax",
              source="IMF WoRLD", unit="% of total tax", direction="positive",
              description="Income, profit & capital-gains taxes as a share of total tax revenue. B-P's fiscal-capacity signal."),
         list(tag="fis_taxgdp", col="taxgdp", label="Tax revenue (% of GDP)",
              source="IMF WoRLD", unit="% of GDP", direction="positive",
              description="Total tax revenue as a share of GDP — the overall reach of the fiscal system."),
         list(tag="fis_tradetax", col="tradetax_share", label="Trade-tax share of total tax",
              source="IMF WoRLD", unit="% of total tax", direction="negative",
              description="Taxes on international trade as a share of total tax. The 'easy' base; reliance on it signals LOW fiscal capacity."),
         list(tag="fis_bias", col="taxbias", label="Income − trade tax bias",
              source="IMF WoRLD", unit="ppt", direction="positive",
              description="Income-tax share minus trade-tax share (B-P's taxshare_bias). Higher = a more capacity-intensive tax mix.")
       )),
  list(key = "legal", label = "Legal capacity", pct = "legal_pct",
       signal = "Property rights protection (V-Dem)",
       description = paste(
         "The state's ability to protect property and enforce contracts —",
         "the legal infrastructure that lets markets function. B-P's chosen",
         "annual measure is V-Dem's property-rights index; we add horizontal",
         "constraints on the executive (judicial / legislative) and the Fraser",
         "Institute's legal-structure index as convergent context."),
       default = "leg_prpty",
       indicators = list(
         list(tag="leg_prpty", col="v_prpty", label="Property rights (V-Dem)",
              source="V-Dem", unit="0-1 index", direction="positive",
              description="Do citizens enjoy the right to acquire, possess, inherit and sell private property? V-Dem v2xcl_prpty, 0-1. B-P's legal-capacity signal."),
         list(tag="leg_jucon", col="v_jucon", label="Judicial constraints on the executive",
              source="V-Dem", unit="0-1 index", direction="positive",
              description="The extent to which the executive respects the constitution and complies with court rulings (V-Dem v2x_jucon)."),
         list(tag="leg_legcon", col="v_legcon", label="Legislative constraints on the executive",
              source="V-Dem", unit="0-1 index", direction="positive",
              description="The extent to which the legislature and oversight bodies can constrain the executive (V-Dem v2xlg_legcon)."),
         list(tag="leg_fraser", col="fraser_leg", label="Legal structure & property rights (Fraser)",
              source="Fraser Institute (via QoG)", unit="0-10 index", direction="positive",
              description="Judicial independence, impartial courts, protection of property, military non-interference and legal integrity. 0 (worst) to 10 (best).")
       )),
  list(key = "collective", label = "Collective capacity", pct = "collective_pct",
       signal = "Health + education standing (mean of life-expectancy & human-capital percentiles)",
       description = paste(
         "The state's capacity to deliver broad public goods — B-P's third,",
         "newest dimension, operationalised (after Besley & Persson 2014) as",
         "the combination of population health and education. The pillar score",
         "averages a country's within-year standing on life expectancy and",
         "human capital; schooling, infant mortality and public spending are",
         "shipped as context."),
       default = "col_lifeexp",
       indicators = list(
         list(tag="col_lifeexp", col="lifeexp", label="Life expectancy at birth",
              source="WDI", unit="years", direction="positive",
              description="Life expectancy at birth, total (years). WDI. One of the two B-P collective-capacity signals."),
         list(tag="col_humancap", col="humancap", label="Human capital index",
              source="Penn World Table", unit="index", direction="positive",
              description="PWT human-capital index built from average years of schooling and returns to education. Annual proxy for B-P's Barro-Lee schooling input."),
         list(tag="col_schooling", col="schooling", label="Mean years of schooling (15-64)",
              source="Barro-Lee (via QoG)", unit="years", direction="positive",
              description="Average years of total schooling for the population aged 15-64. B-P's exact education input; five-yearly."),
         list(tag="col_infmort", col="infmort", label="Infant mortality rate",
              source="WDI", unit="per 1,000 births", direction="negative",
              description="Infant deaths per 1,000 live births. WDI. A classic inverse marker of public-health delivery."),
         list(tag="col_eduexp", col="eduexp", label="Government education spending",
              source="WDI", unit="% of GDP", direction="positive",
              description="Government expenditure on education as a share of GDP — investment in collective capacity."),
         list(tag="col_healthexp", col="healthexp", label="Government health spending",
              source="WHO / WDI", unit="% of GDP", direction="positive",
              description="Domestic general government health expenditure as a share of GDP. WHO Global Health Expenditure DB (2000-).")
       )),
  list(key = "peace", label = "Peace", pct = "peace_pct",
       signal = "Besley-Persson peace metric — freedom from civil war & repression",
       description = paste(
         "Adam Smith's second driver and B-P's fourth pillar: the absence of",
         "political violence. This uses B-P's own metric — 0.5 x repression +",
         "civil war, scored as the cumulative share of years (from 1975) a",
         "country has avoided conflict and repression, so the value at 2016",
         "matches their published index. Built from UCDP/PRIO civil war and",
         "their repression dummy; coverage 1975-2016. (V-Dem freedom from",
         "political killings and torture are shipped as raw context for a",
         "future, higher-coverage peace measure.)"),
       default = "pea_civilwar",  # unused by PillarDrilldown (defaults to score)
       indicators = list(
         list(tag="pea_civilwar", col="civilwar", label="Civil-war incidence (B-P score input)",
              source="UCDP/PRIO (via B-P)", unit="0/1", direction="negative",
              description="1 if the country was in an internal armed conflict that year (B-P's UCDP-derived war dummy). Weighted 1.0 in the peace score; inverse signal; 1946-2016."),
         list(tag="pea_repression", col="repression", label="Repression incidence (B-P score input)",
              source="B-P replication", unit="0/1", direction="negative",
              description="1 if the country was in a state of political repression that year (B-P repression dummy). Weighted 0.5 in the peace score; inverse signal; through 2016."),
         list(tag="pea_kill", col="v_kill", label="Freedom from political killings (V-Dem, context)",
              source="V-Dem", unit="index", direction="positive",
              description="Freedom from political killings by the state (V-Dem v2clkill). NOT used in the current B-P peace score — shipped as context for a future, higher-coverage peace measure. Higher = freer; through 2025."),
         list(tag="pea_tort", col="v_tort", label="Freedom from torture (V-Dem, context)",
              source="V-Dem", unit="index", direction="positive",
              description="Freedom from torture by the state (V-Dem v2cltort). NOT used in the current B-P peace score — shipped as context for a future, higher-coverage peace measure. Higher = freer; through 2025.")
       ))
)

# ---------------------------------------------------------------------------
# 7. Per-country JSON.
# ---------------------------------------------------------------------------
dir.create(OUT, recursive = TRUE, showWarnings = FALSE)
old <- list.files(OUT, pattern = "\\.json$", full.names = TRUE)
if (length(old)) file.remove(old)

mkpts <- function(yrs, vals, digits = 2) {
  keep <- !is.na(vals)
  if (!any(keep)) return(NULL)
  pmap(list(year = as.integer(yrs[keep]), value = round(as.numeric(vals[keep]), digits)),
       function(year, value) list(year = unbox(year), value = unbox(value)))
}

pillar_pct_cols <- c(fiscal = "fiscal_pct", legal = "legal_pct",
                     collective = "collective_pct", peace = "peace_pct",
                     composite = "composite_pct")
raw_cols <- unlist(lapply(PILLARS, \(p) setNames(sapply(p$indicators, \(i) i$col),
                                                 sapply(p$indicators, \(i) i$tag))))

written <- 0
for (iso in sort(unique(master$iso3))) {
  d <- master |> filter(iso3 == iso) |> arrange(year)

  pillars <- list()
  for (k in names(pillar_pct_cols)) {
    pts <- mkpts(d$year, d[[pillar_pct_cols[[k]]]], digits = 1)
    if (!is.null(pts)) pillars[[k]] <- pts
  }
  series <- list()
  for (tag in names(raw_cols)) {
    pts <- mkpts(d$year, d[[raw_cols[[tag]]]], digits = 3)
    if (!is.null(pts)) series[[tag]] <- pts
  }
  if (length(pillars) == 0 && length(series) == 0) next

  write_json(
    list(iso3 = unbox(iso), pillars = pillars, series = series),
    file.path(OUT, paste0(iso, ".json")),
    auto_unbox = FALSE, na = "null"
  )
  written <- written + 1
}

# ---------------------------------------------------------------------------
# 8. Meta.
# ---------------------------------------------------------------------------
build_ind <- function(i) list(
  tag = unbox(i$tag), label = unbox(i$label), source = unbox(i$source),
  unit = unbox(i$unit), direction = unbox(i$direction),
  description = unbox(i$description)
)
build_pillar <- function(p) list(
  key = unbox(p$key), label = unbox(p$label), signal = unbox(p$signal),
  description = unbox(p$description), default = unbox(p$default),
  indicators = lapply(p$indicators, build_ind)
)

yr_rng <- master |> filter(!is.na(composite_pct)) |> summarise(a = min(year), b = max(year))

meta <- list(
  source = unbox(paste(
    "Reconstructed for this dashboard from: IMF World Revenue Longitudinal",
    "Database (fiscal); V-Dem v13 and the Fraser Institute (legal, peace);",
    "World Bank WDI, WHO and Penn World Table (collective); and the Besley &",
    "Persson Pillars 2 replication archive (civil-war / repression context)."
  )),
  citation = unbox(paste(
    "Besley, Timothy and Torsten Persson. 2011. Pillars of Prosperity: The",
    "Political Economics of Development Clusters. Princeton University Press;",
    "and Besley, Persson & Dann (2021), 'Pillars of Prosperity: A Ten-Year",
    "Update', CEPR DP16256."
  )),
  framework = unbox(paste(
    "Besley & Persson argue prosperity rests on Adam Smith's two drivers —",
    "state capacity and peace. State capacity has three dimensions: fiscal",
    "(raising revenue), legal (protecting property & contracts) and collective",
    "(delivering public goods). With peace, these are the four Pillars of",
    "Prosperity shown here."
  )),
  normalization = unbox(paste(
    "Each pillar is scored as a WITHIN-YEAR PERCENTILE (0-100): a country's",
    "rank, among all countries with data that year, on the pillar's signal.",
    "This mirrors B-P's own method — they normalise every component relative",
    "to the cross-section of countries in each snapshot year (min-max and",
    "rank within year, then per-year PCA). Percentile rank is their Doing",
    "Business normalisation, robust to outliers across a long panel. The",
    "composite is the average of all four pillar percentiles, drawn only",
    "where all four are observed (the full-framework window, ~1980-2016,",
    "bounded by fiscal coverage from 1980 and B-P's peace metric to 2016).",
    "Native-unit values for every underlying indicator are available",
    "beneath each pillar."
  )),
  composite_year_range = list(unbox(as.integer(yr_rng$a)), unbox(as.integer(yr_rng$b))),
  pillars = lapply(PILLARS, build_pillar)
)
write_json(meta, META, auto_unbox = FALSE, pretty = TRUE)

message("Wrote ", written, " per-country files to ", OUT)
message("Composite coverage: ", yr_rng$a, "-", yr_rng$b)
message("Wrote ", META)
