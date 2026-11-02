# How much of PolSett is signal? Inter-coder reliability, and the ceiling it
# imposes on any external proxy.
#
# Motivation: hand-picked V-Dem proxies recover PolSett's cooptation layer
# (LOCO R² ≈ 0.5) but not its power-distribution layer (≈ 0.1-0.2). One reading
# is that V-Dem lacks the signal. Another is that PolSett's power items are
# themselves noisily coded — roughly 4 experts per country-period, on quantities
# the codebook itself calls "educated guesstimates" — so no proxy could correlate
# well with them.
#
# The classical-test-theory bound: if the published country-period value is
# X_obs = X_true + e with reliability R, then for any perfectly measured proxy P,
#   |r(X_obs, P)| <= sqrt(R) * |r(X_true, P)| <= sqrt(R).
# So sqrt(R) is the most any external indicator could achieve. Comparing the
# observed proxy correlations against sqrt(R) separates "V-Dem is the wrong
# instrument" from "the target is too noisy to hit".
#
# Reliability of the k-coder mean is estimated from a one-way random-effects
# decomposition with country-period as the grouping factor:
#   R = (MSB - MSW) / MSB      [ICC(1,k)]
# which is exactly the reliability of the group mean under a balanced design.

suppressMessages({ library(tidyverse); library(haven) })
setwd("/home/taimur/dev/institutional-complexity")

CODER <- "~/dev/shared-data/polsett/psd_coder_level_v1.dta"

message("Loading coder-level PolSett (this file is large)…")
cl <- read_dta(CODER)

labels <- map_chr(cl, ~ { l <- attr(.x, "label"); if (is.null(l)) NA_character_ else as.character(l) })

# One row per coder per country-period. The file is country-YEAR by coder, and
# values are period-constant, so collapse to country-period-coder first.
items <- names(cl) %>% keep(~ grepl("^q[0-9]+_", .x)) %>%
  discard(~ grepl("_confidence$|_nr$|_sd$|_sm$|_wm$|_rsd$|_wsd$", .x))

cp <- cl %>%
  transmute(
    cp = paste(cname_psd, periodnumber, sep = "|"),
    country = cname_psd,
    coder = coder_id,
    across(all_of(items), as.numeric)
  ) %>%
  group_by(cp, country, coder) %>%
  summarise(across(all_of(items), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(all_of(items), ~ ifelse(is.finite(.x), .x, NA_real_)))

message("Country-period-coder rows: ", nrow(cp),
        " · country-periods: ", n_distinct(cp$cp),
        " · coders: ", n_distinct(cp$coder))

# --- Per-item reliability of the k-coder mean --------------------------------

item_reliability <- function(v, grp) {
  d <- tibble(v, grp) %>% filter(!is.na(v))
  # Need at least two coders in a group to separate within from between.
  d <- d %>% group_by(grp) %>% filter(n() >= 2) %>% ungroup()
  if (n_distinct(d$grp) < 10) return(NULL)
  g <- d %>% group_by(grp) %>% summarise(n = n(), m = mean(v), ss = sum((v - mean(v))^2), .groups = "drop")
  N <- nrow(d); k_bar <- mean(g$n); ngrp <- nrow(g)
  grand <- mean(d$v)
  # Between mean square uses group sizes as weights; within pools the deviations.
  msb <- sum(g$n * (g$m - grand)^2) / (ngrp - 1)
  msw <- sum(g$ss) / (N - ngrp)
  if (!is.finite(msb) || !is.finite(msw) || msb <= 0) return(NULL)
  icc1 <- (msb - msw) / (msb + (k_bar - 1) * msw)
  r_kmean <- (msb - msw) / msb
  tibble(n_cp = ngrp, k = k_bar,
         icc1 = icc1,
         reliability = max(0, r_kmean),
         ceiling = sqrt(max(0, r_kmean)),
         cv_within = sqrt(msw) / abs(grand))
}

rel <- map_dfr(items, ~ {
  r <- item_reliability(cp[[.x]], cp$cp)
  if (is.null(r)) return(NULL)
  bind_cols(tibble(item = .x, label = labels[[.x]]), r)
})

# --- Layer assignment --------------------------------------------------------
# Which survey items feed which PolSett construct (codebook 4.1, 4.2).

LAYER_ITEMS <- list(
  pc_horiz = c("q2_power_ob"),
  pc_vert  = c("q2_power_lb", "q2_power_clb", "q3_clbsplit",
               "q8_hierarchy_lb", "q9_cohesiveness_lb"),
  sf_powerful = c("q1_populationshare_lb", "q1_populationshare_clb", "q1_populationshare_ob",
                  "q7_powerlesspercentage_lb", "q7_powerlesspercentage_clb", "q7_powerlesspercentage_ob"),
  sf_coopt = grep("^q1[01]_", items, value = TRUE)
)

rel <- rel %>%
  mutate(layer = map_chr(item, function(it) {
    hit <- names(LAYER_ITEMS)[map_lgl(LAYER_ITEMS, ~ it %in% .x)]
    if (length(hit)) hit[1] else "other"
  }))

cat("\n\n================ PER-ITEM RELIABILITY, KEY ITEMS ================\n")
key <- rel %>% filter(layer != "other") %>% arrange(layer, desc(reliability))
print(as.data.frame(key %>%
  transmute(layer, item, k = round(k, 1), n_cp,
            icc1 = round(icc1, 3), reliability = round(reliability, 3),
            ceiling = round(ceiling, 3))), right = FALSE)

cat("\n\n================ LAYER SUMMARY (mean over items) ================\n")
print(as.data.frame(rel %>% filter(layer != "other") %>% group_by(layer) %>%
  summarise(n_items = n(), k = round(mean(k), 1),
            icc1 = round(mean(icc1), 3),
            reliability = round(mean(reliability), 3),
            ceiling = round(mean(ceiling), 3), .groups = "drop") %>%
  arrange(desc(reliability))), right = FALSE)

# --- Index-level reliability -------------------------------------------------
# Item-level reliability understates the indices, because most PolSett indices
# average many items and averaging cancels independent coder error. The relevant
# ceiling is therefore at the index level. Each index is rebuilt per coder from
# the codebook formulas, validated against the published aggregate, then
# split-half tested.

set.seed(1)
zs <- function(x) { s <- sd(x, na.rm = TRUE); if (!is.finite(s) || s == 0) return(x * 0); (x - mean(x, na.rm = TRUE)) / s }
inv4 <- function(x) 5 - x   # scale inversion on the 1-4 response scale

# The five q10/q11 positive-cooptation channels, per bloc and per leaders/followers.
coopt_channels <- function(bloc, who) {
  stem <- if (who == "lead") "q10" else "q11"
  suffix <- if (who == "lead") "lead" else "foll"
  paste0(stem, "_", c("clientmatcoopt", "clientnonmat", "progmatlegit", "ideologlegit", "demlegit"),
         suffix, "_", bloc)
}
# 4.2.23-4.2.28: 0.3*inv(violent) + 0.2*inv(non-violent) + 0.25*max(channels) + 0.25*mean(channels)
joined <- function(d, bloc, who) {
  stem <- if (who == "lead") "q10" else "q11"
  suffix <- if (who == "lead") "lead" else "foll"
  viol <- d[[paste0(stem, "_violrepress", suffix, "_", bloc)]]
  nonviol <- d[[paste0(stem, "_nonviolrepress", suffix, "_", bloc)]]
  ch <- as.matrix(d[, coopt_channels(bloc, who)])
  0.3 * inv4(viol) + 0.2 * inv4(nonviol) +
    0.25 * apply(ch, 1, max, na.rm = FALSE) + 0.25 * rowMeans(ch)
}

build_indices <- function(d) {
  # 4.2.29-4.2.31: bloc cooptation index, min-max on the theoretical 1-4 range
  bloc_idx <- function(bloc) ((0.5 * joined(d, bloc, "lead") + 0.5 * joined(d, bloc, "foll")) - 1) / 3
  # 4.2.5-4.2.8: powerful share of the total population, summed over blocs
  pshare <- function(bloc) (100 - d[[paste0("q7_powerlesspercentage_", bloc)]]) *
    d[[paste0("q1_populationshare_", bloc)]] / 100
  mm <- function(x) { r <- range(x, na.rm = TRUE); (x - r[1]) / (r[2] - r[1]) }
  # 4.1.1: scale inversion of the relative power of the opposition bloc
  horiz <- 6 - d$q2_power_ob
  # 4.1.5: PCA-weighted index over four items, weights from the codebook
  vert <- 0.52 * zs(d$q2_power_lb / d$q2_power_clb) + 0.50 * zs(d$q3_clbsplit) +
          0.43 * zs(d$q8_hierarchy_lb) + 0.54 * zs(d$q9_cohesiveness_lb)
  h_nor <- mm(horiz); v_nor <- mm(vert)
  tibble(
    cp = d$cp, country = d$country, coder = d$coder,
    horiz = horiz, vert = vert,
    powerful = pshare("lb") + pshare("clb") + pshare("ob"),
    # 4.2.42: governing coalition and opposition bloc weighted equally
    coopt = 0.25 * bloc_idx("lb") + 0.25 * bloc_idx("clb") + 0.5 * bloc_idx("ob"),
    # 4.2.35: social foundation size, the product of the powerful and coopted layers
    sfs = bloc_idx("lb") * pshare("lb") + bloc_idx("clb") * pshare("clb") +
          bloc_idx("ob") * pshare("ob"),
    # 4.1.9: power concentration, mixed additive/multiplicative form
    pc = 0.25 * h_nor + 0.25 * v_nor + 0.5 * h_nor * v_nor
  )
}

idx <- build_indices(cp)
INDEX_TARGET <- c(horiz = "x_horizontalpower", vert = "x_verticalpower",
                  powerful = "x_totpowerfulpopshare", coopt = "x_gencooptscore",
                  sfs = "x_socialfoundationsize", pc = "x_powerconcentration_mix")

# Validate the reconstruction: the unweighted coder mean should track the
# published distance- and confidence-weighted aggregate closely. The codebook
# reports the three aggregation variants correlate at 0.98-0.99, so anything
# below about 0.9 here means the formula was misread.
pub <- read_dta("~/dev/shared-data/polsett/psd_main_aggregated_v1.dta") %>%
  transmute(cp = paste(cname_psd, periodnumber, sep = "|"),
            across(all_of(unname(INDEX_TARGET)), as.numeric)) %>%
  group_by(cp) %>% summarise(across(everything(), ~ mean(.x, na.rm = TRUE)), .groups = "drop")

recon <- idx %>% group_by(cp) %>%
  summarise(across(all_of(names(INDEX_TARGET)), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  left_join(pub, by = "cp")

cat("\n\n================ RECONSTRUCTION CHECK ================\n")
cat("Correlation of the unweighted coder mean with the published aggregate:\n\n")
for (nm in names(INDEX_TARGET)) {
  r <- suppressWarnings(cor(recon[[nm]], recon[[INDEX_TARGET[[nm]]]], use = "complete.obs"))
  n <- sum(complete.cases(recon[[nm]], recon[[INDEX_TARGET[[nm]]]]))
  cat(sprintf("  %-9s vs %-26s r = %6.3f  (n = %d)%s\n", nm, INDEX_TARGET[[nm]], r, n,
              if (is.finite(r) && r < 0.9) "   <-- reconstruction suspect" else ""))
}

# Split-half over coders, averaged across random splits, Spearman-Brown corrected.
split_half_index <- function(col, min_coders = 4, reps = 60) {
  d <- idx %>% select(cp, coder, v = all_of(col)) %>% filter(is.finite(v)) %>%
    group_by(cp) %>% filter(n() >= min_coders) %>% ungroup()
  if (n_distinct(d$cp) < 10) return(c(NA_real_, NA_real_, n_distinct(d$cp)))
  rs <- map_dbl(seq_len(reps), function(i) {
    h <- d %>% group_by(cp) %>%
      mutate(half = sample(rep(1:2, length.out = n()))) %>%
      group_by(cp, half) %>% summarise(m = mean(v), .groups = "drop") %>%
      pivot_wider(names_from = half, values_from = m, names_prefix = "h") %>%
      filter(is.finite(h1), is.finite(h2))
    if (nrow(h) < 10) return(NA_real_)
    suppressWarnings(cor(h$h1, h$h2))
  })
  r <- mean(rs, na.rm = TRUE)
  # Each half holds k/2 coders; correct up to the full k.
  c(r, 2 * r / (1 + r), n_distinct(d$cp))
}

# Primary estimate is the ICC, not split-half: the mean coder count is about 3,
# so requiring >= 4 coders for a balanced split leaves only 14-39 country-periods
# and the resulting correlations are noise. The one-way random-effects estimator
# handles unbalanced groups and uses every country-period with >= 2 coders.
cat("\n\n================ INDEX-LEVEL RELIABILITY (ICC) ================\n")
cat("Reliability of the k-coder mean, all country-periods with >= 2 coders.\n\n")
irel <- map_dfr(names(INDEX_TARGET), function(nm) {
  r <- item_reliability(idx[[nm]], idx$cp)
  if (is.null(r)) return(tibble(index = nm))
  bind_cols(tibble(index = nm, target = INDEX_TARGET[[nm]]), r)
})
print(as.data.frame(irel %>%
  transmute(index, target, n_cp, k = round(k, 1), icc1 = round(icc1, 3),
            reliability = round(reliability, 3), ceiling = round(ceiling, 3))), right = FALSE)

cat("\nceiling = sqrt(reliability) is the largest correlation any perfectly\n")
cat("measured external proxy could show against the published index.\n")

# Split-half, reported only as a sanity check on the ICC, with its sample size
# shown so the small-n caveat is visible.
cat("\n-- split-half cross-check (>= 3 coders, unbalanced 2:1 splits) --\n")
sh <- map_dfr(names(INDEX_TARGET), function(nm) {
  v <- split_half_index(nm, min_coders = 3)
  tibble(index = nm, n_cp = v[3], r_halves = round(v[1], 3),
         reliability = round(v[2], 3))
})
print(as.data.frame(sh), right = FALSE)
cat("Treat these as indicative only: with k ~ 3 the halves are 2 coders vs 1,\n")
cat("so Spearman-Brown is being pushed well past what the design supports.\n")

# --- Coder disagreement in raw units, for the population-share items --------
# These are the most interpretable: coders are asked for a percentage of the
# population, so the within-period spread is directly readable.

cat("\n\n================ RAW DISAGREEMENT, POPULATION-SHARE ITEMS ================\n")
for (it in c("q1_populationshare_lb", "q1_populationshare_clb", "q1_populationshare_ob",
             "q2_power_ob", "q9_cohesiveness_lb")) {
  d <- cp %>% select(cp, v = all_of(it)) %>% filter(!is.na(v)) %>%
    group_by(cp) %>% filter(n() >= 2) %>%
    summarise(n = n(), sd = sd(v), rng = diff(range(v)), .groups = "drop")
  cat(sprintf("%-28s n_cp=%4d  median within-period SD=%6.2f  median range=%6.2f  mean range=%6.2f\n",
              it, nrow(d), median(d$sd), median(d$rng), mean(d$rng)))
}

saveRDS(rel, "analyses/polsett-proxies/reliability_items.rds")
cat("\nWrote analyses/polsett-proxies/reliability_items.rds\n")
