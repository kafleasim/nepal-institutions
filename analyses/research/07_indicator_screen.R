#!/usr/bin/env Rscript
# Research pipeline, step 7: working backwards from the outcome to the
# indicators. For every one of the V-Dem component indicators in the country
# space, does it predict the complexity of what a country enters, once
# relatedness and income are held fixed?
#
# Three specifications per indicator z_j (the pooled z-score at the window's
# start benchmark year), each with log GDP per head:
#   (a) country level:  tilt_cw = a + b z_jc + d lgdp_c + window FE
#       (tilt = mean PCI of entries minus the PCI relatedness alone predicts)
#   (b) entered products: PCI_p = a + b density_cp + c z_jc + d lgdp_c + window FE
#   (c) fixed-effects entry model: entered ~ density + density:z_j + PCI:z_j
#       + density:lgdp + PCI:lgdp | country x window + product
# Standard errors clustered by country; Benjamini-Hochberg q-values across the
# indicators within each specification; (a) also run in each window alone.
# Also: each indicator's correlation with log income across country-windows,
# which is what decides whether it can be told apart from income at all.
#
# Outputs: indicator_screen.parquet (one row per indicator), tilt_z.parquet
# (country-window z-scores for every indicator, for the tab's scatter).

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite); library(fixest) })
setwd("/home/taimur/dev/institutional-complexity")
OUT <- "apps/country-profile/public/research"
J <- readRDS("analyses/research/cache/joint.rds")
CACHE <- "/home/taimur/dev/g20/code/output/cache"

tilt <- read_parquet(file.path(OUT, "tilt.parquet"))
traits <- read_parquet(file.path(OUT, "product_traits.parquet"))
ind <- J$indicators

# z-scores at the benchmark years, keyed by iso3
Z <- as_tibble(J$M_z) %>% mutate(iso3 = J$keys$iso3, inst_year = J$keys$year, country_name = J$keys$country_name) %>%
  filter(!is.na(iso3)) %>% arrange(iso3, inst_year, country_name) %>% distinct(iso3, inst_year, .keep_all = TRUE) %>% select(-country_name)
tz <- tilt %>% select(iso3, window, inst_year, tilt, lgdp, n_entries) %>% inner_join(Z, by = c("iso3", "inst_year"))
cat("Country-windows:", nrow(tz), "\n")
write_parquet(tz %>% pivot_longer(all_of(ind$tag), names_to = "tag", values_to = "z") %>% mutate(z = round(z, 3)) %>%
                select(iso3, window, tag, z), file.path(OUT, "tilt_z.parquet"), compression = "snappy")

# entries, as in step 5
countries <- read_parquet(file.path(CACHE, "cx_countries.parquet")) %>% filter(in_rankings)
cpy <- read_parquet(file.path(CACHE, "cx_country_product_year.parquet")) %>%
  filter(year %in% c(2003, 2012, 2013, 2022, 2023)) %>% inner_join(countries %>% select(country_id, iso3), by = "country_id")
entries <- map_dfr(list(c(2003, 2013), c(2013, 2023)), function(w) {
  t0 <- w[1]; t1 <- w[2]
  a <- cpy %>% filter(year == t0) %>% select(iso3, product, rca0 = rca, density0 = density)
  b <- cpy %>% filter(year == t1) %>% select(iso3, product, rca1 = rca)
  bp <- cpy %>% filter(year == t1 - 1) %>% select(iso3, product, rca1p = rca)
  a %>% inner_join(b, by = c("iso3", "product")) %>% left_join(bp, by = c("iso3", "product")) %>%
    filter(!is.na(rca0), rca0 < 0.5, !is.na(density0)) %>%
    mutate(entered = as.integer(rca1 >= 1 & coalesce(rca1p, rca1) >= 1), window = paste0(t0, "-", t1),
           inst_year = if_else(t0 == 2003, 2005, 2015), t1 = t1)
}) %>% inner_join(traits %>% select(product, pci_2013, pci_2023), by = "product") %>%
  mutate(pci = if_else(t1 == 2013, pci_2013, pci_2023)) %>% filter(!is.na(pci)) %>%
  inner_join(tilt %>% distinct(iso3, inst_year, lgdp), by = c("iso3", "inst_year")) %>%
  inner_join(Z, by = c("iso3", "inst_year"))
zs <- function(x) (x - mean(x, na.rm = TRUE)) / sd(x, na.rm = TRUE)
entries <- entries %>% mutate(pci_z = zs(pci), lgdp_z = zs(lgdp))
ent_only <- entries %>% filter(entered == 1)
cat("Candidates:", nrow(entries), " entered:", nrow(ent_only), "\n")

pick <- function(f, vars) {
  ct <- coeftable(f); want <- sort(vars)
  row <- rownames(ct)[vapply(rownames(ct), function(r) identical(sort(strsplit(r, ":")[[1]]), want), logical(1))][1]
  c(est = unname(ct[row, "Estimate"]), se = unname(ct[row, "Std. Error"]), p = unname(ct[row, "Pr(>|t|)"]))
}
res <- map_dfr(seq_len(nrow(ind)), function(i) {
  tag <- ind$tag[i]
  tz$zj <- tz[[tag]]; ent_only$zj <- ent_only[[tag]]; entries$zj <- entries[[tag]]
  a  <- pick(feols(tilt ~ zj + lgdp | window, data = tz, cluster = ~iso3), "zj")
  a0 <- pick(feols(tilt ~ zj | window, data = tz, cluster = ~iso3), "zj")
  a1 <- pick(feols(tilt ~ zj + lgdp, data = tz %>% filter(window == "2003-2013"), cluster = ~iso3), "zj")
  a2 <- pick(feols(tilt ~ zj + lgdp, data = tz %>% filter(window == "2013-2023"), cluster = ~iso3), "zj")
  b  <- pick(feols(pci ~ density0 + zj + lgdp | window, data = ent_only, cluster = ~iso3), "zj")
  fc <- feols(entered ~ density0 + density0:zj + pci_z:zj + density0:lgdp_z + pci_z:lgdp_z | iso3^window + product, data = entries, cluster = ~iso3)
  cc <- pick(fc, c("pci_z", "zj"))
  if (i %% 20 == 0) cat("  ", i, "of", nrow(ind), "\n")
  tibble(tag = tag, name = ind$name[i], category = ind$category[i],
         cor_income = cor(tz$zj, tz$lgdp), sd_within = sd(tz$zj),
         a_est = a["est"], a_se = a["se"], a_p = a["p"], a_raw_est = a0["est"], a_raw_p = a0["p"],
         a_w1_est = a1["est"], a_w1_p = a1["p"], a_w2_est = a2["est"], a_w2_p = a2["p"],
         b_est = b["est"], b_se = b["se"], b_p = b["p"],
         c_est = cc["est"], c_se = cc["se"], c_p = cc["p"])
}) %>%
  mutate(a_q = p.adjust(a_p, "BH"), b_q = p.adjust(b_p, "BH"), c_q = p.adjust(c_p, "BH"),
         across(where(is.numeric), ~ signif(.x, 4)))
write_parquet(res, file.path(OUT, "indicator_screen.parquet"))
cat("\nTop indicators by the country-level tilt coefficient (income controlled), q <= 0.1:\n")
print(res %>% filter(a_q <= 0.1) %>% arrange(desc(abs(a_est))) %>% select(tag, name, cor_income, a_est, a_p, a_q, b_est, b_q, c_est, c_q, a_w1_est, a_w2_est) %>% head(25), n = 25, width = 200)
cat("\nHow many pass q <= 0.1 in each spec: a", sum(res$a_q <= 0.1), " b", sum(res$b_q <= 0.1), " c", sum(res$c_q <= 0.1), "; all three:", sum(res$a_q <= 0.1 & res$b_q <= 0.1 & res$c_q <= 0.1), "\n")
write_json(list(n_indicators = nrow(res), n_country_windows = nrow(tz), n_entered = nrow(ent_only), n_candidates = nrow(entries),
                pass_a = sum(res$a_q <= 0.1), pass_b = sum(res$b_q <= 0.1), pass_c = sum(res$c_q <= 0.1),
                pass_all = sum(res$a_q <= 0.1 & res$b_q <= 0.1 & res$c_q <= 0.1)),
           file.path(OUT, "indicator_screen_meta.json"), auto_unbox = TRUE, pretty = TRUE)
cat("Done.\n")
