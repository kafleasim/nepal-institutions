#!/usr/bin/env Rscript
# Export the z-scored V-Dem fingerprint matrices for every cross-section year
# in country_spaces_by_year.rds (1975, 1985, 1995, 2005, 2015, 2025) as a
# single long-format parquet.
#
# The country-profile app uses this for two things:
#   1. Institutional peers — Euclidean distances on the indicator matrix,
#      computed in-browser per (year, focus country).
#   2. "Why this peer?" anomaly chart — pairs of z-scores against the
#      chosen year's world average.
#
# Output:
#   apps/country-profile/public/fingerprints_by_year.parquet
#       Columns: year (int16), iso3 (dict-encoded), tag (dict-encoded),
#       z (float32). All years stacked vertically.

suppressMessages({
  library(tidyverse)
  library(arrow)
  library(countrycode)
})

setwd("/home/taimur/dev/institutional-complexity")

spaces <- readRDS("scratch/country_spaces_by_year.rds")

# V-Dem -> ISO3 patches for common-name residuals.
custom_iso <- c(
  "Burma/Myanmar"      = "MMR",
  "Czech Republic"     = "CZE",
  "German Democratic Republic" = "DDR",
  "Hong Kong"          = "HKG",
  "Ivory Coast"        = "CIV",
  "Kosovo"             = "XKX",
  "Palestine/Gaza"     = "PSE",
  "Palestine/West Bank" = "PSE",
  "Republic of the Congo" = "COG",
  "Sao Tome and Principe" = "STP",
  "Somaliland"         = NA_character_,
  "South Vietnam"      = NA_character_,
  "Vietnam, Democratic Republic of" = NA_character_,
  "Yemen, People's Republic of" = NA_character_,
  "Zanzibar"           = NA_character_
)

# Convert one year's Mz to a long tibble keyed by ISO3.
mz_to_long <- function(year, Mz) {
  country_names <- rownames(Mz)
  iso_lookup <- countrycode(
    country_names,
    origin = "country.name", destination = "iso3c",
    custom_match = custom_iso,
    warn = FALSE
  )

  keep <- !is.na(iso_lookup)
  if (any(!keep)) {
    cat(sprintf("[%s] dropping (no ISO3): %s\n",
                year, paste(country_names[!keep], collapse = ", ")))
  }
  Mz_keep  <- Mz[keep, , drop = FALSE]
  iso_keep <- iso_lookup[keep]

  # Collapse duplicate ISO3s by mean fingerprint.
  if (anyDuplicated(iso_keep)) {
    Mz_collapsed <- t(sapply(unique(iso_keep), function(code) {
      rows <- which(iso_keep == code)
      if (length(rows) == 1) Mz_keep[rows, ]
      else colMeans(Mz_keep[rows, , drop = FALSE])
    }))
    rownames(Mz_collapsed) <- unique(iso_keep)
    Mz_keep  <- Mz_collapsed
    iso_keep <- unique(iso_keep)
  }
  rownames(Mz_keep) <- iso_keep

  as_tibble(Mz_keep, rownames = "iso3") %>%
    pivot_longer(-iso3, names_to = "tag", values_to = "z") %>%
    mutate(year = as.integer(year), .before = 1)
}

long_all <- bind_rows(lapply(names(spaces), function(y) {
  mz_to_long(y, spaces[[y]]$Mz)
}))

long_all <- long_all %>%
  mutate(
    year = as.integer(year),
    iso3 = factor(iso3, levels = sort(unique(iso3))),
    tag  = factor(tag,  levels = sort(unique(tag))),
    z    = round(z, 4)
  ) %>%
  arrange(year, iso3, tag)

message("Years:            ", paste(sort(unique(long_all$year)), collapse = ", "))
message("Unique ISO3s:     ", length(unique(long_all$iso3)))
message("Unique tags:      ", length(unique(long_all$tag)))
message("Total cells:      ", format(nrow(long_all), big.mark = ","))

out <- "apps/country-profile/public/fingerprints_by_year.parquet"
write_parquet(
  long_all, out,
  compression = "snappy",
  use_dictionary = TRUE,
  write_statistics = TRUE
)
message("Wrote ", out, " (",
        format(file.info(out)$size / 1024, digits = 4), " KB)")
