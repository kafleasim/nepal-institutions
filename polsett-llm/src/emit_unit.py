"""Emit one coding unit's exact prompt for the in-session (subagent) backend.

The API pipeline builds the coder prompt in stage2_code.build_system/build_user.
This reproduces it verbatim so an in-session run produces prompt-identical
inputs to a run.py run, rather than an improvised paraphrase.

Usage:
  .venv/bin/python src/emit_unit.py <chain.json> <index>     # print prompt
  .venv/bin/python src/emit_unit.py <chain.json> --list      # list units
  .venv/bin/python src/emit_unit.py <chain.json> <index> --schema   # answer keys
  .venv/bin/python src/emit_unit.py <chain.json> <index> --user-only

The SYSTEM block (questionnaire + variable reference + coding rules) is
identical for every unit, so read it once and use --user-only thereafter.

The answer written to the unit's `out` path must be a JSON object shaped:
  {"period": {...}, "coder": <int>, "values": {<128 vars>},
   "rationales": {"q1": "...", ... 27 entries}, "model": "<label>"}
"""

import json
import sys

import stage2_code
from common import read_json
from schema_build import load_items


def unit_prompt(chain, idx):
    p = chain["periods"][idx]
    dossier = read_json(p["dossier"])["dossier"]
    prev = read_json(p["prev"]) if p.get("prev") else None
    return (stage2_code.build_system(),
            stage2_code.build_user(chain["country"], p, dossier,
                                   chain["persona"], prev))


def main():
    chain = read_json(sys.argv[1])
    if sys.argv[2] == "--list":
        for i, p in enumerate(chain["periods"]):
            print(f"{i}\tp{p['number']}\t{p['start']}-{p['end']}\t"
                  f"{p.get('leader','')}\t-> {p['out']}")
        return

    idx = int(sys.argv[2])
    p = chain["periods"][idx]

    if "--schema" in sys.argv:
        items = load_items()
        print(json.dumps({
            "out": p["out"],
            "record_keys": ["period", "coder", "values", "rationales", "model"],
            "period": {k: v for k, v in p.items()
                       if k not in ("dossier", "out", "prev")},
            "coder": chain["coder"],
            "values": {i["var"]: (f"{i['kind']} {i['min']}-{i['max']}"
                                  if i["kind"] != "text" else "text")
                       for i in items},
            "rationales": sorted({f"q{i['q']}" for i in items},
                                 key=lambda s: int(s[1:])),
        }, indent=1))
        return

    system, user = unit_prompt(chain, idx)
    print("=" * 70)
    print(f"UNIT {idx}: {chain['iso3']} p{p['number']} coder{chain['coder']}")
    print(f"WRITE ANSWER TO: {p['out']}")
    print(f"PREVIOUS PERIOD FILE: {p.get('prev') or '(none - first period)'}")
    print("=" * 70)
    if "--user-only" not in sys.argv:
        print("\n########## SYSTEM ##########\n")
        print(system)
    print("\n########## USER ##########\n")
    print(user)


if __name__ == "__main__":
    main()
