# Nepal fork: export selected V-Dem institutional indicators for the
# "Institutions across regimes" section (src/components/InstitutionsSection.tsx).
#
# Input : V-Dem Country-Year Full+Others v16 (.dta), downloaded by Asim to the Growth Lab OneDrive.
# Output: public/nepal/institutions.json
#   - per country (NPL + benchmarks): yearly point estimate and V-Dem's 68% interval (_codelow/_codehigh)
#   - "WLD": cross-country mean per year, with the 25th–75th percentile across countries as the band
#
# Usage (from apps/country-profile):
#   Rscript scripts/export_nepal_institutions.R [path/to/V-Dem-CY-Full+Others-v16.dta]

suppressMessages({
  library(haven)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
dta <- if (length(args)) args[1] else file.path(
  Sys.getenv("HOME"),
  "Library/CloudStorage/OneDrive-HarvardUniversity/Growth Lab - Nepal/Workstreams",
  "Nepal's political Economy/1_data/1_raw/V-Dem-CY-FullOthers-v16_dta/V-Dem-CY-Full+Others-v16.dta"
)
out <- "public/nepal/institutions.json"
stopifnot(file.exists(dta))

Y0 <- 1900
COUNTRIES <- c("NPL", "IND", "BGD")  # focus + benchmarks; add ISO3 codes here to extend

# Variable metadata. `scale`: "unit" = 0–1 index, "latent" = unbounded measurement-model scale.
# `higher`: whether a higher value is normatively better or worse (drives the chart annotation).
VARS <- list(
  list(tag = "v2x_cspart", group = "Civil society & equality", scale = "unit", higher = "better",
       name = "Civil society participation",
       desc = "Are major civil society organisations routinely consulted by policymakers, how many people take part in them, are women able to participate, and are legislative candidates chosen through decentralised or primary processes?"),
  list(tag = "v2x_egal", group = "Civil society & equality", scale = "unit", higher = "better",
       name = "Egalitarian component",
       desc = "How far rights, freedoms and resources are equally distributed across social groups, so that all groups can participate politically on equal terms."),
  list(tag = "v2x_accountability", group = "Accountability", scale = "latent", higher = "better",
       name = "Accountability (overall)",
       desc = "How far government is constrained by citizens (vertical), by other state institutions (horizontal), and by media and civil society (diagonal)."),
  list(tag = "v2x_veracc", group = "Accountability", scale = "latent", higher = "better",
       name = "Vertical accountability",
       desc = "The ability of the population to hold the government to account through elections and political parties."),
  list(tag = "v2x_horacc", group = "Accountability", scale = "latent", higher = "better",
       name = "Horizontal accountability",
       desc = "How far the legislature, judiciary and oversight agencies can question, investigate and sanction the executive."),
  list(tag = "v2x_diagacc", group = "Accountability", scale = "latent", higher = "better",
       name = "Diagonal accountability",
       desc = "How far civil society organisations and an independent media can hold the government to account."),
  list(tag = "v2x_corr", group = "Corruption & clientelism", scale = "unit", higher = "worse",
       name = "Political corruption",
       desc = "How pervasive political corruption is: an aggregate of public-sector, executive, legislative and judicial corruption."),
  list(tag = "v2xnp_client", group = "Corruption & clientelism", scale = "unit", higher = "worse",
       name = "Clientelism",
       desc = "How far politics runs on clientelistic exchange: vote buying, targeted rather than programmatic spending, and clientelistic party–voter links."),
  list(tag = "v2exbribe", group = "Corruption & clientelism", scale = "latent", higher = "better",
       name = "Executive bribery (reversed: higher = cleaner)",
       desc = "How routinely members of the executive and their agents grant favours in exchange for bribes, kickbacks or other material inducements. Higher values mean less bribery."),
  list(tag = "v2excrptps", group = "Corruption & clientelism", scale = "latent", higher = "better",
       name = "Public-sector corruption (reversed: higher = cleaner)",
       desc = "How routinely public-sector employees grant favours in exchange for bribes, kickbacks or other material inducements. Higher values mean less corruption.")
)
tags <- vapply(VARS, `[[`, "", "tag")

cols <- c("country_name", "country_text_id", "year", as.vector(outer(tags, c("", "_codelow", "_codehigh"), paste0)))
message("Reading ", basename(dta), " (", length(cols), " columns)…")
d <- read_dta(dta, col_select = all_of(cols))
d <- d[d$year >= Y0, ]
Y1 <- max(d$year)
years <- Y0:Y1

r3 <- function(x) ifelse(is.na(x), NA, round(as.numeric(x), 3))
align <- function(yr, x) { v <- rep(NA_real_, length(years)); v[match(yr, years)] <- x; r3(v) }

series <- list()
for (iso in COUNTRIES) {
  s <- d[d$country_text_id == iso, ]
  if (!nrow(s)) stop("No V-Dem rows for ", iso)
  vals <- lapply(tags, function(t) list(
    v  = align(s$year, s[[t]]),
    lo = align(s$year, s[[paste0(t, "_codelow")]]),
    hi = align(s$year, s[[paste0(t, "_codehigh")]])
  ))
  names(vals) <- tags
  series[[iso]] <- list(name = as.character(s$country_name[1]), kind = "country", vars = vals)
}

# World: unweighted mean across all V-Dem countries with data that year; band = interquartile range.
wvals <- lapply(tags, function(t) {
  by <- split(d[[t]], d$year)
  st <- t(vapply(as.character(years), function(y) {
    x <- by[[y]]; x <- x[!is.na(x)]
    if (length(x) < 10) return(c(NA, NA, NA, length(x)))
    c(mean(x), quantile(x, 0.25, names = FALSE), quantile(x, 0.75, names = FALSE), length(x))
  }, numeric(4)))
  list(v = r3(st[, 1]), lo = r3(st[, 2]), hi = r3(st[, 3]), n = as.integer(st[, 4]))
})
names(wvals) <- tags
series[["WLD"]] <- list(name = "World average", kind = "aggregate", vars = wvals)

doc <- list(
  built = format(Sys.Date()),
  source = "V-Dem Country-Year Full+Others v16 (Coppedge et al. 2026)",
  bands = list(country = "68% credible interval (V-Dem _codelow/_codehigh)",
               aggregate = "Middle 50% of countries (25th–75th percentile)"),
  y0 = Y0, y1 = Y1,
  vars = VARS,
  series = series
)
dir.create(dirname(out), showWarnings = FALSE, recursive = TRUE)
write_json(doc, out, auto_unbox = TRUE, na = "null", digits = NA)
message("Wrote ", out, " (", round(file.size(out) / 1024), " KB), years ", Y0, "–", Y1,
        ", series: ", paste(names(series), collapse = ", "))
