#!/usr/bin/env Rscript
# Research pipeline, step 2: what institutional package identifies each cluster.
#
# For every cut k = 2..K_MAX of the Ward tree and every cluster c at that cut,
# three per-indicator quantities describe the cluster against the rest of the
# country-years:
#   mean_z   the cluster's mean z-score on the indicator (0 = pooled average)
#   d        Cohen's d: (mean in cluster - mean outside) / pooled SD
#   auc      the probability that a random member scores above a random
#            non-member (rank-based; 0.5 = no separation, 1 or 0 = perfect)
# Also, for the default cut, a classification tree (rpart) that reproduces the
# partition from a handful of indicators, so the "package" can be read as rules.
#
# Outputs (apps/country-profile/public/research/):
#   profiles.parquet   k, cluster, tag, mean_z, mean_z_2025, d, auc
#   tree_k6.json       the rules, with the share of country-years they classify correctly

suppressMessages({ library(tidyverse); library(arrow); library(jsonlite); library(rpart) })
setwd("/home/taimur/dev/institutional-complexity")
J <- readRDS("analyses/research/cache/joint.rds")
M_z <- J$M_z; keys <- J$keys; ward <- J$ward
K_DEFAULT <- 6

auc_rank <- function(x, in_cluster) {
  # Mann-Whitney AUC via ranks; ties averaged.
  r <- rank(x)
  n1 <- sum(in_cluster); n0 <- sum(!in_cluster)
  (sum(r[in_cluster]) - n1 * (n1 + 1) / 2) / (n1 * n0)
}

profiles <- map_dfr(2:J$diag$k[nrow(J$diag)], function(k) {
  cl <- ward[, paste0("ward_k", k)]
  map_dfr(sort(unique(cl)), function(c) {
    inn <- cl == c
    m_in  <- colMeans(M_z[inn, , drop = FALSE])
    m_out <- colMeans(M_z[!inn, , drop = FALSE])
    v_in  <- apply(M_z[inn, , drop = FALSE], 2, var)
    v_out <- apply(M_z[!inn, , drop = FALSE], 2, var)
    n_in <- sum(inn); n_out <- sum(!inn)
    sp <- sqrt(((n_in - 1) * v_in + (n_out - 1) * v_out) / (n_in + n_out - 2))
    in25 <- inn & keys$year == 2025
    tibble(k = k, cluster = c, tag = colnames(M_z),
           mean_z = round(m_in, 3),
           mean_z_2025 = round(if (any(in25)) colMeans(M_z[in25, , drop = FALSE]) else rep(NA_real_, ncol(M_z)), 3),
           d = round((m_in - m_out) / sp, 3),
           auc = round(vapply(seq_len(ncol(M_z)), function(j) auc_rank(M_z[, j], inn), numeric(1)), 3))
  })
})
write_parquet(profiles, "apps/country-profile/public/research/profiles.parquet", compression = "snappy")
cat("Wrote profiles.parquet:", nrow(profiles), "rows\n")

# -- Rules for the default cut ---------------------------------------------------
cl <- factor(ward[, paste0("ward_k", K_DEFAULT)])
df <- as.data.frame(M_z); df$cluster <- cl
set.seed(3)
fit <- rpart(cluster ~ ., data = df, method = "class",
             control = rpart.control(cp = 0.01, minbucket = 15, maxdepth = 5))
pred <- predict(fit, df, type = "class")
acc <- mean(pred == cl)
cat("Tree accuracy on the fit sample:", round(acc, 3), "; leaves:", sum(fit$frame$var == "<leaf>"), "\n")
# 10-fold CV accuracy from the xerror column
cv_acc <- 1 - min(fit$cptable[, "xerror"]) * (1 - max(table(cl)) / length(cl))
cat("Cross-validated accuracy (approx):", round(cv_acc, 3), "\n")

# Serialise the tree: rpart's frame is in node-number order; rebuild the
# parent/child structure from node numbers (child of n are 2n, 2n+1).
fr <- fit$frame
splits <- fit$splits
nodes <- as.integer(rownames(fr))
labels_tbl <- J$indicators
lab <- function(tag) labels_tbl$name[match(tag, labels_tbl$tag)]
tree_nodes <- lapply(seq_along(nodes), function(i) {
  n <- nodes[i]
  row <- fr[i, ]
  is_leaf <- row$var == "<leaf>"
  out <- list(id = n, leaf = is_leaf, n = row$n,
              class = as.integer(as.character(levels(cl)[row$yval])),
              purity = round(max(row$yval2[, (nlevels(cl) + 2):(2 * nlevels(cl) + 1)]), 3))
  if (!is_leaf) {
    # the primary split for this node is the first split row whose var matches and count matches
    sp_row <- which(rownames(splits) == as.character(row$var) & splits[, "count"] == row$n)[1]
    out$var <- as.character(row$var); out$name <- lab(as.character(row$var))
    out$threshold <- round(splits[sp_row, "index"], 3)
    # ncat = -1 means "left branch is < threshold", +1 means "left is >= threshold"
    out$left_is_lower <- splits[sp_row, "ncat"] < 0
  }
  out
})
write_json(list(k = K_DEFAULT, accuracy = round(acc, 3), cv_accuracy = round(cv_acc, 3),
                n_leaves = sum(fr$var == "<leaf>"), nodes = tree_nodes),
           sprintf("apps/country-profile/public/research/tree_k%d.json", K_DEFAULT),
           auto_unbox = TRUE, pretty = TRUE, digits = NA, na = "null")
cat("Wrote tree json\n")
print(fit)
