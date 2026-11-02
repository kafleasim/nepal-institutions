# Dump ESID PolSett reference data to JSON for the LLM pipeline.
# - esid/countries.json: name -> iso3 for the 44 dataset countries
# - esid/<iso3>.json: periods + human coder-level answers (one record per coder x period)
suppressMessages({library(haven); library(dplyr); library(jsonlite)})

d <- read_dta("~/dev/shared-data/polsett/psd_coder_level_v1.dta")
d <- d %>% filter(cname_psd != "")

qcols <- grep("^q[0-9]+_", names(d), value = TRUE)
typelabs <- attr(d$periodtypebasic, "labels")

# one row per coder x period (values are constant within period)
dp <- d %>%
  group_by(cname_psd, cabbrev_pwt, coder_id, periodnumber) %>%
  slice(1) %>%
  ungroup()

countries <- dp %>% distinct(cname_psd, cabbrev_pwt) %>% arrange(cname_psd)
write_json(
  setNames(as.list(countries$cabbrev_pwt), countries$cname_psd),
  "polsett-llm/esid/countries.json", auto_unbox = TRUE, pretty = TRUE
)

dir.create("polsett-llm/esid", showWarnings = FALSE)
for (cn in countries$cname_psd) {
  iso3 <- countries$cabbrev_pwt[countries$cname_psd == cn]
  cd <- dp %>% filter(cname_psd == cn)
  periods <- cd %>%
    distinct(periodnumber, period, periodstart, periodend, periodtypebasic,
             leadername_nonumber, breakrationale) %>%
    arrange(periodnumber) %>%
    select(number = periodnumber, label = period, start = periodstart,
           end = periodend, type = periodtypebasic, leader = leadername_nonumber,
           break_rationale = breakrationale)
  coders <- lapply(split(cd, cd$periodnumber), function(pd) {
    lapply(split(pd, pd$coder_id), function(r) {
      vals <- as.list(r[1, qcols])
      vals <- vals[!sapply(vals, function(v) is.na(v) || identical(v, ""))]
      lapply(vals, function(v) if (is.numeric(v)) as.numeric(v) else as.character(v))
    })
  })
  out <- list(country = cn, iso3 = iso3, periods = periods, human_coders = coders)
  write_json(out, sprintf("polsett-llm/esid/%s.json", iso3),
             auto_unbox = TRUE, pretty = FALSE, digits = 6, null = "null")
  cat(cn, iso3, nrow(periods), "periods\n")
}
