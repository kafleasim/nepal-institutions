#!/usr/bin/env Rscript
# Research pipeline, step 8: within-country variation.
#
# Does a country's fiscal base (V-Dem v2stfisccap: revenue from taxes on
# economic activity rather than natural resources or aid; and the IMF WoRLD
# measures of tax revenue and resource revenue) move together with the
# complexity of the products it newly exports, once country and year fixed
# effects absorb everything that is constant about the country and everything
# that is common to the year?
#
# New exports, defined year by year on the annual Atlas panel (2000-2024):
#   sustained     RCA < 0.5 in each of the three previous years, RCA >= 1 in
#                 the entry year and the next, export value >= USD 1 million in
#                 the entry year
#   consolidated  as above, plus RCA >= 1 in the year after that and value
#                 >= USD 10 million
# Candidates in year t: products absent (RCA < 0.5) in t-1..t-3 with a density
# reading in t-1. The tilt for a country-year is the mean PCI of its entries
# minus the PCI a pooled density model (entry on density, year FE) would have
# delivered over its candidates.
#
# Outputs: within_panel.parquet, within_results.json

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite); library(fixest); library(readxl); library(countrycode) })
setwd("/home/taimur/dev/institutional-complexity")
OUT <- "apps/country-profile/public/research"
CACHE <- "/home/taimur/dev/g20/code/output/cache"

CAND <- "analyses/research/cache/within_candidates.rds"
countries <- read_parquet(file.path(CACHE, "cx_countries.parquet")) %>% filter(in_rankings)
if (file.exists(CAND)) { cpy <- readRDS(CAND); cat("Loaded cached candidates\n") } else {
cpy <- read_parquet(file.path(CACHE, "cx_country_product_year.parquet")) %>%
  inner_join(countries %>% select(country_id, iso3), by = "country_id") %>%
  select(iso3, product, year, rca, density, value) %>% arrange(iso3, product, year)
pci <- read_parquet(file.path(CACHE, "cx_product_year.parquet")) %>% select(year, product, pci)
cat("Country-product-years:", nrow(cpy), "\n")

# lags and leads within iso3 x product; the panel is balanced in years for
# each pair the Atlas reports, but guard with year arithmetic anyway.
cpy <- cpy %>% group_by(iso3, product) %>%
  mutate(r1 = if_else(lag(year) == year - 1, lag(rca), NA_real_),
         r2 = if_else(lag(year, 2) == year - 2, lag(rca, 2), NA_real_),
         r3 = if_else(lag(year, 3) == year - 3, lag(rca, 3), NA_real_),
         f1 = if_else(lead(year) == year + 1, lead(rca), NA_real_),
         f2 = if_else(lead(year, 2) == year + 2, lead(rca, 2), NA_real_),
         d1 = if_else(lag(year) == year - 1, lag(density), NA_real_)) %>% ungroup() %>%
  filter(year >= 2003, year <= 2023) %>%
  mutate(absent = !is.na(r1) & !is.na(r2) & !is.na(r3) & r1 < 0.5 & r2 < 0.5 & r3 < 0.5,
         entryA = absent & rca >= 1 & coalesce(f1, 0) >= 1 & coalesce(value, 0) >= 1e6,
         entryB = entryA & coalesce(f2, 0) >= 1 & coalesce(value, 0) >= 1e7) %>%
  filter(absent, !is.na(d1)) %>%
  inner_join(pci, by = c("year", "product")) %>% filter(!is.na(pci))
saveRDS(cpy, CAND)
}
cat("Candidates:", nrow(cpy), " sustained entries:", sum(cpy$entryA), " consolidated:", sum(cpy$entryB), "\n")

pooledA <- feols(entryA ~ d1 | year, data = cpy, cluster = ~iso3)
pooledB <- feols(entryB ~ d1 | year, data = cpy, cluster = ~iso3)
cpy$pA <- pmax(predict(pooledA), 0); cpy$pB <- pmax(predict(pooledB), 0)
panel <- cpy %>% group_by(iso3, year) %>%
  summarise(n_cand = n(),
            nA = sum(entryA), pciA = mean(pci[entryA]), expA = sum(pA * pci) / sum(pA), densA = mean(d1[entryA]),
            nB = sum(entryB), pciB = mean(pci[entryB]), expB = sum(pB * pci) / sum(pB),
            .groups = "drop") %>%
  mutate(tiltA = pciA - expA, tiltB = pciB - expB)

# -- Institutions, annual --------------------------------------------------------------
fix_iso <- function(x) countrycode(x, "country.name", "iso3c", warn = FALSE,
  custom_match = c("Burma/Myanmar" = "MMR", "Hong Kong" = "HKG", "Ivory Coast" = "CIV", "Kosovo" = "XKX",
    "Palestine/West Bank" = "PSE", "Palestine/Gaza" = NA_character_, "Republic of the Congo" = "COG", "Somaliland" = NA_character_, "Zanzibar" = NA_character_))
vd <- read_parquet("data/shared-data/vdem/vdem.parquet") %>% filter(year >= 2000) %>%
  transmute(iso3 = fix_iso(country_name), year, v2stfisccap, v2stcritrecadm, v2stcritapparm, v2psorgs, v2psprbrch, v2exdfcbhs, v2x_libdem, v2x_rule, v2x_corr) %>%
  filter(!is.na(iso3)) %>% distinct(iso3, year, .keep_all = TRUE)
imf <- read_excel("data/shared-data/world-imf2026.xlsx", sheet = "Data") %>%
  transmute(iso3 = ISO3, year = as.integer(year), tot_rev = TotRev, tax_rev = TaxRev, res_rev = NonTaxRes, res_share = if_else(TotRev > 0, NonTaxRes / TotRev, NA_real_))
ann <- read_parquet(file.path(OUT, "annual_membership.parquet")) %>% select(iso3, year, pc1)
cxa <- read_parquet(file.path(OUT, "cx_annual.parquet")) %>% transmute(iso3, year, lgdp = log(gdppc_ppp), eci)

panel <- panel %>% left_join(vd, by = c("iso3", "year")) %>% left_join(imf, by = c("iso3", "year")) %>%
  left_join(ann, by = c("iso3", "year")) %>% left_join(cxa, by = c("iso3", "year"))
cat("Panel rows:", nrow(panel), " countries:", n_distinct(panel$iso3), "\n")
write_parquet(panel %>% mutate(across(where(is.numeric), ~ round(.x, 4))), file.path(OUT, "within_panel.parquet"), compression = "snappy")

# -- Regressions ---------------------------------------------------------------------------
measures <- c(v2stfisccap = "State fiscal source of revenue (V-Dem)", tax_rev = "Tax revenue, % of GDP (IMF WoRLD)",
              res_share = "Resource revenue, share of total revenue (IMF WoRLD)", tot_rev = "Total revenue, % of GDP (IMF WoRLD)",
              v2stcritrecadm = "Meritocratic appointment, administration", v2stcritapparm = "Meritocratic appointment, armed forces",
              v2psorgs = "Party organizations", v2psprbrch = "Party branches", v2exdfcbhs = "HOS appoints cabinet in practice",
              pc1 = "PC1 liberal democracy", v2x_rule = "V-Dem rule of law index")
within_share <- function(x, g) { d <- tibble(x, g) %>% filter(!is.na(x)); v_tot <- var(d$x); v_w <- d %>% group_by(g) %>% mutate(x = x - mean(x)) %>% pull(x) %>% var(); v_w / v_tot }
run <- function(rule) {
  y_t <- paste0("tilt", rule); y_n <- paste0("n", rule); y_p <- paste0("pci", rule)
  d0 <- panel %>% filter(.data[[y_n]] >= 2, !is.na(lgdp)) %>% rename(tilt = all_of(y_t), nent = all_of(y_n), pcient = all_of(y_p))
  map_dfr(names(measures), function(m) {
    lag3 <- panel %>% transmute(iso3, year = year + 3, m_l3 = .data[[m]])
    d <- d0 %>% filter(!is.na(.data[[m]])) %>% arrange(iso3, year) %>%
      mutate(m = .data[[m]], m_sd = sd(m), mz = m / m_sd) %>%
      left_join(lag3, by = c("iso3", "year")) %>% mutate(mz_l3 = m_l3 / m_sd)
    if (n_distinct(d$iso3) < 20) return(NULL)
    pick <- function(f, v = "mz") tryCatch({ ct <- coeftable(f); c(est = unname(ct[v, "Estimate"]), se = unname(ct[v, "Std. Error"]), p = unname(ct[v, "Pr(>|t|)"])) },
                                            error = function(e) c(est = NA_real_, se = NA_real_, p = NA_real_))
    fe   <- pick(feols(tilt ~ mz + lgdp | iso3 + year, data = d, cluster = ~iso3))
    fe_l <- pick(feols(tilt ~ mz_l3 + lgdp | iso3 + year, data = d %>% filter(!is.na(mz_l3)), cluster = ~iso3), "mz_l3")
    fpci <- pick(feols(pcient ~ mz + lgdp | iso3 + year, data = d, cluster = ~iso3))
    fe_n <- pick(feols(log1p(nent) ~ mz + lgdp | iso3 + year, data = d, cluster = ~iso3))
    btw  <- pick(feols(tilt ~ mz + lgdp | year, data = d, cluster = ~iso3))
    tibble(measure = m, label = measures[[m]], rule = rule, n_obs = nrow(d), n_countries = n_distinct(d$iso3),
           within_share = within_share(d$m, d$iso3), sd = sd(d$m),
           fe_est = fe["est"], fe_se = fe["se"], fe_p = fe["p"],
           fel_est = fe_l["est"], fel_se = fe_l["se"], fel_p = fe_l["p"],
           fep_est = fpci["est"], fep_se = fpci["se"], fep_p = fpci["p"],
           fen_est = fe_n["est"], fen_se = fe_n["se"], fen_p = fe_n["p"],
           btw_est = btw["est"], btw_se = btw["se"], btw_p = btw["p"])
  })
}
res <- bind_rows(run("A"), run("B")) %>% mutate(across(where(is.numeric), ~ signif(.x, 4)))
options(width = 220)
print(res %>% select(measure, rule, n_obs, n_countries, within_share, fe_est, fe_p, fel_est, fel_p, fep_est, fep_p, fen_est, fen_p, btw_est, btw_p), n = 40)

# -- Movers on the fiscal indicator ------------------------------------------------------
movers <- panel %>% filter(!is.na(v2stfisccap)) %>% group_by(iso3) %>%
  summarise(first = first(v2stfisccap), last = last(v2stfisccap), change = last - first, range = max(v2stfisccap) - min(v2stfisccap), n = n(), .groups = "drop") %>%
  arrange(desc(range))
write_json(list(rules = list(A = "sustained: absent 3 years (RCA < 0.5), RCA >= 1 for 2 years, value >= $1m",
                             B = "consolidated: as A, plus RCA >= 1 a third year and value >= $10m"),
                pooled = list(A = list(slope = round(unname(coef(pooledA)["d1"]), 4), rate = round(mean(cpy$entryA), 4)),
                              B = list(slope = round(unname(coef(pooledB)["d1"]), 4), rate = round(mean(cpy$entryB), 4))),
                n_candidates = nrow(cpy), years = c(2003, 2023), measures = as.list(measures), results = res,
                movers = movers %>% head(30) %>% mutate(across(where(is.numeric), ~ round(.x, 3)))),
           file.path(OUT, "within_results.json"), auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")
cat("Done.\n")
