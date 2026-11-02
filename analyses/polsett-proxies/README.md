# Proxying PolSett concepts from V-Dem and other public indicators

PolSett (Schulz & Kelsall 2020) codes political-settlement concepts for 42
Global-South countries. This directory holds a tool for evaluating hand-picked
proxies for those concepts against the labelled data, and the results of a first
pass.

## Contents

| File | Role |
|---|---|
| `build_proxy_data.R` | Assembles the evaluation dataset: PolSett targets plus 71 candidate proxies, merged at the country-period level. Writes `proxy_data.js`. |
| `typology-match.html` | **Start here.** One proxy per ESID axis, crossed into a predicted quadrant and scored against the actual typology, with a per-country timeline. |
| `proxy-explorer.html` | Candidate search across all 75 proxies and six concepts — use when picking a metric, not when evaluating one. |
| `evaluate.R` | Forward-stepwise search over the candidate pool scored by leave-one-country-out R², for the summary below. |
| `reliability.R` | Inter-coder reliability of the PolSett indices from the coder-level file, and the ceiling it puts on any external proxy. |
| `llm_vs_ceiling.R` | Compares the LLM-coder validation for Cambodia against the within-Cambodia reliability ceiling item by item. |
| `rotations.R` | Tests whether rotating the proxy space (PCA, PCR, CCA, residualisation, ridge) improves the quadrant. LOCO. |
| `proxy_data.js` | Generated (3.4 MB), gitignored if the repo policy requires. Rebuild with `Rscript build_proxy_data.R`. |

## Why the concepts decompose the way they do

The tool is organised around the codebook's own construction formulas rather
than around the headline indices, because the layers behave very differently.

**Social foundation size** (`x_socialfoundationsize`, codebook 4.2.35) is

```
Σ_blocs  popshare_bloc × powerfulshare_bloc × cooptindex_bloc
```

so it is the product of two separable constructs: how much of the population is
*potentially disruptive* (`x_totpowerfulpopshare`), and whether that capability
is *co-opted rather than repressed* (`x_*gencooptindex`). Proxying the product
directly conflates two things V-Dem measures with very different success.

**Power concentration** (`x_powerconcentration_mix`, 4.1.9) is

```
0.25·horizontal_nor + 0.25·vertical + 0.5·horizontal_nor·vertical
```

where horizontal power is the scale inversion of the relative power of the
opposition bloc (4.1.1), and vertical power is a PCA index over the LB-vs-CLB
power ratio, the likelihood the contingent-leadership bloc splits, hierarchy
within the leader's bloc, and cohesiveness of the leader's bloc (4.1.5). The
horizontal axis is Khan's coalition-versus-excluded-factions distinction; the
vertical axis is what Ferguson's unipolar/multipolar contrast picks out.

## What the labelled data says

Unit of analysis is the country-period (631 periods, 44 countries, 1945–2019),
not the country-year: PolSett values are constant within a political period, so
country-year statistics are inflated by repetition. LOCO R² is leave-one-country-out,
refitting within each fold — the metric that matches the actual use case of
placing a country PolSett has never coded.

| Layer | Best single proxy | LOCO R² | Best stepwise compound (≤4 terms) | LOCO R² | 275-feature ridge |
|---|---|---|---|---|---|
| Cooptation vs repression | `v2csreprss` CSO repression | **0.51** | + `v2x_civlib` | **0.54** | 0.50 |
| Social foundation size | `v2x_civlib` civil liberties | 0.28 | + sec. enrolment, `v2csreprss`, `v2cademmob` | 0.36 | 0.27 |
| Powerful population share | `e_peaveduc` avg. years educ. | 0.03 | + industry employment, tertiary enrol., `v2pepwrses` | 0.16 † | 0.00 |
| Horizontal power (coalition vs OB) | `v2lgoppart` legislature opposition | 0.08 | + `v2csantimv`, `v2psbars`, `sup_opp_overlap` | 0.18 | 0.11 |
| Vertical power (leader within coalition) | `v2exremhsp` HOS removal by legislature | 0.04 | + `v2pscohesv`, `v2xnp_pres`, `sup_count` | 0.13 | 0.13 |
| Power concentration (mix) | `v2lgoppart` | 0.10 | + `v2csantimv`, `v2exremhsp`, `v2psbars` | 0.19 | 0.17 |

† on 113 country-periods rather than 326: the structural variables that drive the
gain have thin pre-1990 coverage, so this figure is not comparable to the others
and should be treated as an upper bound obtained on a favourable subsample.

Ridge figures are from `analyses/vdem-scale-audit.md` §2.2 (leave-one-country-out
ridge on 275 V-Dem columns), included for comparison.

### Reading

There is one genuine single drop-in. `v2csreprss` — "Does the government attempt
to repress civil society organizations?" — reaches r = 0.73 against the general
cooptation score, and holds at 0.71 between countries and 0.72 within them. The
conceptual match is close and the empirical match does not depend on the
cross-country/within-country split, which is unusual among these candidates.
`v2x_civlib` performs almost identically and may be preferable as an aggregate.

For the remaining layers no single indicator suffices, and the concept-led
compounds are worth the effort mainly because they roughly match what a
275-feature ridge achieves while using two to four named indicators. On the
horizontal-power axis the hand-built compound does somewhat better than the
ridge (0.18 vs 0.11), which suggests the earlier statistical failure was partly
a specification problem rather than only an absence of signal. In absolute terms,
however, the power-distribution layer remains weakly recoverable: no combination
tried here explains more than a fifth of the cross-country variance.

Two of the nonlinear constructions over V-Dem's multi-select regime-group vectors
do enter the stepwise compounds — `sup_opp_overlap` (cosine similarity between
the support-group and active-opposition-group vectors) for horizontal power, and
`sup_count` (number of social groups named as regime supporters) for vertical
power. Each adds 0.02–0.03 LOCO R². These are quantities a linear model over the
raw 42 group columns cannot represent, so the increment is consistent with the
earlier finding that adding those columns to a ridge changed nothing, without
contradicting it. The increments are small enough that they should be treated as
suggestive.

## How much of PolSett is signal? (`reliability.R`)

A weak proxy correlation admits two readings: V-Dem lacks the construct, or the
PolSett target is too noisily coded for anything to correlate with it. The
coder-level file settles this. With roughly three experts per country-period, the
reliability of the published mean can be estimated from a one-way random-effects
decomposition with country-period as the grouping factor, and classical test
theory then bounds any external proxy at `sqrt(reliability)`.

Each index was rebuilt per coder from the codebook formulas and validated against
the published aggregate first (r = 0.95–0.995 against the distance- and
confidence-weighted values, so the reconstructions are faithful). ICC and
split-half estimates agree closely.

| PolSett index | Reliability | Ceiling √R | Best proxy \|r\| | Share of ceiling |
|---|---|---|---|---|
| `x_gencooptscore` | 0.77 | 0.88 | 0.73 | 83% |
| `x_verticalpower` | 0.68 | 0.82 | 0.24 | **30%** |
| `x_powerconcentration_mix` | 0.61 | 0.78 | 0.34 | 43% |
| `x_socialfoundationsize` | 0.53 | 0.73 | 0.56 | 77% |
| `x_horizontalpower` | 0.47 | 0.69 | 0.32 | 46% |
| `x_totpowerfulpopshare` | **0.08** | 0.28 | 0.30 | **107%** |

Two conclusions, pointing in opposite directions.

**`x_totpowerfulpopshare` is close to pure coder noise.** Reliability 0.081 means
roughly 92% of the variance in the published value is disagreement between
coders. Its constituent items are worse: `q7_powerlesspercentage_lb` has an item
reliability of 0.001 and `_clb` of 0.000. On the population-share questions the
median within-period spread across coders is 20 percentage points; for Cambodia's
second period, coders put the leader bloc's share of the population anywhere
between 5% and 80%. The ceiling is 0.28 and `e_peaveduc` already reaches 0.30, so
no further proxy work on this index is worth doing — it has been saturated.
Social foundation size inherits the problem through the product, which is part of
why its own reliability is only 0.53.

**Vertical power is the opposite case.** It is the second most reliably coded
index in the set (0.68), and the worst captured relative to its ceiling (30%).
Experts agree substantially about whether a leader dominates their own coalition;
V-Dem simply does not contain that construct. So the earlier failure on this axis
should not be attributed to PolSett measurement error. It is a real gap.

### The LLM coder was partly scored against noise (`llm_vs_ceiling.R`)

The Cambodia LLM validation reports a median item-level r of 0.40 against the
human means. Recomputing the ceiling within Cambodia — periods as the grouping
factor, so it is comparable to the LLM's within-country correlation — puts that
figure in context. Over 90 substantive items:

- median LLM r 0.52 against a median ceiling of 0.56, i.e. 73% of what was attainable
- 43% of items have an LLM r at or above the ceiling
- 47% of items have a ceiling below 0.5

So a substantial part of the apparent LLM shortfall is the benchmark, not the
model. But the exception is systematic and it is the same exception as for V-Dem.
On the items feeding vertical power, where human coders agree well, the simulated
coders fail badly:

| Item | LLM r | Ceiling | Share |
|---|---|---|---|
| `q3_clbsplit` (likelihood CLB splits) | −0.57 | 0.84 | sign inverted |
| `q8_hierarchy_lb` | 0.10 | 0.72 | 14% |
| `q14_polmakingconcent` | 0.18 | 0.95 | 19% |
| `q9_cohesiveness_*` | 0.17 | 0.62 | 28% |
| `q2_power_*` | 0.41 | 0.64 | 48% |

Meanwhile the cooptation and repression families (`q10`, `q11`, `q13`, `q18`,
`q19`) reach 80–95% of their ceilings. The simulated coders are also 6× more
agreeable than the humans (mean within-period SD 0.28 vs 1.70), so they are
confidently wrong rather than appropriately uncertain.

Two independent methods therefore converge: the intra-coalition power items are
reliably coded by experts, and are recoverable neither from V-Dem nor by an LLM
working from public sources.

## Bueno de Mesquita's selectorate and winning coalition

Tested because W and S are the closest existing formalisation of "how much of the
population has to be kept on side". BdM's original indices are built from Polity's
LEGSELEC/XRCOMP/XROPEN/PARCOMP components, which are not in our local data (only
the `polity2` aggregate), so `bdm_W` here is the V-Dem reconstruction of Bueno de
Mesquita & Smith (2022) from `analyses/winning_coalition.R`, and `v2x_suffr` —
share of population with suffrage — stands in for the literal size of the
electorate.

| Proxy | vs `x_socialfoundationsize` | vs `x_governingcoalitionsize` | vs `x_totpowerfulpopshare` |
|---|---|---|---|
| `bdm_W` | r 0.49, LOCO R² 0.21 | 0.10, −0.02 | 0.25, 0.01 |
| `v2x_suffr` | 0.07, −0.04 | 0.18, −0.04 | 0.03, −0.05 |
| `v2x_elecoff` | 0.29, 0.05 | 0.15, −0.01 | 0.20, −0.01 |
| `e_polity2` | 0.54, 0.26 | −0.05, −0.03 | 0.31, 0.05 |
| `v2x_polyarchy` | 0.53, 0.26 | 0.09, −0.02 | 0.25, 0.02 |

W does moderately well on social foundation size (r = 0.49) but does not beat
`polity2` (0.54), `v2x_polyarchy` (0.53) or `v2x_civlib` (0.56). Everything that
predicts social foundation size sits in a 0.49–0.56 band and is some form of
democracy or civil-liberties index, which follows from the construction: social
foundation size is the powerful layer times the co-opted layer, the powerful layer
is noise, so what survives is the cooptation layer, and that is the liberties
layer. On this evidence the selectorate framing adds nothing beyond generic
regime openness.

The literal size of the electorate is flat. `v2x_suffr` correlates 0.07 with
social foundation size and 0.18 with governing coalition size. Neither W nor
suffrage predicts governing coalition size at all, despite that being the
construct they most resemble on paper.

### Typology recovery

Assigning the four-category typologies by dichotomising two proxies, one per
axis (thresholds chosen to maximise accuracy — an optimistic setting):

| Typology | Accuracy | Majority baseline | Axis detail |
|---|---|---|---|
| ESID (`x_esidettlementype`) | 50% | 30% | social-foundation axis AUC 0.80; power axis AUC 0.69 |
| Khan (`x_khansettlementype`) | 39% | 35% | horizontal axis AUC 0.65; vertical axis AUC 0.60 |

The ESID typology is partly recoverable and the gain sits almost entirely in its
social-foundation axis. The Khan typology, whose two axes are both power axes, is
close to uninformative — 4 points above assigning every case to the modal class.
This is the same asymmetry the earlier ridge audit found, localised to the axis
responsible for it.

## The ESID quadrant, end to end (`typology-match.html`)

The single best public indicator for each ESID axis, selected on AUC against that
axis's dummy:

| Axis | PolSett variable | Cutoff | Best proxy | AUC | r | Axis called right |
|---|---|---|---|---|---|---|
| Social foundation size | `x_socialfoundationsize` | 41 | `v2x_civlib` civil liberties index | 0.813 | 0.561 | 77.0% |
| Power concentration | `x_powerconcentration_add` | 0.56 | `v2mecenefm` media censorship, reversed | 0.691 | −0.386 | 65.1% |

Crossing the two dichotomies and comparing with `x_esidettlementype` over 453
country-periods gives **50.6%** quadrant agreement against a 30.9%
majority-class baseline (48.8% using PolSett's own sample-mean cutoff rule, 52.5%
with cutoffs tuned to maximise agreement, so the choice of rule moves it by about
four points).

The errors are not spread evenly. Recall by quadrant:

| Actual quadrant | n | Recall |
|---|---|---|
| Broad–Concentrated | 80 | **18%** |
| Broad–Dispersed | 127 | 71% |
| Narrow–Dispersed | 106 | **20%** |
| Narrow–Concentrated | 140 | 74% |

The two off-diagonal quadrants are barely recovered, and the reason is visible in
the two scatter panels on the page. PolSett's own axes correlate −0.22, i.e. they
are close to independent, which is what makes the 2×2 informative. The best proxy
pair correlates −0.81 — close to the same variable with a sign flip. A pair that
collinear can only populate one diagonal, so it systematically cannot express
"broad social foundation with concentrated power" or "narrow foundation with
dispersed power".

This is not an artefact of proxy choice. Every V-Dem variable that discriminates
on either axis is some openness or liberties measure, and that follows from the
construction: social foundation size is the powerful-population layer times the
co-opted layer, the powerful layer is near-unmeasurable (reliability 0.08), so
what a social-foundation proxy actually picks up is the cooptation layer — which
is also what a power-concentration proxy picks up. The two estimated axes are
therefore near-duplicates of one underlying liberties dimension, while the two
real axes are not.

The per-country view shows how uneven this is: Myanmar matches 8 of 8 periods and
Indonesia 6 of 7, while all three Yemen series match 0. Pakistan matches 7 of 15,
with the social-foundation call wrong in 4 of the 8 misses and the power
concentration call wrong in 4 — and its time chart shows why. Pakistan's actual
social foundation size moves between 15 and 30 while the `v2x_civlib`-based
estimate sits almost flat in the low-to-mid 30s, straddling its own cutoff of
about 35, so small wiggles in the proxy flip the classification while the real
variation is missed entirely.

## Using the tool

Open `proxy-explorer.html`. Pick a concept in the left rail; the definition and
the codebook construction formula appear at the top. Four tabs:

- **Single candidates** — leaderboard of the candidate pool with pooled, between-
  and within-country correlations and univariate LOCO R². Click a row for the
  V-Dem codebook question and clarification, a country-period scatter, and a
  country-means scatter. ⚠ flags a candidate whose empirical sign contradicts the
  conceptual prior recorded in `build_proxy_data.R`.
- **Compound builder** — tick candidates, set weights by hand or fit them by OLS,
  and choose additive, multiplicative or mixed combination logic. The three modes
  mirror the substitutability, weakest-link and mixed logics the codebook uses for
  its own indices, so the social-foundation construction can be rebuilt directly
  as a powerful-share proxy multiplied by a cooptation proxy. Note that r and ρ
  respond to the hand weights while the two R² figures refit by OLS and so report
  the ceiling for the selected set.
- **Typology 2×2** — pick an axis proxy each for the horizontal/vertical (Khan) or
  social-foundation/power-concentration (ESID) axes, choose a thresholding rule,
  and read the confusion matrix, per-axis accuracies and AUCs.
- **Global preview** — apply the current proxy to all 182 countries at a benchmark
  year, rescaled onto the target's units, with residuals shown for the countries
  PolSett covers. Coverage caveat: PolSett's last coded period ends in 2018 for 40
  of its 44 countries, so 2019 has almost no labelled counterpart and 2024 has
  none at all.

## Does rotating the proxy space help? (`rotations.R`)

Two questions get conflated under "try a PCA", and they have different answers.
All figures below are leave-one-country-out, refitting the standardisation,
rotation, regressions and cutoffs inside each fold, over 38 complete-coverage
proxies and 453 country-periods.

**Does a rotation predict either axis better? No, and there is no hidden second
dimension.** PC1 holds 41% of the proxy-space variance and is the liberties
dimension — top loadings `v2x_civlib` 0.24, `v2x_polyarchy` 0.24, `v2x_libdem`
0.23, `v2xcs_ccsi` 0.23, `bdm_W` 0.23, against `v2xnp_pres` −0.22 and
`v2x_neopat` −0.19. It correlates 0.58 with social foundation size and −0.32 with
power concentration. PC2 through PC8 carry almost nothing about either: the best
AUC against `x_pcdummy` among them is 0.584 (PC2) against PC1's 0.650. So the
proxy set does not contain a second direction that tracks power concentration and
is being masked by the first — the second direction simply is not there.

**Does making the axes orthogonal help the quadrant? Yes, for the off-diagonal
cells, and at a cost.**

| Method | Accuracy | Balanced (mean recall) | SF axis | PC axis | cor(axes) | Broad–Conc recall | Narrow–Disp recall |
|---|---|---|---|---|---|---|---|
| Best single per axis | **0.503** | 0.455 | 0.764 | 0.656 | −0.81 | 0.188 | 0.179 |
| Residualised PC on SF | 0.477 | **0.468** | 0.764 | 0.620 | **0.00** | **0.412** | **0.443** |
| Principal components regression (10 PCs) | 0.468 | 0.431 | 0.722 | 0.645 | −0.63 | 0.212 | 0.236 |
| Ridge on all 38 proxies | 0.453 | 0.425 | 0.700 | 0.649 | −0.43 | 0.225 | 0.349 |
| CCA (12 PCs vs both axes) | 0.428 | 0.425 | 0.702 | 0.607 | −0.08 | 0.400 | 0.425 |
| PCA components as axes | 0.358 | 0.353 | 0.759 | 0.479 | −0.05 | 0.288 | 0.387 |

Reading:

- Every multi-variable method comes in **below** the two hand-picked indicators on
  headline accuracy. PCR at 0.468 and ridge at 0.453 against 0.503 confirms the
  span argument: these are restricted or shrunk linear estimators on the same
  features, so they cannot manufacture signal that a single well-chosen indicator
  is not already carrying.
- Using PC1 and PC2 directly as the two axes is the worst option (0.358). PC2's
  correlation with power concentration is 0.04 — it is noise for this purpose.
  Orthogonality without signal buys nothing.
- **Residualising the power proxy on the social-foundation proxy is the one thing
  that works**, and it is one line rather than a rotation. It drives the axis
  correlation to 0.00, more than doubles recall on both off-diagonal quadrants
  (0.19 → 0.41 and 0.18 → 0.44), and is the best method on balanced accuracy
  (0.468 vs 0.455). Headline accuracy falls 2.6 points because the two diagonal
  quadrants hold 59% of cases and lose more than the off-diagonal cells gain.
- CCA is the properly specified version of what a PCA is being asked to do here,
  and it decorrelates successfully (−0.08) with off-diagonal recall similar to
  residualisation, but it costs more accuracy (0.428). With 12 components against
  two targets it is fitting more than the data supports.
- Note that ridge attains the best power-concentration correlation of any method
  (r = 0.454 against 0.386 for the single proxy) and still produces a worse
  typology, because its two axes remain correlated at −0.43. Better per-axis
  prediction does not imply a better quadrant.

So the choice is not "rotate or not" but which error profile is wanted. For
maximum agreement with ESID's published typology, keep the two single indicators.
For a typology that can actually flag Broad–Concentrated and Narrow–Dispersed
cases rather than almost never predicting them, residualise. The **Axes:
Decorrelate** toggle in `typology-match.html` switches between the two.

## Caveats

- 44 countries is a small effective sample for leave-one-country-out, and PolSett's
  country set is not a random sample of the world, so these figures do not
  straightforwardly extrapolate to countries outside the Global South.
- Candidate coverage varies from 26% to 100% of the labelled panel — 35 of the 71
  candidates are complete, while the WDI structural variables (adult literacy at
  26%, the employment shares at 46%) are the thinnest. Compounds are
  evaluated on complete cases, so adding a low-coverage candidate can improve
  apparent fit while shrinking the sample. The `n` column in `evaluate.R` output
  and the coverage column in the tool are the guard against this.
- The stepwise search in `evaluate.R` selects on the same LOCO statistic it
  reports, so its compound figures are optimistically biased. They are useful as
  an indication of a ceiling, not as out-of-sample estimates.

## Second pass: concept-first indices for Khan's axes and unipolarity (Oct 2026)

`khan_build.R` → `khan_indices.R` → `khan_puzzles.R`; `export_khan_page.R` and
`export_khan_vars.R` write `khan_data.js` and `khan_vars.js` for the interactive
write-up `khan-axes.html` (open locally; needs network for d3). Logs in `khan_indices.log`,
`khan_puzzles.log`.

The first pass selected proxies by their fit to PolSett. This pass does not fit
anything to PolSett. Each concept is split into lenses — distinct channels through
which it should be observable — and each lens is an equal-weight mean of z-scored
components with signs fixed in advance. z-scores are anchored on the global
country-year panel 1960–2019. Agreement with PolSett is reported afterwards as a
result, and disagreements are treated as case material rather than error.

### Specification

| Index | Lens | Components |
|---|---|---|
| H: coalition vs excluded factions | electoral | seat and vote margin over the largest excluded party, presidential margin, electoral executive turnovers in the last 20 years (−) |
| | armed | territory outside state control, UCDP internal conflict, coup attempts in the last 10 years, non-state political violence (all −) |
| | social | size of the noteworthy opposition, active opposition groups (both −), pivotal group backs vs opposes the regime |
| V: leadership vs lower-level factions | party | centralised candidate selection, legislative party cohesion |
| | personal | personalist regime (Chisols), legitimation by the leader's person, head-of-state tenure |
| U: unipolar vs multipolar | formal | POLCON III, high-court independence, legislative investigation, divided party control (all −) |
| | executive | no body could remove the head of state, count of bodies that could, HOG seeks no approval, count of bodies whose approval is sought |
| | territorial | division-of-power index, elected regional power (both −), uniformity of rule across regions |
| E: elites vs organised non-elites | — | power by wealth, CSO participation, CSO consultation (all −) |

H and U take the minimum across lenses: excluded factions can hold power through
any one channel, and authority can be divided through any one channel. V takes the
mean. A clientelism lens for V was tried and dropped, because clientelism measures
how loyalty is bought rather than who holds bargaining power. It was also unrelated
to PolSett (r = 0.02).

Two corrections were made on face validity before any PolSett comparison. First,
QoG's UCDP "internationalised internal conflict" is coded by participant, so
Germany, the UK and the US scored as conflict states. Only type 3 (internal) is
kept, and V-Dem's `v2caviol` is added. Second, the ruling party's seat share was
replaced by the seat gap plus electoral turnover. Seat share placed Ghana and
Mexico as weak-dominant, because it measures how large the ruling party is rather
than whether the excluded can win.

### Coherence

Components agree with their own lens (r 0.6–0.9, except `v2clrgunev` at 0.37 and
divided party control at 0.51). Lenses within a concept do not agree, and the
pattern looks like substitution rather than noise:

- H: electoral dominance correlates −0.26 with weak social opposition, so
  hegemonic electoral regimes tend to have large opposition constituencies.
- U: formal unipolarity correlates −0.41 with executive unipolarity. Where there
  are no formal veto players, there is usually a body (military, ruling party)
  that could remove the head of state.

This is why H and U use weakest-channel aggregation. It also means a single
reflective scale is the wrong model for these concepts.

### Discriminant validity

Correlation with `v2x_polyarchy` (global): H −0.15, U −0.36, V −0.50, E −0.84.
So H is close to independent of democracy, which no first-pass power proxy managed.
E is essentially the democracy dimension and adds nothing distinct.

### Agreement with PolSett

| Ours | PolSett | r | between | within | ceiling |
|---|---|---|---|---|---|
| H | `x_horizontalpower` | 0.31 | 0.41 | 0.26 | 0.69 |
| V | `x_verticalpower` | 0.31 | 0.34 | 0.35 | 0.82 |
| V | `q8_hierarchy_lb` | 0.33 | 0.32 | 0.40 | — |
| U | q14/q15 policy concentration | 0.23 | 0.18 | 0.27 | — |
| U executive lens | domestic threat breadth (q18) | −0.29 | −0.48 | −0.11 | — |
| E | subordinate minus dominant-class threat | 0.08 | −0.10 | 0.21 | — |

For the Khan typology, our H × V (both cut at the global median) agrees with PolSett
on 40% of 413 periods. The modal-class baseline is 36% and kappa is 0.19. On the
individual axes the agreement is H 65% and V 58%. The off-diagonal types are the
weak part, as in the first pass.

The personal lens correlates more with PolSett's policy-concentration items (0.39)
than with its vertical items. The party lens tracks leader's-bloc-versus-
contingent-bloc and cohesion items. So the personal lens measures one leader's
dominance over the coalition (PolSett's vertical, Ferguson's unipolarity), while
Khan's vertical — whether a possibly collective leadership can discipline lower
factions — is closer to the party lens. Moving the personal lens into U is the
obvious next revision.

### Case-level puzzles

- **Vietnam** is weak-dominant throughout for us, against PolSett's strong-dominant
  for most periods. The difference comes entirely from the personal lens:
  collective leadership scores low. Whether Vietnam's provincial party apparatus
  constitutes strong lower-level factions is a substantive question that the
  literature on Vietnamese decentralisation would support.
- **Uganda under Museveni** shows the largest split between V lenses: party
  discipline −1.0 to −1.5, personal command +0.6 to +1.4. That is one leader
  dominating a weakly disciplined movement, which Khan's 2×2 has no single cell for.
- **Ethiopia under Meles** is strong-dominant in PolSett (H 3.7–4.1), but our H is
  bound by the armed lens (Ogaden, Oromo insurgencies). This raises the question of
  whether peripheral insurgency amounts to holding power against the centre. The
  armed lens currently has no notion of how central the challenge is.
- **Thailand** is vulnerable-authoritarian for us in almost every period, against
  PolSett's weak-dominant or competitive-clientelist. The personal-legitimation
  component may be coding the monarchy rather than the prime minister PolSett
  treats as leader, which is a case where palace, army and parties form separate
  poles.
- **Mozambique, Tanzania, South Africa, Malaysia** (2015–19) are weak-dominant: dominant
  parties with strong internal factions, close to the standard account. PolSett
  codes Tanzania as competitive clientelist.
- Of the periods PolSett codes as high horizontal power, 47% are bound by the
  armed lens. PolSett coders appear to discount armed challenges that our index
  counts in full.
