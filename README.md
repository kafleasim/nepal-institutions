# Institutional Complexity

Two coupled R Markdown analyses that apply economic-complexity tooling and ML to V-Dem
governance data. The output of each `.Rmd` is a self-contained PDF.

| File | Output | What it answers |
|---|---|---|
| `analyses/institutional_complexity.Rmd` | `analyses/institutional_complexity.pdf` | How do institutional *features* cluster? Which countries hold complex institutional portfolios? |
| `analyses/outcomes_ml.Rmd` | `analyses/outcomes_ml.pdf` | Which institutional bundles *predict* fiscal, health, education, complexity, and trade outcomes? Where do specific countries over-/under-perform their institutional fingerprint? |
| `analyses/deals-development.Rmd` | `analyses/deals-development.pdf` | Maps V-Dem/QoG indicators to the Pritchett-Sen-Werker stakeholder typology to score country-by-stakeholder fit. |
| `case-studies/cambodia/cambodia-history.Rmd` | `case-studies/cambodia/cambodia-history.pdf` | Cambodia 1970–2025: institutional fingerprint trajectory passed through the cross-sectional ML model. |
| `case-studies/cambodia/cambodia-pca-peers-analysis.md` | — | Standalone narrative: Cambodia's PC1/PC2 position decomposed feature-by-feature against its Mekong neighbours. |
| `apps/country-profile/` | Vite React app | Interactive country profile tool. First feature: animated 1975–2025 country-space trajectory with searchable selection, hover identification, k=4 nearest-neighbour overlay, persistent trails, and force-directed labels. |

`TASK.md` is the original task spec for `institutional_complexity.Rmd`. Treat it as
historical — the actual code has evolved past it.

## Conceptual sketch

Both analyses operate on a single object: an `Mcp` matrix indexed by *country × V-Dem
institutional feature*, populated with min-max-normalized continuous scores from the
latest V-Dem year with ≥150-country coverage (currently 2025). All downstream work —
ICI, proximity, UMAPs, ML, PCA — runs on this same matrix.

| Economic complexity | Institutional complexity |
|---|---|
| Country exports a product | Country has an institutional feature |
| Revealed Comparative Advantage (binary) | Continuous V-Dem score, [0,1] min-max scaled |
| ECI / PCI | ICI (countries) / IFC (features) |
| Product space | Institution space |

## What each analysis produces

### `institutional_complexity.Rmd`
- **Mcp construction** from V-Dem C-type ("component") indicators. Filters: numeric, ≥150-country coverage in latest year, drops `v2regopploc` / `v2regsuploc` (problematic discretes). Min-max normalize each feature to [0,1]; replace residual NAs with 0.
- **Diversity / ubiquity** (continuous-generalized k₀) and the **Method of Reflections** for ICI (countries) and IFC (features). Eigenvalue method (second eigenvector of `Mcc_tilde` / `Mpp_tilde`) computed for robustness.
- **Proximity matrices** between features and between countries — both the Hidalgo co-location form and a Spearman-correlation form. Used to draw the institution space and country space.
- **UMAP embeddings** of both spaces (using both proximity forms), color-coded by V-Dem category prefix or by region, sized by complexity.
- **k-means clusters** in the Spearman embeddings, with cluster labels assigned via *landmark indicators* (specific V-Dem codes that uniquely fall into one cluster) so labels are stable across re-runs.
- **Country profiles**: per-country positions, nearest institutional peers, distinguishing features, cluster anchors.
- **Cross-method comparison** (co-location vs Spearman; PCA vs UMAP).
- Additional: heatmap of Mcp, ICI vs GDP/cap, ICI vs V-Dem liberal-democracy index, ICI by region.

### `outcomes_ml.Rmd`
Sits on top of the same Mcp construction, adds:

- **Outcome panel** assembled in `load-outcomes` chunk. `outcome_meta` is a tribble; add a row to extend. Currently 9 outcomes across 5 buckets:
  - Fiscal: `weo_ggr_ngdp` (Revenue % GDP), `imf_tax_inc` (Income tax % GDP — pulled from IMF WoRLD 2026 sheet, not the macro parquet)
  - Health: `wdi_sp_dyn_le00_in`, `wdi_sp_dyn_imrt_in` (log), `wdi_sh_sta_mmrt` (log)
  - Education: `wdi_hd_hci_ovrl`, `wdi_se_sec_enrr`
  - Complexity: `atl_sitc_eci`
  - Trade: `wdi_ne_exp_gnfs_zs`
  - Each country × outcome takes its most recent non-NA value in the 6-year window ending at `latest_year` (so coverage gaps in 2024–25 fall back to 2023). Per-outcome "year used" is reported.
- **XGBoost depth sweep** (max_depth 3–6) per outcome with 5-fold CV, picking depth on OOS R². Hyperparameters: `eta=0.05`, `subsample=0.8`, `colsample_bytree=0.8`, `min_child_weight=5`. Best `nrounds` from CV.
- **SHAP main-effects** plots per outcome (top features by mean |SHAP|).
- **Tree-path bundle extraction**: for each leaf in the trained booster, the unique set of features used along the leaf-to-root path is the "bundle"; weight = leaf Cover (≈ samples reaching the leaf). Aggregated per (outcome × bundle) to identify dominant interaction sets. Top bundle per outcome reported.
- **PCA on Mcp** (centered + scaled). PC1 ≈ 45% var = liberal-democracy axis (uniform positive loadings on freedom features). PC2 ≈ 7% = contestation-vs-managed-state. Country scatter in PC1–PC2 with quadrant coloring; per-outcome `lm(y ~ PC1 + PC2 + PC1:PC2)` for quadrant interpretation.
- **Cambodia case study** (KHM): institutional peers via Euclidean distance in top-K PC space (Burundi is robustly #1 across K=2,5,10,20). Mekong geographic peers (VNM/LAO/THA/MMR) ranked.
- **LOO scorecard**: for the focus set `{KHM, BDI, VNM, LAO, THA, MMR}` and each outcome, refit XGBoost with that country held out, predict it, scale residual by `oos_rmse = sqrt(var(y) * (1 - r2_oos))`. Heatmap + table of "institutional surprises."

## Data

All inputs live under `data/shared-data/`. Read paths only — never write.

| Path | Use |
|---|---|
| `data/shared-data/vdem/vdem.parquet` | V-Dem country-year scores (long), used for both Rmds |
| `data/shared-data/vdem/vdem_codebook.parquet` | Codebook: `tag`, `name`, `vartype` (filter `vartype == "C"` for components) |
| `data/shared-data/vdem/vdem_codebook.md` | Greppable markdown rendering of the codebook (regenerate via `Rscript scratch/build_vdem_codebook_md.R`) |
| `data/shared-data/growth-lab/glmacro_master_alldata.parquet` | Macro outcomes panel; columns prefixed by source (`wdi_`, `weo_`, `atl_`) |
| `data/shared-data/world-imf2026.xlsx` (sheet `Data`) | IMF WoRLD income-tax variable (`TaxInc`) — joined as `imf_tax_inc` |

When choosing a new outcome variable from the macro parquet, **use the
`macro-dataset-advisor` subagent** (per project CLAUDE.md). Do not guess column names.

## Conventions and gotchas

- **`latest_year`** is computed dynamically: most recent year ≥2020 with ≥150 unique
  countries in V-Dem. Currently resolves to 2025. Both Rmds derive it the same way.
- **Mcp normalization is min-max, not z-score.** Done deliberately so feature scale is
  bounded and PCA on this matrix doesn't blow up. The PCA in `outcomes_ml.Rmd` then
  re-centers and re-scales (`prcomp(..., center=TRUE, scale.=TRUE)`) so that PC1 isn't
  just driven by the most-variant features.
- **`v2regopploc` and `v2regsuploc` are excluded** — discrete categorical variables that
  break the continuous-Mcp logic and would dominate proximity calculations.
- **GL design system** (per global CLAUDE.md): every chart loads
  `~/dev/gl-design/skills/gl-ggplot/assets/theme_gl.R` and calls `gl_setup()`. Highlight
  color is `highlight` (#C64646). Don't override the theme; don't set font families
  on individual geoms (PostScript will fail on JetBrains Mono in pdflatex).
- **Unicode + pdflatex**: avoid `≈`, `×`, smart quotes in plot text — pdflatex's default
  font lacks them. A warning about `’` substitution to `'` appears for the
  `v2smorgelitact` codebook entry; cosmetic, can be ignored.
- **xgboost 2.x DMatrix alignment**: when building feature matrices for `xgb.train`,
  *do not* go via `tibble |> as.matrix()` — the resulting buffer can be misaligned and
  xgboost crashes with `Check failed: ptr % alignment == 0`. Always rebuild with
  ```r
  matrix(as.double(x), nrow=, ncol=, dimnames=list(rownames, colnames))
  ```
  This pattern appears in `outcomes_ml.Rmd` chunks `join` and inside `fit_outcome`.

## Caching

All Rmds use `cache=TRUE` globally. Cache dirs (`*_cache/`) live next to each Rmd
and are gitignored.

**Knitr cache invalidation only checks the chunk's own code** — not its dependencies.
If you edit `outcome_meta` (or anything that changes upstream objects without
changing downstream chunk source), you must manually delete the stale cache files
for downstream chunks. The pattern that works:

```bash
cd analyses/outcomes_ml_cache/latex
rm -f join_* run-sweep_* sweep-table_* sweep-plot_* best-depth-table_* \
      per-outcome-plots_* predict-focus-countries_* residual-heatmap_* \
      scorecard-table_* pca-outcome-regression_* pca-quadrant-heatmap_* \
      pca-quadrant-counts_* top-bundle-per-outcome_*
```

The PCA / institutional-peer chunks are independent of `outcome_meta` and stay valid.

## Country-profile app

Interactive viewer for the joint-UMAP country trajectory (1975–2025). The
trajectory CSV produced by `scratch/country_space_animation.R` is converted to
JSON by `apps/country-profile/scripts/export_data.R` and consumed by a Canvas
renderer that does cubic-in-out tweening, hover identification, click-to-toggle
selection, k=4 nearest-neighbour overlay (recomputed per frame), trails, and a
force-directed label layout that resolves overlap each frame.

```bash
# regenerate JSON when outputs/country_space_trajectory.csv changes
Rscript apps/country-profile/scripts/export_data.R

# dev server
cd apps/country-profile && npm install && npm run dev
```

### Deployment

The app is hosted at **<https://institutions.taimur.sh>** by nginx on the
`cloud` SSH host, which serves `apps/country-profile/dist` directly (config:
`/etc/nginx/sites-available/institutions.taimur.sh.conf`). There is no CI —
deploys are manual:

```bash
# 1. Push from laptop
git push origin master

# 2. Copy the data folders that are not in git (see .gitignore).
#    publish_khan.sh copies the Khan axes page and its data into public/khan/,
#    served at /khan/.
analyses/polsett-proxies/publish_khan.sh
cd apps/country-profile/public
rsync -az --delete vdem-codebook research khan cloud:dev/institutional-complexity/apps/country-profile/public/
# public/polsett/llm/ is held back on purpose: without its index.json the
# experimental LLM overlay on the PolSett explorer stays hidden.

# 3. Pull + rebuild on the cloud host
ssh cloud 'cd ~/dev/institutional-complexity/apps/country-profile \
  && git -C ~/dev/institutional-complexity pull --ff-only \
  && npm install --no-audit --no-fund \
  && npm run build'
```

nginx serves `dist/` directly, so the new bundle is live once the build
completes. The SPA fallback is `try_files $uri /index.html`; `/khan/` has its
own location block so that it resolves to `khan/index.html` rather than the
app. Verify with `curl -I https://institutions.taimur.sh/` and
`curl -I https://institutions.taimur.sh/khan/`.

## Files map

```
analyses/
  institutional_complexity.Rmd     ← main complexity analysis
  institutional_complexity.pdf     ← knitted output
  outcomes_ml.Rmd                  ← ML extension: institutions → outcomes
  outcomes_ml.pdf                  ← knitted output
  deals-development.Rmd            ← Pritchett-Sen-Werker stakeholder fit
  deals-development.pdf            ← knitted output
  deals-and-development.md         ← workstream notes
case-studies/
  cambodia/
    cambodia-history.Rmd           ← 1970–2025 trajectory through the ML model
    cambodia-history.pdf           ← knitted output
    cambodia-pca-peers-analysis.md ← PC-space peer decomposition narrative
    thoughts-cambodia.md           ← scratch notes
apps/
  country-profile/                 ← Vite React + TS country profile tool
    public/{tracks,meta}.json      ← exported coords, regions, color map
    scripts/export_data.R          ← regenerates the JSON from outputs/
    src/                           ← components, interpolation, layout
TASK.md                            ← original spec for institutional_complexity.Rmd (stale)
imgs/                              ← exported figures (shared across analyses)
outputs/                           ← exported CSVs (shared across analyses)
scratch/                           ← exploratory R scripts (gitignored)
*_cache/, *_files/                 ← knitr caches and figure dirs (gitignored)
```

Each Rmd sets `knitr::opts_knit$set(root.dir = ...)` in its setup chunk so that
relative paths (`imgs/`, `outputs/`, `scratch/`, `data/shared-data/...`) resolve
from the project root regardless of where the Rmd is nested.

## Required R packages

Core: `tidyverse`, `arrow`, `knitr`, `xgboost`, `shapviz` (for `outcomes_ml.Rmd`);
`uwot`, `ggrepel`, `countrycode`, `WDI`, `pheatmap`, `igraph`, `RColorBrewer`, `DT`
(for `institutional_complexity.Rmd`).

V-Dem itself is loaded from the parquet under `data/shared-data/vdem/`; the
`vdemdata` R package mentioned in `TASK.md` is no longer used.

## References

- Hidalgo, C. A., & Hausmann, R. (2009). The building blocks of economic complexity.
  *PNAS*, 106(26), 10570–10575.
- Coppedge, M. et al. V-Dem Codebook. Varieties of Democracy (V-Dem) Project.

## Research route (`/research`)

A second page in the same Vite app, deliberately not linked from the shell:
open `https://institutions.taimur.sh/research` (or `/research#packages` etc.)
directly. It is set up like the g20 atlas — one page of tabs, each a thread
of analysis with a folded method note — and leaves the profile/country-space
routes untouched. Source under `apps/country-profile/src/research/`.

Tabs: Clusters (Ward / k-means / Louvain partitions of the joint country
space, dendrogram, k diagnostics), Packages (Cohen's d, AUC, category means,
rpart rules per cluster), Trajectories (cluster membership across the six
benchmark years), Complexity (ECI/diversity/PCI/COI by cluster, with and
without income), Product space (basket shares by Atlas community, product-level
gaps, Jaccard within/between with a permutation test), Diversification (entry
on density by cluster, expected entries, PCI of entries, co-entry), Outliers
(countries in a different cluster from their subregion: do their baskets follow
neighbours or cluster-mates), Mechanisms (institutions x PCI and x Rauch
differentiation in a fixed-effects entry model, plus a continuous PCI-tilt
formulation with and without income), Events (annual cluster
transitions against matched stayers, difference-in-differences paths),
Indicators (backward screen of all 139 indicators on the complexity of
entries, with income; the fiscal-revenue-source indicator v2stfisccap is the
strongest single survivor), Within (annual panel of new exports with country and
year fixed effects; V-Dem fiscal indicator plus IMF WoRLD tax and resource
revenue; within-country variation is small and the within estimates are null).

Nunn's (2007) input contract-intensity file is not fetched (his data page is
behind a browser check); drop it at `data/nunn/contract_intensity_io1997.dta`
and step 5 will prefer it over the Rauch product classification.

Pipeline (R, run in order; ~3 minutes total):

```bash
Rscript analyses/research/01_clusters.R     # joint matrix, Ward/k-means/Louvain, diagnostics
Rscript analyses/research/02_packages.R     # per-cluster profiles, rpart tree for k = 6
Rscript analyses/research/03_complexity.R   # Atlas joins, entries, pairs
Rscript analyses/research/04_null_model.R   # BiCM null: validated specialisations, null-adjusted pair overlap
Rscript analyses/research/05_mechanisms.R   # product traits (PCI, Rauch differentiation) x institutions in the entry model
Rscript analyses/research/06_events.R       # annual cluster membership (k-NN vote) for the event study; Atlas annual panel
Rscript analyses/research/07_indicator_screen.R  # every indicator vs the PCI tilt of entries, income held fixed (BH-corrected)
Rscript analyses/research/08_within.R       # annual new-export panel (sustained/consolidated rules), two-way FE on fiscal measures
```

Outputs land in `apps/country-profile/public/research/` (parquet + JSON, ~1 MB).
Step 3 reads the world complexity panel that the g20 project cached from the
Atlas DB (`~/dev/g20/code/output/cache/cx_*.parquet`) and its product table
with product-space coordinates and communities
(`~/dev/g20/app/public/data/products.parquet`); no database connection is
needed. The k slider works in the browser because every cut k = 2..12 ships
with the data; hand-written cluster names exist only for Ward k = 6
(`src/research/names.ts`). Step 4 fits the bipartite configuration model
(Saracco et al. 2015, as on cities-complexity.jesusd.app) to the 2023 RCA
matrix and rewrites `cx_pairs.parquet` with expected overlaps and MCC; the
Product space tab offers raw and null-adjusted readings side by side.
