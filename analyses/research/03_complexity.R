#!/usr/bin/env Rscript
# Research pipeline, step 3: institutional clusters against economic complexity.
#
# Inputs beyond step 1: the world complexity panel cached from the Atlas DB by
# the g20 project (~/dev/g20/code/output/cache: country-year ECI/COI/diversity/
# GDP, country-product-year RCA/density/PCI, 2000-2024) and the Atlas product
# table with product-space coordinates and the eight product-space communities
# (~/dev/g20/app/public/data/products.parquet). Read only; nothing is re-derived.
#
# Institutional benchmark years are matched to Atlas years: 2005->2005,
# 2015->2015, 2025->2023 (the latest Atlas year with settled data).
#
# Outputs (apps/country-profile/public/research/):
#   cx_country.parquet   one row per country x Atlas year: ECI, COI, diversity,
#                        GDP per head, Ward labels at the matched benchmark year,
#                        basket shares by product-space community, entry counts
#   cx_pairs.parquet     one row per country pair (2023): Jaccard similarity of
#                        RCA>=1 baskets, of 2013->2023 entry sets, income terciles
#   entries.json         per k and cluster: density gradient of entry, PCI and
#                        density of entered products, products entered in common
#   cx_meta.json         product-space community names, windows, thresholds

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite); library(fixest) })
setwd("/home/taimur/dev/institutional-complexity")
J <- readRDS("analyses/research/cache/joint.rds")
K_MAX <- max(J$diag$k)
CACHE <- "/home/taimur/dev/g20/code/output/cache"

ps_names <- c("0" = "Agriculture", "1" = "Construction", "2" = "Electronics",
              "3" = "Chemicals & metals", "4" = "Machinery", "5" = "Minerals",
              "6" = "Apparel", "7" = "Textile & home")

countries <- read_parquet(file.path(CACHE, "cx_countries.parquet")) %>% filter(in_rankings)
cy  <- read_parquet(file.path(CACHE, "cx_country_year.parquet")) %>%
  inner_join(countries %>% select(country_id, iso3), by = "country_id")
cpy <- read_parquet(file.path(CACHE, "cx_country_product_year.parquet")) %>%
  filter(year %in% c(2003, 2005, 2013, 2015, 2022, 2023)) %>%
  inner_join(countries %>% select(country_id, iso3), by = "country_id")
prod <- read_parquet("/home/taimur/dev/g20/app/public/data/products.parquet") %>%
  transmute(product = code, name_short, sector, ps = as.integer(cluster),
            ps_x = product_space_x, ps_y = product_space_y)
pci <- read_parquet(file.path(CACHE, "cx_product_year.parquet"))

# Institutional labels: one row per iso3-year (Palestine's two V-Dem units
# collapse to PSE; keep the first by name).
inst <- J$keys %>% select(country_name, iso3, year) %>%
  bind_cols(as_tibble(J$ward)) %>%
  filter(!is.na(iso3)) %>% arrange(iso3, year, country_name) %>%
  distinct(iso3, year, .keep_all = TRUE)
year_map <- c("2005" = 2005, "2015" = 2015, "2023" = 2025)

# -- A. Country x Atlas-year table -------------------------------------------------
basket <- cpy %>% filter(year %in% c(2005, 2015, 2023)) %>%
  inner_join(prod %>% select(product, ps), by = "product") %>%
  group_by(iso3, year) %>%
  mutate(has = rca >= 1, tot_val = sum(value, na.rm = TRUE)) %>%
  group_by(iso3, year, ps) %>%
  summarise(n_rca = sum(has), val = sum(value, na.rm = TRUE), tot_val = first(tot_val), .groups = "drop") %>%
  group_by(iso3, year) %>%
  mutate(share_n = n_rca / pmax(sum(n_rca), 1), share_val = val / pmax(tot_val, 1)) %>%
  ungroup()
basket_wide <- basket %>%
  select(iso3, year, ps, share_n, share_val) %>%
  pivot_wider(names_from = ps, values_from = c(share_n, share_val), names_sep = "_ps", values_fill = 0)

# Mean PCI of the RCA>=1 basket, unweighted (a complexity measure that does not
# use the ECI normalisation)
basket_pci <- cpy %>% filter(year %in% c(2005, 2015, 2023), rca >= 1) %>%
  inner_join(pci, by = c("year", "product")) %>%
  group_by(iso3, year) %>% summarise(basket_pci = mean(pci, na.rm = TRUE), n_rca = n(), .groups = "drop")

# -- B. Entries: candidates at t0 (RCA < 0.5), entered if RCA >= 1 at t1 and t1-1 --
windows <- list(c(2003, 2013), c(2013, 2023))
entries <- map_dfr(windows, function(w) {
  t0 <- w[1]; t1 <- w[2]
  a <- cpy %>% filter(year == t0) %>% select(iso3, product, rca0 = rca, density0 = density)
  b <- cpy %>% filter(year == t1) %>% select(iso3, product, rca1 = rca)
  b_prev <- cpy %>% filter(year == t1 - 1) %>% select(iso3, product, rca1p = rca)
  a %>% inner_join(b, by = c("iso3", "product")) %>%
    left_join(b_prev, by = c("iso3", "product")) %>%
    filter(!is.na(rca0), rca0 < 0.5, !is.na(density0)) %>%
    mutate(entered = as.integer(rca1 >= 1 & coalesce(rca1p, rca1) >= 1),
           window = paste0(t0, "-", t1), t0 = t0, t1 = t1) %>%
    inner_join(pci %>% filter(year == t1) %>% select(product, pci1 = pci), by = "product") %>%
    inner_join(prod %>% select(product, ps), by = "product")
})
cat("Entry candidates:", nrow(entries), " entries:", sum(entries$entered), "\n")

# Pooled entry model: entry on density with window fixed effects. Predicted
# probabilities give an "expected entries" count per country from density alone.
pooled <- feols(entered ~ density0 | window, data = entries, cluster = ~iso3)
entries$p_hat <- pmax(predict(pooled), 0)
country_entries <- entries %>%
  group_by(iso3, window, t0, t1) %>%
  summarise(n_candidates = n(), n_entries = sum(entered), expected_entries = sum(p_hat),
            entry_pci = mean(pci1[entered == 1]), entry_density = mean(density0[entered == 1]),
            cand_density = mean(density0), .groups = "drop")

# -- C. Assemble the country table ----------------------------------------------------
cx_country <- cy %>% filter(year %in% c(2005, 2015, 2023)) %>%
  transmute(iso3, year, eci, coi, diversity, export_value, gdppc_ppp, population) %>%
  mutate(inst_year = year_map[as.character(year)]) %>%
  inner_join(inst, by = c("iso3", "inst_year" = "year")) %>%
  left_join(basket_wide, by = c("iso3", "year")) %>%
  left_join(basket_pci, by = c("iso3", "year")) %>%
  left_join(country_entries %>% filter(t0 == 2003) %>%
              select(iso3, e1_candidates = n_candidates, e1_entries = n_entries, e1_expected = expected_entries,
                     e1_pci = entry_pci, e1_density = entry_density) %>% mutate(year = 2005), by = c("iso3", "year")) %>%
  left_join(country_entries %>% filter(t0 == 2013) %>%
              select(iso3, e2_candidates = n_candidates, e2_entries = n_entries, e2_expected = expected_entries,
                     e2_pci = entry_pci, e2_density = entry_density) %>% mutate(year = 2015), by = c("iso3", "year")) %>%
  mutate(across(where(is.numeric), ~ round(.x, 4)))
cat("cx_country rows:", nrow(cx_country), " countries:", n_distinct(cx_country$iso3), "\n")
print(table(cx_country$year))
write_parquet(cx_country, "apps/country-profile/public/research/cx_country.parquet", compression = "snappy")

# -- D. Pairwise similarity (2023 baskets; 2013->2023 entry sets) ----------------------
iso_2023 <- cx_country %>% filter(year == 2023) %>% pull(iso3)
sets <- cpy %>% filter(year == 2023, rca >= 1, iso3 %in% iso_2023) %>% group_by(iso3) %>% summarise(s = list(product))
entry_sets <- entries %>% filter(t0 == 2013, entered == 1, iso3 %in% iso_2023) %>% group_by(iso3) %>% summarise(e = list(product))
gdp_terc <- cx_country %>% filter(year == 2023, !is.na(gdppc_ppp)) %>%
  mutate(tercile = ntile(gdppc_ppp, 3)) %>% select(iso3, tercile)
jacc <- function(a, b) { if (is.null(a) || is.null(b)) return(NA_real_); u <- length(union(a, b)); if (u == 0) NA_real_ else length(intersect(a, b)) / u }
S <- setNames(sets$s, sets$iso3); E <- setNames(entry_sets$e, entry_sets$iso3)
isos <- sort(intersect(iso_2023, names(S)))
pairs <- as_tibble(t(combn(isos, 2))) %>% set_names(c("a", "b")) %>%
  mutate(jaccard_basket = round(map2_dbl(a, b, ~ jacc(S[[.x]], S[[.y]])), 4),
         jaccard_entry  = round(map2_dbl(a, b, ~ jacc(E[[.x]], E[[.y]])), 4)) %>%
  left_join(gdp_terc %>% rename(a = iso3, tercile_a = tercile), by = "a") %>%
  left_join(gdp_terc %>% rename(b = iso3, tercile_b = tercile), by = "b")
write_parquet(pairs, "apps/country-profile/public/research/cx_pairs.parquet", compression = "snappy")
cat("Pairs:", nrow(pairs), "\n")

# -- E. Per-k, per-cluster entry results ------------------------------------------------
entries_lab <- entries %>%
  mutate(inst_year = if_else(t0 == 2003, 2005, 2015)) %>%
  inner_join(inst, by = c("iso3", "inst_year" = "year"))
world_entry_share <- entries_lab %>% filter(t0 == 2013) %>% group_by(product) %>%
  summarise(world_share = mean(entered), n_world = n(), .groups = "drop")

entry_results <- map(2:K_MAX, function(k) {
  col <- paste0("ward_k", k)
  d <- entries_lab %>% mutate(cl = .data[[col]])
  # gradient per cluster: entered ~ density0 with window FE, SE clustered by country
  grads <- map_dfr(sort(unique(d$cl)), function(c) {
    dd <- d %>% filter(cl == c)
    if (n_distinct(dd$iso3) < 3) return(NULL)
    f <- feols(entered ~ density0 | window, data = dd, cluster = ~iso3)
    ct <- coeftable(f)
    tibble(cluster = c, n_countries = n_distinct(dd$iso3), n_candidates = nrow(dd),
           entry_rate = mean(dd$entered), slope = unname(coef(f)["density0"]),
           slope_se = ct["density0", "Std. Error"],
           entry_rate_at_mean_density = mean(dd$entered) ,
           entered_pci = mean(dd$pci1[dd$entered == 1]),
           entered_density = mean(dd$density0[dd$entered == 1]),
           candidate_density = mean(dd$density0),
           actual_over_expected = sum(dd$entered) / sum(dd$p_hat))
  })
  # pooled model with cluster-specific intercepts and slopes, for a joint test
  d$cl <- factor(d$cl)
  joint <- feols(entered ~ density0 * cl | window, data = d, cluster = ~iso3)
  w <- wald(joint, keep = "density0:cl", print = FALSE)
  w_int <- wald(joint, keep = "^cl", print = FALSE)
  # products entered in common, 2013->2023: share of cluster members entering vs world
  common <- d %>% filter(t0 == 2013) %>% group_by(cl, product) %>%
    summarise(share = mean(entered), n = n(), n_entered = sum(entered), .groups = "drop") %>%
    inner_join(world_entry_share, by = "product") %>%
    filter(n >= 5, n_entered >= 2) %>%
    mutate(lift = share - world_share) %>%
    inner_join(prod %>% select(product, name_short, ps), by = "product") %>%
    group_by(cl) %>% slice_max(lift, n = 12, with_ties = FALSE) %>% ungroup() %>%
    mutate(across(c(share, world_share, lift), ~ round(.x, 3)))
  list(k = k, gradients = grads %>% mutate(across(where(is.numeric), ~ round(.x, 4))),
       slope_test = list(stat = round(unname(w$stat), 3), p = round(unname(w$p), 4)),
       intercept_test = list(stat = round(unname(w_int$stat), 3), p = round(unname(w_int$p), 4)),
       common = split(common %>% select(product, name_short, ps, share, world_share, lift, n_entered, n), common$cl))
})
pooled_ct <- coeftable(pooled)
write_json(list(windows = c("2003-2013", "2013-2023"), candidate_rule = "RCA < 0.5 at t0",
                entry_rule = "RCA >= 1 at t1 and at t1 - 1",
                pooled = list(slope = round(unname(coef(pooled)["density0"]), 4),
                              se = round(pooled_ct["density0", "Std. Error"], 4),
                              n = nobs(pooled), entry_rate = round(mean(entries$entered), 4),
                              r2 = round(unname(r2(pooled, "r2")), 4)),
                by_k = entry_results),
           "apps/country-profile/public/research/entries.json", auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")

# -- F. Meta ------------------------------------------------------------------------------
write_json(list(ps_names = as.list(ps_names), atlas_years = c(2005, 2015, 2023),
                year_map = as.list(year_map), n_countries_ranked = nrow(countries),
                products = prod %>% mutate(across(c(ps_x, ps_y), ~ round(.x, 3))),
                source = "Atlas of Economic Complexity via ~/dev/g20/code/output/cache (HS92 4-digit, 2000-2024)"),
           "apps/country-profile/public/research/cx_meta.json", auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")
cat("Done.\n")

# -- G. RCA >= 1 sets, 2023, so the tool can compute product-level occupancy per cluster
rca_sets <- cpy %>% filter(year == 2023, rca >= 1, iso3 %in% iso_2023) %>%
  transmute(iso3, product, value = round(value)) %>% arrange(iso3, product)
write_parquet(rca_sets, "apps/country-profile/public/research/cx_rca.parquet", compression = "snappy")
cat("Wrote cx_rca.parquet:", nrow(rca_sets), "rows\n")
