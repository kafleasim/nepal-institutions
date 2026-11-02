# Build the evaluation dataset for the PolSett proxy explorer.
#
# Purpose: PolSett (Schulz & Kelsall 2020) codes political-settlement concepts
# for 42 Global-South countries only. This script assembles, at the PolSett
# country-period level, (a) the PolSett target indices and (b) a hand-picked set
# of candidate proxies from V-Dem plus structural variables from the GL macro
# master, so that proxy quality can be evaluated against the labelled data.
#
# Writes:
#   proxy_data.js  — window.PROXY_DATA = {...} consumed by proxy-explorer.html
#                    (a .js assignment rather than .json so the tool works
#                     from file:// without a server)
#
# Unit of analysis is the country-period, not the country-year: PolSett values
# are constant within a political period, so country-year statistics would be
# inflated by repetition (see analyses/vdem-scale-audit.md §2.1).

suppressMessages({
  library(tidyverse)
  library(haven)
  library(arrow)
  library(jsonlite)
})

setwd("/home/taimur/dev/institutional-complexity")

PSD    <- "~/dev/shared-data/polsett/psd_main_aggregated_v1.dta"
VDEM   <- "~/dev/shared-data/vdem/vdem.parquet"
VDEMCB <- "~/dev/shared-data/vdem/vdem_codebook.parquet"
MACRO  <- "~/dev/shared-data/growth-lab/glmacro_master_alldata.parquet"
OUT    <- "analyses/polsett-proxies/proxy_data.js"

# Benchmark years for the global preview (all countries, not just PolSett's 42).
# 2018 rather than 2019: PolSett's last coded period ends in 2018 for 40 of its
# 44 countries, so 2019 has almost no labelled counterpart to compare against.
# 2024 is included for a present-day estimate with no labelled comparison.
BENCH_YEARS <- c(1965, 1975, 1985, 1995, 2005, 2015, 2018, 2024)

# ---------------------------------------------------------------------------
# 1. PolSett targets at country-period level
# ---------------------------------------------------------------------------

# The concepts we are trying to proxy. `layer` groups them by the decomposition
# in the codebook: social foundation size is the product of a "who is powerful"
# layer and a "are they co-opted" layer; power concentration is the mix of a
# horizontal (coalition vs opposition bloc) and a vertical (leader within
# coalition) layer.
TARGETS <- tribble(
  ~tag,                        ~label,                                   ~layer,        ~range,
  "x_socialfoundationsize",    "Social Foundation Size",                 "sf",          "0-100",
  "x_totpowerfulpopshare",     "Powerful share of population",           "sf_powerful", "0-100",
  "x_gencooptscore",           "General cooptation score",               "sf_coopt",    "0-1",
  "x_genviorepscore",          "General violent repression score",       "sf_coopt",    "0-1",
  "x_governingcoalitionsize",  "Governing coalition size (% pop)",       "sf",          "0-100",
  "x_powerconcentration_mix",  "Power Concentration (mix)",              "pc",          "0-1",
  "x_powerconcentration_add",  "Power Concentration (additive)",         "pc",          "0-1",
  "x_horizontalpower",         "Horizontal power (coalition vs OB)",     "pc_horiz",    "1-5",
  "x_verticalpower",           "Vertical power (leader within coal.)",   "pc_vert",     "0-1",
  "x_lbvsclbpowerratio",       "LB vs CLB power ratio",                  "pc_vert",     "0.2-5",
  "x_horizdistrinequality_nor","Horizontal distribution inequality",     "other",       "0-1",
  "x_sfspc_mix",               "ESID Political Settlement Index",        "other",       "0-1"
)

# Raw survey items behind the two power sub-indices, kept as extra targets so
# the components can be proxied directly rather than only via the composites.
RAW_ITEMS <- c(
  "q1_populationshare_lb", "q1_populationshare_clb", "q1_populationshare_ob",
  "q2_power_lb", "q2_power_clb", "q2_power_ob",
  "q3_clbsplit", "q8_hierarchy_lb", "q9_cohesiveness_lb"
)

# Categorical labels.
CLASS_TARGETS <- c(
  "x_khansettlementype", "x_esidettlementype",
  "x_sfsdummy", "x_pcdummy", "x_horizontalpowerdummy", "x_verticalpowerdummy"
)

message("Loading PolSett…")
psd_raw <- read_dta(PSD)

psd <- psd_raw %>%
  transmute(
    cname_psd, cname_vdem, ccode_cow,
    year = as.integer(year),
    # `period` is a character label ("1958-1962"); `periodnumber` is the index.
    period = as.integer(periodnumber),
    periodstart = as.integer(periodstart),
    periodend = as.integer(periodend),
    leader = leadername_nonumber,
    across(all_of(c(TARGETS$tag, RAW_ITEMS, CLASS_TARGETS)), as.numeric)
  )

# Collapse country-years to country-periods. Values are period-constant, so the
# mean is the value; using mean rather than first is robust to the odd NA.
psd_period <- psd %>%
  group_by(cname_psd, cname_vdem, period) %>%
  summarise(
    y0 = min(year), y1 = max(year), n_years = n(),
    leader = first(na.omit(leader)),
    across(all_of(c(TARGETS$tag, RAW_ITEMS)), ~ mean(.x, na.rm = TRUE)),
    # Categoricals: modal value within period (they are period-constant anyway)
    across(all_of(CLASS_TARGETS), ~ {
      v <- .x[!is.na(.x)]
      if (!length(v)) NA_real_ else as.numeric(names(sort(table(v), decreasing = TRUE))[1])
    }),
    .groups = "drop"
  ) %>%
  mutate(across(where(is.numeric), ~ ifelse(is.finite(.x), .x, NA_real_)))

message("PolSett country-periods: ", nrow(psd_period),
        " · countries: ", n_distinct(psd_period$cname_psd))

# ---------------------------------------------------------------------------
# 2. Candidate registry
# ---------------------------------------------------------------------------
# `concept` is which target layer the candidate is proposed for. `dir` is the
# expected sign against that layer's target (+1 / -1) — recorded so the tool can
# flag candidates whose empirical sign contradicts the conceptual prior.

CANDIDATES <- tribble(
  ~key,                 ~source,   ~concept,       ~dir, ~label,
  # --- mobilisational capacity: who is "powerful"/potentially disruptive ----
  "v2x_cspart",         "vdem",    "sf_powerful",   1,  "Civil society participation index",
  "v2csprtcpt",         "vdem",    "sf_powerful",   1,  "CSO participatory environment",
  "v2xcs_ccsi",         "vdem",    "sf_powerful",   1,  "Core civil society index",
  "v2x_partip",         "vdem",    "sf_powerful",   1,  "Participatory component index",
  "v2pepwrses",         "vdem",    "sf_powerful",   1,  "Power distributed by socioeconomic position",
  "v2pepwrsoc",         "vdem",    "sf_powerful",   1,  "Power distributed by social group",
  "v2peedueq",          "vdem",    "sf_powerful",   1,  "Educational equality",
  "v2cademmob",         "vdem",    "sf_powerful",   1,  "Mobilization for democracy",
  "v2caautmob",         "vdem",    "sf_powerful",   1,  "Mobilization for autocracy",
  # --- cooptation vs repression --------------------------------------------
  "v2csreprss",         "vdem",    "sf_coopt",      1,  "CSO repression (high = no repression)",
  "v2clacfree",         "vdem",    "sf_coopt",      1,  "Freedom of academic & cultural expression",
  "v2csrlgrep",         "vdem",    "sf_coopt",      1,  "Religious organization repression (high = none)",
  "v2mecenefm",         "vdem",    "sf_coopt",      1,  "Government media censorship (high = none)",
  "v2x_civlib",         "vdem",    "sf_coopt",      1,  "Civil liberties index",
  "v2caviol",           "vdem",    "sf_coopt",     -1,  "Political violence",
  "v2exl_legitratio",   "vdem",    "sf_coopt",      1,  "Rational-legal legitimation",
  "v2exl_legitideol",   "vdem",    "sf_coopt",      1,  "Ideological legitimation",
  "v2exl_legitlead",    "vdem",    "sf_coopt",      1,  "Legitimation by person of the leader",
  "v2dlencmps",         "vdem",    "sf_coopt",     -1,  "Particularistic vs public goods (low = particularistic)",
  "v2xnp_client",       "vdem",    "sf_coopt",      1,  "Clientelism index",
  "v2psprlnks",         "vdem",    "sf_coopt",     -1,  "Party linkages (low = clientelistic)",
  # --- horizontal power: governing coalition vs opposition bloc ------------
  "v2psoppaut",         "vdem",    "pc_horiz",     -1,  "Opposition parties autonomy",
  "v2psbars",           "vdem",    "pc_horiz",      1,  "Barriers to parties",
  "v2psparban",         "vdem",    "pc_horiz",     -1,  "Party ban (low = parties banned)",
  "v2csantimv",         "vdem",    "pc_horiz",     -1,  "CSO anti-system movements",
  "v2xlg_legcon",       "vdem",    "pc_horiz",     -1,  "Legislative constraints on the executive",
  "v2x_jucon",          "vdem",    "pc_horiz",     -1,  "Judicial constraints on the executive",
  "v2lgoppart",         "vdem",    "pc_horiz",     -1,  "Legislature opposition parties",
  "v2regoppgroupssize", "vdem",    "pc_horiz",     -1,  "Regime opposition groups size",
  "v2cacamps",          "vdem",    "pc_horiz",     -1,  "Political polarization",
  "e_civil_war",        "vdem",    "pc_horiz",     -1,  "Civil war (binary)",
  # --- vertical power: leader dominance within the coalition ---------------
  "v2x_neopat",         "vdem",    "pc_vert",       1,  "Neopatrimonial rule index",
  "v2xnp_pres",         "vdem",    "pc_vert",       1,  "Presidentialism index",
  "v2xnp_regcorr",      "vdem",    "pc_vert",       1,  "Regime corruption",
  "v2pscohesv",         "vdem",    "pc_vert",       1,  "Legislative party cohesion",
  "v2psorgs",           "vdem",    "pc_vert",      -1,  "Party organizations",
  "v2psplats",          "vdem",    "pc_vert",      -1,  "Distinct party platforms",
  "v2psnatpar",         "vdem",    "pc_vert",       1,  "National party control",
  "v2exdfcbhs",         "vdem",    "pc_vert",       1,  "HOS appoints cabinet in practice",
  "v2exremhsp",         "vdem",    "pc_vert",      -1,  "HOS removal by legislature in practice",
  "v2exhoshog",         "vdem",    "pc_vert",       1,  "HOS = HOG (leader holds both offices)",
  "v2regsupgroupssize", "vdem",    "pc_vert",      -1,  "Regime support groups size",
  # --- selectorate / winning-coalition family -------------------------------
  # Bueno de Mesquita's S (selectorate) and W (winning coalition) are the closest
  # existing formalisation of "how much of the population must be kept on side",
  # so they are natural candidates for the social-foundation axis. Polity's
  # LEGSELEC/XRCOMP/XROPEN/PARCOMP components, which BdM's original indices are
  # built from, are not in our local data — only the polity2 aggregate — so the
  # W index here is the V-Dem reconstruction of Bueno de Mesquita & Smith (2022)
  # assembled in analyses/winning_coalition.R, and `v2x_suffr` stands in for the
  # literal size of the electorate.
  "v2x_suffr",          "vdem",    "sf_powerful",   1,  "Share of population with suffrage",
  "v2x_elecoff",        "vdem",    "sf_powerful",   1,  "Elected officials index",
  "e_polity2",          "vdem",    "other",         0,  "Polity2 score",
  # --- regime-type context -------------------------------------------------
  "v2x_polyarchy",      "vdem",    "other",         0,  "Electoral democracy index",
  "v2x_libdem",         "vdem",    "other",         0,  "Liberal democracy index",
  "v2clstown",          "vdem",    "other",         0,  "State ownership of economy",
  "v2x_pubcorr",        "vdem",    "other",         0,  "Public sector corruption index"
)

# Multi-select group vectors: share of coders naming each of 14 social groups.
# Continuous on [0,1] and the raw material for the nonlinear constructions in
# section 3 — see analyses/vdem-scale-audit.md §1.5.
GROUP_LABELS <- c(
  "Aristocracy", "Agrarian elites", "Party elites", "Business elites",
  "Civil servants", "Military", "Ethnic/racial", "Religious",
  "Local elites/chiefs", "Urban working class", "Urban middle class",
  "Rural working class", "Rural middle class", "Foreign/colonial power"
)
SUP_COLS <- paste0("v2regsupgroups_", 0:13)
OPP_COLS <- paste0("v2regoppgroups_", 0:13)
OPPACT_COLS <- paste0("v2regoppgroupsact_", 0:13)
# Indices of "mass" (non-elite) groups: urban/rural working & middle classes.
MASS_IDX <- c(9, 10, 11, 12)
ELITE_IDX <- c(0, 1, 2, 3)

STRUCTURAL <- tribble(
  ~key,                     ~source,  ~concept,       ~dir, ~label,
  "wdi_sp_urb_totl_in_zs",  "macro",  "sf_powerful",   1,  "Urban population (% of total)",
  "wdi_se_sec_enrr",        "macro",  "sf_powerful",   1,  "Secondary school enrolment (% gross)",
  "wdi_se_ter_enrr",        "macro",  "sf_powerful",   1,  "Tertiary school enrolment (% gross)",
  "wdi_se_adt_litr_zs",     "macro",  "sf_powerful",   1,  "Adult literacy rate (%)",
  "wdi_sl_agr_empl_zs",     "macro",  "sf_powerful",  -1,  "Employment in agriculture (% of total)",
  "wdi_sl_ind_empl_zs",     "macro",  "sf_powerful",   1,  "Employment in industry (% of total)",
  "wdi_sl_emp_self_zs",     "macro",  "sf_powerful",  -1,  "Self-employment (% of total employment)",
  "wdi_nv_ind_manf_zs",     "macro",  "sf_powerful",   1,  "Manufacturing value added (% GDP)",
  "e_peaveduc",             "vdem",   "sf_powerful",   1,  "Average years of education (15+)",
  "e_miurbani",             "vdem",   "sf_powerful",   1,  "Urbanization (V-Dem external)",
  "log_gdppc",              "derived","sf_powerful",   1,  "log GDP per capita (V-Dem e_gdppc)"
)

DERIVED <- tribble(
  ~key,               ~concept,       ~dir, ~label,                                            ~note,
  "sup_count",        "pc_vert",      -1,  "Support groups named (count, >=0.5)",
  "Number of the 14 social groups named as regime support groups by at least half the coders. Higher = broader coalition = less leader dominance.",
  "sup_entropy",      "pc_vert",      -1,  "Support coalition entropy",
  "Shannon entropy of the normalised support-group share vector. Higher = support spread evenly across many groups (multipolar); lower = concentrated in one group (unipolar).",
  "sup_hhi",          "pc_vert",       1,  "Support coalition concentration (HHI)",
  "Herfindahl index of the normalised support-group share vector. Direct operationalisation of Ferguson's unipolar-vs-multipolar distinction.",
  "sup_top1",         "pc_vert",       1,  "Largest support group share",
  "Share of coders naming the single most-cited regime support group.",
  "sup_gap12",        "pc_vert",       1,  "Support group top-1 minus top-2",
  "Gap between the most- and second-most-cited support groups. Conceptual analogue of PolSett's LB-vs-CLB power ratio: how far the primary support bloc outweighs the secondary one.",
  "oppact_count",     "pc_horiz",     -1,  "Active opposition groups named (count, >=0.5)",
  "Number of the 14 social groups named as explicit and active regime opposition groups. Higher = stronger opposition bloc = lower horizontal power.",
  "oppact_sum",       "pc_horiz",     -1,  "Active opposition breadth (sum of shares)",
  "Sum of the 14 active-opposition group shares — a continuous version of the count.",
  "oppact_top1",      "pc_horiz",     -1,  "Largest active opposition group share",
  "Share of coders naming the single most-cited active opposition group.",
  "sup_minus_opp",    "pc_horiz",      1,  "Support breadth minus opposition breadth",
  "sup_count - oppact_count. Positive = the regime draws on more social groups than oppose it, i.e. the governing coalition dominates the opposition bloc.",
  "sup_opp_overlap",  "pc_horiz",     -1,  "Support/opposition overlap (cosine)",
  "Cosine similarity between the support-group and active-opposition-group vectors. High = the same social groups are both backing and opposing the regime, i.e. a contested social base.",
  "polgroups_count",  "sf_powerful",   1,  "Politically consequential groups (count)",
  "Number of the 14 social groups named as either a regime support group or an active opposition group. Proposed as the closest V-Dem analogue of PolSett's 'share of the population that is potentially powerful': how many distinct social groups register politically at all.",
  "mass_salience",    "sf_powerful",   1,  "Mass-group political salience",
  "Mean over the four mass groups (urban/rural working and middle classes) of max(support share, active-opposition share). High = non-elite groups are politically consequential, which is what PolSett's 'powerful' coding turns on.",
  "elite_salience",   "sf_powerful",  -1,  "Elite-group political salience",
  "Mean over the four elite groups (aristocracy, agrarian, party and business elites) of max(support share, active-opposition share).",
  "mass_minus_elite", "sf_powerful",   1,  "Mass minus elite salience",
  "mass_salience - elite_salience. Positive = politics runs through mass constituencies rather than narrow elites.",
  "bdm_W",            "sf_powerful",   1,  "Winning coalition size W (Bueno de Mesquita & Smith 2022)",
  "Mean of four cross-panel z-scored V-Dem components: election-monitoring autonomy (v2elembaut), opposition-party autonomy (v2psoppaut), barriers to parties (v2psbars), and minus the maximum of the hereditary, military and party closed-succession indices. Reproduces the W index of Bueno de Mesquita & Smith (2022) as built in analyses/winning_coalition.R. Higher = larger winning coalition. Note this is a V-Dem reconstruction, not BdM's original Polity-based W, whose LEGSELEC/XRCOMP/XROPEN/PARCOMP inputs are not in our local data."
)

# ---------------------------------------------------------------------------
# 3. V-Dem: load, derive, collapse
# ---------------------------------------------------------------------------

vdem_keys <- CANDIDATES %>% filter(source == "vdem") %>% pull(key)
vdem_struct <- STRUCTURAL %>% filter(source == "vdem") %>% pull(key)

# Components of the Bueno de Mesquita & Smith (2022) W index.
BDM_COLS <- c("v2elembaut", "v2psoppaut", "v2psbars",
              "v2x_ex_hereditary", "v2x_ex_military", "v2x_ex_party")

message("Loading V-Dem…")
vd <- read_parquet(
  VDEM,
  col_select = all_of(unique(c(
    "country_name", "country_text_id", "year",
    vdem_keys, vdem_struct, "e_gdppc",
    BDM_COLS, SUP_COLS, OPP_COLS, OPPACT_COLS
  )))
) %>%
  filter(year >= 1900) %>%
  mutate(log_gdppc = log(e_gdppc))

# W: mean of four z-scored components, z-scored across the whole panel as in
# analyses/winning_coalition.R. na.rm = FALSE so W is missing unless all four are
# present, matching that script.
zpanel <- function(x) (x - mean(x, na.rm = TRUE)) / sd(x, na.rm = TRUE)
vd <- vd %>%
  mutate(
    closed_succession = -pmax(v2x_ex_hereditary, v2x_ex_military, v2x_ex_party, na.rm = FALSE),
    bdm_W = rowMeans(cbind(zpanel(v2elembaut), zpanel(v2psoppaut),
                           zpanel(v2psbars), zpanel(closed_succession)), na.rm = FALSE)
  )

# Row-wise helpers over a 14-column group block.
norm_shares <- function(m) {
  s <- rowSums(m, na.rm = TRUE)
  s[s == 0] <- NA_real_
  m / s
}
row_entropy <- function(p) {
  # Shannon entropy in nats; 0 when all mass on one group.
  lp <- ifelse(p > 0, p * log(p), 0)
  -rowSums(lp, na.rm = TRUE)
}
row_topk <- function(m, k) {
  apply(m, 1, function(r) {
    r <- sort(r[!is.na(r)], decreasing = TRUE)
    if (length(r) < k) NA_real_ else r[k]
  })
}

sup_m <- as.matrix(vd[SUP_COLS])
oppact_m <- as.matrix(vd[OPPACT_COLS])
sup_p <- norm_shares(sup_m)

# All-NA rows must stay NA rather than becoming 0 from na.rm sums.
sup_ok <- rowSums(!is.na(sup_m)) > 0
opp_ok <- rowSums(!is.na(oppact_m)) > 0
na_if_not <- function(x, ok) ifelse(ok, x, NA_real_)

sup_t1 <- row_topk(sup_m, 1)
sup_t2 <- row_topk(sup_m, 2)

cos_sim <- function(a, b) {
  num <- rowSums(a * b, na.rm = TRUE)
  den <- sqrt(rowSums(a^2, na.rm = TRUE)) * sqrt(rowSums(b^2, na.rm = TRUE))
  ifelse(den > 0, num / den, NA_real_)
}

mass_max <- pmax(sup_m[, MASS_IDX + 1], oppact_m[, MASS_IDX + 1], na.rm = TRUE)
elite_max <- pmax(sup_m[, ELITE_IDX + 1], oppact_m[, ELITE_IDX + 1], na.rm = TRUE)

vd <- vd %>%
  mutate(
    sup_count   = na_if_not(rowSums(sup_m >= 0.5, na.rm = TRUE), sup_ok),
    sup_entropy = na_if_not(row_entropy(sup_p), sup_ok),
    sup_hhi     = na_if_not(rowSums(sup_p^2, na.rm = TRUE), sup_ok),
    sup_top1    = sup_t1,
    sup_gap12   = sup_t1 - sup_t2,
    oppact_count = na_if_not(rowSums(oppact_m >= 0.5, na.rm = TRUE), opp_ok),
    oppact_sum   = na_if_not(rowSums(oppact_m, na.rm = TRUE), opp_ok),
    oppact_top1  = row_topk(oppact_m, 1),
    sup_minus_opp = sup_count - oppact_count,
    sup_opp_overlap = cos_sim(sup_m, oppact_m),
    polgroups_count = na_if_not(
      rowSums(pmax(sup_m, oppact_m, na.rm = TRUE) >= 0.5, na.rm = TRUE),
      sup_ok | opp_ok
    ),
    mass_salience   = na_if_not(rowMeans(mass_max, na.rm = TRUE), sup_ok | opp_ok),
    elite_salience  = na_if_not(rowMeans(elite_max, na.rm = TRUE), sup_ok | opp_ok),
    mass_minus_elite = mass_salience - elite_salience
  )

# ---------------------------------------------------------------------------
# 4. Macro structural variables
# ---------------------------------------------------------------------------

macro_keys <- STRUCTURAL %>% filter(source == "macro") %>% pull(key)
message("Loading macro master…")
mac <- read_parquet(
  MACRO,
  col_select = all_of(c("countrycodeiso", "year", macro_keys))
) %>%
  mutate(year = as.integer(year)) %>%
  rename(country_text_id = countrycodeiso)

vd <- vd %>%
  mutate(year = as.integer(year)) %>%
  left_join(mac, by = c("country_text_id", "year"))

ALL_CAND <- bind_rows(
  CANDIDATES %>% select(key, source, concept, dir, label),
  STRUCTURAL %>% select(key, source, concept, dir, label),
  DERIVED %>% transmute(key, source = "derived", concept, dir, label)
)
cand_keys <- ALL_CAND$key
stopifnot(!any(duplicated(cand_keys)))
missing_cols <- setdiff(cand_keys, names(vd))
if (length(missing_cols)) stop("missing candidate columns: ", paste(missing_cols, collapse = ", "))

# ---------------------------------------------------------------------------
# 5. Merge to PolSett periods
# ---------------------------------------------------------------------------

# PolSett ships a V-Dem country-name crosswalk (`cname_vdem`) — use it rather
# than a name-matching heuristic.
xwalk <- psd_period %>% distinct(cname_psd, cname_vdem)
unmatched <- setdiff(na.omit(xwalk$cname_vdem), unique(vd$country_name))
if (length(unmatched)) message("V-Dem names not matched: ", paste(unmatched, collapse = ", "))

# Expand each period to its years, attach V-Dem, average within period.
period_years <- psd_period %>%
  filter(!is.na(cname_vdem)) %>%
  select(cname_psd, cname_vdem, period, y0, y1) %>%
  rowwise() %>%
  mutate(year = list(seq(y0, y1))) %>%
  ungroup() %>%
  unnest(year)

cand_by_period <- period_years %>%
  left_join(vd %>% select(country_name, year, all_of(cand_keys)),
            by = c("cname_vdem" = "country_name", "year")) %>%
  group_by(cname_psd, period) %>%
  summarise(across(all_of(cand_keys), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(all_of(cand_keys), ~ ifelse(is.finite(.x), .x, NA_real_)))

panel <- psd_period %>%
  inner_join(cand_by_period, by = c("cname_psd", "period")) %>%
  # iso3 for display, from the V-Dem crosswalk
  left_join(vd %>% distinct(country_name, country_text_id),
            by = c("cname_vdem" = "country_name")) %>%
  rename(iso3 = country_text_id)

message("Merged periods: ", nrow(panel), " · countries: ", n_distinct(panel$cname_psd))

# Coverage report per candidate over the labelled panel.
cov <- tibble(
  key = cand_keys,
  cov_panel = map_dbl(cand_keys, ~ mean(!is.na(panel[[.x]])))
)

# ---------------------------------------------------------------------------
# 6. Diagnostics printed to console (the tool recomputes these client-side)
# ---------------------------------------------------------------------------

wcorr <- function(x, y, grp, mode = c("pooled", "between", "within")) {
  mode <- match.arg(mode)
  ok <- is.finite(x) & is.finite(y)
  x <- x[ok]; y <- y[ok]; grp <- grp[ok]
  if (length(unique(grp)) < 3 || length(x) < 10) return(NA_real_)
  if (mode == "between") {
    d <- tibble(g = grp, x, y) %>% group_by(g) %>%
      summarise(x = mean(x), y = mean(y), .groups = "drop")
    if (nrow(d) < 4) return(NA_real_)
    return(suppressWarnings(cor(d$x, d$y)))
  }
  if (mode == "within") {
    d <- tibble(g = grp, x, y) %>% group_by(g) %>%
      mutate(x = x - mean(x), y = y - mean(y)) %>% ungroup()
    return(suppressWarnings(cor(d$x, d$y)))
  }
  suppressWarnings(cor(x, y))
}

message("\n--- Top candidates by |pooled r| per target layer ---")
for (lay in c("sf_powerful", "sf_coopt", "pc_horiz", "pc_vert")) {
  tg <- TARGETS %>% filter(layer == lay) %>% pull(tag) %>% first()
  if (is.na(tg)) next
  ks <- ALL_CAND %>% filter(concept == lay) %>% pull(key)
  res <- map_dfr(ks, ~ tibble(
    key = .x,
    r      = wcorr(panel[[.x]], panel[[tg]], panel$cname_psd, "pooled"),
    r_btwn = wcorr(panel[[.x]], panel[[tg]], panel$cname_psd, "between"),
    r_wthn = wcorr(panel[[.x]], panel[[tg]], panel$cname_psd, "within"),
    cov    = mean(!is.na(panel[[.x]]))
  )) %>% arrange(desc(abs(r)))
  message("\n== ", lay, "  target: ", tg)
  print(as.data.frame(res %>% mutate(across(where(is.numeric), ~ round(.x, 3)))), right = FALSE)
}

# ---------------------------------------------------------------------------
# 7. Global benchmark-year slices (all countries)
# ---------------------------------------------------------------------------

global <- vd %>%
  filter(year %in% BENCH_YEARS, !is.na(country_text_id)) %>%
  select(iso3 = country_text_id, country = country_name, year, all_of(cand_keys))

message("\nGlobal preview rows: ", nrow(global),
        " · countries: ", n_distinct(global$iso3))

# ---------------------------------------------------------------------------
# 8. V-Dem codebook text for the candidate descriptions
# ---------------------------------------------------------------------------

cb <- read_parquet(VDEMCB) %>%
  select(tag, cb_name = name, question, clarification, responses, scale, vartype)

ALL_CAND <- ALL_CAND %>%
  left_join(cb, by = c("key" = "tag")) %>%
  left_join(DERIVED %>% select(key, note), by = "key") %>%
  left_join(cov, by = "key") %>%
  mutate(
    cov_global = map_dbl(key, ~ mean(!is.na(global[[.x]]))),
    # Trim the very long clarifications so the payload stays small.
    clarification = str_trunc(coalesce(clarification, ""), 600),
    question = coalesce(question, ""),
    responses = str_trunc(coalesce(responses, ""), 400),
    scale = coalesce(scale, ""),
    note = coalesce(note, "")
  )

# ---------------------------------------------------------------------------
# 9. Emit
# ---------------------------------------------------------------------------

CONCEPT_META <- tribble(
  ~concept,      ~label,                                     ~definition,
  "sf_powerful", "Powerful population share",
  "PolSett x_totpowerfulpopshare: the share of the adult population that is 'relatively powerful' — potentially disruptive, able to impose costs on the leadership. Capability to disrupt, independent of whether that capability is included in the settlement.",
  "sf_coopt",    "Cooptation vs repression",
  "PolSett x_gencooptscore / x_genviorepscore: whether a bloc's leaders and followers are primarily co-opted — via clientelist material and non-material transfers, programmatic provision, ideological or procedural-democratic legitimation — or primarily repressed.",
  "sf",          "Social foundation size",
  "PolSett x_socialfoundationsize: the percentage of the population that is both potentially powerful AND co-opted under the leadership. Constructed as the sum over the three blocs of (bloc population share) x (share of bloc that is powerful) x (bloc cooptation index), so it is the product of the two layers above.",
  "pc_horiz",    "Horizontal power: coalition vs opposition bloc",
  "PolSett x_horizontalpower: the scale inversion of the relative power of the opposition bloc (OB). High = weak opposition = the governing coalition dominates. The OB includes non-electoral opposition — insurgents, exiled elites, rival factions — not only opposition parties. This is Khan's axis of whether excluded factions hold the upper hand.",
  "pc_vert",     "Vertical power: leader dominance within the coalition",
  "PolSett x_verticalpower: a PCA index over the LB-vs-CLB power ratio, the likelihood the contingent-leadership bloc splits from government, hierarchy within the leader's bloc, and cohesiveness of the leader's bloc. High = the leader personally dominates their own coalition. Maps to Ferguson's unipolar vs multipolar distinction.",
  "pc",          "Power concentration (composite)",
  "PolSett x_powerconcentration_mix: 0.25*horizontal_nor + 0.25*vertical + 0.5*horizontal_nor*vertical, min-max normalised. The composite of the two layers above.",
  "other",       "Context / composite",
  "Regime-type context variables and PolSett composites that combine both axes."
)

payload <- list(
  meta = list(
    generated = format(Sys.time(), "%Y-%m-%d %H:%M"),
    n_periods = nrow(panel),
    n_countries = n_distinct(panel$cname_psd),
    year_range = c(min(panel$y0), max(panel$y1)),
    bench_years = BENCH_YEARS,
    group_labels = GROUP_LABELS
  ),
  concepts = CONCEPT_META,
  targets = TARGETS,
  class_targets = CLASS_TARGETS,
  candidates = ALL_CAND,
  # Rounded to keep the file small; 4dp is far beyond the precision of the data.
  periods = panel %>%
    transmute(
      iso3, country = cname_psd, period, y0, y1, n_years, leader,
      across(all_of(c(TARGETS$tag, RAW_ITEMS, CLASS_TARGETS, cand_keys)),
             ~ round(.x, 4))
    ),
  global = global %>% mutate(across(all_of(cand_keys), ~ round(.x, 4)))
)

json <- toJSON(payload, auto_unbox = TRUE, na = "null", digits = 4)
writeLines(paste0("window.PROXY_DATA = ", json, ";"), OUT)

message("\nWrote ", OUT, " (",
        round(file.size(OUT) / 1024 / 1024, 2), " MB)")
