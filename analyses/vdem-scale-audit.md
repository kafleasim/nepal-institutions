# V-Dem measurement-scale audit, and how far V-Dem can stand in for PolSett

Two questions, addressed in turn:

1. Which V-Dem indicators entering the country space and the peer calculation are not
   continuous, and are therefore being z-scored on a scale that has no metric?
2. How well can the PolSett political-settlement indicators be approximated from V-Dem?

Scripts used are in `scratch/` (see the end of this note). Numbers below are from
`scratch/country_spaces_by_year.rds` (the six cross-section years) and the 2024 V-Dem
cross-section.

---

## 1. Scale audit of the country space

### 1.1 Five nominal indicators are being z-scored

The pipeline in `analyses/country-space-writeup.Rmd` drops two indicators as
"discrete-categorical" — `v2regopploc` and `v2regsuploc`. Five further indicators have
exactly the same problem and are currently retained. They are present in all six
cross-section years:

| Tag | Name | Levels |
|---|---|---|
| `v2regimpgroup` | Regime most important support group | 14 |
| `v2regproreg` | Strongest pro-regime preferences | 14 |
| `v2regimpoppgroup` | Regime most important opposition group | 14 |
| `v2regantireg` | Strongest anti-regime preferences | 14 |
| `v2regpower` | Most powerful group in affecting regime duration and change | 14 |

All five share one response set — a list of social groups, not an ordered scale:

```
0 Aristocracy          4 Civil servants     8 Local elites/chiefs  12 Rural middle class
1 Agrarian elites      5 Military           9 Urban working class  13 Foreign govt / colonial power
2 Party elites         6 Ethnic/racial      10 Urban middle class
3 Business elites      7 Religious          11 Rural working class
```

The codebook `scale` field is empty for all five, which is why a `vartype == "C"` filter
lets them through. Their cross-coder aggregation rule is **mode** — the country-year value
is the modal category across coders, an integer in 0–13, not an IRT latent score.

### 1.2 What the z-scoring implies

On the 2024 cross-section `v2regimpgroup` has mean 4.48 and SD 3.31, so one category step
is 0.30 SD. Distances between category pairs then read:

| Pair | Implied distance |
|---|---|
| Military-supported vs. Religious-supported | 0.60 SD |
| Party-elite-supported vs. Business-elite-supported | 0.30 SD |
| Urban-working-class vs. Urban-middle-class | 0.30 SD |
| Aristocracy-supported vs. Foreign-backed | 3.92 SD |

A monarchy and a foreign-backed regime are placed at the largest institutional gap this
feature can express, while a military regime and a theocracy are placed closer together
than two varieties of civilian elite rule. The ordering is a list, and the arithmetic on
it is not meaningful.

### 1.3 How much it actually moves the peer results

Less than the framing suggests. Because the five are z-scored like everything else, each
contributes about the same expected squared distance as any other feature:

| Year | Features | Nominal share of total squared distance | Uniform share |
|---|---|---|---|
| 1975 | 188 | 2.7% | 2.7% |
| 1985 | 188 | 2.7% | 2.7% |
| 1995 | 190 | 2.6% | 2.6% |
| 2005 | 222 | 2.3% | 2.3% |
| 2015 | 222 | 2.3% | 2.3% |
| 2025 | 173 | 2.9% | 2.9% |

Dropping all five from the 2025 space changes the top-10 peer set by a mean of 1.1
countries (mean overlap 8.9/10, median 9/10; only 2% of countries lose more than three
peers). Cambodia keeps 9 of 10; Pakistan, Ethiopia and Rwanda keep 9–10; the largest
movers are South Korea, Spain and Seychelles at 7/10.

So this is a defect to fix for correctness and for the interpretability of the anomaly
chart, not a result that invalidates the existing peer sets. The nominal-scale problem
that would have dominated distances — a wide integer range against an IRT `[-4, +4]`
range, which is the reason `v2regopploc`/`v2regsuploc` were dropped — does not arise here,
because z-scoring rescales every feature to unit variance regardless.

### 1.4 The same five are plotted as time series in the app

`export_vdem_explorer.R` keeps `vartype %in% c("C","D")` with no scale screen, so all
seven nominals (the five above plus `v2regopploc` and `v2regsuploc`) appear in
`vdem_explorer.parquet` and are drawn as continuous lines. A country whose modal support
group shifts from Military (5) to Religious (7) renders as an upward trend. This is more
misleading than the peer-distance effect, because the chart invites reading a slope.

### 1.5 A filter that is removing the wrong thing

`country-space-writeup.Rmd`, `institutional_complexity.Rmd` and `pooled-panel-pca.Rmd`
all apply:

```r
is_numbered <- grepl("_\\d+$", all_cols)   # "multi-coder per-rater columns"
```

described as dropping "individual rater's codings, not aggregated scores". The V-Dem
country-year file contains no per-rater columns — the codebook has zero tags ending in
`_<digit>`. What this regex removes is V-Dem's **multi-select** response families, where
a "check all that apply" question is published as one column per option holding the share
of coders who selected it. These are continuous on [0, 1].

Seventeen C-type families, 215 columns, are dropped this way at ≥50% coverage in 2024:

| Stem | Cols | Name |
|---|---|---|
| `v2regsupgroups` | 14 | Regime support groups |
| `v2regoppgroups` | 14 | Regime opposition groups |
| `v2regoppgroupsact` | 14 | Explicit and active regime opposition groups |
| `v2clrgstch` | 22 | Stronger civil liberties characteristics |
| `v2clrgwkch` | 22 | Weaker civil liberties characteristics |
| `v2elsnlfc` | 22 | Subnational election area less free/fair characteristics |
| `v2elsnmrfc` | 22 | Subnational election area more free/fair characteristics |
| `v2csanmvch` | 13 | CSO anti-system movement character |
| `v2smhargr` | 11 | Online harassment groups |
| `v2smorgtypes` | 10 | Types of organization through social media |
| `v2exctlhg` | 9 | HOG control over |
| `v2exrmhgnp` | 9 | HOG removal by other in practice |
| `v2exctlhs` | 8 | HOS control over |
| `v2exrmhsol` | 8 | HOS removal by other in practice |
| `v2casoe` | 7 | State of emergency |
| `v2psbantar` | 6 | Party ban target |
| `v2csstruc` | 4 | CSO structure |

The three regime-group families are the continuous counterpart of the five modal
categoricals: `v2regsupgroups_0..13` gives, for each of the 14 groups, the share of coders
naming it as a regime support group. Coverage is 98–99% of countries in every benchmark
year from 1975. Support-coalition vectors, 2024:

| | Aristo | Agrar | Party | Business | CivServ | Mil | Ethnic | Relig | Local | UrbWk | UrbMid | RurWk | RurMid | Foreign |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Saudi Arabia | **1.00** | 0.40 | 0.00 | 0.60 | 0.40 | 0.40 | 0.20 | 0.80 | 0.40 | 0.20 | 0.40 | 0.20 | 0.40 | 0.20 |
| China | 0.00 | 0.00 | **1.00** | 0.14 | 0.29 | 0.29 | 0.00 | 0.00 | 0.00 | 0.14 | 0.14 | 0.14 | 0.00 | 0.00 |
| Cambodia | 0.17 | 0.17 | **1.00** | **1.00** | 0.67 | 0.83 | 0.00 | 0.33 | 0.50 | 0.17 | 0.50 | 0.33 | 0.50 | 0.33 |
| Egypt | 0.40 | 0.00 | 0.00 | 0.20 | 0.80 | 0.80 | 0.00 | 0.00 | 0.20 | 0.00 | 0.00 | 0.20 | 0.00 | 0.60 |
| Pakistan | 0.20 | 0.20 | 0.40 | 0.60 | 0.20 | **1.00** | 0.00 | 0.40 | 0.20 | 0.20 | 0.00 | 0.00 | 0.20 | 0.00 |
| India | 0.67 | 0.50 | 0.83 | **1.00** | 0.67 | 0.33 | 0.50 | **1.00** | 0.67 | 0.17 | 0.17 | 0.17 | 0.17 | 0.00 |
| Ethiopia | 0.00 | 0.00 | 0.50 | 0.12 | 0.50 | 0.88 | 0.75 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.12 | 0.00 |
| Rwanda | 0.00 | 0.00 | 0.67 | 0.17 | 0.00 | **1.00** | 0.17 | 0.00 | 0.00 | 0.00 | 0.17 | 0.00 | 0.00 | 0.00 |

The modal-category variable compresses each of these rows to a single integer. Egypt's
`v2regimpgroup` is 4 (civil servants), which loses the 0.80 on military and the 0.60 on
foreign backing. China's narrow party-only coalition and Cambodia's broad
party-plus-business-plus-military coalition both reduce to 2 (party elites).

Replacing the five modal categoricals with the 42 regime-group columns (173 → 210
features) moves the 2025 peer sets considerably more than simply deleting them — mean
top-10 overlap against the current space is 7.0/10:

```
Cambodia   current:  Djibouti, Eq. Guinea, Uganda, Egypt, Zimbabwe, Comoros, Congo-B, Burundi
           proposed: Eq. Guinea, Comoros, Uganda, Djibouti, Zimbabwe, Egypt, El Salvador, Uzbekistan

Ethiopia   current:  Algeria, Togo, Uganda, Djibouti, Cambodia, Comoros, Egypt, Mozambique
           proposed: Togo, Comoros, Algeria, Sudan, Djibouti, Congo-B, Pakistan, Libya

Egypt      current:  Djibouti, Uzbekistan, Uganda, Kazakhstan, Congo-B, Eq. Guinea, Kyrgyzstan, Burundi
           proposed: Uzbekistan, Eq. Guinea, Djibouti, Kazakhstan, Comoros, Uganda, Rwanda, Russia
```

### 1.6 Suggested changes

- Add the five tags to `discrete_vars` in `country-space-writeup.Rmd`,
  `institutional_complexity.Rmd` and `pooled-panel-pca.Rmd`. Re-derive
  `country_spaces_by_year.rds`, `fingerprints_by_year.parquet` and `pc_scores.parquet`.
- Replace the `_\d+$` screen with an explicit per-rater screen, or restrict it to the
  families that genuinely should be excluded, and admit the multi-select families as
  ordinary continuous features. Adding all 215 would give a 383-feature space and would
  reweight the space toward the civil-liberties and subnational-election families
  (22 columns each); admitting only the three regime-group families (42 columns) is the
  conservative version and is the one priced above.
- In the explorer, either exclude nominal-scale tags or render them as a step/category
  strip rather than a line. A `scale`-based screen will not catch these (the field is
  empty); the reliable test is integer-valued with ≤25 distinct values across the panel.

### 1.7 Applied, and what moved

The nominal screen is now a rule rather than a hardcoded pair — `is_nominal_code()` in
`country-space-writeup.Rmd`, `pooled-panel-pca.Rmd` and `institutional_complexity.Rmd`.
The `_\d+$` screen is retained but renamed `is_multiselect` with a corrected comment; the
multi-select families are still excluded, pending a separate decision.

Rebuilt: `scratch/country_spaces_by_year.rds` (2025 goes 173 → 168 features, each other
year −5), `fingerprints_by_year.parquet` (222 → 217 tags, five removed, none added),
`outputs/pooled_pca/*` (190 → 185 indicators) and `pc_scores.parquet`. Because both
`derivePeers.ts` and `PeerAnomaliesSection.tsx` read only from the fingerprint parquet,
this covers the peer ranking and the "why this peer" chart with no React change.

2025 top-10 peer sets move by a mean of 1.0 country; 24% of countries are unchanged.
Cambodia swaps Burundi for Bahrain, Ethiopia gains Iran, Bangladesh gains Nepal.

**PC4 and PC5 swapped in the rebuilt PCA.** PC1–PC3 are stable (r = 1.000, 0.9995, 0.998
against the previous fit, same signs, loadings unchanged to three decimals). But old PC4
and old PC5 held 2.3% and 2.2% of variance — near-degenerate — and dropping five
indicators reordered them:

| | new PC3 | new PC4 | new PC5 |
|---|---|---|---|
| old PC3 | **0.998** | −0.02 | −0.02 |
| old PC4 | −0.03 | −0.18 | **−0.93** |
| old PC5 | −0.02 | **−0.98** | 0.18 |

So new PC4 ≈ −(old PC5) and new PC5 ≈ −(old PC4). Nothing in the app is affected —
`pc_meta.json` carries prose only for PC1–PC3 and `PCTrajectoriesSection` displays only
those three. But any prior reading of "PC4" now refers to a different component, which
matters for the outstanding PC3/PC4 interpretation question. Given the 0.1pp variance gap
between them, their ordering should be treated as unstable under any change to the
indicator set rather than as a fact about the data.

**Unresolved:** `save_fig(..., ".pdf")` fails in the current environment with "invalid
font type" (showtext on the pdf device), and xelatex fails the same way on
`Invalid font: -1 (0)`. Verified independent of these changes — a two-line plot reproduces
it, and PNG saves fine. Consequence: `country-space-writeup.Rmd` and
`pooled-panel-pca.Rmd` run all R chunks correctly but cannot render to PDF, so the
committed PDFs are stale relative to the Rmds.

**Also unresolved:** `export_vdem_explorer.R` still screens on `vartype %in% c("C","D")`
with no scale check, so all seven nominals remain in `vdem_explorer.parquet` and are drawn
as continuous lines (§1.4).

---

## 2. Approximating PolSett from V-Dem

### 2.1 Setup

43 of the 44 PolSett countries match V-Dem by name, giving 2,717 country-years across 630
country-periods, 1945–2019. Features are the V-Dem C-type components plus the multi-select
group vectors from §1.5, screened at ≥90% coverage within the merged sample: 275 columns
(150 base components + 125 multi-select).

Estimator is ridge, with λ chosen by an inner grouped CV inside each outer fold. Because
PolSett values are constant within a political period, R² is computed after collapsing
predictions and outcomes to country-period means — country-year R² would be inflated by
the repetition.

Two cross-validation regimes answer different questions:

- **Leave-one-country-out (LOCO)** — can V-Dem place a country PolSett has never coded?
  This is the relevant test for extending PolSett beyond its 44 countries.
- **Leave-one-period-out** — can V-Dem fill in a period for a country PolSett has coded?
  This is the relevant test for extending the 44 covered countries past 2019.

### 2.2 Results

Period-level R², out of sample:

| PolSett index | LOCO: polyarchy+libdem+regime (3) | LOCO: C-components (150) | LOCO: +group vectors (275) | Leave-period-out (275) |
|---|---|---|---|---|
| General cooptation | 0.42 | **0.50** | 0.49 | 0.77 |
| Violent repression | 0.41 | 0.49 | **0.50** | 0.72 |
| Social Foundation Size | 0.26 | **0.27** | 0.27 | 0.74 |
| Horiz. distribution inequality | 0.08 | 0.22 | **0.23** | 0.47 |
| Power Concentration (add) | 0.05 | 0.17 | **0.17** | 0.27 |
| Power Concentration (mix) | 0.05 | 0.15 | **0.17** | 0.26 |
| Vertical power | 0.02 | 0.11 | **0.13** | 0.24 |
| Horizontal power (norm) | 0.03 | 0.11 | **0.11** | 0.27 |
| ESID Pol. Settlement Index | −0.01 | **0.08** | 0.05 | 0.46 |
| Governing Coalition Size | −0.03 | **0.02** | 0.00 | 0.46 |
| Powerful-citizen pop share | 0.01 | 0.00 | −0.01 | 0.62 |

Four-category typologies, LOCO accuracy:

| Typology | Accuracy | Majority-class baseline |
|---|---|---|
| ESID settlement type (`x_esidettlementype`) | 50.0% | 37.6% |
| Khan settlement type (`x_khansettlementype`) | 50.9% | 43.1% |

Both sit about 8–12 points above chance, and both confusion matrices collapse onto two of
the four classes. For ESID, of 448 country-years in class 1 it predicts class 1 zero
times, and of 499 in class 3 it predicts class 3 fifteen times. For Khan, class 2 is
predicted 38 times out of 393 actual and class 4 zero times out of 349. In both cases the
model is separating one axis — broadly, the breadth of the social foundation — and is
close to uninformative on the other.

### 2.3 Reading

PolSett separates into two layers with very different V-Dem recoverability.

The **repression and cooptation** layer is substantially recoverable (LOCO R² ≈ 0.5).
This is unsurprising: both projects are coding the same observable conduct, and the top
correlates are what you would expect — `v2csreprss` (CSO repression) at r = 0.73 with the
cooptation score and −0.70 with violent repression, alongside freedom from torture,
freedom of discussion, and CSO entry/exit. For these constructs a V-Dem-based estimate is
a reasonable prior and a usable external check.

The **power-distribution** layer — power concentration, governing coalition size, share of
powerful citizens, and the composite settlement index — is not recoverable across
countries (LOCO R² between −0.01 and 0.17). The best single V-Dem correlate of governing
coalition size is `v2cacamps` (political polarization) at r = −0.39, and
`v2regsupgroupssize` — the V-Dem variable most directly about coalition breadth — reaches
only r = 0.32. This is the substantive result: V-Dem's coalition coding and PolSett's
power-distribution coding overlap conceptually but do not track each other empirically.

Adding the 125 multi-select group columns to the 150 base components changes almost
nothing (column 3 vs. column 2 above, differences within ±0.03). The regime-support-group
vectors that look conceptually closest to PolSett's coalition constructs carry no
incremental predictive content for them. Note this cuts against a natural reading of §1.5:
those columns are worth admitting to the country space on measurement grounds, but they
are not a back-door route to PolSett.

Within covered countries the picture is much better — Social Foundation Size at 0.74,
cooptation 0.77, repression 0.72, and even the composite index at 0.46. Extending PolSett
forward from 2019 for the 43 covered countries is a tractable interpolation problem.
Extending it sideways to new countries is not, at least on the power axis.

### 2.4 Bearing on the LLM-coder expansion

The axis where V-Dem cannot substitute for PolSett — power concentration and coalition
size — is the axis that motivates the expansion, so this is an argument for the LLM route
rather than against it. It is also a warning: that axis is the one with no independent
V-Dem-based validation available, so coder-level ground-truth validation matters most
there. Social foundation size, cooptation and repression have a usable V-Dem check;
`x_powerconcentration_*` and `x_governingcoalitionsize` do not.

A caveat on all of this: 43 countries is a small effective sample for LOCO, and the LOCO
figures are a lower bound in the sense that PolSett's country set is not a random sample
of the world. The gap between the LOCO and leave-period-out columns is partly genuine
country heterogeneity and partly a reflection of how much of PolSett's variance is
cross-country rather than within-country.

---

## Scripts

In `scratch/vdem-scale-audit/` (gitignored, but rerunnable in place):

- `audit_scale.R` — profiles every indicator in the country space; flags integer-valued
  columns with ≤25 levels
- `absurd.R` — the implied-distance table in §1.2
- `swap.R` — peer comparison, modal categoricals vs. regime-group vectors
- `polsett_predict.R` — PolSett/V-Dem merge and feature screen
- `ridge_cv.R`, `ridge_period.R`, `cls_cv.R` — the cross-validation runs
- `topfeat.R` — per-target correlates
