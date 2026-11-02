"""Stage 2: simulated expert coders answer the survey per period.

Each coder answers the full 128-item battery for every period in the coding
plan, sequentially in chronological order (seeing its own previous-period
answers, as a human expert filling the survey would). Coders differ by
persona; they work only from the dossier plus general knowledge, and must
justify every question with evidence from the dossier."""

import asyncio
import json

from common import INSTRUMENT, out_dir, read_json, write_json
from schema_build import (item_reference_text, load_items, output_schema,
                          validate_answer)

PERSONAS = [
    "You are a historian who has spent your career studying this country's "
    "political history, with deep knowledge of its leaders, parties, and "
    "social forces.",
    "You are a comparative political economist who studies developing "
    "countries' governing coalitions, rents, and state-business relations, "
    "and who knows this country well from cross-national fieldwork.",
    "You are a governance and conflict analyst with long policy experience "
    "in this country, focused on elites, security actors, and the practical "
    "workings of power.",
]

CODING_RULES = """
CODING RULES:
- Answer for the PERIOD AS A WHOLE (its average or typical state), from the
  perspective of what the leadership could plausibly perceive at the time.
- Use ONLY the dossier provided plus your general knowledge of the country.
  Do not invent specifics. If the dossier and your knowledge genuinely do not
  support an answer, use null rather than guessing.
- The three q1 population shares (LB, CLB, OB) should sum to approximately
  100.
- The q*_confidence item of each question records YOUR confidence in your
  answers to that question: 1 = very unconfident ... 4 = very confident
  (question 1 uses a 1-3 confidence scale).
- Free-text items (q5/q6 group lists): short comma-separated names of
  groups/organizations, most powerful first.
- For every question, write a rationale of 1-3 sentences in the rationales
  object citing specific evidence (events, actors, dates) from the dossier.
- Answer every item using the exact variable names from the VARIABLE
  REFERENCE. The scale anchors are defined in the questionnaire text; apply
  them literally.
"""


def build_system() -> str:
    questionnaire = (INSTRUMENT / "questionnaire.txt").read_text()
    items = load_items()
    return (
        "You are an expert country coder completing the ESID Political "
        "Settlements (PolSett) survey (Schulz & Kelsall 2020) for a specific "
        "political period of a specific country. The full survey instrument, "
        "as sent to human country experts, follows.\n\n"
        "=== SURVEY INSTRUMENT ===\n" + questionnaire +
        "\n\n=== END OF INSTRUMENT ===\n\n" + item_reference_text(items) +
        "\n\n" + CODING_RULES
    )


def build_user(country, period, dossier_text, persona, prev_answers):
    prev = ""
    if prev_answers:
        compact = {k: v for k, v in prev_answers["values"].items()
                   if v is not None}
        prev = (
            f"\nYou previously coded the immediately preceding period "
            f"({prev_answers['period']['start']}-{prev_answers['period']['end']}, "
            f"{prev_answers['period'].get('leader','')}). Your answers were:\n"
            f"{json.dumps(compact)}\n"
            "Change scores only where the dossier evidences real change "
            "between the periods; unchanged circumstances should get "
            "unchanged scores.\n"
        )
    return f"""{persona}

Code the following period of {country}'s political history.

PERIOD: {period['start']}-{period['end']}
DE FACTO LEADER: {period.get('leader', 'unknown')}
PERIOD TYPE: {period.get('type', 'unknown')}

=== EVIDENCE DOSSIER ===
{dossier_text}
=== END OF DOSSIER ===
{prev}
Answer all survey items now."""


async def code_one(client, model, system, schema, items, country, period,
                   dossier_text, persona, prev_answers):
    user = build_user(country, period, dossier_text, persona, prev_answers)
    messages = [{"role": "user", "content": user}]
    last_problems = None
    for attempt in range(2):
        resp = await client.messages.create(
            model=model,
            max_tokens=12000,
            system=[{"type": "text", "text": system,
                     "cache_control": {"type": "ephemeral"}}],
            output_config={"format": {"type": "json_schema", "schema": schema}},
            messages=messages,
        )
        text = next(b.text for b in resp.content if b.type == "text")
        ans = json.loads(text)
        problems = validate_answer(items, ans)
        if not problems:
            return ans, resp.usage
        last_problems = problems
        messages = messages + [
            {"role": "assistant", "content": text},
            {"role": "user", "content":
                "Some answers were invalid: " + "; ".join(problems[:20]) +
                ". Re-emit the complete corrected JSON."},
        ]
    raise ValueError(f"coding failed validation twice: {last_problems[:5]}")


async def run(client, model, country, iso3, plan, dossiers, n_coders=3,
              force=False):
    system = build_system()
    items = load_items()
    schema = output_schema(items)
    coding_dir = out_dir(iso3) / "coding"
    coding_dir.mkdir(exist_ok=True)

    async def coder_task(k):
        persona = PERSONAS[k % len(PERSONAS)]
        prev = None
        for period in plan:
            path = coding_dir / f"p{period['number']}_c{k}.json"
            if path.exists() and not force:
                prev = read_json(path)
                continue
            dossier_text = dossiers[period["number"]]["dossier"]
            ans, usage = await code_one(
                client, model, system, schema, items, country, period,
                dossier_text, persona, prev)
            rec = {
                "period": {kk: vv for kk, vv in period.items()
                           if not kk.startswith("_")},
                "coder": k,
                "values": {i["var"]: ans.get(i["var"]) for i in items},
                "rationales": ans.get("rationales", {}),
                "model": model,
                "usage": {"in": usage.input_tokens, "out": usage.output_tokens,
                          "cache_read": usage.cache_read_input_tokens,
                          "cache_write": usage.cache_creation_input_tokens},
            }
            write_json(path, rec)
            prev = rec
            print(f"  coded {iso3} p{period['number']} coder{k}", flush=True)

    await asyncio.gather(*(coder_task(k) for k in range(n_coders)))
