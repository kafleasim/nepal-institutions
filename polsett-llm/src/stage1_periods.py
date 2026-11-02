"""Stage 1a: periodization.

For ESID countries: take ESID's periods (1946-2018) as given and have the
model produce a researched extension from the start of the final ESID period
through --end-year. For new countries: full LLM periodization since 1946 or
independence."""

from common import (ESID, INSTRUMENT, is_codeable_type, read_json, write_json,
                    extract_fenced_json, out_dir, research_call)

SYSTEM = (
    "You are a comparative-politics researcher applying the ESID Political "
    "Settlements (PolSett) periodization methodology (Schulz & Kelsall 2020). "
    "You divide a country's political history into periods separated by major "
    "de facto changes in the configuration of power, following the rules "
    "provided. You research carefully, prefer authoritative sources, and are "
    "precise about dates and de facto (not merely de jure) leadership."
)

PERIOD_JSON_SPEC = """
Output ONLY a fenced ```json code block containing an array of period objects,
ordered chronologically, covering the requested year range completely with no
gaps. Each object:
{
  "start": <int year>,
  "end": <int year>,
  "leader": "<de facto leader name (surname as commonly used)>",
  "type": "<Settled | Challenged | Semi-Settled | Unsettled | Transitional>",
  "break_rationale": "<1-2 sentences: why a new period starts here>",
  "summary": "<1-2 sentences describing the period>"
}
Rules refresher: leadership change is the default break point; add breaks for
major de facto changes in governing-coalition composition/power, formal
political institutions, violent contestation, leadership ideology, or foreign
control. If multiple leaders rule in one calendar year, assign the year to the
one who ruled longest in it. Apply the Settled/Challenged/Semi-Settled/
Unsettled/Transitional definitions exactly as given.
"""


def rules_text():
    return (INSTRUMENT / "periodization_rules.txt").read_text()


async def run(client, model, country, iso3, in_esid, end_year, force=False):
    path = out_dir(iso3) / "periods.json"
    if path.exists() and not force:
        return read_json(path)

    esid_periods = []
    if in_esid:
        esid_periods = read_json(ESID / f"{iso3}.json")["periods"]

    if in_esid:
        last = esid_periods[-1]
        recent = esid_periods[-5:]
        recent_txt = "\n".join(
            f"  #{p['number']} {p['start']}-{p['end']} {p['leader']} [{p['type']}]"
            for p in recent
        )
        prompt = f"""{rules_text()}

TASK: The ESID PolSett dataset periodizes {country} through 2018. Its most
recent periods are:
{recent_txt}

The final period (#{last['number']}, starting {last['start']}, leader
{last['leader']}) was provisional when the dataset was published. Research
{country}'s political history from {last['start']} through mid-{end_year} and
produce a corrected periodization for the years {last['start']}-{end_year}
(inclusive), applying the periodization rules above. The first period you
output should begin in {last['start']}.

{PERIOD_JSON_SPEC}"""
    else:
        prompt = f"""{rules_text()}

TASK: {country} is not covered by the ESID PolSett dataset. Research
{country}'s political history and produce a complete periodization from 1946
(or independence, whichever is later) through mid-{end_year}, applying the
periodization rules above.

{PERIOD_JSON_SPEC}"""

    text, _, sources = await research_call(
        client, model, SYSTEM, prompt, max_tokens=8000, max_search_uses=12)
    new_periods = extract_fenced_json(text)
    assert isinstance(new_periods, list) and new_periods, "no periods returned"

    # number LLM periods from 101 upward to avoid clashing with ESID numbers
    base = 100 if in_esid else 0
    for i, p in enumerate(new_periods):
        p["number"] = base + i + 1
        p["source"] = "llm"
        p["codeable"] = is_codeable_type(p.get("type", ""))

    result = {
        "country": country, "iso3": iso3, "end_year": end_year,
        "esid_periods": esid_periods, "llm_periods": new_periods,
        "sources": sources,
    }
    write_json(path, result)
    return result


def coding_plan(periods_doc, esid_country_data=None):
    """Which (period, dossier) units get coded in stage 2.

    ESID countries: every ESID period with at least one human answer (for
    validation comparability) + LLM extension periods of codeable type.
    New countries: all codeable LLM periods.
    """
    plan = []
    if periods_doc["esid_periods"]:
        answered = set()
        if esid_country_data:
            for pnum, coders in esid_country_data["human_coders"].items():
                if any(len(v) > 3 for v in coders.values()):
                    answered.add(int(pnum))
        for p in periods_doc["esid_periods"]:
            if p["number"] in answered:
                plan.append({**p, "source": "esid"})
        for p in periods_doc["llm_periods"]:
            if p["codeable"]:
                plan.append(p)
    else:
        for p in periods_doc["llm_periods"]:
            if p["codeable"]:
                plan.append(p)
    return plan
