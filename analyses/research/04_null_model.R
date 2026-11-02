#!/usr/bin/env Rscript
# Research pipeline, step 4: a null model for baskets.
#
# The bipartite configuration model (BiCM; Saracco et al. 2015) is the
# maximum-entropy distribution over binary country x product matrices whose
# expected row sums (each country's diversity) and column sums (each product's
# ubiquity) match the data. Under it every cell is an independent Bernoulli,
#   P_cp = x_c y_p / (1 + x_c y_p),
# with the fitnesses x, y found by fixed-point iteration. It answers "what would
# co-occurrence look like if the only structure were how diversified each
# country is and how common each product is".
#
# Two uses:
#   pairs     for every country pair, the observed overlap |A ∩ B| against its
#             BiCM expectation and variance; plus the Matthews correlation of
#             the two basket vectors.
#   clusters  for every Ward cut, cluster and product: the number of members
#             holding the product against the Poisson-binomial null (exact
#             distribution, by convolution), two one-sided p-values, and a
#             Benjamini-Hochberg flag at 10% FDR within each cluster.
#
# Outputs (apps/country-profile/public/research/):
#   cx_pairs.parquet        rewritten with overlap_obs, overlap_exp, overlap_sd,
#                           mcc, region_a, region_b
#   null_products.parquet   k, cluster, product, n, n_obs, expected, sd, z,
#                           p_right, p_left, sig
#   null_meta.json          fit diagnostics

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity")
OUT <- "apps/country-profile/public/research"
J <- readRDS("analyses/research/cache/joint.rds")
K_MAX <- max(J$diag$k)

rca   <- read_parquet(file.path(OUT, "cx_rca.parquet"))
cx    <- read_parquet(file.path(OUT, "cx_country.parquet")) %>% filter(year == 2023)
pairs <- read_parquet(file.path(OUT, "cx_pairs.parquet")) %>%
  select(a, b, jaccard_basket, jaccard_entry, tercile_a, tercile_b)  # base columns from step 3; the rest are re-derived here
prod  <- fromJSON(file.path(OUT, "cx_meta.json"))$products

isos <- sort(unique(rca$iso3))
prods <- sort(unique(prod$product))
B <- matrix(0L, length(isos), length(prods), dimnames = list(isos, prods))
B[cbind(match(rca$iso3, isos), match(rca$product, prods))] <- 1L
B <- B[, colSums(B) > 0, drop = FALSE]  # products nobody holds carry no information
cat("Binary matrix:", nrow(B), "countries x", ncol(B), "products; density", round(mean(B), 3), "\n")

# -- BiCM fit ---------------------------------------------------------------------
kc <- rowSums(B); kp <- colSums(B)
x <- kc / sqrt(sum(B)); y <- kp / sqrt(sum(B))
for (it in 1:5000) {
  Pm <- outer(x, y); Pm <- Pm / (1 + Pm)
  x_new <- kc / rowSums(sweep(1 / (1 + outer(x, y)), 2, y, "*"))
  y_new <- kp / colSums(sweep(1 / (1 + outer(x, y)), 1, x, "*"))
  delta <- max(abs(x_new - x), abs(y_new - y))
  x <- x_new; y <- y_new
  if (delta < 1e-10) break
}
P <- outer(x, y); P <- P / (1 + P)
cat("BiCM converged in", it, "iterations; max |row error|", signif(max(abs(rowSums(P) - kc)), 3),
    "; max |col error|", signif(max(abs(colSums(P) - kp)), 3), "\n")

# -- Pairs: observed vs expected overlap, and MCC ---------------------------------
O   <- B %*% t(B)                       # |A ∩ B|
E   <- P %*% t(P)                       # Σ_p P_ap P_bp
V   <- E - (P^2) %*% t(P^2)             # Σ_p q(1-q), q = P_ap P_bp
n11 <- O; n10 <- outer(kc, kc, "+") - 2 * O   # mismatches: |A| + |B| - 2|A∩B|
Np  <- ncol(B)
n1a <- matrix(kc, nrow(B), nrow(B)); n1b <- t(n1a)
n00 <- Np - n1a - n1b + O
mcc <- (n11 * n00 - (n1a - O) * (n1b - O)) / sqrt(n1a * n1b * (Np - n1a) * (Np - n1b))

region <- J$keys %>% filter(!is.na(iso3)) %>% distinct(iso3, .keep_all = TRUE) %>% select(iso3, region)
idx <- function(v) match(v, isos)
pairs2 <- pairs %>%
  mutate(overlap_obs = O[cbind(idx(a), idx(b))],
         overlap_exp = round(E[cbind(idx(a), idx(b))], 3),
         overlap_sd  = round(sqrt(V[cbind(idx(a), idx(b))]), 3),
         mcc         = round(mcc[cbind(idx(a), idx(b))], 4)) %>%
  left_join(region %>% rename(a = iso3, region_a = region), by = "a") %>%
  left_join(region %>% rename(b = iso3, region_b = region), by = "b")
write_parquet(pairs2, file.path(OUT, "cx_pairs.parquet"), compression = "snappy")
cat("Rewrote cx_pairs.parquet with null columns\n")

# -- Clusters: Poisson-binomial test per product ----------------------------------
# Exact distribution of the number of members holding a product, by convolving
# the members' Bernoulli probabilities (a matrix of products x (n+1) per step).
pb_tail <- function(Pg) {
  n <- nrow(Pg); m <- ncol(Pg)
  D <- matrix(0, m, n + 1); D[, 1] <- 1
  for (i in seq_len(n)) {
    p <- Pg[i, ]
    D <- cbind(D[, 1:(n)] * (1 - p), 0) + cbind(0, D[, 1:n] * p)
  }
  D  # D[p, j+1] = P(count = j)
}
null_rows <- list()
for (k in 2:K_MAX) {
  lab <- cx %>% select(iso3, cl = all_of(paste0("ward_k", k))) %>% filter(iso3 %in% isos)
  for (g in sort(unique(lab$cl))) {
    members <- lab$iso3[lab$cl == g]
    n <- length(members)
    if (n < 2) next
    Pg <- P[members, , drop = FALSE]
    obs <- colSums(B[members, , drop = FALSE])
    D <- pb_tail(Pg)
    cum <- t(apply(D, 1, cumsum))                        # P(count <= j)
    p_left  <- cum[cbind(seq_len(ncol(B)), obs + 1)]     # P(count <= obs)
    # P(count >= obs) = 1 - P(count <= obs - 1); a zero index would drop the
    # row from the extraction, so obs = 0 is looked up at 1 and overridden.
    below   <- cum[cbind(seq_len(ncol(B)), pmax(obs, 1))]
    p_right <- ifelse(obs == 0, 1, 1 - below)
    ex <- colSums(Pg); sdv <- sqrt(colSums(Pg * (1 - Pg)))
    q_right <- p.adjust(p_right, "BH"); q_left <- p.adjust(p_left, "BH")
    null_rows[[length(null_rows) + 1]] <- tibble(
      k = k, cluster = g, product = colnames(B), n = n, n_obs = as.integer(obs),
      expected = round(ex, 3), sd = round(sdv, 3),
      z = round((obs - ex) / pmax(sdv, 1e-9), 2),
      p_right = signif(p_right, 3), p_left = signif(p_left, 3),
      sig = as.integer(ifelse(q_right <= 0.1 & obs > ex, 1L, ifelse(q_left <= 0.1 & obs < ex, -1L, 0L))))
  }
}
null_df <- bind_rows(null_rows)
write_parquet(null_df, file.path(OUT, "null_products.parquet"), compression = "snappy")
cat("null_products.parquet:", nrow(null_df), "rows;",
    "validated specialisations at k=6:", sum(null_df$sig == 1 & null_df$k == 6),
    "; avoidances:", sum(null_df$sig == -1 & null_df$k == 6), "\n")
print(null_df %>% filter(k == 6) %>% group_by(cluster) %>% summarise(n = first(n), spec = sum(sig == 1), avoid = sum(sig == -1)))

write_json(list(n_countries = nrow(B), n_products = ncol(B), density = round(mean(B), 4),
                iterations = it, max_margin_error = signif(max(abs(rowSums(P) - kc), abs(colSums(P) - kp)), 3),
                fdr_alpha = 0.1, universe_products = Np),
           file.path(OUT, "null_meta.json"), auto_unbox = TRUE, pretty = TRUE, na = "null")
cat("Done.\n")
