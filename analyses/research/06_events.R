#!/usr/bin/env Rscript
# Research pipeline, step 6: annual cluster membership, for the event study
# and the outliers tab.
#
# The Ward partition is fitted on six benchmark years. To date transitions
# more finely than a decade, every V-Dem country-year from 1990 to 2025 is
# scored with the same indicators, the same pooled means and SDs, and the
# same mean imputation, then labelled at every cut k by a majority vote of its
# 15 nearest benchmark rows (Euclidean, the same distance as everywhere else).
# Ward clusters are not spheres around a centre, so a nearest-centroid rule
# misplaces 10-14% of the benchmark rows themselves; the k-NN rule follows the
# clusters' actual shapes. Both agreements with the Ward labels are reported
# (leave-one-out for k-NN on the benchmark rows).
#
# Outputs (apps/country-profile/public/research/):
#   annual_membership.parquet  iso3, country_name, year, pc1, ward_k2..k12
#   cx_annual.parquet          iso3, year (2000-2024), eci, diversity, coi,
#                              export_value, gdppc_ppp
#   subregions.json            iso3 -> Atlas subregion, for the ranked economies
#   events_meta.json           agreement of nearest-centroid with Ward labels

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite); library(countrycode) })
setwd("/home/taimur/dev/institutional-complexity")
OUT <- "apps/country-profile/public/research"
J <- readRDS("analyses/research/cache/joint.rds")
K_MAX <- max(J$diag$k)
indicators <- J$indicators$tag
years_bench <- J$years

vdem_raw <- read_parquet("data/shared-data/vdem/vdem.parquet")

# -- Pooled scaling parameters, recomputed from the benchmark rows -----------------
bench <- vdem_raw %>% filter(year %in% years_bench) %>%
  select(country_name, year, all_of(indicators)) %>%
  mutate(p_missing = rowSums(is.na(across(all_of(indicators)))) / length(indicators)) %>%
  filter(p_missing < 0.5) %>% select(-p_missing)
stopifnot(nrow(bench) == nrow(J$M_z))
Mb <- as.matrix(bench[, indicators])
mu <- colMeans(Mb, na.rm = TRUE)
for (j in seq_len(ncol(Mb))) Mb[is.na(Mb[, j]), j] <- mu[j]
sdv <- apply(Mb, 2, sd)
# sanity: reproduce the stored z-matrix
stopifnot(max(abs(scale(Mb, mu, sdv) - J$M_z)) < 1e-8)

# -- Annual z-scores 1990-2025 ------------------------------------------------------
annual <- vdem_raw %>% filter(year >= 1990) %>%
  select(country_name, year, all_of(indicators)) %>%
  mutate(p_missing = rowSums(is.na(across(all_of(indicators)))) / length(indicators)) %>%
  filter(p_missing < 0.5) %>% select(-p_missing)
Ma <- as.matrix(annual[, indicators])
for (j in seq_len(ncol(Ma))) Ma[is.na(Ma[, j]), j] <- mu[j]
Za <- scale(Ma, mu, sdv)

fix_iso <- function(x) countrycode(
  x, origin = "country.name", destination = "iso3c", warn = FALSE,
  custom_match = c("Burma/Myanmar" = "MMR", "Czech Republic" = "CZE",
    "German Democratic Republic" = "DDR", "Hong Kong" = "HKG", "Ivory Coast" = "CIV",
    "Kosovo" = "XKX", "Palestine/Gaza" = "PSE", "Palestine/West Bank" = "PSE",
    "Republic of the Congo" = "COG", "Sao Tome and Principe" = "STP",
    "Somaliland" = NA_character_, "South Vietnam" = NA_character_,
    "Republic of Vietnam" = NA_character_, "Vietnam, Democratic Republic of" = NA_character_,
    "Yemen, People's Republic of" = NA_character_, "South Yemen" = NA_character_,
    "Zanzibar" = NA_character_))

# -- Nearest centroid at every k ------------------------------------------------------
assign_nearest <- function(Z, cl) {
  cents <- t(sapply(sort(unique(cl)), function(c) colMeans(J$M_z[cl == c, , drop = FALSE])))
  # squared distances via expansion
  d2 <- outer(rowSums(Z^2), rowSums(cents^2), "+") - 2 * Z %*% t(cents)
  sort(unique(cl))[apply(d2, 1, which.min)]
}
KNN <- 15
knn_vote <- function(Z, exclude_self = FALSE) {
  d2 <- outer(rowSums(Z^2), rowSums(J$M_z^2), "+") - 2 * Z %*% t(J$M_z)
  if (exclude_self) diag(d2) <- Inf
  nn <- t(apply(d2, 1, function(r) order(r)[1:KNN]))
  sapply(2:K_MAX, function(k) {
    lab <- J$ward[, paste0("ward_k", k)]
    apply(nn, 1, function(ix) { t <- table(lab[ix]); as.integer(names(t)[which.max(t)]) })
  })
}
memb <- knn_vote(Za)
colnames(memb) <- paste0("ward_k", 2:K_MAX)
memb_bench <- knn_vote(J$M_z, exclude_self = TRUE)
agree <- sapply(seq_along(2:K_MAX), function(i) mean(memb_bench[, i] == J$ward[, i]))
memb_cent <- sapply(2:K_MAX, function(k) assign_nearest(J$M_z, J$ward[, paste0("ward_k", k)]))
agree_cent <- sapply(seq_along(2:K_MAX), function(i) mean(memb_cent[, i] == J$ward[, i]))
names(agree) <- names(agree_cent) <- paste0("k", 2:K_MAX)
cat("Leave-one-out k-NN agreement with Ward labels on benchmark rows:\n"); print(round(agree, 3))
cat("Nearest-centroid agreement:\n"); print(round(agree_cent, 3))

pc1 <- as.vector(Za %*% J$pca$rotation[, 1])
annual_out <- tibble(country_name = annual$country_name, iso3 = fix_iso(annual$country_name),
                     year = as.integer(annual$year), pc1 = round(pc1, 3)) %>%
  bind_cols(as_tibble(memb)) %>%
  filter(!is.na(iso3)) %>% arrange(iso3, year, country_name) %>% distinct(iso3, year, .keep_all = TRUE)
write_parquet(annual_out, file.path(OUT, "annual_membership.parquet"), compression = "snappy")
cat("annual_membership.parquet:", nrow(annual_out), "rows,", n_distinct(annual_out$iso3), "countries\n")

# -- Annual Atlas outcomes ------------------------------------------------------------
CACHE <- "/home/taimur/dev/g20/code/output/cache"
countries <- read_parquet(file.path(CACHE, "cx_countries.parquet")) %>% filter(in_rankings)
cxa <- read_parquet(file.path(CACHE, "cx_country_year.parquet")) %>%
  inner_join(countries %>% select(country_id, iso3), by = "country_id") %>%
  transmute(iso3, year = as.integer(year), eci = round(eci, 4), diversity = as.integer(diversity),
            coi = round(coi, 4), export_value = round(export_value), gdppc_ppp = round(gdppc_ppp)) %>%
  arrange(iso3, year)
write_parquet(cxa, file.path(OUT, "cx_annual.parquet"), compression = "snappy")
cat("cx_annual.parquet:", nrow(cxa), "rows\n")

write_json(setNames(as.list(countries$subregion), countries$iso3), file.path(OUT, "subregions.json"), auto_unbox = TRUE, pretty = TRUE)
write_json(list(agreement_knn = as.list(round(agree, 3)), agreement_centroid = as.list(round(agree_cent, 3)), knn = KNN, years = c(1990L, max(annual_out$year)),
                n_countries = n_distinct(annual_out$iso3)),
           file.path(OUT, "events_meta.json"), auto_unbox = TRUE, pretty = TRUE)
cat("Done.\n")
