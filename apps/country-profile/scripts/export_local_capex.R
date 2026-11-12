# Nepal fork: local-government budget execution for the Capital expenditure page (src/capex/CapexPage.tsx).
#
# Input : revenue_income_panel_long_74_82.dta — 753 local governments x FY 2074/75–2081/82, compiled by Asim
#         from the Office of the Auditor General's annual reports (Dropbox: Nepal_Data/1_7_admin_other/1_1_audit_data/4_clean).
#         Amounts are in NRs thousand (variable labels say "NRs", but magnitudes only make sense in thousands).
# Output: public/nepal/local_capex.json (national aggregates + cross-municipality distribution per year).
#
# Definitions (per local government, per fiscal year):
#   available        = prev_year_transfer + income_total        (identity: available - expense_total = remaining_balance)
#   unspent share    = remaining_balance / available
#   implied unspent capital share = remaining_balance / (expense_capital + remaining_balance)
#     — assumes the unspent balance is capital budget (recurrent items such as salaries are largely spent).
#
# Usage (from apps/country-profile): Rscript scripts/export_local_capex.R [path/to/panel.dta]

suppressMessages({ library(haven); library(dplyr); library(jsonlite) })

args <- commandArgs(trailingOnly = TRUE)
dta <- if (length(args)) args[1] else file.path(Sys.getenv("HOME"),
  "Dropbox/Nepal_Data/1_7_admin_other/1_1_audit_data/4_clean/revenue_income_panel_long_74_82.dta")
out <- "public/nepal/local_capex.json"
stopifnot(file.exists(dta))

d <- read_dta(dta) %>% zap_labels()

# FY 2079/80 and 2080/81 are identical for ~99% of municipalities in the source panel (cleaning issue,
# under review with the raw OAG files). Detect rather than hard-code, so the flag clears once fixed.
dup_years <- c()
yrs <- sort(unique(d$year))
for (i in seq_along(yrs)[-1]) {
  a <- d %>% filter(year == yrs[i - 1]) %>% arrange(municipality_code)
  b <- d %>% filter(year == yrs[i]) %>% arrange(municipality_code)
  same <- mean(a$income_total == b$income_total & a$remaining_balance == b$remaining_balance, na.rm = TRUE)
  if (same > 0.5) dup_years <- union(dup_years, c(yrs[i - 1], yrs[i]))
}

d <- d %>%
  mutate(available = prev_year_transfer + income_total) %>%
  filter(!is.na(remaining_balance), !is.na(available), available > 0) %>%
  mutate(m_unspent = remaining_balance / available,
         cap_base = expense_capital + remaining_balance,
         m_cap_unspent = ifelse(!is.na(cap_base) & cap_base > 0, remaining_balance / cap_base, NA))

q <- function(x, p) unname(quantile(x, p, na.rm = TRUE))
bn <- function(x) round(sum(x, na.rm = TRUE) / 1e6, 2) # NRs thousand -> NRs billion
r4 <- function(x) round(x, 4)

years <- d %>% group_by(year, f_year_nep) %>% summarise(
  n = n(),
  available_bn = bn(available), income_bn = bn(income_total), carryover_bn = bn(prev_year_transfer),
  spent_bn = bn(expense_total), capital_bn = bn(expense_capital), current_bn = bn(expense_current),
  remaining_bn = bn(remaining_balance),
  n_cap = sum(!is.na(m_cap_unspent)),
  # national (pooled) ratios; capital ratios use only units with capital data
  unspent = r4(sum(remaining_balance) / sum(available)),
  unspent_med = r4(median(m_unspent)), unspent_p25 = r4(q(m_unspent, .25)), unspent_p75 = r4(q(m_unspent, .75)),
  cap_unspent = r4(sum(remaining_balance[!is.na(m_cap_unspent)]) / sum(cap_base[!is.na(m_cap_unspent)])),
  cap_unspent_med = r4(median(m_cap_unspent, na.rm = TRUE)),
  cap_unspent_p25 = r4(q(m_cap_unspent, .25)), cap_unspent_p75 = r4(q(m_cap_unspent, .75)),
  cap_share_spent = r4(sum(expense_capital, na.rm = TRUE) / sum(expense_total[!is.na(expense_capital)], na.rm = TRUE)),
  .groups = "drop") %>%
  mutate(fy_bs = sub("_", "/", paste0("20", f_year_nep)),           # 74_75 -> 2074/75
         fy_ad = paste0(year, "/", substr(year + 1, 3, 4)),          # 2017 -> 2017/18
         flag_duplicate = year %in% dup_years) %>%
  select(-f_year_nep)

doc <- list(
  built = format(Sys.Date()),
  source = "Office of the Auditor General of Nepal, annual audit reports (local governments); panel compiled by the Growth Lab Nepal team",
  units = "NRs billion, nominal",
  n_units = length(unique(d$municipality_code)),
  duplicate_note = if (length(dup_years)) paste0("FY ", paste(years$fy_bs[years$year %in% dup_years], collapse = " and "),
    " have identical values for almost all municipalities in the source panel; one year is likely a copy of the other and is under review.") else NULL,
  years = years
)
dir.create(dirname(out), showWarnings = FALSE, recursive = TRUE)
write_json(doc, out, auto_unbox = TRUE, na = "null", digits = NA, pretty = TRUE)
message("Wrote ", out, "; duplicate-flagged years: ", paste(dup_years, collapse = ", "))
print(as.data.frame(years %>% select(fy_ad, n, available_bn, remaining_bn, capital_bn, unspent, unspent_med, cap_unspent, cap_unspent_med, flag_duplicate)))
