# Export the raw indicator series and their documentation for the variable
# popups in khan-axes.html. Writes khan_vars.js (window.KHAN_VARS).
#
# Every indicator that enters the H, V or U index is exported for all countries,
# 1960-2023, in its own units (before z-scoring), with the full V-Dem codebook
# entry where the indicator is a V-Dem variable, and a construction note plus
# the codebook entries of its inputs where it is derived.

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity/analyses/polsett-proxies")

G <- readRDS("khan_global.rds") %>% filter(year <= 2023)
cb <- read_parquet("~/dev/shared-data/vdem/vdem_codebook.parquet")

# Specification, parsed from khan_indices.R as in export_khan_page.R.
src <- readLines("khan_indices.R")
spec_txt <- src[(grep("^SPEC <- tribble", src) + 1):(grep("^\\)$", src)[1] - 1)]
SPEC <- spec_txt %>%
  keep(~ grepl('^\\s*"[HVU]",', .x)) %>%
  map_dfr(~ {
    m <- regmatches(.x, gregexpr('"[^"]*"|-?[0-9]+(?=,)', .x, perl = TRUE))[[1]]
    tibble(index = gsub('"', "", m[1]), lens = gsub('"', "", m[2]), key = gsub('"', "", m[3]),
           sign = as.integer(m[4]), why = gsub('"', "", m[5]))
  })

# The index uses log(1 + tenure); the popup shows tenure in years.
DISPLAY_COL <- c(log_hos_tenure = "hos_tenure")

entry <- function(tag) {
  r <- cb %>% filter(tag == !!tag) %>% slice(1)
  if (!nrow(r)) return(NULL)
  list(tag = tag, name = r$name, question = r$question, clarification = r$clarification,
       responses = r$responses, scale = r$scale, years = r$years)
}

QOG <- list(
  qog_h_polcon3 = list(
    name = "Political Constraint Index III (Henisz POLCON)",
    source = "Henisz, Political Constraint Index dataset, via the Quality of Government dataset in the GL macro panel",
    construction = "Measures the feasibility of a change in policy given the structure of political institutions: the number of independent branches of government with veto power and the distribution of political preferences across them. Ranges from 0 (no checks; one actor can change policy at will) to 1 (change is effectively impossible). Coverage in the macro panel ends in 2016.",
    unit = "0–1"),
  qog_chisols_per = list(
    name = "Personalist regime (CHISOLS)",
    source = "CHISOLS dataset (Change in Source of Leader Support) as distributed by the Quality of Government dataset, via the GL macro panel",
    construction = "Macro-panel label: \"Whether the state is a personalist regime in the year\" (1 = yes). The source codes non-autocracies −9; these are set to 0 here, i.e. not a personalist regime. Coverage ends in 2018.",
    unit = "0/1"),
  ucdp_internal = list(
    name = "Internal armed conflict (UCDP/PRIO, type 3)",
    source = "UCDP/PRIO Armed Conflict Dataset via the Quality of Government dataset (qog_ucdp_type3), in the GL macro panel",
    construction = "Number of internal armed conflicts (between the government and internal opposition groups, at least 25 battle-related deaths in the year) recorded by UCDP/PRIO for the country-year, as distributed by QoG. The value is a count of distinct conflicts, so countries facing several insurgencies at once (India, Myanmar, Ethiopia in the 1970s and 1980s) score above 1. Years with no recorded conflict are set to 0. Type 4 (internationalised internal conflict) is excluded because QoG codes it by participant, which marks countries that deploy forces abroad.",
    unit = "count of conflicts")
)

DERIVED <- list(
  seat_gap = list(name = "Seat margin of the largest party over the second", unit = "percentage points",
    construction = "Lower-chamber seat share of the largest party minus that of the second-largest party, in percentage points, from the most recent election. Values are carried forward from each election for up to 10 years.",
    inputs = c("v2ellostsl", "v2ellostss")),
  vote_gap = list(name = "Vote margin of the largest party over the second", unit = "percentage points",
    construction = "Lower-chamber vote share of the largest party minus that of the second-largest party, from the most recent election, carried forward up to 10 years.",
    inputs = c("v2ellovtlg", "v2ellovtsm")),
  pres_gap = list(name = "Presidential vote margin, winner over runner-up", unit = "percentage points",
    construction = "First-round presidential vote share of the leading candidate minus that of the second, from the most recent presidential election, carried forward up to 10 years. Missing where there is no direct presidential election.",
    inputs = c("v2elvotlrg", "v2elvotsml")),
  elect_turnover_20y = list(name = "Executive turnovers at elections, last 20 years", unit = "count",
    construction = "Number of elections in the current and previous 19 years at which the executive lost office as a result of the election (v2eltvrexo = 2). Note that V-Dem also codes 2 for the first elected executive of a newly independent state.",
    inputs = c("v2eltvrexo")),
  terr_uncontrolled = list(name = "Territory outside state control", unit = "% of territory",
    construction = "100 minus V-Dem's estimate of the share of territory over which the state has effective control.",
    inputs = c("v2svstterr")),
  coup_att_10y = list(name = "Coup attempts, last 10 years", unit = "count",
    construction = "Sum of coup attempts (Powell and Thyne, as distributed with V-Dem) over the current and previous 9 years.",
    inputs = c("e_pt_coup_attempts")),
  opp_count = list(name = "Social groups in active opposition", unit = "count of 14 groups",
    construction = "Number of the 14 social groups in V-Dem's regime-opposition question that at least half of coders name as explicit and active opposition to the regime.",
    inputs = c("v2regoppgroupsact")),
  pivot_balance = list(name = "Pivotal group: support minus opposition", unit = "share of coders, −1 to 1",
    construction = "V-Dem names the one group most important for the regime's chances of staying in power (v2regpower). This variable is the share of coders naming that group as a regime support group minus the share naming it as active opposition. Positive: the pivotal group backs the regime.",
    inputs = c("v2regpower", "v2regsupgroups", "v2regoppgroupsact")),
  hos_unremovable = list(name = "No body could remove the head of state", unit = "share of coders, 0–1",
    construction = "Option 0 (\"None\") of V-Dem's question on which bodies could remove the head of state short of military force.",
    inputs = c("v2exrmhsol")),
  hos_removers = list(name = "Bodies able to remove the head of state", unit = "count, 0–7",
    construction = "Sum over options 1–7 (foreign power, ruling party, royal council, military, religious body, tribal or ethnic council, other) of V-Dem's question on which bodies could remove the head of state short of military force.",
    inputs = c("v2exrmhsol")),
  hog_noapproval = list(name = "Head of government seeks no body's approval", unit = "share of coders, 0–1",
    construction = "Option 0 (\"None\") of V-Dem's question on which bodies the head of government customarily seeks approval from before important domestic decisions. Coverage is about 58% of country-years.",
    inputs = c("v2exctlhg")),
  hog_approvers = list(name = "Bodies whose approval the head of government seeks", unit = "count",
    construction = "Sum over the foreign power, ruling party, royal council, military, religious body, ethnic council and other options of V-Dem's head-of-government approval question. The head-of-state option is excluded.",
    inputs = c("v2exctlhg")),
  log_hos_tenure = list(name = "Head-of-state tenure", unit = "years",
    construction = "Consecutive years in which V-Dem records the same person as head of state (v2exnamhos). The index uses log(1 + years); the charts here show years.",
    inputs = c("v2exnamhos"))
)

years <- 1960:2023
isos <- sort(unique(G$country_text_id))
names_by_iso <- G %>% distinct(country_text_id, country_name) %>% group_by(country_text_id) %>% slice(1) %>%
  { setNames(as.list(.$country_name), .$country_text_id) }
grid <- expand_grid(country_text_id = isos, year = years)

vars <- list()
for (i in seq_len(nrow(SPEC))) {
  k <- SPEC$key[i]
  col <- if (k %in% names(DISPLAY_COL)) DISPLAY_COL[[k]] else k
  v <- grid %>% left_join(G %>% select(country_text_id, year, val = all_of(col)), by = c("country_text_id", "year")) %>%
    pull(val)
  v <- ifelse(is.finite(v), signif(v, 4), NA)
  doc <- if (!is.null(DERIVED[[k]])) {
    d <- DERIVED[[k]]
    list(kind = "derived", name = d$name, unit = d$unit, source = "Constructed in khan_build.R from V-Dem",
         construction = d$construction, inputs = compact(map(d$inputs, entry)))
  } else if (!is.null(QOG[[k]])) {
    q <- QOG[[k]]; list(kind = "macro", name = q$name, unit = q$unit, source = q$source, construction = q$construction)
  } else {
    e <- entry(k)
    list(kind = "vdem", name = e$name, source = "V-Dem (v16), shared-data/vdem", entry = e,
         unit = if (grepl("interval by the measurement model", e$scale)) "V-Dem latent scale (measurement-model estimate)" else e$scale)
  }
  vars[[k]] <- c(doc, list(index = SPEC$index[i], lens = SPEC$lens[i], sign = SPEC$sign[i], short = SPEC$why[i],
                           values = v))
}

out <- list(years = years, iso = isos, names = names_by_iso, vars = vars)
writeLines(paste0("window.KHAN_VARS = ", toJSON(out, auto_unbox = TRUE, na = "null", digits = NA, null = "null"), ";"),
           "khan_vars.js")
message("Wrote khan_vars.js (", round(file.size("khan_vars.js") / 1024), " KB): ",
        length(vars), " indicators × ", length(isos), " countries × ", length(years), " years")
