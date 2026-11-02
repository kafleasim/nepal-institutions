# Was the LLM coder judged against a moving target?
#
# polsett-llm/output/KHM/validation.json scores the simulated coders item by item
# against the human country-period means for Cambodia, reporting a median r of
# 0.40. But if the human means are themselves noisy, that number conflates LLM
# error with human coding error, and the LLM cannot exceed sqrt(reliability) no
# matter how good it is.
#
# The comparison has to be made inside Cambodia, because the LLM r is a
# within-country correlation across ~13 political periods. So the ceiling is
# recomputed from Cambodia's own coders with period as the grouping factor,
# rather than reusing the pooled cross-country reliability.

suppressMessages({ library(tidyverse); library(haven); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity")

VAL <- "polsett-llm/output/KHM/validation.json"
CODER <- "~/dev/shared-data/polsett/psd_coder_level_v1.dta"

val <- fromJSON(VAL, simplifyVector = FALSE)
llm <- imap_dfr(val$items, ~ tibble(
  item = .y,
  llm_r = if (is.null(.x$r)) NA_real_ else .x$r,
  n_periods = if (is.null(.x$n_periods)) NA_integer_ else .x$n_periods,
  human_sd = if (is.null(.x$human_sd)) NA_real_ else .x$human_sd,
  llm_sd = if (is.null(.x$llm_sd)) NA_real_ else .x$llm_sd
))
message("LLM-scored items: ", nrow(llm))

cl <- read_dta(CODER)
items <- intersect(llm$item, names(cl))

khm <- cl %>%
  filter(cname_psd == "Cambodia") %>%
  transmute(grp = as.character(periodnumber), coder = coder_id,
            across(all_of(items), as.numeric)) %>%
  group_by(grp, coder) %>%
  summarise(across(all_of(items), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(all_of(items), ~ ifelse(is.finite(.x), .x, NA_real_)))

message("Cambodia period-coder rows: ", nrow(khm),
        " · periods: ", n_distinct(khm$grp), " · coders: ", n_distinct(khm$coder))

# Reliability of the k-coder mean, one-way random effects, groups = periods.
rel_one <- function(v, grp) {
  d <- tibble(v, grp) %>% filter(!is.na(v)) %>% group_by(grp) %>% filter(n() >= 2) %>% ungroup()
  if (n_distinct(d$grp) < 5) return(tibble(n_grp = n_distinct(d$grp), k = NA, reliability = NA, ceiling = NA))
  g <- d %>% group_by(grp) %>% summarise(n = n(), m = mean(v), ss = sum((v - mean(v))^2), .groups = "drop")
  N <- nrow(d); ngrp <- nrow(g); grand <- mean(d$v)
  msb <- sum(g$n * (g$m - grand)^2) / (ngrp - 1)
  msw <- sum(g$ss) / (N - ngrp)
  if (!is.finite(msb) || !is.finite(msw) || msb <= 0)
    return(tibble(n_grp = ngrp, k = mean(g$n), reliability = NA, ceiling = NA))
  r <- max(0, (msb - msw) / msb)
  tibble(n_grp = ngrp, k = mean(g$n), reliability = r, ceiling = sqrt(r))
}

ceil <- map_dfr(items, ~ bind_cols(tibble(item = .x), rel_one(khm[[.x]], khm$grp)))

cmp <- llm %>% inner_join(ceil, by = "item") %>%
  filter(!is.na(llm_r), !is.na(ceiling)) %>%
  # Confidence ratings are metadata, not substantive items.
  filter(!str_detect(item, "_confidence$")) %>%
  # A zero ceiling means the item carries no reliable signal at all, so the
  # ratio is undefined rather than infinite.
  mutate(share_of_ceiling = if_else(ceiling > 0.05, llm_r / ceiling, NA_real_))

cat("\n\n================ LLM r VS WITHIN-CAMBODIA CEILING ================\n")
cat("n items compared: ", nrow(cmp), "\n\n")
cat(sprintf("median LLM r                       %.3f\n", median(cmp$llm_r)))
cat(sprintf("median within-Cambodia ceiling     %.3f\n", median(cmp$ceiling)))
cat(sprintf("median LLM r / ceiling             %.3f\n", median(cmp$share_of_ceiling, na.rm = TRUE)))
cat(sprintf("items where LLM r exceeds ceiling  %d of %d (%.0f%%)\n",
            sum(cmp$llm_r >= cmp$ceiling), nrow(cmp),
            100 * mean(cmp$llm_r >= cmp$ceiling)))
cat(sprintf("items with ceiling < 0.5 (target largely noise)  %d (%.0f%%)\n",
            sum(cmp$ceiling < 0.5), 100 * mean(cmp$ceiling < 0.5)))

# Split by question family so the power items can be read separately.
fam <- cmp %>%
  mutate(q = str_extract(item, "^q[0-9]+")) %>%
  group_by(q) %>%
  summarise(n = n(), llm_r = median(llm_r), ceiling = median(ceiling),
            share = median(share_of_ceiling, na.rm = TRUE), .groups = "drop") %>%
  arrange(desc(ceiling))

cat("\n-- by question family (medians) --\n")
print(as.data.frame(fam %>% mutate(across(where(is.double), ~ round(.x, 3)))), right = FALSE)

cat("\n-- the items the LLM is furthest below the ceiling on --\n")
print(as.data.frame(cmp %>% filter(ceiling > 0.6) %>% arrange(share_of_ceiling) %>%
  transmute(item, llm_r = round(llm_r, 3), ceiling = round(ceiling, 3),
            share = round(share_of_ceiling, 2)) %>% head(12)), right = FALSE)

cat("\n-- coder spread: humans vs simulated coders --\n")
cat(sprintf("mean human within-period SD  %.3f\nmean LLM within-period SD    %.3f\nratio %.1fx\n",
            mean(cmp$human_sd, na.rm = TRUE), mean(cmp$llm_sd, na.rm = TRUE),
            mean(cmp$human_sd, na.rm = TRUE) / mean(cmp$llm_sd, na.rm = TRUE)))
