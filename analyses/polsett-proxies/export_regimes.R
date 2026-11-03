# Export V-Dem's regime survey (v2reg*) and the head-of-state and governing-party
# information for the regime explorer in khan-axes.html. Writes regime_data.js
# (window.REGIMES).
#
# Unit: country-year, 1900-2025, every country in V-Dem v16. A regime is a run of
# years with the same V-Dem regime identifier (v2regidnr). V-Dem's country-year
# file records the regime in place at the end of each year, so regimes that began
# and ended within one calendar year do not appear.
#
# The governing party comes from V-Party v2 (elections to 2019): the senior
# government partner (v2pagovsup = 0) and junior partners (= 1) after each
# election, with their internal cohesion, personalisation and local organisation.

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity/analyses/polsett-proxies")

G <- 0:13
v <- open_dataset("~/dev/shared-data/vdem/vdem.parquet")
cols <- c("country_name", "country_text_id", "year", "v2reginfo", "v2regidnr", "v2regendtype", "v2regint",
          "v2regsupgroupssize_osp", "v2regsupgroupssize_osp_codelow", "v2regsupgroupssize_osp_codehigh",
          "v2regoppgroupssize_osp", "v2regoppgroupssize_osp_codelow", "v2regoppgroupssize_osp_codehigh",
          "v2regimpgroup", "v2regimpoppgroup", "v2regpower", "v2regproreg", "v2regantireg",
          "v2regsuploc", "v2regopploc", "v2exnamhos", "v2exparhos", "v2exnamhog", "v2expathhs", "v2x_polyarchy",
          paste0("v2regsupgroups_", G), paste0("v2regoppgroups_", G), paste0("v2regoppgroupsact_", G))
d <- v %>% filter(year >= 1900) %>% select(all_of(cols)) %>% collect() %>% arrange(country_text_id, year)

r2 <- function(x) ifelse(is.finite(x), round(x, 2), NA)
pct <- function(x) ifelse(is.finite(x), as.integer(round(100 * x)), NA)
int <- function(x) ifelse(is.finite(x), as.integer(x), NA)
str <- function(x) same_as_prev(as.list(ifelse(is.na(x) | x == "", NA, x)))
shares <- function(df, stem) {
  m <- as.matrix(df[paste0(stem, G)])
  rows <- lapply(seq_len(nrow(m)), function(i) if (all(is.na(m[i, ]))) NULL else pct(m[i, ]))
  same_as_prev(rows)
}
# Within a regime most rows repeat the previous year. A repeated row or string is
# written as 1 and restored by carrying the previous value forward in the page.
same_as_prev <- function(xs) {
  for (i in rev(seq_along(xs))[-length(xs)])
    if (!is.null(xs[[i]]) && !all(is.na(xs[[i]])) && identical(xs[[i]], xs[[i - 1]])) xs[[i]] <- 1L
  xs
}

# "Museveni's rule (27/01/1986 - E)" -> name, start, end
parse_info <- function(s) {
  m <- str_match(s, "^(.*?)\\s*\\((\\d[^()]*?)\\s*[-\u2013\u2014]\\s*([^()]*?)\\)\\s*(.*)$")
  tibble(name = str_squish(ifelse(is.na(m[, 2]), s, paste(m[, 2], m[, 5]))), start = m[, 3], end = m[, 4])
}

countries <- list()
for (iso in unique(d$country_text_id)) {
  x <- d %>% filter(country_text_id == iso)
  if (all(is.na(x$v2regidnr))) next

  runs <- x %>% filter(!is.na(v2regidnr)) %>%
    mutate(run = cumsum(v2regidnr != lag(v2regidnr, default = -1) | year != lag(year, default = -1) + 1)) %>%
    group_by(run, id = v2regidnr) %>%
    summarise(y0 = min(year), y1 = max(year), info = last(na.omit(v2reginfo)),
              endtype = last(v2regendtype), .groups = "drop")
  regimes <- bind_cols(runs, parse_info(runs$info)) %>%
    transmute(id = as.integer(id), name, start, end, endtype = int(endtype), y0, y1)

  countries[[iso]] <- list(
    name = last(x$country_name), y0 = min(x$year),
    regimes = regimes,
    rid = int(x$v2regidnr), int = int(x$v2regint),
    sup = r2(x$v2regsupgroupssize_osp), supl = r2(x$v2regsupgroupssize_osp_codelow), suph = r2(x$v2regsupgroupssize_osp_codehigh),
    opp = r2(x$v2regoppgroupssize_osp), oppl = r2(x$v2regoppgroupssize_osp_codelow), opph = r2(x$v2regoppgroupssize_osp_codehigh),
    imp = int(x$v2regimpgroup), impo = int(x$v2regimpoppgroup), pow = int(x$v2regpower),
    pro = int(x$v2regproreg), anti = int(x$v2regantireg),
    sloc = int(x$v2regsuploc), oloc = int(x$v2regopploc),
    hos = str(x$v2exnamhos), hosp = str(x$v2exparhos), hog = str(x$v2exnamhog), path = int(x$v2expathhs),
    poly = r2(x$v2x_polyarchy),
    sg = shares(x, "v2regsupgroups_"), og = shares(x, "v2regoppgroups_"), oa = shares(x, "v2regoppgroupsact_")
  )
}

# ---- V-Party: governing parties after each election -------------------------
p <- read_parquet("~/dev/shared-data/vparty/vparty.parquet")
PG <- 0:14
gov <- p %>% filter(v2pagovsup %in% c(0, 1), country_text_id %in% names(countries)) %>%
  arrange(country_text_id, year, v2pagovsup, desc(v2paseatshare))
for (iso in unique(gov$country_text_id)) {
  g <- gov %>% filter(country_text_id == iso)
  grp <- as.matrix(g[paste0("v2pagroup_", PG)])
  countries[[iso]]$parties <- lapply(seq_len(nrow(g)), function(i) list(
    y = g$year[i], role = as.integer(g$v2pagovsup[i]),
    name = coalesce(g$v2paenname[i], g$v2paorname[i]), short = g$v2pashname[i],
    vote = r2(g$v2pavote[i]), seat = r2(g$v2paseatshare[i]),
    disa = r2(g$v2padisa_osp[i]), ind = r2(g$v2paind_osp[i]), act = r2(g$v2paactcom_osp[i]), loc = r2(g$v2palocoff_osp[i]),
    groups = which(grp[i, ] >= 0.5) - 1L
  ))
}

# ---- codebook text for the info notes ---------------------------------------
cb <- read_parquet("~/dev/shared-data/vdem/vdem_codebook.parquet")
cbp <- read_parquet("~/dev/shared-data/vparty/vparty_codebook.parquet")
doc_of <- function(tag, book = cb) {
  r <- book %>% filter(tag == !!tag) %>% slice(1)
  list(tag = tag, name = r$name, question = r$question, clarification = r$clarification)
}
DOC <- c("v2reginfo", "v2regendtype", "v2regsupgroupssize", "v2regoppgroupssize", "v2regsupgroups",
         "v2regoppgroups", "v2regoppgroupsact", "v2regimpgroup", "v2regimpoppgroup", "v2regpower",
         "v2regproreg", "v2regantireg", "v2regsuploc", "v2regopploc", "v2exnamhos", "v2exparhos", "v2expathhs")
docs <- c(set_names(map(DOC, doc_of), DOC),
          set_names(map(c("v2pagovsup", "v2padisa", "v2paind", "v2paactcom", "v2pagroup"), doc_of, book = cbp),
                    c("v2pagovsup", "v2padisa", "v2paind", "v2paactcom", "v2pagroup")))

out <- list(built = format(Sys.Date()), years = c(1900, max(d$year)), countries = countries, docs = docs)
writeLines(paste0("window.REGIMES = ", toJSON(out, auto_unbox = TRUE, na = "null", null = "null", digits = NA,
                                               dataframe = "rows"), ";"), "regime_data.js")
message("Wrote regime_data.js (", round(file.size("regime_data.js") / 1024), " KB): ", length(countries), " countries, ",
        sum(map_int(countries, ~ nrow(.x$regimes))), " regimes")

# ---- per-country files for the country-profile app (/regimes/<ISO>.json) ----
# Same structure as one entry of window.REGIMES$countries; the codebook text goes
# in regimes/meta.json. The folder is gitignored and deployed by rsync.
app_dir <- "../../apps/country-profile/public/regimes"
dir.create(app_dir, showWarnings = FALSE, recursive = TRUE)
for (iso in names(countries))
  writeLines(toJSON(countries[[iso]], auto_unbox = TRUE, na = "null", null = "null", digits = NA, dataframe = "rows"),
             file.path(app_dir, paste0(iso, ".json")))
writeLines(toJSON(list(built = out$built, years = out$years, docs = docs), auto_unbox = TRUE, na = "null", null = "null"),
           file.path(app_dir, "meta.json"))
message("Wrote ", length(countries), " country files to ", normalizePath(app_dir))
