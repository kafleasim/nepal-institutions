#!/usr/bin/env Rscript
# Research pipeline, step 5: does institutional type change WHICH related
# products get entered, not just how many?
#
# Product traits (HS92 4-digit):
#   pci        Atlas product complexity index in the window's end year
#   diff       Rauch (1999) differentiation: the share of the product's SITC
#              rev. 2 lines that are neither traded on an organised exchange nor
#              reference-priced ("n" in the conservative classification). This
#              is the ingredient Nunn (2007) applies to an industry's INPUTS to
#              get contract intensity; applied to the product itself it is the
#              Rauch "differentiated goods" measure used by Berkowitz, Moenius &
#              Pistor (2006) as the institution-sensitive class. Nunn's own
#              input-based measure is used instead if a copy of his 1997 I-O
#              file is dropped at data/nunn/contract_intensity_io1997.dta
#              (his data page sits behind a browser check, so it is not fetched
#              here). Concordances from the R package `concordance`.
# Institutional measures at the window's start benchmark year:
#   Ward cluster at every k; pooled-PCA scores pc1..pc3; V-Dem indices
#   v2x_libdem, v2x_polyarchy, v2x_rule, v2xcl_prpty, v2x_corr.
#
# Estimation on the candidate country-product pairs of the two entry windows
# (same construction as step 3): a linear probability model with country x
# window and product fixed effects, so only the interactions of institutions
# with density and with the product traits are identified,
#   entered ~ density + density:m + diff:m + pci:m | iso3^window + product,
# standard errors clustered by country. Continuous measures m are z-scored
# over the estimation sample. For clusters, one slope per cluster.
#
# Outputs (apps/country-profile/public/research/):
#   mechanisms.json     coefficient tables, binned relative entry rates
#   product_traits.parquet   product, pci_2013, pci_2023, diff
#   inst_measures.parquet    iso3, year, pc1, pc2, pc3, v2x_* indices

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite); library(fixest); library(concordance) })
setwd("/home/taimur/dev/institutional-complexity")
OUT <- "apps/country-profile/public/research"
J <- readRDS("analyses/research/cache/joint.rds")
K_MAX <- max(J$diag$k)
CACHE <- "/home/taimur/dev/g20/code/output/cache"

# -- Product traits -----------------------------------------------------------------
pci <- read_parquet(file.path(CACHE, "cx_product_year.parquet"))
rauch <- hs0_sitc2 %>% distinct(HS0_4d, SITC2_4d) %>%
  left_join(sitc2_rauch %>% distinct(SITC2, .keep_all = TRUE), by = c("SITC2_4d" = "SITC2")) %>%
  filter(!is.na(CON)) %>%
  group_by(product = HS0_4d) %>%
  summarise(diff = mean(CON == "n"), n_sitc = n(), .groups = "drop")
traits <- rauch %>%
  left_join(pci %>% filter(year == 2013) %>% select(product, pci_2013 = pci), by = "product") %>%
  left_join(pci %>% filter(year == 2023) %>% select(product, pci_2023 = pci), by = "product")
nunn_path <- "data/nunn/contract_intensity_io1997.dta"
traits$contract <- NA_real_
if (file.exists(nunn_path)) message("Nunn file found; wire the I-O -> HS concordance here.") else
  message("No Nunn file at ", nunn_path, "; using Rauch differentiation of the product.")
cat("Products with a Rauch share:", nrow(rauch), "; mean diff share", round(mean(rauch$diff), 3), "\n")
write_parquet(traits %>% mutate(across(where(is.numeric), ~ round(.x, 4))), file.path(OUT, "product_traits.parquet"))

# -- Institutional measures at benchmark years ------------------------------------
vdem <- read_parquet("data/shared-data/vdem/vdem.parquet") %>%
  filter(year %in% J$years) %>% select(country_name, year, v2x_libdem, v2x_polyarchy, v2x_rule, v2xcl_prpty, v2x_corr)
inst <- J$keys %>% select(country_name, iso3, year) %>%
  mutate(pc1 = J$pca$x[, 1], pc2 = J$pca$x[, 2], pc3 = J$pca$x[, 3]) %>%
  bind_cols(as_tibble(J$ward)) %>%
  left_join(vdem, by = c("country_name", "year")) %>%
  filter(!is.na(iso3)) %>% arrange(iso3, year, country_name) %>% distinct(iso3, year, .keep_all = TRUE)
write_parquet(inst %>% select(iso3, year, pc1, pc2, pc3, starts_with("v2x")) %>%
                mutate(across(where(is.numeric), ~ round(.x, 4))), file.path(OUT, "inst_measures.parquet"))

# -- Entry candidates (as in step 3) ----------------------------------------------------
countries <- read_parquet(file.path(CACHE, "cx_countries.parquet")) %>% filter(in_rankings)
cpy <- read_parquet(file.path(CACHE, "cx_country_product_year.parquet")) %>%
  filter(year %in% c(2003, 2012, 2013, 2022, 2023)) %>%
  inner_join(countries %>% select(country_id, iso3), by = "country_id")
windows <- list(c(2003, 2013), c(2013, 2023))
entries <- map_dfr(windows, function(w) {
  t0 <- w[1]; t1 <- w[2]
  a <- cpy %>% filter(year == t0) %>% select(iso3, product, rca0 = rca, density0 = density)
  b <- cpy %>% filter(year == t1) %>% select(iso3, product, rca1 = rca)
  b_prev <- cpy %>% filter(year == t1 - 1) %>% select(iso3, product, rca1p = rca)
  a %>% inner_join(b, by = c("iso3", "product")) %>% left_join(b_prev, by = c("iso3", "product")) %>%
    filter(!is.na(rca0), rca0 < 0.5, !is.na(density0)) %>%
    mutate(entered = as.integer(rca1 >= 1 & coalesce(rca1p, rca1) >= 1), window = paste0(t0, "-", t1),
           inst_year = if_else(t0 == 2003, 2005, 2015), t1 = t1)
}) %>%
  inner_join(traits %>% select(product, diff, pci_2013, pci_2023), by = "product") %>%
  mutate(pci = if_else(t1 == 2013, pci_2013, pci_2023)) %>%
  filter(!is.na(pci), !is.na(diff)) %>%
  inner_join(inst, by = c("iso3", "inst_year" = "year"))
cat("Estimation sample:", nrow(entries), "candidates,", n_distinct(entries$iso3), "countries\n")
pooled <- feols(entered ~ density0 | window, data = entries, cluster = ~iso3)
entries$p_hat <- pmax(predict(pooled), 0)

# -- Continuous measures ------------------------------------------------------------------
measures <- c(pc1 = "PC1 liberal democracy", pc2 = "PC2 state encompassment", pc3 = "PC3 programmatic vs personalist",
              v2x_libdem = "V-Dem liberal democracy index", v2x_polyarchy = "V-Dem electoral democracy index",
              v2x_rule = "V-Dem rule of law index", v2xcl_prpty = "V-Dem property rights", v2x_corr = "V-Dem political corruption (higher = more)")
zs <- function(x) (x - mean(x, na.rm = TRUE)) / sd(x, na.rm = TRUE)
cont <- map_dfr(names(measures), function(m) {
  d <- entries %>% filter(!is.na(.data[[m]])) %>% mutate(m = zs(.data[[m]]), pci_z = zs(pci), diff_c = diff - mean(diff))
  f <- feols(entered ~ density0 + density0:m + diff_c:m + pci_z:m | iso3^window + product, data = d, cluster = ~iso3)
  ct <- as.data.frame(coeftable(f)); ct$term <- rownames(ct); rownames(ct) <- NULL
  ct %>% transmute(measure = m, label = measures[[m]], term, est = round(Estimate, 5), se = round(`Std. Error`, 5), p = signif(`Pr(>|t|)`, 3), n = nobs(f))
})
print(as_tibble(cont) %>% select(measure, term, est, se, p), n = 40)

# -- Clusters, per k --------------------------------------------------------------------------
by_k <- map(2:K_MAX, function(k) {
  d <- entries %>% mutate(cl = factor(.data[[paste0("ward_k", k)]]), pci_z = zs(pci), diff_c = diff - mean(diff))
  keep <- d %>% count(cl) %>% filter(n >= 500) %>% pull(cl)
  d <- d %>% filter(cl %in% keep) %>% mutate(cl = droplevels(cl))
  # Product traits are absorbed by the product fixed effect, so their
  # interactions with cluster are identified only relative to a reference
  # cluster (the largest). Density varies within product, so it gets one
  # slope per cluster.
  ref_cl <- d %>% count(cl) %>% slice_max(n, n = 1, with_ties = FALSE) %>% pull(cl) %>% as.character()
  f <- feols(entered ~ density0:cl + i(cl, diff_c, ref = ref_cl) + i(cl, pci_z, ref = ref_cl) | iso3^window + product, data = d, cluster = ~iso3)
  ct <- as.data.frame(coeftable(f)); ct$term <- rownames(ct); rownames(ct) <- NULL
  coefs <- ct %>% mutate(
      cluster = as.integer(str_extract(term, "(?<=cl)\\d+|(?<=cl::)\\d+")),
      var = case_when(str_detect(term, "density0") ~ "density", str_detect(term, "diff_c") ~ "diff", TRUE ~ "pci")) %>%
    transmute(cluster, var, est = round(Estimate, 5), se = round(`Std. Error`, 5), p = signif(`Pr(>|t|)`, 3))
  # binned: relative entry rate (actual / density-expected) by cluster x product class
  classes <- d %>% mutate(diff_class = if_else(diff >= 0.5, "differentiated", "homogeneous or reference-priced"),
                          pci_class = case_when(pci >= quantile(pci, 2/3) ~ "high PCI", pci >= quantile(pci, 1/3) ~ "mid PCI", TRUE ~ "low PCI"))
  rel <- bind_rows(
    classes %>% group_by(cluster = as.integer(as.character(cl)), class = diff_class) %>% summarise(n = n(), entered = sum(entered), expected = sum(p_hat), .groups = "drop") %>% mutate(axis = "differentiation"),
    classes %>% group_by(cluster = as.integer(as.character(cl)), class = pci_class) %>% summarise(n = n(), entered = sum(entered), expected = sum(p_hat), .groups = "drop") %>% mutate(axis = "complexity")) %>%
    mutate(ratio = round(entered / expected, 3), expected = round(expected, 1))
  list(k = k, ref = as.integer(ref_cl), coefs = coefs, relative = rel, n = nobs(f))
})

# PC1 terciles, same binned table, for the continuous reading
d <- entries %>% mutate(g = ntile(pc1, 3), diff_class = if_else(diff >= 0.5, "differentiated", "homogeneous or reference-priced"),
                        pci_class = case_when(pci >= quantile(pci, 2/3) ~ "high PCI", pci >= quantile(pci, 1/3) ~ "mid PCI", TRUE ~ "low PCI"))
rel_pc1 <- bind_rows(
  d %>% group_by(g, class = diff_class) %>% summarise(n = n(), entered = sum(entered), expected = sum(p_hat), .groups = "drop") %>% mutate(axis = "differentiation"),
  d %>% group_by(g, class = pci_class) %>% summarise(n = n(), entered = sum(entered), expected = sum(p_hat), .groups = "drop") %>% mutate(axis = "complexity")) %>%
  mutate(ratio = round(entered / expected, 3), expected = round(expected, 1), group = c("Least liberal third", "Middle third", "Most liberal third")[g])

write_json(list(measures = as.list(measures), continuous = cont, by_k = by_k, pc1_terciles = rel_pc1,
                n_candidates = nrow(entries), n_countries = n_distinct(entries$iso3), entry_rate = round(mean(entries$entered), 4),
                diff_source = if (file.exists(nunn_path)) "Nunn (2007) input contract intensity" else "Rauch (1999) product differentiation, conservative classification",
                n_products = n_distinct(entries$product)),
           file.path(OUT, "mechanisms.json"), auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")
cat("Done.\n")

# ==================================================================================
# Continuous formulation: the complexity of what gets entered.
#
# Three regressions, all with continuous institutional measures m (z-scored):
#   (a) entry level, entered pairs only:
#         PCI_p = a + b density_cp + c m_c + d log GDPpc_c + window FE
#       c is the extra PCI of an entered product per SD of m, at the same
#       relatedness and income.
#   (b) country level: the PCI "tilt" is the mean PCI of the products a country
#       entered minus the PCI it would have entered if only relatedness mattered
#       (candidates' PCI weighted by the pooled density model's entry
#       probabilities). tilt ~ m + log GDPpc + window FE.
#   (c) the fixed-effects entry model of the first section with an income x PCI
#       term added, so the institution x PCI coefficient is read net of income.
# ==================================================================================
cx_inc <- read_parquet(file.path(OUT, "cx_country.parquet")) %>%
  filter(year %in% c(2005, 2015)) %>% transmute(iso3, inst_year = if_else(year == 2005, 2005, 2015), lgdp = log(gdppc_ppp))
ent <- entries %>% inner_join(cx_inc, by = c("iso3", "inst_year")) %>% filter(!is.na(lgdp))
tilt <- ent %>% group_by(iso3, window, inst_year) %>%
  summarise(n_entries = sum(entered), pci_entered = mean(pci[entered == 1]),
            pci_expected = sum(p_hat * pci) / sum(p_hat), density_entered = mean(density0[entered == 1]),
            across(all_of(c(names(measures), "lgdp")), first), .groups = "drop") %>%
  mutate(tilt = pci_entered - pci_expected) %>% filter(n_entries >= 3)
inst_lab <- inst %>% select(iso3, inst_year = year, ward_k2:ward_k12)
tilt <- tilt %>% left_join(inst_lab, by = c("iso3", "inst_year"))
cat("Country-windows with >= 3 entries:", nrow(tilt), "\n")
write_parquet(tilt %>% mutate(across(where(is.numeric), ~ round(.x, 4))), file.path(OUT, "tilt.parquet"))

zs2 <- function(x) (x - mean(x, na.rm = TRUE)) / sd(x, na.rm = TRUE)
cont_pci <- map_dfr(names(measures), function(m) {
  d <- ent %>% filter(!is.na(.data[[m]])) %>% mutate(m = zs2(.data[[m]]), lgdp_z = zs2(lgdp), pci_z = zs2(pci))
  de <- d %>% filter(entered == 1)
  fa0 <- feols(pci ~ density0 + m | window, data = de, cluster = ~iso3)
  fa1 <- feols(pci ~ density0 + m + lgdp | window, data = de, cluster = ~iso3)
  tt <- tilt %>% filter(!is.na(.data[[m]])) %>% mutate(m = zs2(.data[[m]]))
  fb0 <- feols(tilt ~ m | window, data = tt, cluster = ~iso3)
  fb1 <- feols(tilt ~ m + lgdp | window, data = tt, cluster = ~iso3)
  fc0 <- feols(entered ~ density0 + density0:m + pci_z:m | iso3^window + product, data = d, cluster = ~iso3)
  fc1 <- feols(entered ~ density0 + density0:m + pci_z:m + density0:lgdp_z + pci_z:lgdp_z | iso3^window + product, data = d, cluster = ~iso3)
  # fixest orders interaction names its own way; match on the set of variables.
  g <- function(f, term, model) {
    ct <- coeftable(f)
    want <- sort(strsplit(term, ":")[[1]])
    row <- rownames(ct)[vapply(rownames(ct), function(r) identical(sort(strsplit(r, ":")[[1]]), want), logical(1))][1]
    tibble(measure = m, label = measures[[m]], model = model, term = term,
      est = round(ct[row, "Estimate"], 5), se = round(ct[row, "Std. Error"], 5), p = signif(ct[row, "Pr(>|t|)"], 3), n = nobs(f)) }
  bind_rows(
    g(fa0, "m", "entry_pci"), g(fa0, "density0", "entry_pci"),
    g(fa1, "m", "entry_pci_income"), g(fa1, "density0", "entry_pci_income"), g(fa1, "lgdp", "entry_pci_income"),
    g(fb0, "m", "tilt"), g(fb1, "m", "tilt_income"), g(fb1, "lgdp", "tilt_income"),
    g(fc0, "pci_z:m", "entry_fe"), g(fc1, "pci_z:m", "entry_fe_income"), g(fc1, "pci_z:lgdp_z", "entry_fe_income"))
})
print(as_tibble(cont_pci) %>% filter(term %in% c("m", "pci_z:m", "pci_z:lgdp_z")) %>% select(measure, model, term, est, se, p), n = 60)
mech <- fromJSON(file.path(OUT, "mechanisms.json"), simplifyVector = FALSE)
mech$continuous_pci <- cont_pci
mech$tilt_n <- nrow(tilt)
write_json(mech, file.path(OUT, "mechanisms.json"), auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")
cat("Done (continuous).\n")
