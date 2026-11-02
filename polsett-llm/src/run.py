"""Run the PolSett LLM survey pipeline for one country.

Usage:
  .venv/bin/python src/run.py "Pakistan" --end-year 2026
  .venv/bin/python src/run.py "Bolivia" --iso3 BOL
  .venv/bin/python src/run.py "Cambodia" --plan          # dry run, no API calls
  .venv/bin/python src/run.py "Pakistan" --stages validate,export

Stages: periods, dossiers, code, aggregate, validate, export (default: all).
Every stage checkpoints to output/<ISO3>/ and skips existing work unless
--force. Validation runs only for countries present in the ESID dataset.
"""

import argparse
import asyncio

import aggregate
import export_frontend
import stage1_dossier
import stage1_periods
import stage2_code
import validate
from common import (DEFAULT_CODERS, DEFAULT_END_YEAR, DEFAULT_MODEL, ESID,
                    get_client, read_json, resolve_country)

ALL_STAGES = ["periods", "dossiers", "code", "aggregate", "validate", "export"]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("country")
    ap.add_argument("--iso3", help="required for countries not in ESID")
    ap.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--coders", type=int, default=DEFAULT_CODERS)
    ap.add_argument("--stages", default="all")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--plan", action="store_true",
                    help="print the coding plan and exit (requires periods "
                    "stage output or ESID membership; no API calls for ESID "
                    "countries)")
    args = ap.parse_args()

    stages = ALL_STAGES if args.stages == "all" else args.stages.split(",")
    country, iso3, in_esid = resolve_country(args.country, args.iso3)
    esid_data = read_json(ESID / f"{iso3}.json") if in_esid else None
    print(f"=== {country} ({iso3}) | in ESID: {in_esid} | model: {args.model} "
          f"| coders: {args.coders} | end year: {args.end_year}")

    if args.plan and in_esid:
        doc = {"esid_periods": esid_data["periods"], "llm_periods": []}
        plan = stage1_periods.coding_plan(doc, esid_data)
        for p in plan:
            print(f"  p{p['number']:>3} {p['start']}-{p['end']} "
                  f"{p.get('leader',''):28s} [{p.get('type','')}] "
                  f"({p['source']})")
        print(f"  = {len(plan)} ESID periods to code "
              f"(+ LLM extension {2019}-{args.end_year} at run time)")
        return

    client = get_client()

    periods_doc = await stage1_periods.run(
        client, args.model, country, iso3, in_esid, args.end_year,
        force=args.force and "periods" in stages)
    plan = stage1_periods.coding_plan(periods_doc, esid_data)
    print(f"--- coding plan: {len(plan)} periods "
          f"({sum(1 for p in plan if p['source'] == 'esid')} ESID, "
          f"{sum(1 for p in plan if p['source'] == 'llm')} LLM)")
    if args.plan:
        for p in plan:
            print(f"  p{p['number']:>3} {p['start']}-{p['end']} "
                  f"{p.get('leader',''):28s} [{p.get('type','')}] "
                  f"({p['source']})")
        return

    if "dossiers" in stages:
        print("--- stage 1b: dossiers")
        dossiers = await stage1_dossier.run(
            client, args.model, country, iso3, plan, force=args.force)
    else:
        dossiers = await stage1_dossier.run(
            client, args.model, country, iso3, plan, force=False)

    if "code" in stages:
        print("--- stage 2: coding")
        await stage2_code.run(client, args.model, country, iso3, plan,
                              dossiers, n_coders=args.coders,
                              force=args.force)

    if "aggregate" in stages:
        print("--- aggregation")
        aggregate.run(iso3, plan, n_coders=args.coders)

    if "validate" in stages and in_esid:
        print("--- validation vs ESID human coders")
        validate.run(iso3, n_coders=args.coders)

    if "export" in stages:
        print("--- frontend export")
        export_frontend.run(iso3, country, args.model, args.coders)

    print("=== done:", country)


if __name__ == "__main__":
    asyncio.run(main())
