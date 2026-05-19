#!/usr/bin/env Rscript
# Export the PolSett (Political Settlements) dataset for the country-profile app.
#
# Source: Schulz & Kelsall (2020), ESID — 44 Global-South countries,
# political-period-coded with values held constant within periods, 1945-2019.
# Local mirror: ~/dev/shared-data/polsett/psd_main_aggregated_v1.dta
#
# Outputs:
#   public/polsett/typology.json
#       Compact array {iso3, year, sfs, pc, khan, leader, periodStart, periodEnd}
#       for every country-year where the two typology axes are present. Drives
#       the typology scatter (with year slider).
#   public/polsett/panel.parquet
#       Long-format (iso3, year, tag, value). All numeric indicators (`x_*`
#       indices + `q*_*` raw items, deduped against `_sd/_wsd/_rsd/_n/_nor`
#       variants).
#   public/polsett/indicators.json
#       Registry: tag, name, section, question, construction, scale, notes —
#       parsed from the codebook PDF text.
#   public/polsett/meta.json
#       Top-level metadata (citation, year range, country list).

suppressMessages({
  library(tidyverse)
  library(haven)
  library(arrow)
  library(countrycode)
  library(jsonlite)
})

setwd("/home/taimur/dev/institutional-complexity")

DTA      <- "~/dev/shared-data/polsett/psd_main_aggregated_v1.dta"
CODEBOOK <- "~/dev/shared-data/polsett/codebook.txt"
OUT_DIR  <- "apps/country-profile/public/polsett"
dir.create(OUT_DIR, showWarnings = FALSE, recursive = TRUE)

# -- Load --------------------------------------------------------------------
message("Loading PolSett main aggregated dataset…")
raw <- read_dta(DTA)

# Variable labels (haven embeds them as attribute `label` per column).
labels <- map_chr(raw, ~ {
  l <- attr(.x, "label")
  if (is.null(l)) NA_character_ else as.character(l)
})

# -- Country crosswalk -------------------------------------------------------
target_isos <- fromJSON("apps/country-profile/public/countries.json")$iso3

# PolSett uses its own country names; map via countrycode with overrides.
psd_names <- unique(raw$cname_psd)
iso_lookup <- countrycode(
  psd_names,
  origin = "country.name",
  destination = "iso3c",
  custom_match = c(
    "D.R. of the Congo"    = "COD",
    "Syrian Arab Republic" = "SYR",
    "Republic of Korea"    = "KOR",
    "Yemen"                = "YEM",
    "Yemen (North)"        = NA_character_,
    "Yemen (South)"        = NA_character_,
    "Côte d'Ivoire"        = "CIV"
  )
)
names(iso_lookup) <- psd_names

df <- raw %>%
  mutate(iso3 = unname(iso_lookup[cname_psd])) %>%
  filter(!is.na(iso3), iso3 %in% target_isos)

message("Country-years kept: ", nrow(df),
        " · countries: ", length(unique(df$iso3)))

# -- Typology slice ----------------------------------------------------------
# Quadrant labels for the BOOK typology (sfs × pc), derived directly from
# the axes so the tooltip and visual can never disagree.
SK_QUADRANT_LABELS <- c(
  "BC" = "Strong-Dominant",          # broad SF, concentrated power
  "NC" = "Vulnerable-Authoritarian", # narrow SF, concentrated power
  "ND" = "Competitive-Clientelist",  # narrow SF, dispersed power
  "BD" = "Weak-Dominant"             # broad SF, dispersed power
)

# Quadrant labels for the KHAN typology — these come straight from
# `x_khansettlementype` (codebook 4.1.11), which dichotomises horizontal &
# vertical power at their full-sample means.
KHAN_QUADRANT_LABELS <- c(
  "1" = "Strong-Dominant",
  "2" = "Vulnerable-Authoritarian",
  "3" = "Competitive-Clientelist",
  "4" = "Weak-Dominant"
)

# Codebook cutoffs.
CUT_SFS  <- 41     # x_sfsdummy mean (0-100)
CUT_PC   <- 0.56   # x_pcdummy  mean (0-1)
CUT_HORZ <- 3.28   # x_horizontalpowerdummy mean (1-5)
CUT_VERT <- 0.44   # x_verticalpowerdummy   mean (0-1)

typology <- df %>%
  transmute(
    iso3,
    year         = as.integer(year),
    # Schulz-Kelsall axes. We use the additive Power Concentration index
    # (x_powerconcentration_add = 0.5 * horz_nor + 0.5 * vert) — same
    # variant that defines x_pcdummy at the CUT_PC = 0.56 threshold below,
    # so the dummies and the continuous y-axis stay aligned.
    sfs          = round(x_socialfoundationsize, 2),
    pc           = round(x_powerconcentration_add, 4),
    # Khan axes
    horz         = round(as.numeric(x_horizontalpower), 3),  # 1-5
    vert         = round(x_verticalpower, 4),                # 0-1
    khan_raw     = as.integer(x_khansettlementype),          # 1-4
    leader       = leadername_nonumber,
    period_start = as.integer(periodstart),
    period_end   = as.integer(periodend)
  ) %>%
  filter(!is.na(sfs), !is.na(pc)) %>%
  mutate(
    # Schulz-Kelsall quadrant (anchored to (sfs, pc) axes)
    sk_code = paste0(
      if_else(sfs >= CUT_SFS, "B", "N"),
      if_else(pc  >= CUT_PC,  "C", "D")
    ),
    sk_label = SK_QUADRANT_LABELS[sk_code],
    # Khan quadrant straight from the dataset's settlement type
    khan_label = KHAN_QUADRANT_LABELS[as.character(khan_raw)]
  ) %>%
  arrange(iso3, year)

message("Typology rows: ", nrow(typology),
        " · year range: ", min(typology$year), "-", max(typology$year))

write_json(
  typology,
  file.path(OUT_DIR, "typology.json"),
  auto_unbox = TRUE,
  na = "null",
  digits = 4
)

# -- Indicator catalog -------------------------------------------------------
# Identify numeric indicator columns. Drop:
#   - identifier / meta cols
#   - the typology axes (rendered in the scatter, not the explorer)
#   - SD / weighted-SD / relative-SD / reply-count variants
#   - `_nor` normalized variants when the un-normalized form is also present
#     (raw form is more interpretable; users can read both labels in tooltip)
ID_COLS <- c(
  "cname_psd", "cname_qog", "cname_vdem", "histname_vdem", "cname_wdi",
  "cabbrev_pwt", "ccode_qog", "ccode_cow", "year", "period", "periodstart",
  "periodend", "periodduration", "leadername_number", "leadername_nonumber",
  "leadername_archigos", "periodnumber", "periodtypebasic", "breakrationale",
  "iso3"
)

is_numericish <- function(x) {
  if (inherits(x, c("haven_labelled", "labelled"))) return(TRUE)
  is.numeric(x)
}

all_cols <- names(df)
candidate <- all_cols[
  !all_cols %in% ID_COLS &
  vapply(df, is_numericish, logical(1)) &
  # Drop SD / response-count variants — never useful for plotting
  !grepl("_(sd|wsd|rsd|n|replies)$", all_cols) &
  # Drop the simple-mean / weighted-mean aggregation variants — keep the
  # default (intercoder-distance-based) form documented in codebook §2.1.3
  !grepl("_(sm|wm)$", all_cols) &
  # Drop numerically recoded `_nr` variants — the parent column is already
  # numeric for our use (haven labelled = numeric values + text labels)
  !grepl("_nr$", all_cols)
]

# Among `_nor` (normalized) pairs, prefer the raw form if both exist.
strip_nor <- sub("_nor$", "", candidate)
has_raw <- strip_nor %in% candidate
candidate <- ifelse(
  endsWith(candidate, "_nor") & has_raw,
  NA_character_,
  candidate
)
candidate <- candidate[!is.na(candidate)]

# Powerfulgroups / powerlessgroups are coded as ranked lists, not numeric.
candidate <- candidate[!grepl("powerfulgroups|powerlessgroups", candidate)]

# `q*_confidence` are coder confidence ratings — meta-stats, not indicators.
candidate <- candidate[!grepl("_confidence$", candidate)]

# Drop the two typology axes — they're in their own panel.
candidate <- setdiff(
  candidate,
  c("x_socialfoundationsize", "x_powerconcentration_mix")
)

message("Indicator columns to ship: ", length(candidate))

# -- Codebook parser ---------------------------------------------------------
# pdftotext output is preserved. Parse each variable entry: heading line of
# form "<section>.<n> Title (varname)", followed by Question/Construction/
# Scale/Notes blocks. We treat blocks loosely — splitting on the next heading
# is good enough.

cb_lines <- readLines(CODEBOOK, warn = FALSE)

# Heading: line that starts with "<section>.<n> Title (varname)". The codebook
# wraps long headings across two lines — when the tag is missing on the first
# line, peek ahead and stitch.
is_heading <- function(line) {
  grepl("^\\s*\\d+\\.\\d+(\\.\\d+)?\\s+\\S", line) &
    !grepl("^\\s*\\d+\\.\\d+(\\.\\d+)?\\s+\\S.*\\.{3,}\\s*\\d+\\s*$", line) &
    # Exclude TOC-style entries (dots leading to page numbers)
    !grepl("\\.{4,}", line)
}

heading_idx <- which(vapply(cb_lines, is_heading, logical(1),
                            USE.NAMES = FALSE))

# Stitch headings whose `(tag)` got bumped onto the next line
stitched <- character(length(heading_idx))
for (i in seq_along(heading_idx)) {
  k <- heading_idx[i]
  raw <- cb_lines[k]
  if (!grepl("\\([a-zA-Z_][a-zA-Z0-9_]*\\)\\s*$", raw)) {
    # Try to pull the tag from up to the next 3 lines
    look <- paste(cb_lines[k:min(k + 3L, length(cb_lines))], collapse = " ")
    raw <- look
  }
  stitched[i] <- raw
}

# Reject any "headings" that still don't expose a (tag).
keep <- grepl("\\([a-zA-Z_][a-zA-Z0-9_]*\\)", stitched)
heading_idx <- heading_idx[keep]
stitched <- stitched[keep]

# Body label set, matched at start of a line (any indent).
FIELD_RE <- paste0(
  "^\\s*(Question(?:/Request)?|Clarification|Clarification|",
  "Construction|Scale|Response options|Categories|Possible answers|",
  "Additional versions|Notes|Scale inversion):\\s*"
)

# Standardize field names to a stable key set.
standardize_field <- function(f) {
  f <- sub("/Request$", "", f)
  f <- sub("Clariﬁcation", "Clarification", f, fixed = TRUE)
  f
}

parse_entry <- function(i) {
  start <- heading_idx[i]
  end <- if (i < length(heading_idx)) heading_idx[i + 1L] - 1L else length(cb_lines)

  head <- stitched[i]
  tag <- regmatches(head, regexpr("\\(([a-zA-Z_][a-zA-Z0-9_]*)\\)", head))
  tag <- gsub("[()]", "", tag)
  section_full <- regmatches(head, regexpr("\\d+\\.\\d+(\\.\\d+)?", head))
  section_top  <- sub("^(\\d+\\.\\d+).*", "\\1", section_full)
  # Strip the section number and (tag) — leaves the indicator name
  name <- sub(paste0("^\\s*", section_full, "\\s+"), "", head)
  name <- sub("\\s*\\([a-zA-Z_][a-zA-Z0-9_]*\\)\\s*.*$", "", name)
  name <- str_trim(name)

  body <- cb_lines[(start + 1L):end]
  # Find field boundaries within the body
  is_field <- grepl(FIELD_RE, body, perl = TRUE)
  field_pos <- which(is_field)
  if (length(field_pos) == 0L) {
    fields <- list()
  } else {
    field_ends <- c(field_pos[-1] - 1L, length(body))
    fields <- list()
    for (k in seq_along(field_pos)) {
      span <- body[field_pos[k]:field_ends[k]]
      first <- span[1]
      fname <- regmatches(first, regexpr(FIELD_RE, first, perl = TRUE))
      fname <- sub("^\\s*", "", fname)
      fname <- sub(":\\s*$", "", fname)
      fname <- standardize_field(fname)
      content <- c(
        sub(FIELD_RE, "", first, perl = TRUE),
        if (length(span) > 1) span[-1] else character()
      )
      content <- str_trim(paste(content, collapse = " "))
      content <- gsub("\\s+", " ", content)
      fields[[fname]] <- content
    }
  }

  list(
    tag = tag,
    name = name,
    section = section_top,
    section_path = section_full,
    question     = fields[["Question"]]      %||% NA_character_,
    clarification = fields[["Clarification"]] %||% NA_character_,
    responses    = fields[["Response options"]] %||% fields[["Possible answers"]] %||% fields[["Categories"]] %||% NA_character_,
    construction = fields[["Construction"]]  %||% NA_character_,
    scale        = fields[["Scale"]]         %||% NA_character_,
    notes        = fields[["Notes"]]         %||% NA_character_
  )
}

`%||%` <- function(a, b) if (is.null(a) || is.na(a) || !nzchar(a)) b else a

parsed <- map(seq_along(heading_idx), parse_entry)
parsed_df <- bind_rows(parsed) %>%
  filter(!is.na(tag), nzchar(tag)) %>%
  distinct(tag, .keep_all = TRUE)

# Map section -> human-readable label
SECTION_LABELS <- c(
  "3.1" = "I. Configuration of Power",
  "3.2" = "II. Blocs' Relationship to the Settlement",
  "3.3" = "III. Decision-making & Implementation Power",
  "3.4" = "IV. Foreign Influence & Threats",
  "3.5" = "V. Economic Organizations",
  "3.6" = "VI. Economic & Social Policy",
  "4.1" = "Index — Power Concentration",
  "4.2" = "Index — Social Foundation & Cooptation",
  "4.3" = "Index — Other"
)

# Some 4.* sections beyond the codebook ToC (4.3+) — backfill with "Index"
parsed_df <- parsed_df %>%
  mutate(
    section_label = SECTION_LABELS[section],
    section_label = if_else(
      is.na(section_label) & startsWith(section, "4"),
      "Index — Other",
      section_label
    )
  )

# Inherit clarification & responses from a sibling when this entry says
# "Identical to ...". Most q*_clb / q*_ob entries reference q*_lb.
sibling_question <- function(text) {
  if (is.na(text)) return(NA_character_)
  m <- regmatches(text, regexpr("\\(([a-zA-Z_][a-zA-Z0-9_]*)\\)", text))
  if (length(m) == 0) return(NA_character_)
  gsub("[()]", "", m)
}
identical_ref <- vapply(
  parsed_df$question,
  function(q) {
    if (is.na(q)) return(NA_character_)
    if (!grepl("Identical to", q)) return(NA_character_)
    sibling_question(q)
  },
  character(1)
)
parsed_df$identical_ref <- identical_ref
parent_map <- parsed_df %>% select(tag, q = question, c = clarification,
                                   r = responses, s = scale)
parsed_df <- parsed_df %>%
  rowwise() %>%
  mutate(
    parent_q = parent_map$q[match(identical_ref, parent_map$tag)],
    parent_c = parent_map$c[match(identical_ref, parent_map$tag)],
    parent_r = parent_map$r[match(identical_ref, parent_map$tag)],
    question      = if (!is.na(identical_ref) && !is.na(parent_q))
                      paste0("(Same as ", identical_ref, ", below) ", parent_q)
                    else question,
    clarification = coalesce(clarification, parent_c),
    responses     = coalesce(responses, parent_r)
  ) %>%
  ungroup() %>%
  select(-parent_q, -parent_c, -parent_r, -identical_ref)

# -- Build the registry against the actual shipped columns -------------------
# A `_nr` (numerically recoded) variant inherits its parent's codebook entry.
canonical_tag <- function(tag) sub("_nr$", "", tag)

registry <- tibble(tag = candidate) %>%
  left_join(parsed_df, by = "tag") %>%
  mutate(
    # Fall back to the dta label if the codebook parser missed it
    name = coalesce(name, unname(labels[tag])),
    # Anything still without a section is a derived/auxiliary index outside
    # the codebook ToC — group them under "Other".
    section_label = coalesce(section_label, "Other / Auxiliary"),
    section = coalesce(section, "9.9")
  ) %>%
  select(tag, name, section, section_label, question, clarification,
         responses, construction, scale, notes) %>%
  arrange(section, name)

# Drop entries with no name at all (unlikely but safe)
registry <- registry %>% filter(!is.na(name) & nchar(name) > 0)

# Sections list in display order
section_order <- c(
  "3.1", "3.2", "3.3", "3.4", "3.5", "3.6",
  "4.1", "4.2", "4.3"
)
sections <- registry %>%
  distinct(section, section_label) %>%
  arrange(match(section, section_order))

write_json(
  list(
    sections = sections,
    indicators = registry
  ),
  file.path(OUT_DIR, "indicators.json"),
  auto_unbox = FALSE,
  na = "null",
  pretty = TRUE
)

message("Indicator registry written: ", nrow(registry), " entries")

# -- Long-format panel -------------------------------------------------------
shipped_tags <- registry$tag
message("Building long-format panel for ", length(shipped_tags), " indicators…")

panel <- df %>%
  select(iso3, year, all_of(shipped_tags)) %>%
  mutate(across(all_of(shipped_tags), \(x) as.numeric(x))) %>%
  pivot_longer(all_of(shipped_tags), names_to = "tag", values_to = "value") %>%
  filter(!is.na(value)) %>%
  mutate(
    iso3  = factor(iso3),
    tag   = factor(tag, levels = shipped_tags),
    year  = as.integer(year),
    value = round(value, 4)
  ) %>%
  arrange(tag, iso3, year)

message("Panel rows: ", format(nrow(panel), big.mark = ","))

out_parquet <- file.path(OUT_DIR, "panel.parquet")
write_parquet(
  panel,
  out_parquet,
  compression = "snappy",
  use_dictionary = TRUE,
  write_statistics = TRUE
)
message("Wrote ", out_parquet,
        " (", format(file.info(out_parquet)$size / 1024 / 1024,
                     digits = 3), " MB)")

# -- Meta --------------------------------------------------------------------
country_list <- df %>%
  distinct(iso3, cname_psd) %>%
  arrange(iso3) %>%
  rename(name = cname_psd) %>%
  mutate(name = as.character(name))

meta <- list(
  source = unbox("Schulz & Kelsall (2020), ESID — Political Settlements (PolSett) Dataset"),
  citation = unbox(paste(
    "Schulz, Nicolai and Tim Kelsall. 2021.",
    "'The political settlements dataset: An introduction with illustrative applications.'",
    "ESID Working Paper No. 165. Manchester."
  )),
  year_range = c(min(typology$year), max(typology$year)),
  countries = country_list,
  typology_sk = list(
    x_var = unbox("x_socialfoundationsize"),
    y_var = unbox("x_powerconcentration_add"),
    x_label = unbox("Social foundation size"),
    y_label = unbox("Power concentration"),
    x_cut = unbox(CUT_SFS),
    y_cut = unbox(CUT_PC),
    x_description = unbox(paste(
      "Share of the population that is both potentially powerful/disruptive",
      "AND co-opted under the leadership (0–100%). Narrow ↔ broad."
    )),
    y_description = unbox(paste(
      "Additive Power Concentration Index: 0.5·horizontal + 0.5·vertical",
      "(min-max normalised, 0–1). Same variant that defines x_pcdummy at its",
      "sample mean (0.56). Dispersed ↔ concentrated."
    ))
  ),
  typology_khan = list(
    x_var = unbox("x_horizontalpower"),
    y_var = unbox("x_verticalpower"),
    x_label = unbox("Horizontal power"),
    y_label = unbox("Vertical power"),
    x_cut = unbox(CUT_HORZ),
    y_cut = unbox(CUT_VERT),
    x_description = unbox(paste(
      "How concentrated power is in the governing coalition (LB + CLB)",
      "vis-à-vis the opposition. 1 = OB dominates, 5 = governing coalition",
      "dominates. Mean ≈ 3.28."
    )),
    y_description = unbox(paste(
      "How concentrated power is in the leader's bloc within the governing",
      "coalition (LB vs CLB). PCA-weighted index of LB-vs-CLB power ratio,",
      "likelihood of CLB defection, LB hierarchy and LB cohesiveness;",
      "min-max normalised. Mean ≈ 0.44."
    ))
  )
)

write_json(
  meta,
  file.path(OUT_DIR, "meta.json"),
  auto_unbox = FALSE,
  pretty = TRUE,
  na = "null"
)

message("Wrote meta.json")
message("Done.")
