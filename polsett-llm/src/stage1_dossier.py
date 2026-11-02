"""Stage 1b: per-period research dossiers.

One research call per codeable period. The dossier is the evidence base the
stage-2 coders work from; coders do no research of their own."""

import asyncio

from common import out_dir, read_json, write_json, research_call

SYSTEM = (
    "You are a political historian compiling an evidence dossier on a "
    "specific period of a country's political history, for later use by "
    "coders answering the ESID Political Settlements expert survey. You "
    "combine your own knowledge with targeted web research (essential for "
    "events after 2018 or under-documented periods; use fewer searches when "
    "your knowledge of the period is solid). You report facts with dates and "
    "attribute claims to sources. You are balanced and note uncertainty or "
    "scholarly disagreement where it exists."
)

DOSSIER_OUTLINE = """
Write a dossier of roughly 900-1400 words covering, in order:

1. CONFIGURATION OF POWER: the de facto leader and ruling group; which
   segments of the population formed (a) the leader's bloc (loyal even under
   moderate stress), (b) the contingently loyal bloc (aligned but could
   defect), and (c) the opposition bloc (incl. apolitical population).
   Rough population shares of each; the most powerful political groups/
   organizations inside each bloc; powerful groups perceived as beyond the
   leader's influence; internal hierarchy and cohesion of each bloc; how
   powerful lower-level followers were relative to elites.
2. BLOCS' RELATIONSHIP TO THE SETTLEMENT: for each bloc, how the leadership
   secured acquiescence — material cooptation (clientelistic vs programmatic,
   elites vs followers), repression (elites vs followers), ideological/
   identity appeals; each bloc's satisfaction with the distribution of
   benefits; likelihood the CLB would split from the leader; likelihood the
   OB would join the government.
3. DECISION-MAKING AND IMPLEMENTING POWER: how concentrated de facto
   decision-making power was in the leadership; how concentrated the power
   to implement decisions was (bureaucracy, subnational actors, veto
   players).
4. FOREIGN INFLUENCE AND THREATS: importance of foreign military and
   financial/technical support to the settlement's survival; political and
   physical/violent threats to the leadership from rural/urban, subordinate/
   dominant, ethno-regional/religious groups, exiled opposition, military,
   neighboring and non-neighboring countries.
5. ECONOMIC ORGANIZATIONS: average political power of domestic big business,
   SMEs, foreign investors, state-owned enterprises, organized labor,
   informal/agricultural producers.
6. ECONOMIC AND SOCIAL POLICY: industrialization strategy (ISI vs
   export-oriented), treatment of FDI, state intervention in markets, welfare/
   redistribution priorities, whether economic and social development were
   genuine leadership priorities beyond rhetoric.

End with a SOURCES list (title + publication/site). Cite within the text
using [n] markers tied to that list. Note explicitly any topic where evidence
is thin for this period.
"""


async def one_dossier(client, model, country, period, prior_summaries, force):
    iso3 = period["_iso3"]
    path = out_dir(iso3) / "dossiers" / f"p{period['number']}.json"
    if path.exists() and not force:
        return read_json(path)
    context = ""
    if prior_summaries:
        context = ("\nFor context, the periods immediately before this one:\n"
                   + "\n".join(f"  {s}" for s in prior_summaries[-3:]))
    prompt = f"""Compile the evidence dossier for:

COUNTRY: {country}
PERIOD: {period['start']}-{period['end']}
DE FACTO LEADER: {period.get('leader', 'unknown')}
PERIOD TYPE (ESID classification): {period.get('type', 'unknown')}
{context}

{DOSSIER_OUTLINE}"""
    text, _, sources = await research_call(
        client, model, SYSTEM, prompt, max_tokens=8000, max_search_uses=8)
    doc = {
        "period": {k: v for k, v in period.items() if not k.startswith("_")},
        "dossier": text,
        "web_sources": sources,
        "model": model,
    }
    write_json(path, doc)
    return doc


async def run(client, model, country, iso3, plan, force=False, concurrency=4):
    sem = asyncio.Semaphore(concurrency)
    results = {}

    async def worker(period, priors):
        async with sem:
            doc = await one_dossier(client, model, country, period, priors, force)
            results[period["number"]] = doc
            print(f"  dossier {iso3} p{period['number']} "
                  f"({period['start']}-{period['end']}) done", flush=True)

    tasks = []
    for i, p in enumerate(plan):
        p = {**p, "_iso3": iso3}
        priors = [
            f"{q['start']}-{q['end']} {q.get('leader','')} [{q.get('type','')}]"
            for q in plan[max(0, i - 3):i]
        ]
        tasks.append(worker(p, priors))
    await asyncio.gather(*tasks)
    return results
