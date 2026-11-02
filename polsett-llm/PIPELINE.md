# PolSett LLM pipeline — process diagram

A multi-agent pipeline that simulates the ESID Political Settlements expert
survey. Research and coding are separated: research agents build cited
evidence dossiers; coder agents answer the survey from those dossiers only.
Every unit of work checkpoints to its own file, so any interruption resumes
by re-scanning the disk.

```mermaid
flowchart TB
    subgraph inputs["Inputs (one-time extraction)"]
        CB["ESID codebook PDF/txt"] --> QQ["questionnaire.txt<br/>27 questions, verbatim"]
        CB --> PR["periodization_rules.txt<br/>period types + break criteria"]
        DTA["psd_coder_level_v1.dta<br/>(136 human coders)"] --> SCH["item_schema_raw.json<br/>128 items, scales, labels"]
        DTA --> REF["esid/&lt;ISO3&gt;.json<br/>periods + human answers"]
    end

    subgraph s1a["Stage 1a — Periodization (1 research agent / country)"]
        P1["ESID country:<br/>keep 1946-2018 periods,<br/>research 2019-2026 extension"]
        P2["New country:<br/>full periodization<br/>1946-2026"]
    end
    PR --> s1a
    REF --> P1
    s1a --> PLAN["coding plan<br/>(codeable periods:<br/>Settled / Challenged / Transitional)"]

    subgraph s1b["Stage 1b — Dossiers (1 research agent / period, parallel)"]
        D["web search + fetch →<br/>900-1400 word cited dossier:<br/>power blocs, cooptation/repression,<br/>decision power, threats,<br/>economic orgs, policy"]
    end
    PLAN --> s1b
    s1b --> DOS["dossiers/p&lt;N&gt;.md + .json"]

    subgraph s2["Stage 2 — Coding (3 persona coders / period)"]
        direction TB
        C0["coder 0: historian"]
        C1["coder 1: political economist"]
        C2["coder 2: governance analyst"]
    end
    QQ --> s2
    SCH --> s2
    DOS --> s2
    s2 -->|"sequential within coder<br/>(sees own previous period);<br/>chains run in parallel"| CODE["coding/p&lt;N&gt;_c&lt;K&gt;.json<br/>128 values + confidence<br/>+ per-question rationale"]

    CODE --> AGG["Aggregate<br/>simple + confidence-weighted mean<br/>(mirrors ESID 2.1.3)"]
    AGG --> VAL["Validate (ESID countries)<br/>vs human coder distribution:<br/>r, MAE, min-max coverage,<br/>human inter-coder SD floor"]
    REF --> VAL
    AGG --> EXP["Export<br/>public/polsett/llm/&lt;ISO3&gt;.json"]
    VAL --> EXP
    EXP --> FE["Frontend: PolSett Explorer<br/>⚠ yellow LLM warning banner<br/>toggle: ESID experts / LLM / both"]
```

## Agent roles

| Agent | Count | Tools | Output |
|---|---|---|---|
| Periodizer | 1 per country | web search/fetch | period list with types + break rationales |
| Dossier researcher | 1 per period (~10–30/country) | web search/fetch, Write | cited Markdown dossier |
| Coder | 3 per period | Read (instrument + dossier), Write | 128 answers + confidence + rationales (schema-validated) |
| Aggregation / validation / export | 0 (plain Python) | — | period means, validation stats, frontend JSON |

## Design choices worth noting

- **Research/coding separation.** Coders cannot search the web; they must cite
  the shared dossier. This keeps the evidence base auditable and prevents a
  coder from rationalizing a prior with fresh searches.
- **Sequential chains, parallel coders.** Within a coder, periods are coded in
  chronological order with the previous period's answers as baseline
  (mirroring how a human expert fills the survey; scores change only when the
  dossier evidences change). Independence lives across the three personas.
- **Human-comparable validation.** For the 44 ESID countries the same
  pipeline runs on the human-coded periods, so LLM coders can be benchmarked
  against the *distribution* of human coders (is the LLM within the human
  min–max band? is its error inside human inter-coder disagreement?) rather
  than against a single "truth".
- **Checkpoint-everything.** One file per unit of work; job generators skip
  existing files. Interruptions (usage limits, laptop moves) cost only the
  in-flight units.
