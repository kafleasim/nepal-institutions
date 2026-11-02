"""Build the stage-2 structured-output schema and item documentation
from the Stata-derived item metadata (instrument/item_schema_raw.json)."""

import re
from common import INSTRUMENT, read_json

# Items whose observed max in the data understates the questionnaire scale
# would be a problem; ranges below come straight from observed data and the
# questionnaire text is authoritative in the prompt. We use observed ranges
# only for validation bounds on clearly bounded ordinals.
PCT_ITEMS_RE = re.compile(r"^q(1_populationshare|7_powerlesspercentage)")


def load_items():
    raw = read_json(INSTRUMENT / "item_schema_raw.json")
    items = []
    for x in raw:
        qnum = int(re.match(r"q(\d+)_", x["var"]).group(1))
        kind = (
            "text" if x["type"] == "character"
            else "percent" if PCT_ITEMS_RE.match(x["var"])
            else "ordinal"
        )
        items.append({
            "var": x["var"], "q": qnum, "label": x["label"], "kind": kind,
            "min": x["min"] if kind != "text" else None,
            "max": x["max"] if kind != "text" else None,
        })
    return items


def questions(items):
    qs = sorted({i["q"] for i in items})
    return {q: [i for i in items if i["q"] == q] for q in qs}


def output_schema(items):
    """JSON schema the coder model must satisfy."""
    props = {}
    required = []
    for it in items:
        v = it["var"]
        required.append(v)
        if it["kind"] == "text":
            props[v] = {
                "type": ["string", "null"],
                "description": f"{it['label']}. Comma-separated list, or null.",
            }
        elif it["kind"] == "percent":
            props[v] = {
                "type": ["number", "null"],
                "description": f"{it['label']} (0-100, percent).",
            }
        else:
            lo, hi = int(it["min"]), int(it["max"])
            props[v] = {
                "type": ["integer", "null"],
                "enum": list(range(lo, hi + 1)) + [None],
                "description": f"{it['label']} ({lo}-{hi}).",
            }
    qnums = sorted({i["q"] for i in items})
    props["rationales"] = {
        "type": "object",
        "description": "Per-question justification, 1-3 sentences each, "
                       "citing specific evidence from the dossier.",
        "properties": {
            f"q{q}": {"type": "string"} for q in qnums
        },
        "required": [f"q{q}" for q in qnums],
        "additionalProperties": False,
    }
    required.append("rationales")
    return {
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": False,
    }


def item_reference_text(items):
    """Compact variable reference included in the system prompt so answers
    map to the exact dataset variable names."""
    lines = ["VARIABLE REFERENCE (answer key -> question item):"]
    for q, its in questions(items).items():
        lines.append(f"\nQuestion {q}:")
        for it in its:
            if it["kind"] == "text":
                scale = "free text (comma-separated list)"
            elif it["kind"] == "percent":
                scale = "0-100 percent"
            else:
                scale = f"integer {int(it['min'])}-{int(it['max'])}"
            lines.append(f"  {it['var']}: {it['label']} [{scale}]")
    return "\n".join(lines)


def validate_answer(items, ans: dict):
    """Return list of problems (empty if valid). Nulls are allowed."""
    problems = []
    by_var = {i["var"]: i for i in items}
    for var, it in by_var.items():
        if var not in ans:
            problems.append(f"missing {var}")
            continue
        v = ans[var]
        if v is None:
            continue
        if it["kind"] == "text":
            if not isinstance(v, str):
                problems.append(f"{var} should be string or null")
        elif it["kind"] == "percent":
            if not isinstance(v, (int, float)) or not (0 <= v <= 100):
                problems.append(f"{var} should be 0-100")
        else:
            lo, hi = int(it["min"]), int(it["max"])
            if not isinstance(v, int) or not (lo <= v <= hi):
                problems.append(f"{var} should be integer {lo}-{hi}")
    if "rationales" not in ans or not isinstance(ans.get("rationales"), dict):
        problems.append("missing rationales object")
    return problems
