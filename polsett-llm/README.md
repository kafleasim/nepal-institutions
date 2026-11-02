# PolSett LLM survey pipeline

Extends the ESID Political Settlements dataset (Schulz & Kelsall 2020) by
having LLM "coders" answer the original expert survey for any country, per
political period, from research dossiers. Produces coder-level answers with
per-question rationales, period-level aggregates mirroring ESID's aggregation,
validation against the human coders (for the 44 ESID countries), and a
frontend export for the country-profile app.

## Layout

```
instrument/               survey instrument + metadata (derived from codebook)
  questionnaire.txt         Phase 2 questionnaire (codebook appendix, verbatim)
  periodization_rules.txt   Phase 1 periodization rules (codebook 2.1.2.1)
  item_schema_raw.json      128 items from psd_coder_level_v1.dta Stata labels
  coding_reference.txt      variable name -> question item mapping for coders
esid/                     reference data dumped from the ESID .dta files
  countries.json            name -> iso3 (44 countries)
  <ISO3>.json               periods + human coder-level answers
output/<ISO3>/            per-country run artifacts (checkpointed)
  periods.json              ESID periods + LLM periodization/extension
  dossiers/p<N>.json        per-period research dossier + sources
  coding/p<N>_c<K>.json     per-period per-coder answers + rationales
  aggregated.json           period-level simple/confidence-weighted means
  validation.json           comparison vs human coders (ESID countries)
src/                      pipeline code
```

## Design

1. **Periodization** (stage 1a): ESID countries keep ESID's periods 1946-2018
   as given (required for validation comparability); the LLM produces a
   researched extension through 2026. Non-ESID countries get a full LLM
   periodization. Only Settled/Challenged/Transitional periods are coded
   (codebook 2.1.2.2).
2. **Dossiers** (stage 1b): one research agent per codeable period compiles an
   evidence dossier structured around the survey's six sections, with web
   sources. Coders do no research of their own — the dossier is the shared,
   auditable evidence base.
3. **Coding** (stage 2): three simulated coders with different personas answer
   all 128 items per period (values + per-question confidence + rationale),
   sequentially in chronological order within a coder (each sees its own
   previous-period answers, like a human expert filling the survey).
4. **Aggregation**: simple mean and ESID-style confidence-weighted mean across
   coders per item-period.
5. **Validation** (ESID countries): per item, across shared periods — Pearson
   r vs the human mean, MAE (scale-normalized), coverage within the human
   coder min-max, benchmarked against human inter-coder SD.
6. **Export**: `apps/country-profile/public/polsett/llm/<ISO3>.json` — the app
   shows LLM series in the PolSett Explorer behind a "Source: ESID experts /
   LLM survey / Both" toggle with a yellow warning banner.

## Execution backends

**A. Standalone API pipeline** (reproducible; needs `ANTHROPIC_API_KEY` in the
environment or in `polsett-llm/.env`):

```sh
.venv/bin/python src/run.py "Pakistan" --plan     # dry run
.venv/bin/python src/run.py "Pakistan"            # full run, checkpointed
.venv/bin/python src/run.py "Bolivia" --iso3 BOL  # non-ESID country
```

**B. In-session via Claude Code subagents** (no API key; used for the pilot):
workflows write the same checkpoint files, then:

```sh
.venv/bin/python src/ingest_periods.py <workflow results.json>
.venv/bin/python src/make_jobs.py dossiers   # job list for dossier workflow
.venv/bin/python src/make_jobs.py coding     # coder chains for coding workflow
.venv/bin/python src/check_outputs.py dossiers|coding
.venv/bin/python src/finalize.py PAK "Pakistan" "<model label>"
```

## Caveats

- LLM-generated values are experimental estimates, not expert data; the
  frontend labels them accordingly.
- The PolSett dataset is public since 2020 and plausibly in training data, so
  validation on ESID countries may overstate accuracy for new countries.
- ESID's core aggregation adds a distance-based weight that needs full-sample
  normalization; exports use the simple mean (the methods correlate ~0.99 in
  ESID's data).
- The three coders share one dossier per period, so their errors are not
  independent in the way three human experts' are.
