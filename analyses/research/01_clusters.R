#!/usr/bin/env Rscript
# Research pipeline, step 1: institutional clusters.
#
# Rebuilds the joint country-year matrix behind the animated country space
# (scratch/country_space_animation.R: six benchmark years, core V-Dem
# component indicators, one global z-scoring), attaches the UMAP coordinates
# the tool already shows, and partitions the country-years into clusters.
#
# Three partitions are produced so they can be compared in the tool:
#   ward     hierarchical clustering, Ward's criterion, Euclidean distance in
#            the z-scored indicator space (the same distance that ranks peers).
#            Cut at k = 2..K_MAX; the cuts are nested, which is what makes a
#            k-slider readable.
#   kmeans   k-means in the same space, k = 2..K_MAX, 50 restarts. Not nested.
#   louvain  community detection on the 15-nearest-neighbour graph, which is
#            the graph UMAP itself draws the map from. Chooses its own k.
#
# Diagnostics per k: mean silhouette, Calinski-Harabasz, bootstrap stability
# (adjusted Rand index between the full-sample Ward cut and the cut on an 80%
# subsample, 40 draws), and Ward-vs-k-means agreement.
#
# Outputs (apps/country-profile/public/research/):
#   points.parquet       one row per country-year: coordinates, PC scores,
#                        every cluster label, distance to own / second centroid
#   cluster_meta.json    indicators, diagnostics, the dendrogram above k = K_MAX,
#                        parameters
# and analyses/research/cache/joint.rds for the later steps.

suppressMessages({
  library(tidyverse)
  library(arrow)
  library(cluster)
  library(igraph)
  library(countrycode)
  library(jsonlite)
})

setwd("/home/taimur/dev/institutional-complexity")
set.seed(42)
K_MAX <- 12
years <- c(1975, 1985, 1995, 2005, 2015, 2025)

# -- 1. Joint matrix: verbatim rules from scratch/country_space_animation.R ----
discrete_vars   <- c("v2regopploc", "v2regsuploc")
suffixes        <- c("_codelow", "_codehigh", "_sd", "_osp",
                     "_ord", "_mean", "_nr", "_rec")
redundant_drops <- c(
  "v2cldmovew", "v2cldiscw", "v2clslavef", "v2clprptyw", "v2clacjstw",
  "v2juncind",  "v2juhccomp", "v2csrlgrep", "v2csrlgcon", "v2exdfdmhs",
  "v2smgovsm",  "v2lgqstexp", "v2lglegplo", "v2merange",  "v2dlreason",
  "v2psoppaut", "v2cafexch",  "v2caconmob"
)

vdem_raw      <- read_parquet("data/shared-data/vdem/vdem.parquet")
vdem_codebook <- read_parquet("data/shared-data/vdem/vdem_codebook.parquet")

all_cols    <- names(vdem_raw)
is_suffix   <- vapply(all_cols, function(x)
                       any(vapply(suffixes, endsWith, logical(1), x = x)),
                       logical(1))
is_numbered <- grepl("_\\d+$", all_cols)
base_cols   <- all_cols[!is_suffix & !is_numbered]

component_codes <- vdem_codebook %>%
  filter(vartype == "C") %>% pull(tag) %>% unique()

candidate_codes <- intersect(component_codes, base_cols) %>%
  setdiff(discrete_vars) %>%
  setdiff(redundant_drops)
candidate_codes <- candidate_codes[
  vapply(candidate_codes, function(x) is.numeric(vdem_raw[[x]]), logical(1))
]

year_sets <- map(years, function(yr) {
  yd  <- vdem_raw %>% filter(year == yr)
  cov <- vapply(candidate_codes, function(x) sum(!is.na(yd[[x]])), integer(1))
  candidate_codes[cov >= 0.5 * nrow(yd)]
})
core_indicators <- Reduce(intersect, year_sets)
cat("Core indicators:", length(core_indicators), "\n")

long_data <- vdem_raw %>%
  filter(year %in% years) %>%
  select(country_name, year, all_of(core_indicators)) %>%
  mutate(p_missing = rowSums(is.na(across(all_of(core_indicators)))) /
                     length(core_indicators)) %>%
  filter(p_missing < 0.5) %>%
  select(-p_missing)

M <- as.matrix(long_data[, core_indicators])
n_imputed <- sum(is.na(M))
for (j in seq_len(ncol(M))) {
  na_idx <- is.na(M[, j])
  if (any(na_idx)) M[na_idx, j] <- mean(M[, j], na.rm = TRUE)
}
M_z <- scale(M, center = TRUE, scale = TRUE)
M_z <- M_z[, !is.nan(colSums(M_z)), drop = FALSE]
indicators <- colnames(M_z)
rownames(M_z) <- paste(long_data$country_name, long_data$year, sep = "|")
cat("Joint matrix:", nrow(M_z), "country-years x", ncol(M_z), "indicators;",
    n_imputed, "cells mean-imputed\n")

# -- 2. Coordinates the tool already shows -------------------------------------
traj <- read_csv("outputs/country_space_trajectory.csv", show_col_types = FALSE)
keys <- tibble(country_name = long_data$country_name, year = long_data$year) %>%
  left_join(traj, by = c("country_name", "year"))
stopifnot(!any(is.na(keys$UMAP1)))

fix_iso <- function(x) countrycode(
  x, origin = "country.name", destination = "iso3c", warn = FALSE,
  custom_match = c(
    "Burma/Myanmar" = "MMR", "Czech Republic" = "CZE",
    "German Democratic Republic" = "DDR", "Hong Kong" = "HKG",
    "Ivory Coast" = "CIV", "Kosovo" = "XKX", "Palestine/Gaza" = "PSE",
    "Palestine/West Bank" = "PSE", "Republic of the Congo" = "COG",
    "Sao Tome and Principe" = "STP", "Somaliland" = NA_character_,
    "South Vietnam" = NA_character_, "Republic of Vietnam" = NA_character_,
    "Vietnam, Democratic Republic of" = NA_character_,
    "Yemen, People's Republic of" = NA_character_,
    "South Yemen" = NA_character_, "Zanzibar" = NA_character_))
keys$iso3 <- fix_iso(keys$country_name)

# -- 3. PCA of the pooled matrix (for reading the clusters in axis terms) -------
pca <- prcomp(M_z, center = FALSE, scale. = FALSE)
pc_var <- pca$sdev^2 / sum(pca$sdev^2)
# Sign convention: PC1 positive = liberal democracy (free expression loads +).
if (pca$rotation["v2mecenefm", 1] < 0) { pca$rotation[, 1] <- -pca$rotation[, 1]; pca$x[, 1] <- -pca$x[, 1] }

# -- 4. Partitions --------------------------------------------------------------
D  <- dist(M_z)
hc <- hclust(D, method = "ward.D2")
ward <- sapply(2:K_MAX, function(k) cutree(hc, k = k))
colnames(ward) <- paste0("ward_k", 2:K_MAX)

km_fits <- lapply(2:K_MAX, function(k) {
  set.seed(1000 + k)
  kmeans(M_z, centers = k, nstart = 50, iter.max = 300)
})
km <- sapply(km_fits, function(f) f$cluster)
colnames(km) <- paste0("kmeans_k", 2:K_MAX)

# kNN graph, k = 15, same as UMAP's n_neighbors. Edge weight = 1 for each
# directed neighbour relation, symmetrised (2 if mutual).
knn_k <- 15
Dm <- as.matrix(D)
nn <- t(apply(Dm, 1, function(r) order(r)[2:(knn_k + 1)]))
edges <- cbind(rep(seq_len(nrow(Dm)), each = knn_k), as.vector(t(nn)))
g <- graph_from_edgelist(edges, directed = TRUE)
g <- as.undirected(g, mode = "collapse", edge.attr.comb = "sum")
E(g)$weight <- 1
g <- simplify(g, edge.attr.comb = "sum")
set.seed(7)
lv <- cluster_louvain(g, resolution = 1)
louvain <- membership(lv)
cat("Louvain communities:", max(louvain), " modularity:", round(modularity(lv), 3), "\n")

# -- 5. Diagnostics --------------------------------------------------------------
ari <- function(a, b) {
  tab <- table(a, b)
  n <- sum(tab)
  comb2 <- function(x) x * (x - 1) / 2
  sum_ij <- sum(comb2(tab)); sum_a <- sum(comb2(rowSums(tab))); sum_b <- sum(comb2(colSums(tab)))
  expected <- sum_a * sum_b / comb2(n)
  max_idx <- (sum_a + sum_b) / 2
  (sum_ij - expected) / (max_idx - expected)
}
ch_index <- function(X, cl) {
  n <- nrow(X); k <- length(unique(cl))
  grand <- colMeans(X)
  bss <- sum(sapply(split(seq_len(n), cl), function(i) length(i) * sum((colMeans(X[i, , drop = FALSE]) - grand)^2)))
  wss <- sum(sapply(split(seq_len(n), cl), function(i) sum(sweep(X[i, , drop = FALSE], 2, colMeans(X[i, , drop = FALSE]))^2)))
  (bss / (k - 1)) / (wss / (n - k))
}

set.seed(99)
B <- 40
boot_idx <- replicate(B, sort(sample(nrow(M_z), round(0.8 * nrow(M_z)))), simplify = FALSE)
boot_hc  <- lapply(boot_idx, function(i) hclust(dist(M_z[i, ]), method = "ward.D2"))

diag <- map_dfr(2:K_MAX, function(k) {
  cl <- ward[, k - 1]
  sil <- mean(silhouette(cl, D)[, 3])
  sil_km <- mean(silhouette(km[, k - 1], D)[, 3])
  stab <- mean(sapply(seq_len(B), function(b) {
    i <- boot_idx[[b]]
    ari(cl[i], cutree(boot_hc[[b]], k = k))
  }))
  tibble(k = k, silhouette = sil, silhouette_kmeans = sil_km,
         ch = ch_index(M_z, cl), ch_kmeans = ch_index(M_z, km[, k - 1]),
         stability = stab, ari_ward_kmeans = ari(cl, km[, k - 1]),
         within_ss = sum(sapply(split(seq_len(nrow(M_z)), cl), function(i)
           sum(sweep(M_z[i, , drop = FALSE], 2, colMeans(M_z[i, , drop = FALSE]))^2))),
         smallest = min(table(cl)))
})
print(as.data.frame(diag), digits = 3)
cat("ARI louvain vs ward at k =", max(louvain), ":",
    if (max(louvain) <= K_MAX && max(louvain) >= 2) round(ari(louvain, ward[, max(louvain) - 1]), 3) else NA, "\n")

# -- 6. Dendrogram above the K_MAX cut ------------------------------------------
# cutree ids are ordered by first appearance, so ids at k and k-1 are related
# only through membership: find the two k-clusters that share a (k-1)-cluster.
merges <- map_dfr(K_MAX:2, function(k) {
  a <- cutree(hc, k = k); b <- cutree(hc, k = k - 1)
  tab <- table(a, b)
  merged_into <- which(colSums(tab > 0) == 2)
  pair <- which(tab[, merged_into] > 0)
  tibble(k_from = k, k_to = k - 1,
         a = as.integer(names(pair)[1]), b = as.integer(names(pair)[2]),
         into = as.integer(merged_into),
         height = hc$height[length(hc$height) - k + 2])
})
top_height <- max(hc$height)

# -- 7. Assignment firmness: distance to own centroid vs second-nearest ---------
firmness <- function(cl) {
  cents <- t(sapply(sort(unique(cl)), function(c) colMeans(M_z[cl == c, , drop = FALSE])))
  dc <- as.matrix(dist(rbind(cents, M_z)))[-(seq_len(nrow(cents))), seq_len(nrow(cents)), drop = FALSE]
  own <- dc[cbind(seq_len(nrow(dc)), cl)]
  second <- apply(dc, 1, function(r) sort(r)[2])
  list(own = own, second = second, nearest_other = apply(dc, 1, function(r) order(r)[2]))
}

# -- 8. Export --------------------------------------------------------------------
prefix_categories <- c(
  "el" = "Elections", "ps" = "Political parties", "cl" = "Civil liberties",
  "ju" = "Judiciary", "lg" = "Legislature", "me" = "Media", "ex" = "Executive",
  "dl" = "Deliberation", "ca" = "Mobilisation & academia", "cs" = "Civil society",
  "pe" = "Political equality", "st" = "State capacity", "sv" = "Sovereignty",
  "dd" = "Direct democracy", "ed" = "Education", "sm" = "Digital society",
  "re" = "Regime", "te" = "Technology & media")
ind_tbl <- tibble(tag = indicators) %>%
  left_join(vdem_codebook %>% filter(vartype == "C") %>% distinct(tag, .keep_all = TRUE) %>%
              select(tag, name), by = "tag") %>%
  mutate(prefix = sub("^v[23](\\w{2}).*", "\\1", tag),
         category = coalesce(unname(prefix_categories[prefix]), "Other")) %>%
  select(tag, name, category)

points <- keys %>%
  transmute(country_name, iso3, year = as.integer(year), region,
            x = round(UMAP1, 4), y = round(UMAP2, 4),
            pc1 = round(pca$x[, 1], 3), pc2 = round(pca$x[, 2], 3),
            pc3 = round(pca$x[, 3], 3)) %>%
  bind_cols(as_tibble(ward), as_tibble(km)) %>%
  mutate(louvain = as.integer(louvain))

write_parquet(points, "apps/country-profile/public/research/points.parquet", compression = "snappy")
cat("Wrote points.parquet:", nrow(points), "rows\n")

saveRDS(list(M_z = M_z, keys = keys, ward = ward, kmeans = km, louvain = louvain,
             hc = hc, pca = pca, indicators = ind_tbl, diag = diag, years = years),
        "analyses/research/cache/joint.rds")

meta <- list(
  years = years, n_country_years = nrow(M_z), n_countries = n_distinct(keys$country_name),
  n_indicators = ncol(M_z), n_imputed_cells = n_imputed,
  k_max = K_MAX, knn_k = knn_k, bootstrap_draws = B, bootstrap_share = 0.8,
  louvain_k = max(louvain), louvain_modularity = round(modularity(lv), 3),
  pc_var_explained = round(pc_var[1:5], 4),
  indicators = ind_tbl,
  diagnostics = diag %>% mutate(across(where(is.numeric), ~ round(.x, 4))),
  merges = merges %>% mutate(height = round(height, 3)),
  top_height = round(top_height, 3),
  source = "outputs/country_space_trajectory.csv + data/shared-data/vdem/vdem.parquet"
)
write_json(meta, "apps/country-profile/public/research/cluster_meta.json",
           auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")
cat("Wrote cluster_meta.json\n")
