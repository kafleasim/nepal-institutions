# Case-level output from the concept-first indices (khan_indices.R):
#   1. PolSett countries where our Khan type and PolSett's disagree, by period.
#   2. The binding channel for H and U: under weakest-channel aggregation, which
#      lens sets the value — where the strongest challenge to the coalition comes
#      from, and what kind of second power centre exists. This is itself a
#      characterisation of the settlement, not only a score.
#   3. Global placement, 2015-2019 average, for all countries.

suppressMessages({ library(tidyverse) })
setwd("/home/taimur/dev/institutional-complexity/analyses/polsett-proxies")

Gi <- readRDS("khan_indices.rds")
Ki <- readRDS("khan_periods.rds")

KHAN <- c("SD", "VA", "CC", "WD")   # strong-dominant, vulnerable-auth., competitive-cl., weak-dominant
khan_type <- function(hd, vd) case_when(hd & vd ~ "SD", !hd & vd ~ "VA", !hd & !vd ~ "CC", hd & !vd ~ "WD")
binding <- function(d, ix, lenses) {
  m <- as.matrix(d[paste(ix, lenses, sep = "_")])
  apply(m, 1, function(r) if (all(is.na(r))) NA_character_ else lenses[which.min(r)])
}

# Cutoffs: the global 1960-2019 median, so a type means "above/below the world's
# typical country-year", not "above/below the PolSett sample".
ref <- Gi %>% filter(year <= 2019)
cutH <- median(ref$H, na.rm = TRUE); cutV <- median(ref$V, na.rm = TRUE)

Ki <- Ki %>% mutate(
  ours = khan_type(H >= cutH, V >= cutV),
  polsett = KHAN[x_khansettlementype],
  H_bind = binding(Ki, "H", c("electoral", "armed", "social")),
  U_bind = binding(Ki, "U", c("formal", "executive", "territorial"))
)

cat("\n=========== 1. OURS vs POLSETT, by country (share of periods agreeing) ===========\n")
by_c <- Ki %>% filter(!is.na(ours), !is.na(polsett)) %>%
  group_by(cname_psd) %>%
  summarise(n = n(), agree = mean(ours == polsett),
            polsett_modal = names(sort(table(polsett), decreasing = TRUE))[1],
            ours_modal = names(sort(table(ours), decreasing = TRUE))[1],
            H = mean(H), V = mean(V), ps_H = mean(x_horizontalpower), ps_V = mean(x_verticalpower),
            .groups = "drop") %>%
  arrange(agree)
print(as.data.frame(by_c %>% mutate(across(where(is.double), ~ round(.x, 2)))), right = FALSE)

cat("\nOverall agreement with global-median cutoffs:",
    round(mean(Ki$ours == Ki$polsett, na.rm = TRUE), 2), "\n")
cat("\nBinding H channel by PolSett horizontal-power dummy (row %):\n")
print(round(prop.table(table(PolSett_H_high = Ki$x_horizontalpower >= 3.28, Ki$H_bind), 1), 2))

saveRDS(Ki, "khan_periods_typed.rds")

cat("\n=========== 3. GLOBAL PLACEMENT, 2015-2019 mean ===========\n")
recent <- Gi %>% filter(between(year, 2015, 2019)) %>%
  group_by(country_text_id, country_name) %>%
  summarise(across(c(starts_with("H"), starts_with("V"), starts_with("U"), v2x_polyarchy),
                   ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(where(is.double), ~ ifelse(is.finite(.x), .x, NA_real_)))
recent <- recent %>% mutate(
  type = khan_type(H >= cutH, V >= cutV),
  H_bind = binding(recent, "H", c("electoral", "armed", "social")),
  U_bind = binding(recent, "U", c("formal", "executive", "territorial")),
  in_polsett = country_text_id %in% Ki$iso3
)
saveRDS(recent, "khan_recent.rds")
print(table(recent$type, useNA = "ifany"))
show <- c("CHN", "VNM", "RWA", "ETH", "KHM", "SGP", "MYS", "BGD", "IND", "PAK", "KEN", "GHA",
          "NGA", "UGA", "TZA", "ZWE", "EGY", "THA", "IDN", "PHL", "MEX", "BRA", "ZAF", "RUS",
          "TUR", "IRN", "SAU", "COL", "MOZ", "LBN", "IRQ", "SOM", "USA", "DEU")
print(as.data.frame(recent %>% filter(country_text_id %in% show) %>%
  select(country_text_id, type, H, V, U, H_bind, U_bind, H_electoral, H_armed, H_social,
         V_party, V_personal, U_formal, U_executive, U_territorial, in_polsett) %>%
  mutate(across(where(is.double), ~ round(.x, 2))) %>% arrange(type, desc(H))), right = FALSE)
