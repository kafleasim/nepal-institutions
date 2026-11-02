# Does rotating the proxy set help the ESID quadrant?
#
# The failure diagnosed in typology-match.html is not mainly per-axis accuracy —
# it is that the two best proxies correlate -0.81 while PolSett's own axes
# correlate -0.22. A collinear proxy pair can only populate one diagonal of the
# 2x2, so "Broad-Concentrated" and "Narrow-Dispersed" are close to unreachable.
#
# Two distinct questions, which get conflated under "should we do a PCA":
#
#   1. Can a rotation predict each axis better? Principal components regression
#      is a restricted linear estimator on the same feature span that the ridge
#      in vdem-scale-audit.R already searched, so the expected gain is near zero.
#      Included as a control rather than a hope.
#   2. Can a rotation make the two estimated axes orthogonal, so all four
#      quadrants become reachable? This is untested and is the real question.
#      Orthogonality is free (PCA components are uncorrelated by construction;
#      CCA variates likewise), but it is only useful if the second direction
#      still carries signal about power concentration.
#
# Everything is scored leave-one-country-out, refitting the standardisation,
# rotation, regressions and cutoffs inside each fold. Otherwise the many-parameter
# methods win purely by fitting the sample.

suppressMessages({ library(tidyverse); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity")

txt <- readLines("analyses/polsett-proxies/proxy_data.js", warn = FALSE)
D <- fromJSON(sub(";$", "", sub("^window\\.PROXY_DATA = ", "", paste(txt, collapse = "\n"))))
P <- as_tibble(D$periods)
cands <- as_tibble(D$candidates)

SF_T <- "x_socialfoundationsize"; SF_D <- "x_sfsdummy"; SF_CUT <- 41
PC_T <- "x_powerconcentration_add"; PC_D <- "x_pcdummy"; PC_CUT <- 0.56
TRU <- "x_esidettlementype"

# ESID quadrants (codebook 4.3.7): 1 BC, 2 BD, 3 ND, 4 NC.
cls <- function(sfHigh, pcHigh) ifelse(sfHigh, ifelse(pcHigh, 1L, 2L), ifelse(pcHigh, 4L, 3L))

# Restrict to complete-coverage candidates so the panel stays at full size and
# the rotation is not driven by missingness patterns.
feat <- cands %>% filter(cov_panel >= 0.999) %>% pull(key)
dat <- P %>%
  select(country, iso3, y0, y1, all_of(c(SF_T, SF_D, PC_T, PC_D, TRU)), all_of(feat)) %>%
  drop_na()
feat <- feat[map_lgl(feat, ~ sd(dat[[.x]]) > 0)]
message("features: ", length(feat), " · country-periods: ", nrow(dat),
        " · countries: ", n_distinct(dat$country))

auc <- function(s, l) {
  p <- sum(l == 1); n <- sum(l == 0)
  if (p == 0 || n == 0) return(NA_real_)
  r <- rank(s); (sum(r[l == 1]) - p * (p + 1) / 2) / (p * n)
}
# Cutoff placed so the predicted base rate matches the training base rate.
cut_at_base <- function(v, base) as.numeric(quantile(v, 1 - base, names = FALSE))

ridge_fit <- function(X, y, lam) {
  X1 <- cbind(1, X)
  p <- ncol(X1)
  Pen <- diag(p); Pen[1, 1] <- 0
  solve(crossprod(X1) + lam * Pen, crossprod(X1, y))
}

# ---------------------------------------------------------------------------
# Descriptive: is there a second dimension that tracks power concentration?
# ---------------------------------------------------------------------------

Xall <- scale(as.matrix(dat[feat]))
pcaA <- prcomp(Xall, center = FALSE, scale. = FALSE)
ev <- pcaA$sdev^2 / sum(pcaA$sdev^2)
sc <- pcaA$x

cat("\n================ PROXY-SPACE PCA, FULL SAMPLE ================\n")
tab <- tibble(
  PC = paste0("PC", 1:8),
  var_share = round(ev[1:8], 3),
  r_sfs = round(map_dbl(1:8, ~ cor(sc[, .x], dat[[SF_T]])), 3),
  r_pc  = round(map_dbl(1:8, ~ cor(sc[, .x], dat[[PC_T]])), 3),
  auc_sfsdummy = round(map_dbl(1:8, ~ { a <- auc(sc[, .x], dat[[SF_D]]); max(a, 1 - a) }), 3),
  auc_pcdummy  = round(map_dbl(1:8, ~ { a <- auc(sc[, .x], dat[[PC_D]]);  max(a, 1 - a) }), 3)
)
print(as.data.frame(tab), right = FALSE)
cat("\nPolSett's own axes correlate:", round(cor(dat[[SF_T]], dat[[PC_T]]), 3), "\n")
cat("Top loadings on PC1:\n")
l1 <- sort(pcaA$rotation[, 1]); print(round(c(head(l1, 5), tail(l1, 5)), 3))
cat("Top loadings on PC2:\n")
l2 <- sort(pcaA$rotation[, 2]); print(round(c(head(l2, 5), tail(l2, 5)), 3))

# ---------------------------------------------------------------------------
# Leave-one-country-out comparison of axis-construction methods
# ---------------------------------------------------------------------------
# Each method returns, for the held-out rows, a pair of scores oriented so that
# higher means higher on the corresponding PolSett axis, plus the cutoffs to use.

methods <- list(

  # Current approach: one hand-picked indicator per axis.
  best_single = function(tr, te) {
    sfk <- "v2x_civlib"; pck <- "v2mecenefm"
    os <- if (auc(tr[[sfk]], tr[[SF_D]]) < 0.5) -1 else 1
    op <- if (auc(tr[[pck]], tr[[PC_D]]) < 0.5) -1 else 1
    list(sf = os * te[[sfk]], pc = op * te[[pck]],
         sf_tr = os * tr[[sfk]], pc_tr = op * tr[[pck]])
  },

  # Keep the social-foundation proxy; take the power proxy's component that is
  # orthogonal to it. Targets the collinearity directly, with no extra features.
  residualised = function(tr, te) {
    sfk <- "v2x_civlib"; pck <- "v2mecenefm"
    os <- if (auc(tr[[sfk]], tr[[SF_D]]) < 0.5) -1 else 1
    s_tr <- os * tr[[sfk]]; s_te <- os * te[[sfk]]
    m <- lm(tr[[pck]] ~ s_tr)
    p_tr <- resid(m)
    p_te <- te[[pck]] - (coef(m)[1] + coef(m)[2] * s_te)
    op <- if (auc(p_tr, tr[[PC_D]]) < 0.5) -1 else 1
    list(sf = s_te, pc = op * p_te, sf_tr = s_tr, pc_tr = op * p_tr)
  },

  # Unsupervised rotation: pick the best-discriminating principal component for
  # each axis, forcing the two to be different components (hence uncorrelated).
  pca_axes = function(tr, te) {
    ctr <- colMeans(tr[feat]); sds <- apply(tr[feat], 2, sd)
    Xtr <- scale(as.matrix(tr[feat]), center = ctr, scale = sds)
    Xte <- scale(as.matrix(te[feat]), center = ctr, scale = sds)
    pp <- prcomp(Xtr, center = FALSE, scale. = FALSE)
    K <- 6
    Str <- pp$x[, 1:K, drop = FALSE]; Ste <- Xte %*% pp$rotation[, 1:K, drop = FALSE]
    as_ <- map_dbl(1:K, ~ { a <- auc(Str[, .x], tr[[SF_D]]); max(a, 1 - a) })
    ap_ <- map_dbl(1:K, ~ { a <- auc(Str[, .x], tr[[PC_D]]); max(a, 1 - a) })
    is_ <- which.max(as_)
    ip_ <- which.max(ifelse(seq_len(K) == is_, -Inf, ap_))   # must differ
    os <- if (auc(Str[, is_], tr[[SF_D]]) < 0.5) -1 else 1
    op <- if (auc(Str[, ip_], tr[[PC_D]]) < 0.5) -1 else 1
    list(sf = os * Ste[, is_], pc = op * Ste[, ip_],
         sf_tr = os * Str[, is_], pc_tr = op * Str[, ip_])
  },

  # Principal components regression: regress each axis on the leading PCs. The
  # control for question 1 — a regularised linear fit on the same span.
  pcr = function(tr, te) {
    ctr <- colMeans(tr[feat]); sds <- apply(tr[feat], 2, sd)
    Xtr <- scale(as.matrix(tr[feat]), center = ctr, scale = sds)
    Xte <- scale(as.matrix(te[feat]), center = ctr, scale = sds)
    pp <- prcomp(Xtr, center = FALSE, scale. = FALSE)
    K <- 10
    Str <- pp$x[, 1:K, drop = FALSE]; Ste <- Xte %*% pp$rotation[, 1:K, drop = FALSE]
    bs <- ridge_fit(Str, tr[[SF_T]], 1e-6); bp <- ridge_fit(Str, tr[[PC_T]], 1e-6)
    list(sf = as.numeric(cbind(1, Ste) %*% bs), pc = as.numeric(cbind(1, Ste) %*% bp),
         sf_tr = as.numeric(cbind(1, Str) %*% bs), pc_tr = as.numeric(cbind(1, Str) %*% bp))
  },

  # Ridge on every feature, one fit per axis. The unrestricted linear benchmark.
  ridge_all = function(tr, te) {
    ctr <- colMeans(tr[feat]); sds <- apply(tr[feat], 2, sd)
    Xtr <- scale(as.matrix(tr[feat]), center = ctr, scale = sds)
    Xte <- scale(as.matrix(te[feat]), center = ctr, scale = sds)
    bs <- ridge_fit(Xtr, tr[[SF_T]], 30); bp <- ridge_fit(Xtr, tr[[PC_T]], 30)
    list(sf = as.numeric(cbind(1, Xte) %*% bs), pc = as.numeric(cbind(1, Xte) %*% bp),
         sf_tr = as.numeric(cbind(1, Xtr) %*% bs), pc_tr = as.numeric(cbind(1, Xtr) %*% bp))
  },

  # Canonical correlation between the proxy block and the two PolSett axes
  # jointly. The two canonical variates of X are uncorrelated by construction and
  # each is chosen to align with the targets, so this is the properly specified
  # version of what a PCA is being asked to do. Run on leading PCs to regularise.
  cca = function(tr, te) {
    ctr <- colMeans(tr[feat]); sds <- apply(tr[feat], 2, sd)
    Xtr <- scale(as.matrix(tr[feat]), center = ctr, scale = sds)
    Xte <- scale(as.matrix(te[feat]), center = ctr, scale = sds)
    pp <- prcomp(Xtr, center = FALSE, scale. = FALSE)
    K <- 12
    Str <- pp$x[, 1:K, drop = FALSE]; Ste <- Xte %*% pp$rotation[, 1:K, drop = FALSE]
    Y <- cbind(scale(tr[[SF_T]]), scale(tr[[PC_T]]))
    cc <- cancor(Str, Y)
    Utr <- sweep(Str, 2, cc$xcenter) %*% cc$xcoef[, 1:2]
    Ute <- sweep(Ste, 2, cc$xcenter) %*% cc$xcoef[, 1:2]
    # Assign variate -> axis by absolute training correlation with each target.
    c1s <- abs(cor(Utr[, 1], tr[[SF_T]])); c2s <- abs(cor(Utr[, 2], tr[[SF_T]]))
    sfi <- if (c1s >= c2s) 1 else 2; pci <- 3 - sfi
    os <- if (auc(Utr[, sfi], tr[[SF_D]]) < 0.5) -1 else 1
    op <- if (auc(Utr[, pci], tr[[PC_D]]) < 0.5) -1 else 1
    list(sf = os * Ute[, sfi], pc = op * Ute[, pci],
         sf_tr = os * Utr[, sfi], pc_tr = op * Utr[, pci])
  }
)

countries <- unique(dat$country)
res <- map_dfr(names(methods), function(mn) {
  f <- methods[[mn]]
  pred_sf <- rep(NA, nrow(dat)); pred_pc <- rep(NA, nrow(dat)); pred_cls <- rep(NA_integer_, nrow(dat))
  for (g in countries) {
    te_i <- which(dat$country == g); tr_i <- setdiff(seq_len(nrow(dat)), te_i)
    tr <- dat[tr_i, ]; te <- dat[te_i, ]
    o <- try(f(tr, te), silent = TRUE)
    if (inherits(o, "try-error")) next
    # Cutoffs from the training fold only.
    bs <- mean(tr[[SF_D]] == 1); bp <- mean(tr[[PC_D]] == 1)
    ts <- cut_at_base(o$sf_tr, bs); tp <- cut_at_base(o$pc_tr, bp)
    pred_sf[te_i] <- o$sf; pred_pc[te_i] <- o$pc
    pred_cls[te_i] <- cls(o$sf >= ts, o$pc >= tp)
  }
  ok <- !is.na(pred_cls)
  tru <- dat[[TRU]][ok]
  sf_ok <- (pred_sf[ok] >= NA) # placeholder, recomputed below
  # Per-axis accuracy needs the fold cutoffs, so recompute the dichotomy from the
  # stored class rather than re-thresholding globally.
  sf_hi <- pred_cls[ok] %in% c(1L, 2L); pc_hi <- pred_cls[ok] %in% c(1L, 4L)
  tibble(
    method = mn,
    n = sum(ok),
    acc = mean(pred_cls[ok] == tru),
    # Macro-average recall over the four quadrants. Plain accuracy is dominated by
    # the two large diagonal classes (59% of cases), so it rewards a method that
    # gives up on the off-diagonal entirely.
    bal_acc = mean(map_dbl(1:4, ~ { s <- tru == .x; if (any(s)) mean(pred_cls[ok][s] == .x) else NA_real_ }), na.rm = TRUE),
    sf_acc = mean(sf_hi == (dat[[SF_D]][ok] == 1)),
    pc_acc = mean(pc_hi == (dat[[PC_D]][ok] == 1)),
    cor_axes = cor(pred_sf[ok], pred_pc[ok]),
    recall_BC = { s <- tru == 1; if (any(s)) mean(pred_cls[ok][s] == 1) else NA },
    recall_ND = { s <- tru == 3; if (any(s)) mean(pred_cls[ok][s] == 3) else NA },
    r_sfs = cor(pred_sf[ok], dat[[SF_T]][ok]),
    r_pc = cor(pred_pc[ok], dat[[PC_T]][ok])
  )
})

base_rate <- max(prop.table(table(dat[[TRU]])))
cat("\n\n================ LOCO COMPARISON, ESID QUADRANT ================\n")
cat("majority-class baseline:", round(base_rate, 3),
    " · PolSett axes correlate", round(cor(dat[[SF_T]], dat[[PC_T]]), 3), "\n\n")
print(as.data.frame(res %>% arrange(desc(acc)) %>%
  mutate(across(where(is.double), ~ round(.x, 3)))), right = FALSE)

cat("\ncor_axes is the correlation between the two predicted axes. PolSett's own\n")
cat("axes sit at", round(cor(dat[[SF_T]], dat[[PC_T]]), 2),
    "- a method near that value has genuinely decorrelated them.\n")
cat("recall_BC / recall_ND are the two off-diagonal quadrants, which a collinear\n")
cat("proxy pair cannot reach.\n")
