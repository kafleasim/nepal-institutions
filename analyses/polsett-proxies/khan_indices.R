# Concept-first indices for Khan's horizontal and vertical power, unipolar vs
# multipolar authority, and (as a side reading) elite vs organised non-elite power.
#
# Method, deliberately unlike evaluate.R: nothing here is fitted to PolSett.
# Each concept is split into "lenses" — distinct channels through which the
# concept should show up — and each lens is an equal-weight mean of z-scored
# components whose signs are fixed in advance from the concept. z-scores are taken
# over the global country-year panel 1960-2019, so the scale is anchored on the
# world, not on the PolSett sample.
#
# Lenses are combined according to the logic of each concept (AGG below):
#   H, U  weakest channel. Excluded factions can hold power through ballots, arms
#         or the street, and authority can be split by formal veto players, by
#         bodies able to remove the leader, or territorially; one channel is
#         enough. These lenses are substitutes, so they are not expected to
#         correlate, and in the data they do not (or correlate negatively).
#   V     mean. The party and personal lenses are two observations of the same
#         thing — the top's command over lower-level factions.
# A clientelism "rents" lens was tried for V and dropped: it measures how loyalty
# is bought, not who holds bargaining power, and it is unrelated to PolSett
# (r = 0.02), which is consistent with that reading.
#
# Validation then runs in three steps, in this order:
#   1. coherence: do components agree with their own lens; how do lenses relate?
#   2. discriminant validity: is the index more than generic democracy?
#   3. agreement with PolSett, reported as a result rather than an objective.
# Disagreements — between lenses, or between an index and PolSett — are kept as
# the material for case-level puzzles.
#
# Reads khan_global.rds and khan_panel.rds from khan_build.R.

suppressMessages({ library(tidyverse) })
setwd("/home/taimur/dev/institutional-complexity/analyses/polsett-proxies")

G <- readRDS("khan_global.rds") %>% mutate(log_hos_tenure = log1p(hos_tenure))
K <- readRDS("khan_panel.rds")

# ---------------------------------------------------------------------------
# 1. Concept specification
# ---------------------------------------------------------------------------
# Orientation: H high = ruling coalition dominates excluded factions; V high =
# leadership dominates lower-level factions of its own coalition; U high = one
# centre of authority; E high = elites dominate organised non-elites.

SPEC <- tribble(
  ~index, ~lens,        ~key,                ~sign, ~why,
  # Horizontal: holding power of excluded factions, read through three channels
  # through which excluded factions can impose costs on the coalition.
  "H", "electoral",   "seat_gap",           1, "Seat margin over the largest excluded party",
  "H", "electoral",   "elect_turnover_20y",-1, "Executive lost to the opposition at elections, last 20 years",
  "H", "electoral",   "vote_gap",           1, "Vote margin over the largest excluded party",
  "H", "electoral",   "pres_gap",           1, "Presidential margin over the runner-up",
  "H", "armed",       "terr_uncontrolled", -1, "Territory held by non-state armed actors",
  "H", "armed",       "ucdp_internal",     -1, "Internal armed conflict",
  "H", "armed",       "coup_att_10y",      -1, "Coup attempts, last 10 years",
  "H", "armed",       "v2caviol",          -1, "Political violence by non-state actors",
  "H", "social",      "v2regoppgroupssize",-1, "Share of population in noteworthy opposition",
  "H", "social",      "opp_count",         -1, "Social groups in active opposition",
  "H", "social",      "pivot_balance",      1, "Pivotal group backs rather than opposes the regime",
  # Vertical: can the top of the coalition discipline its lower-level factions.
  "V", "party",       "v2pscnslnl",        -1, "Candidates picked by national leaders, not local organisers",
  "V", "party",       "v2pscohesv",         1, "Legislators vote with their party",
  "V", "personal",    "qog_chisols_per",    1, "Personalist regime",
  "V", "personal",    "v2exl_legitlead",    1, "Regime legitimated by the person of the leader",
  "V", "personal",    "log_hos_tenure",     1, "Head-of-state tenure (log years)",
  # Unipolar vs multipolar: how many centres of authority can block or remove the
  # leadership, whether inside or outside the coalition.
  "U", "formal",      "qog_h_polcon3",     -1, "Independent veto players (Henisz)",
  "U", "formal",      "v2juhcind",         -1, "High court independence",
  "U", "formal",      "v2lginvstp",        -1, "Legislature would investigate the executive",
  "U", "formal",      "v2x_divparctrl",    -1, "Divided party control",
  "U", "executive",   "hos_unremovable",    1, "No body could remove the head of state",
  "U", "executive",   "hos_removers",      -1, "Bodies able to remove the head of state",
  "U", "executive",   "hog_noapproval",     1, "Head of government seeks no body's approval",
  "U", "executive",   "hog_approvers",     -1, "Bodies whose approval the HOG seeks",
  "U", "territorial", "v2x_feduni",        -1, "Autonomous elected subnational government",
  "U", "territorial", "v2elrgpwr",         -1, "Elected regional offices hold real power",
  "U", "territorial", "v2clrgunev",         1, "Rule applied uniformly across regions",
  # Elite vs organised non-elite: the looser reading of the vertical dimension.
  "E", "elite",       "v2pepwrses",        -1, "Power distributed by wealth",
  "E", "elite",       "v2csprtcpt",        -1, "Ordinary people take part in CSOs",
  "E", "elite",       "v2cscnsult",        -1, "Policymakers consult CSOs"
)

stopifnot(all(SPEC$key %in% names(G)))

AGG <- c(H = "min", V = "mean", U = "min", E = "mean")

# ---------------------------------------------------------------------------
# 2. Build the indices on the global country-year panel
# ---------------------------------------------------------------------------

ref <- G %>% filter(year <= 2019)
mu <- map_dbl(SPEC$key, ~ mean(ref[[.x]], na.rm = TRUE))
sdv <- map_dbl(SPEC$key, ~ sd(ref[[.x]], na.rm = TRUE))
names(mu) <- names(sdv) <- SPEC$key

zsigned <- function(d) {
  for (i in seq_len(nrow(SPEC))) {
    k <- SPEC$key[i]
    d[[paste0("z_", k, "_", SPEC$index[i])]] <- SPEC$sign[i] * (d[[k]] - mu[k]) / sdv[k]
  }
  d
}
# A lens needs at least half its components; an index needs at least two lenses
# (E has one lens, so one).
build <- function(d) {
  d <- zsigned(d)
  lenses <- SPEC %>% distinct(index, lens)
  for (j in seq_len(nrow(lenses))) {
    s <- SPEC %>% filter(index == lenses$index[j], lens == lenses$lens[j])
    m <- as.matrix(d[paste0("z_", s$key, "_", s$index)])
    v <- rowMeans(m, na.rm = TRUE)
    v[rowSums(!is.na(m)) < ceiling(nrow(s) / 2)] <- NA
    d[[paste(lenses$index[j], lenses$lens[j], sep = "_")]] <- v
  }
  for (ix in unique(SPEC$index)) {
    cols <- paste(ix, unique(SPEC$lens[SPEC$index == ix]), sep = "_")
    m <- as.matrix(d[cols])
    v <- if (AGG[[ix]] == "min") suppressWarnings(apply(m, 1, min, na.rm = TRUE)) else rowMeans(m, na.rm = TRUE)
    v[!is.finite(v) | rowSums(!is.na(m)) < min(2, length(cols))] <- NA
    d[[ix]] <- v
  }
  d
}

LENS_COLS <- SPEC %>% distinct(index, lens) %>% transmute(col = paste(index, lens, sep = "_"), index)
IDX <- c("H", "V", "U", "E")
# Signed component z-scores, kept so any value can be decomposed into its inputs.
Z_COLS <- paste0("z_", SPEC$key, "_", SPEC$index)

Gi <- build(G)
saveRDS(Gi %>% select(country_name, country_text_id, year, all_of(LENS_COLS$col), all_of(IDX), all_of(Z_COLS),
                      v2x_polyarchy), "khan_indices.rds")

# Period level: average the yearly index over the PolSett period, same as the
# component collapse in khan_build.R.
Ki <- K$panel %>%
  select(cname_psd, cname_vdem, iso3, period, y0, y1, leader,
         x_horizontalpower, x_verticalpower, x_khansettlementype, q8_hierarchy_lb,
         unipolar, threat_breadth, subord_threat, v2x_polyarchy) %>%
  inner_join(Gi %>% select(country_name, year, all_of(LENS_COLS$col), all_of(IDX), all_of(Z_COLS)),
             by = c("cname_vdem" = "country_name"), relationship = "many-to-many") %>%
  filter(year >= y0, year <= y1) %>%
  group_by(across(c(cname_psd, iso3, period, y0, y1, leader, x_horizontalpower, x_verticalpower,
                    x_khansettlementype, q8_hierarchy_lb, unipolar, threat_breadth,
                    subord_threat, v2x_polyarchy))) %>%
  summarise(across(all_of(c(LENS_COLS$col, IDX, Z_COLS)), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(all_of(c(LENS_COLS$col, IDX, Z_COLS)), ~ ifelse(is.finite(.x), .x, NA_real_)))
saveRDS(Ki, "khan_periods.rds")

r2 <- function(x) sprintf("%.2f", x)
cor_p <- function(a, b) suppressWarnings(cor(a, b, use = "pairwise.complete.obs"))

# ---------------------------------------------------------------------------
# 3. Coherence: lens intercorrelations within each concept
# ---------------------------------------------------------------------------

cat("\n=========== 1. COHERENCE — lens intercorrelations (global country-years 1960-2019) ===========\n")
ref_i <- Gi %>% filter(year <= 2019)
for (ix in IDX) {
  cols <- LENS_COLS$col[LENS_COLS$index == ix]
  cat("\n", ix, " coverage of index:", r2(mean(!is.na(ref_i[[ix]]))), "\n")
  if (length(cols) > 1) print(round(cor(ref_i[cols], use = "pairwise.complete.obs"), 2))
  # Component-level: do components load in the intended direction on their lens?
  s <- SPEC %>% filter(index == ix)
  comp <- map_dfr(seq_len(nrow(s)), function(i) {
    lc <- paste(ix, s$lens[i], sep = "_")
    tibble(lens = s$lens[i], key = s$key[i],
           r_with_own_lens = cor_p(s$sign[i] * ref_i[[s$key[i]]], ref_i[[lc]]),
           coverage = mean(!is.na(ref_i[[s$key[i]]])))
  })
  print(as.data.frame(comp %>% mutate(across(where(is.numeric), ~ round(.x, 2)))), right = FALSE)
}

cat("\n=========== 2. DISCRIMINANT — correlation with electoral democracy (v2x_polyarchy) ===========\n")
dd <- tibble(col = c(LENS_COLS$col, IDX),
             r_polyarchy_global = map_dbl(col, ~ cor_p(ref_i[[.x]], ref_i$v2x_polyarchy)),
             r_polyarchy_polsett = map_dbl(col, ~ cor_p(Ki[[.x]], Ki$v2x_polyarchy)))
print(as.data.frame(dd %>% mutate(across(where(is.numeric), ~ round(.x, 2)))), right = FALSE)
cat("\nIndex intercorrelations (global):\n")
print(round(cor(ref_i[IDX], use = "pairwise.complete.obs"), 2))

# ---------------------------------------------------------------------------
# 4. Agreement with PolSett
# ---------------------------------------------------------------------------
# Pooled r over country-periods, then split into between-country (country means)
# and within-country (deviations from country means) to see where agreement comes
# from. Ceiling = sqrt(inter-coder reliability) from reliability.R where known.

decomp <- function(d, a, b) {
  d <- d %>% filter(!is.na(.data[[a]]), !is.na(.data[[b]]))
  bw <- d %>% group_by(cname_psd) %>% summarise(ma = mean(.data[[a]]), mb = mean(.data[[b]]), .groups = "drop")
  wi <- d %>% group_by(cname_psd) %>% mutate(da = .data[[a]] - mean(.data[[a]]), db = .data[[b]] - mean(.data[[b]])) %>% ungroup()
  tibble(n = nrow(d), r = cor(d[[a]], d[[b]]), r_between = cor(bw$ma, bw$mb), r_within = cor(wi$da, wi$db))
}

PAIRS <- tribble(
  ~ours, ~polsett,              ~ceiling,
  "H",   "x_horizontalpower",   0.69,
  "V",   "x_verticalpower",     0.82,
  "V",   "q8_hierarchy_lb",     NA,
  "U",   "unipolar",            NA,
  "U",   "threat_breadth",      NA,
  "U",   "x_verticalpower",     0.82,
  "E",   "subord_threat",       NA
)
cat("\n=========== 3. AGREEMENT WITH POLSETT (country-periods) ===========\n")
agree <- pmap_dfr(PAIRS, function(ours, polsett, ceiling) {
  cols <- c(ours, LENS_COLS$col[LENS_COLS$index == ours])
  map_dfr(cols, ~ bind_cols(tibble(ours = .x, polsett = polsett, ceiling = ceiling), decomp(Ki, .x, polsett)))
})
print(as.data.frame(agree %>% mutate(across(where(is.double), ~ round(.x, 2)))), right = FALSE)

# Khan typology: both axes cut at the PolSett-sample median of our index, so the
# two classifications have comparable base rates.
kt <- Ki %>% filter(!is.na(H), !is.na(V), !is.na(x_khansettlementype)) %>%
  mutate(hd = H >= median(H), vd = V >= median(V),
         ours = case_when(hd & vd ~ 1, !hd & vd ~ 2, !hd & !vd ~ 3, hd & !vd ~ 4))
lab <- c("1 Strong-dominant", "2 Vulnerable-auth.", "3 Competitive-cl.", "4 Weak-dominant")
cat("\nKhan typology, ours (cols) vs PolSett (rows), n =", nrow(kt), "\n")
print(table(PolSett = factor(kt$x_khansettlementype, 1:4, lab), Ours = factor(kt$ours, 1:4, lab)))
po <- mean(kt$ours == kt$x_khansettlementype)
pe <- sum(prop.table(table(factor(kt$ours, 1:4))) * prop.table(table(factor(kt$x_khansettlementype, 1:4))))
cat("Agreement", r2(po), " · chance", r2(pe), " · kappa", r2((po - pe) / (1 - pe)),
    " · modal-class baseline", r2(max(prop.table(table(kt$x_khansettlementype)))), "\n")
cat("Horizontal axis agreement:", r2(mean(kt$hd == (kt$x_horizontalpower >= 3.28))),
    " · vertical axis agreement:", r2(mean(kt$vd == (kt$x_verticalpower >= 0.44))), "\n")
