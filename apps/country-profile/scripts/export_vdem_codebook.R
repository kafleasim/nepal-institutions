#!/usr/bin/env Rscript
# Export the whole V-Dem country-year file, variable by variable, for the
# /vdem codebook explorer in the country-profile app.
#
# Output (apps/country-profile/public/vdem-codebook/):
#   index.json        Countries, categories, and one short record per variable
#                     (tag, name, category, vartype, kind, scale, coverage,
#                     available versions). Loaded once.
#   vars/<tag>.json.gz  The full codebook entry (question, clarification, parsed
#                     response options, aggregation, notes) and every version
#                     of the series for all country-years. Fetched on demand.
#
# Versions exported where V-Dem ships them:
#   point            measurement-model estimate (latent scale for C variables;
#                    0-1 for most indices)
#   codelow/high     its 68% interval
#   osp (+ low/high) the model estimate mapped back onto the response scale
#   ord              the most likely response category
#   mean             the plain mean of the coders' answers, before the model
#   nr               number of coders
# z-scores and percentiles are not exported: the page computes them.
#
# Multi-select questions ("check all that apply") are exported as one variable
# whose versions are the options: each option column is the share of coders
# who ticked it. Nominal variables (unordered categories such as
# v2regimpgroup) are flagged so the page draws them as categories and
# refuses to z-score them; the rule is the one in export_data.R's
# is_nominal_code() plus the codebook's own "Nominal" scale label.
#
# Scope: every codebook tag present in the data except vartype A* (country
# identifiers and coding metadata) and free-text variables. 1789-2025, all
# V-Dem countries including historical ones, keyed by V-Dem's
# country_text_id.

suppressMessages({
  library(tidyverse)
  library(arrow)
  library(jsonlite)
})

setwd("/home/taimur/dev/institutional-complexity")
VDEM <- "data/shared-data/vdem/vdem.parquet"
OUT  <- "apps/country-profile/public/vdem-codebook"
dir.create(file.path(OUT, "vars"), recursive = TRUE, showWarnings = FALSE)
unlink(list.files(file.path(OUT, "vars"), full.names = TRUE))

# -- Codebook ------------------------------------------------------------------
cb <- read_parquet("data/shared-data/vdem/vdem_codebook.parquet") %>%
  mutate(across(where(is.character), ~ na_if(str_squish(.x), ""))) %>%
  distinct(tag, .keep_all = TRUE)

# Category comes from the markdown codebook. About a third of tags are
# "Other / Misc" there; those are assigned by tag prefix, following the
# sections of the V-Dem codebook.
md <- readLines("data/shared-data/vdem/vdem_codebook.md")
ti <- grep("^### `", md)
md_cat <- tibble(
  tag = gsub("^### `([^`]+)`.*", "\\1", md[ti]),
  category = map_chr(ti, function(i) {
    m <- grep("^- \\*\\*Category:", md[i:min(i + 12L, length(md))], value = TRUE)
    if (length(m)) sub("^- \\*\\*Category:\\*\\*\\s*", "", m[1]) else NA_character_
  })
) %>% distinct(tag, .keep_all = TRUE)

PREFIX_CAT <- tribble(
  ~prefix, ~category,
  "^v2x_|^v2xnp_|^v2xdd_|^v2xdl_|^v2xel_|^v2xeg_|^v2xcl_|^v2xcs_|^v2xme_|^v2xlg_|^v2xex_|^v2xps_|^v2xpe_|^v2xca_|^v2xed_|^v2xpas_|^v2xreg_|^v2xpa_", "Indices",
  "^e_",     "External (non-V-Dem)",
  "^v3",     "Historical (v3)",
  "^v2el",   "Elections",
  "^v2ps",   "Political Parties",
  "^v2dd",   "Direct Democracy",
  "^v2ex",   "Executive",
  "^v2lg",   "Legislature",
  "^v2dl",   "Deliberation",
  "^v2ju",   "Judiciary",
  "^v2cl",   "Civil Liberties",
  "^v2st|^v2sv", "State Capacity",
  "^v2cs",   "Civil Society",
  "^v2me",   "Media",
  "^v2pe",   "Political Equality",
  "^v2ca",   "Academic & Cultural",
  "^v2ed",   "Education",
  "^v2reg",  "Regime",
  "^v2sm",   "Digital Society"
)
prefix_category <- function(tag) {
  hit <- PREFIX_CAT$category[map_lgl(PREFIX_CAT$prefix, ~ grepl(.x, tag))]
  if (length(hit)) hit[1] else "Other"
}

cb <- cb %>%
  left_join(md_cat, by = "tag") %>%
  mutate(category = if_else(is.na(category) | category == "Other / Misc",
                            map_chr(tag, prefix_category), category))

# -- Which columns exist -------------------------------------------------------
cols <- names(open_dataset(VDEM)$schema)
SUFFIX <- c(point = "", codelow = "_codelow", codehigh = "_codehigh",
            osp = "_osp", osp_codelow = "_osp_codelow", osp_codehigh = "_osp_codehigh",
            ord = "_ord", mean = "_mean", nr = "_nr")

option_cols <- function(tag) {
  m <- cols[grepl(paste0("^", tag, "_[0-9]+$"), cols)]
  m[order(as.integer(sub(".*_", "", m)))]
}

cb <- cb %>%
  filter(vartype != "A*", !grepl("^Text", coalesce(scale, "")), tag != "COWcode") %>%
  mutate(options = map(tag, option_cols),
         is_multi = lengths(options) > 0) %>%
  filter(is_multi | tag %in% cols)
message("Variables: ", nrow(cb), " (", sum(cb$is_multi), " multi-select)")

# -- Data ----------------------------------------------------------------------
need <- unique(c(
  unlist(cb$options),
  unlist(map(cb$tag[!cb$is_multi], ~ intersect(paste0(.x, SUFFIX), cols)))
))
d <- read_parquet(VDEM, col_select = c("country_text_id", "country_name", "year", all_of(need))) %>%
  arrange(country_text_id, year)

countries <- d %>%
  group_by(iso = country_text_id) %>%
  summarise(name = last(country_name), y0 = min(year), y1 = max(year), .groups = "drop")
ci <- set_names(seq_len(nrow(countries)) - 1L, countries$iso)
d_ci <- unname(ci[d$country_text_id])

# -- Response options ----------------------------------------------------------
# "0: No. ... 1: Little. ..." -> list of {v, label}. Option tags in square
# brackets (multi-select questions) are stripped; one bracket in the source is
# unclosed ("[v2regsupgroups_11 12: ..."), hence the lazy pattern.
parse_responses <- function(txt) {
  if (is.na(txt)) return(NULL)
  t <- gsub("\\[[A-Za-z0-9_]+\\]?", " ", txt)
  starts <- gregexpr("(^|\\s)-?[0-9]+:\\s", t, perl = TRUE)[[1]]
  if (starts[1] < 0) return(NULL)
  pieces <- substring(t, starts, c(starts[-1] - 1, nchar(t)))
  out <- map(pieces, function(p) {
    p <- str_trim(p)
    v <- as.numeric(sub(":.*", "", p))
    list(v = v, label = str_trim(sub("^-?[0-9]+:\\s*", "", p)))
  })
  vs <- map_dbl(out, "v")
  # Guard against numbers inside labels ("between 1 and 5: ...") being read as
  # options: keep only a strictly increasing run.
  if (any(diff(vs) <= 0)) return(NULL)
  out
}

# -- Kind ----------------------------------------------------------------------
discrete_values <- function(x) {
  x <- x[!is.na(x)]
  if (!length(x) || any(abs(x - round(x)) > 1e-9)) return(NULL)
  u <- sort(unique(x))
  if (length(u) > 25) NULL else u
}

# Region codes carry no scale label but are unordered.
NOMINAL_EXTRA <- c("e_regionpol", "e_regionpol_6C", "e_regionpol_7C", "e_regiongeo")

kind_of <- function(row, x) {
  sc <- coalesce(row$scale, "")
  if (row$is_multi) return("multi")
  u <- discrete_values(x)
  if (row$tag %in% NOMINAL_EXTRA) return("nominal")
  if (grepl("^Nominal", sc) && !is.null(u)) return("nominal")
  if (row$vartype == "C" && sc == "" && !is.null(u)) return("nominal")  # is_nominal_code()
  if (paste0(row$tag, "_osp") %in% cols) return("ordinal")             # model-estimated
  if (!is.null(u) && length(u) <= 2) return("binary")
  if (!is.null(u) && length(u) <= 12) return("ordinal_raw")            # discrete, no model
  "continuous"
}

# -- Rounding ------------------------------------------------------------------
rnd <- function(x) {
  r <- suppressWarnings(max(abs(x), na.rm = TRUE))
  if (!is.finite(r)) return(x)
  if (all(abs(x - round(x)) < 1e-9, na.rm = TRUE)) return(round(x))
  if (r <= 1.5) round(x, 3) else if (r < 100) round(x, 2) else signif(x, 4)
}

# Runs of country-years with any data, as [country index, first year, length].
runs_of <- function(keep) {
  idx <- which(keep)
  if (!length(idx)) return(list(runs = list(), idx = idx))
  brk <- c(TRUE, diff(idx) != 1 | diff(d_ci[idx]) != 0 | diff(d$year[idx]) != 1)
  g <- cumsum(brk)
  runs <- map(split(idx, g), ~ c(d_ci[.x[1]], d$year[.x[1]], length(.x)))
  list(runs = unname(runs), idx = idx)
}

# jsonlite writes a NULL list element as {}; NA with na = "null" gives null.
text_or_null <- function(x) if (is.na(x)) NA else x
nul <- function(x) if (is.null(x)) NA else x

records <- vector("list", nrow(cb))
for (i in seq_len(nrow(cb))) {
  row <- cb[i, ]
  tag <- row$tag
  if (row$is_multi) {
    srcs <- set_names(row$options[[1]], sub(".*_", "", row$options[[1]]))
  } else {
    have <- SUFFIX[paste0(tag, SUFFIX) %in% cols]
    srcs <- set_names(paste0(tag, have), names(have))
  }
  M <- as.data.frame(d[, unname(srcs)])
  names(M) <- names(srcs)
  M <- M[map_lgl(M, is.numeric)]
  if (!ncol(M) || (!row$is_multi && names(M)[1] != "point")) next
  srcs <- srcs[names(M)]
  keep <- rowSums(!is.na(M)) > 0
  if (!any(keep)) next
  kind <- kind_of(row, M[[1]])
  R <- runs_of(keep)
  series <- map(M, ~ rnd(.x[R$idx]))

  resp <- parse_responses(row$responses)
  options <- NULL
  if (kind == "multi") {
    lab <- if (!is.null(resp)) set_names(map_chr(resp, "label"), map_dbl(resp, "v")) else character()
    options <- map(names(srcs), ~ list(k = .x, label = unname(coalesce(lab[.x], paste("Option", .x)))))
  }
  discrete <- if (kind %in% c("nominal", "binary", "ordinal_raw")) discrete_values(M[[1]]) else NULL
  # Variables asking about the same list (the 14 social groups of the v2reg*
  # questions, say) share this key. Wording drifts between questions ("The
  # state bureaucracy." / "Civil servants."), so it is built from the option
  # count and the opening words of the first two options only.
  rkey <- if (length(resp) >= 4) {
    paste(length(resp), map_chr(resp[1:2], ~ tolower(substr(.x$label, 1, 15))), collapse = "|")
  } else NULL

  gz <- gzfile(file.path(OUT, "vars", paste0(tag, ".json.gz")), "w", compression = 9)
  writeLines(toJSON(list(
    tag = tag,
    question = text_or_null(row$question),
    clarification = text_or_null(row$clarification),
    responses_raw = text_or_null(row$responses),
    responses = nul(resp),
    notes = text_or_null(row$notes),
    crosscoder = text_or_null(row$crosscoder_aggregation),
    cy_aggregation = text_or_null(row$cy_aggregation),
    convergence = text_or_null(row$convergence),
    pm = text_or_null(row$projectmanager),
    release = text_or_null(row$datarelease),
    runs = R$runs,
    series = series
  ), auto_unbox = TRUE, na = "null", digits = NA), gz)
  close(gz)

  obs <- d[R$idx, c("country_text_id", "year")]
  records[[i]] <- list(
    tag = tag, name = coalesce(row$name, tag), category = row$category,
    vartype = row$vartype, kind = kind, scale = text_or_null(row$scale),
    question = text_or_null(row$question),
    versions = I(names(srcs)), options = nul(options),
    values = if (is.null(discrete)) NA else I(discrete), rkey = nul(rkey),
    y0 = min(obs$year), y1 = max(obs$year),
    n_countries = n_distinct(obs$country_text_id), n_obs = nrow(obs)
  )
  if (i %% 100 == 0) message("  ", i, " / ", nrow(cb))
}
records <- compact(records)

cats <- map_chr(records, "category") %>% table() %>% sort(decreasing = TRUE) %>% names()
write_json(list(
  built = format(Sys.Date()),
  source = "V-Dem Country-Year dataset, v15 (vdemdata package), via ~/dev/shared-data/vdem",
  countries = pmap(countries, function(iso, name, y0, y1) list(iso = iso, name = name, y0 = y0, y1 = y1)),
  categories = cats,
  variables = records
), file.path(OUT, "index.json"), auto_unbox = TRUE, na = "null", digits = NA)

sz <- sum(file.size(list.files(file.path(OUT, "vars"), full.names = TRUE)))
message("Wrote ", length(records), " variables; vars/ is ", round(sz / 2^20), " MB; index ",
        round(file.size(file.path(OUT, "index.json")) / 2^10), " KB")
print(table(map_chr(records, "kind")))
