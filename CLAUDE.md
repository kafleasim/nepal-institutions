# nepal-institutions

Private working copy of `taimur38/institutional-complexity` (Taimur, Growth Lab), owned by Asim (kafleasim).
Purpose: adapt the country-profile site (live original: https://institutions.taimur.sh/country/NPL) for the
Nepal engagement — first task: **characterize Nepal's governments after 2008** (details to come from Asim).

## Remotes
- `origin` → https://github.com/kafleasim/nepal-institutions (private). Push here.
- `upstream` → taimur38/institutional-complexity (fetch only; push is DISABLED). To pull Taimur's updates:
  `git fetch upstream && git merge upstream/master` — review conflicts with Asim before merging.

## Layout (see README.md for full detail)
- `apps/country-profile/` — Vite + React + TS + Tailwind site. Country page: `src/pages/CountryProfilePage.tsx`
  (sections by id, e.g. `#vdem` at the `<section id="vdem">`). Data is static, pre-built into `public/`
  (`public/vdem/NPL.json`, `public/regimes/`, `public/polsett/`, parquet files) by the R/Python scripts below.
- `polsett-llm/` — ESID Political Settlements survey pipeline (periodize → research dossiers → LLM coders →
  aggregate → `export_frontend.py`). **Nepal (NPL) is not yet coded** — likely vehicle for the post-2008 work.
- `analyses/` — R Markdown analyses (institutional complexity, outcomes ML, polsett proxies, regimes export).
- `case-studies/cambodia/` — worked example of a country case study to mirror for Nepal.
- `data/shared-data/` is referenced by the analyses but NOT in the repo (Growth Lab shared data) — ask Asim for access.

## Running the site locally
```bash
cd apps/country-profile
npm ci          # first time only
npm run dev     # http://localhost:5173/country/NPL
```

## Conventions
- Follow the Growth Lab design kit for any new charts/sections (`apps/country-profile/src/lib/glTokens.ts`
  already carries GL tokens; source of truth is `~/dev/gl-design/grammar.md`).
- Nepal content must cite sources (year + publisher); keep Nepal-specific additions clearly separated from
  upstream code so future upstream merges stay easy (prefer new files/components over editing shared ones).
- Nepal periods: 2008 Constituent Assembly / end of monarchy, 2015 constitution, 2017 elections (federal,
  7 provinces), 2022 elections; frequent coalition changes — PM-level periodization will matter.
