# Forward-stepwise search over the candidate pool, scored by leave-one-country-out
# R² at the country-period level. Answers "how far can a compound index get?" for
# each PolSett layer, which the interactive tool can only answer one hand-built
# combination at a time.
#
# Reads analyses/polsett-proxies/proxy_data.js (built by build_proxy_data.R).

suppressMessages({ library(tidyverse); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity")

txt <- readLines("analyses/polsett-proxies/proxy_data.js", warn = FALSE)
d <- fromJSON(sub(";$", "", sub("^window\\.PROXY_DATA = ", "", paste(txt, collapse = "\n"))))

P <- as_tibble(d$periods)
cands <- as_tibble(d$candidates)

# Leave-one-country-out R², pooling held-out predictions and scoring against the
# overall outcome mean. Refits inside every fold.
loco_r2 <- function(df, keys, target) {
  df <- df %>% filter(if_all(all_of(c(keys, target)), ~ !is.na(.x)))
  if (nrow(df) < 25 || n_distinct(df$country) < 5) return(NA_real_)
  f <- reformulate(keys, response = target)
  pred <- rep(NA_real_, nrow(df))
  for (g in unique(df$country)) {
    te <- df$country == g
    if (sum(!te) < length(keys) + 5) next
    fit <- try(lm(f, data = df[!te, ]), silent = TRUE)
    if (inherits(fit, "try-error")) next
    pred[te] <- suppressWarnings(predict(fit, newdata = df[te, ]))
  }
  ok <- !is.na(pred)
  if (sum(ok) < 25) return(NA_real_)
  y <- df[[target]][ok]
  1 - sum((y - pred[ok])^2) / sum((y - mean(y))^2)
}

# Greedy forward selection on LOCO R². Coverage matters as much as fit here:
# adding a low-coverage candidate shrinks the complete-case sample, so the
# search is run on whatever complete-case set each combination implies.
stepwise <- function(pool, target, max_k = 4) {
  chosen <- character(0)
  best <- -Inf
  trace <- tibble()
  for (k in seq_len(max_k)) {
    scores <- map_dbl(setdiff(pool, chosen), ~ loco_r2(P, c(chosen, .x), target))
    names(scores) <- setdiff(pool, chosen)
    scores <- scores[!is.na(scores)]
    if (!length(scores)) break
    top <- names(which.max(scores))
    if (max(scores) <= best + 0.002) break        # stop when gains are noise
    chosen <- c(chosen, top); best <- max(scores)
    n_cc <- P %>% filter(if_all(all_of(c(chosen, target)), ~ !is.na(.x))) %>% nrow()
    trace <- bind_rows(trace, tibble(k = k, added = top, loco = best, n = n_cc))
  }
  list(keys = chosen, loco = best, trace = trace)
}

LAYERS <- tribble(
  ~layer,        ~target,                    ~pool_layers,
  "sf_powerful", "x_totpowerfulpopshare",    list("sf_powerful"),
  "sf_coopt",    "x_gencooptscore",          list("sf_coopt"),
  "sf",          "x_socialfoundationsize",   list(c("sf", "sf_powerful", "sf_coopt")),
  "pc_horiz",    "x_horizontalpower",        list("pc_horiz"),
  "pc_vert",     "x_verticalpower",          list("pc_vert"),
  "pc",          "x_powerconcentration_mix", list(c("pc", "pc_horiz", "pc_vert"))
)

for (i in seq_len(nrow(LAYERS))) {
  lay <- LAYERS$layer[i]; tgt <- LAYERS$target[i]
  # unlist(): the list-column cell holds a character vector, and %in% would
  # otherwise coerce a multi-element cell to a single mangled string.
  pool <- cands %>% filter(concept %in% unlist(LAYERS$pool_layers[[i]])) %>% pull(key)

  # Best single candidate on LOCO, for reference.
  singles <- map_dbl(pool, ~ loco_r2(P, .x, tgt))
  names(singles) <- pool
  singles <- sort(singles[!is.na(singles)], decreasing = TRUE)

  res <- stepwise(pool, tgt)
  cat("\n=====", lay, " target:", tgt, "\n")
  cat("best singles (LOCO R²):\n")
  print(round(head(singles, 4), 3))
  cat("stepwise compound:\n")
  if (nrow(res$trace) == 0) cat("  (no candidate improved on the null model)\n")
  else print(as.data.frame(res$trace %>% mutate(loco = round(loco, 3))), right = FALSE)
}
