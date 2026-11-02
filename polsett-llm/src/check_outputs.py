"""Check dossier and coding outputs produced by the in-session workflows.

Usage:
  .venv/bin/python src/check_outputs.py dossiers
  .venv/bin/python src/check_outputs.py coding

Prints a summary and lists failures (missing/invalid files). Exit code 1 if
any failures.
"""

import json
import sys

import stage1_periods
from common import ESID, out_dir, read_json
from schema_build import load_items, validate_answer

COUNTRIES = [("PAK", "Pakistan"), ("KHM", "Cambodia"),
             ("ECU", "Ecuador"), ("BOL", "Bolivia")]
N_CODERS = 3


def plan_for(iso3):
    periods_doc = read_json(out_dir(iso3) / "periods.json")
    esid_path = ESID / f"{iso3}.json"
    esid_data = read_json(esid_path) if esid_path.exists() else None
    return stage1_periods.coding_plan(periods_doc, esid_data)


def check_dossiers():
    fails = []
    total = 0
    for iso3, _ in COUNTRIES:
        for p in plan_for(iso3):
            total += 1
            path = out_dir(iso3) / "dossiers" / f"p{p['number']}.json"
            if not path.exists():
                fails.append(f"{iso3} p{p['number']}: missing")
                continue
            try:
                doc = read_json(path)
                words = len(doc.get("dossier", "").split())
                if words < 300:
                    fails.append(f"{iso3} p{p['number']}: only {words} words")
            except (json.JSONDecodeError, KeyError) as e:
                fails.append(f"{iso3} p{p['number']}: unreadable ({e})")
    return total, fails


def check_coding():
    items = load_items()
    fails = []
    total = 0
    for iso3, _ in COUNTRIES:
        for p in plan_for(iso3):
            for k in range(N_CODERS):
                total += 1
                path = out_dir(iso3) / "coding" / f"p{p['number']}_c{k}.json"
                if not path.exists():
                    fails.append(f"{iso3} p{p['number']} c{k}: missing")
                    continue
                try:
                    rec = read_json(path)
                    problems = validate_answer(items, rec["values"] | {
                        "rationales": rec.get("rationales")})
                    # tolerate nulls; flag only structural problems
                    hard = [x for x in problems if "missing" in x
                            or "should be" in x]
                    if hard:
                        fails.append(
                            f"{iso3} p{p['number']} c{k}: {hard[:3]}")
                except (json.JSONDecodeError, KeyError, TypeError) as e:
                    fails.append(f"{iso3} p{p['number']} c{k}: unreadable ({e})")
    return total, fails


if __name__ == "__main__":
    total, fails = (check_dossiers() if sys.argv[1] == "dossiers"
                    else check_coding())
    print(f"{total - len(fails)}/{total} ok")
    for f in fails:
        print("FAIL:", f)
    sys.exit(1 if fails else 0)
