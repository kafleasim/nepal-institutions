# Export the concept-first index results for khan-axes.html.
# Reads the outputs of khan_build.R and khan_indices.R; writes khan_data.js.

suppressMessages({ library(tidyverse); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity/analyses/polsett-proxies")

Gi <- readRDS("khan_indices.rds")
Ki <- readRDS("khan_periods.rds")

# The specification is parsed out of khan_indices.R so the page cannot drift
# from the script that produced the numbers.
src <- readLines("khan_indices.R")
spec_txt <- src[(grep("^SPEC <- tribble", src) + 1):(grep("^\\)$", src)[1] - 1)]
SPEC <- spec_txt %>%
  keep(~ grepl('^\\s*"[HVUE]",', .x)) %>%
  map_dfr(~ {
    m <- regmatches(.x, gregexpr('"[^"]*"|-?[0-9]+(?=,)', .x, perl = TRUE))[[1]]
    tibble(index = gsub('"', "", m[1]), lens = gsub('"', "", m[2]), key = gsub('"', "", m[3]),
           sign = as.integer(m[4]), why = gsub('"', "", m[5]))
  })
stopifnot(nrow(SPEC) >= 25)
SPEC <- SPEC %>% mutate(z = paste0("z_", key, "_", index))

LENS <- SPEC %>% distinct(index, lens) %>% mutate(col = paste(index, lens, sep = "_"))
IDX <- c("H", "V", "U")
KHAN <- c("SD", "VA", "CC", "WD")

ref <- Gi %>% filter(year <= 2019)
cutH <- median(ref$H, na.rm = TRUE); cutV <- median(ref$V, na.rm = TRUE)
khan_type <- function(h, v) case_when(is.na(h) | is.na(v) ~ NA_character_,
                                      h >= cutH & v >= cutV ~ "SD", h < cutH & v >= cutV ~ "VA",
                                      h < cutH & v < cutV ~ "CC", TRUE ~ "WD")
rnd <- function(x, d = 3) ifelse(is.finite(x), round(x, d), NA)

# ---- country-periods -------------------------------------------------------
P <- Ki %>%
  filter(!is.na(H) | !is.na(V)) %>%
  mutate(ours = khan_type(H, V), ps = KHAN[x_khansettlementype]) %>%
  arrange(cname_psd, y0)

periods <- P %>%
  transmute(c = cname_psd, iso = iso3, y0, y1, leader, ps, ours,
            across(all_of(c(IDX, LENS$col[LENS$index %in% IDX])), rnd),
            psH = rnd(x_horizontalpower), psV = rnd(x_verticalpower),
            q8 = rnd(q8_hierarchy_lb), uni = rnd(unipolar), poly = rnd(v2x_polyarchy))
periods$z <- pmap(P[SPEC$z], function(...) unname(rnd(c(...), 2)))

# ---- yearly series for PolSett countries -------------------------------------
xw <- Ki %>% distinct(cname_psd, iso3)
years <- Gi %>%
  filter(country_text_id %in% xw$iso3, year <= 2023) %>%
  transmute(iso = country_text_id, y = year, across(all_of(c(IDX, LENS$col[LENS$index %in% IDX])), ~ rnd(.x, 2)))

# ---- 2015-2019 world placement ------------------------------------------------
recent <- Gi %>% filter(between(year, 2015, 2019)) %>%
  group_by(iso = country_text_id, name = country_name) %>%
  summarise(across(all_of(c(IDX, LENS$col[LENS$index %in% IDX], SPEC$z, "v2x_polyarchy")),
                   ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(where(is.double), ~ ifelse(is.finite(.x), .x, NA_real_))) %>%
  filter(!is.na(H), !is.na(V)) %>%
  mutate(type = khan_type(H, V), inPS = iso %in% xw$iso3)
world <- recent %>%
  transmute(iso, name, type, inPS, across(all_of(c(IDX, LENS$col[LENS$index %in% IDX])), rnd),
            poly = rnd(v2x_polyarchy))
world$z <- pmap(recent[SPEC$z], function(...) unname(rnd(c(...), 2)))

# ---- statistics ---------------------------------------------------------------
cor_m <- function(d, cols) { m <- cor(d[cols], use = "pairwise.complete.obs"); dimnames(m) <- NULL; round(m, 2) }
coherence <- map(set_names(IDX), ~ {
  cols <- LENS$col[LENS$index == .x]
  list(lenses = sub("^[A-Z]_", "", cols), r = cor_m(ref, cols))
})

disc <- tibble(col = c(LENS$col, "H", "V", "U", "E")) %>%
  mutate(r = map_dbl(col, ~ round(cor(ref[[.x]], ref$v2x_polyarchy, use = "pair"), 2)))

decomp <- function(d, a, b) {
  d <- d %>% filter(!is.na(.data[[a]]), !is.na(.data[[b]]))
  bw <- d %>% group_by(cname_psd) %>% summarise(x = mean(.data[[a]]), y = mean(.data[[b]]), .groups = "drop")
  wi <- d %>% group_by(cname_psd) %>% mutate(x = .data[[a]] - mean(.data[[a]]), y = .data[[b]] - mean(.data[[b]])) %>% ungroup()
  c(n = nrow(d), r = cor(d[[a]], d[[b]]), between = cor(bw$x, bw$y), within = cor(wi$x, wi$y))
}
PAIRS <- tribble(
  ~ours, ~ps,                 ~ps_label,                                  ~ceiling,
  "H",   "x_horizontalpower", "Horizontal power (coalition vs opposition)", 0.69,
  "V",   "x_verticalpower",   "Vertical power index",                     0.82,
  "V",   "q8_hierarchy_lb",   "Hierarchy in the leader's bloc (q8)",      NA,
  "U",   "unipolar",          "Policy concentration in the leader (q14-15)", NA,
  "U",   "threat_breadth",    "Breadth of domestic threats (q18)",        NA
)
agree <- pmap_dfr(PAIRS, function(ours, ps, ps_label, ceiling) {
  map_dfr(c(ours, LENS$col[LENS$index == ours]), function(o) {
    v <- decomp(Ki, o, ps)
    tibble(ours = o, ps = ps, ps_label = ps_label, ceiling = ceiling,
           n = v[["n"]], r = round(v[["r"]], 2), between = round(v[["between"]], 2), within = round(v[["within"]], 2))
  })
})

confusion <- P %>% filter(!is.na(ours), !is.na(ps)) %>% count(ps, ours) %>%
  complete(ps = KHAN, ours = KHAN, fill = list(n = 0))

items <- haven::read_dta("~/dev/shared-data/polsett/psd_main_aggregated_v1.dta") %>%
  group_by(cname_psd, period = as.integer(periodnumber)) %>%
  summarise(across(c(q9_cohesiveness_lb, q3_clbsplit, x_lbvsclbpowerratio), ~ mean(as.numeric(.x), na.rm = TRUE)),
            .groups = "drop")
Kx <- Ki %>% left_join(items, by = c("cname_psd", "period"))
ITEM_T <- c(x_verticalpower = "Vertical power index", q8_hierarchy_lb = "Hierarchy in leader's bloc",
            q9_cohesiveness_lb = "Cohesion of leader's bloc", q3_clbsplit = "Contingent bloc unlikely to split",
            x_lbvsclbpowerratio = "Leader's bloc vs contingent bloc power", unipolar = "Policy concentration in leader",
            threat_breadth = "Breadth of domestic threats")
ITEM_O <- c("V_party", "V_personal", "U_formal", "U_executive", "U_territorial")
itemcor <- list(rows = ITEM_O, cols = unname(ITEM_T),
                r = round(t(sapply(ITEM_O, function(o) sapply(names(ITEM_T), function(t) cor(Kx[[o]], Kx[[t]], use = "pair")))), 2) %>% unname())

out <- list(
  meta = list(cutH = rnd(cutH), cutV = rnd(cutV), psCutH = 3.28, psCutV = 0.44,
              sdH = rnd(sd(P$H, na.rm = TRUE)), sdV = rnd(sd(P$V, na.rm = TRUE)),
              sdPsH = rnd(sd(P$x_horizontalpower, na.rm = TRUE)), sdPsV = rnd(sd(P$x_verticalpower, na.rm = TRUE)),
              built = format(Sys.Date())),
  spec = SPEC %>% select(index, lens, key, sign, why),
  periods = periods, years = years, world = world,
  coherence = coherence, disc = disc, agree = agree, confusion = confusion, itemcor = itemcor
)
writeLines(paste0("window.KHAN = ", toJSON(out, dataframe = "rows", na = "null", auto_unbox = TRUE, digits = NA), ";"),
           "khan_data.js")
message("Wrote khan_data.js (", round(file.size("khan_data.js") / 1024), " KB): ",
        nrow(periods), " periods, ", nrow(years), " country-years, ", nrow(world), " countries")
