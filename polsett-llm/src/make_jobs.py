"""Emit job files for the in-session workflows.

Usage:
  .venv/bin/python src/make_jobs.py dossiers   # output/jobs/dossiers_<ISO>.json
  .venv/bin/python src/make_jobs.py coding     # output/jobs/chain_<ISO>_c<K>.json

Skips work whose output file already exists (checkpoint semantics identical
to the API pipeline). Job files are read by loader agents inside the
workflows.
"""

import json
import sys

from common import OUTPUT

import stage1_periods
from common import ESID, out_dir, read_json
from stage2_code import PERSONAS

COUNTRIES = [("PAK", "Pakistan"), ("KHM", "Cambodia"),
             ("ECU", "Ecuador"), ("BOL", "Bolivia")]
N_CODERS = 3


def plan_for(iso3):
    periods_doc = read_json(out_dir(iso3) / "periods.json")
    esid_path = ESID / f"{iso3}.json"
    esid_data = read_json(esid_path) if esid_path.exists() else None
    return stage1_periods.coding_plan(periods_doc, esid_data)


def dossier_jobs():
    jobs = []
    for iso3, country in COUNTRIES:
        plan = plan_for(iso3)
        ddir = out_dir(iso3) / "dossiers"
        ddir.mkdir(exist_ok=True)
        for i, p in enumerate(plan):
            out = ddir / f"p{p['number']}.json"
            if out.exists():
                continue
            priors = [
                f"{q['start']}-{q['end']} {q.get('leader', '')} [{q.get('type', '')}]"
                for q in plan[max(0, i - 3):i]
            ]
            jobs.append({
                "iso3": iso3, "country": country,
                "number": p["number"], "start": p["start"], "end": p["end"],
                "leader": p.get("leader") or "unknown",
                "type": p.get("type") or "unknown",
                "priors": priors, "out": str(out),
            })
    return jobs


def coding_chains():
    chains = []
    for iso3, country in COUNTRIES:
        plan = plan_for(iso3)
        cdir = out_dir(iso3) / "coding"
        cdir.mkdir(exist_ok=True)
        ddir = out_dir(iso3) / "dossiers"
        for k in range(N_CODERS):
            pending = []
            prev_path = None
            for p in plan:
                out = cdir / f"p{p['number']}_c{k}.json"
                if out.exists():
                    prev_path = str(out)
                    continue
                pending.append({
                    "number": p["number"], "start": p["start"],
                    "end": p["end"],
                    "leader": p.get("leader") or "unknown",
                    "type": p.get("type") or "unknown",
                    "source": p.get("source", "llm"),
                    "dossier": str(ddir / f"p{p['number']}.json"),
                    "out": str(out),
                    "prev": prev_path,
                })
                # the next period's "previous answers" file is this one; it
                # will exist by the time the sequential chain reaches it
                prev_path = str(out)
            if pending:
                chains.append({
                    "iso3": iso3, "country": country, "coder": k,
                    "persona": PERSONAS[k % len(PERSONAS)],
                    "periods": pending,
                })
    return chains


if __name__ == "__main__":
    kind = sys.argv[1]
    jdir = OUTPUT / "jobs"
    jdir.mkdir(parents=True, exist_ok=True)
    if kind == "dossiers":
        jobs = dossier_jobs()
        files = []
        for iso3, _ in COUNTRIES:
            cjobs = [j for j in jobs if j["iso3"] == iso3]
            if not cjobs:
                continue
            path = jdir / f"dossiers_{iso3}.json"
            path.write_text(json.dumps(cjobs, indent=1))
            files.append(str(path))
            print(f"{iso3}: {len(cjobs)} dossier jobs -> {path}")
        print(json.dumps(files))
    else:
        chains = coding_chains()
        files = []
        for ch in chains:
            path = jdir / f"chain_{ch['iso3']}_c{ch['coder']}.json"
            path.write_text(json.dumps(ch, indent=1))
            files.append(str(path))
            print(f"{ch['iso3']} coder{ch['coder']}: "
                  f"{len(ch['periods'])} periods -> {path}")
        print(json.dumps(files))
