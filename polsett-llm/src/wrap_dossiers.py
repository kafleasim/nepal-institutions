"""Wrap dossier .md files (written by in-session agents) into the .json
envelope the rest of the pipeline reads. Idempotent; skips existing .json."""

import re

import stage1_periods
from common import ESID, out_dir, read_json, write_json

COUNTRIES = [("PAK", "Pakistan"), ("KHM", "Cambodia"),
             ("ECU", "Ecuador"), ("BOL", "Bolivia")]

URL_RE = re.compile(r"https?://[^\s)\]>\"']+")


def main():
    for iso3, _ in COUNTRIES:
        periods_doc = read_json(out_dir(iso3) / "periods.json")
        esid_path = ESID / f"{iso3}.json"
        esid_data = read_json(esid_path) if esid_path.exists() else None
        plan = stage1_periods.coding_plan(periods_doc, esid_data)
        ddir = out_dir(iso3) / "dossiers"
        n = 0
        for p in plan:
            md = ddir / f"p{p['number']}.md"
            js = ddir / f"p{p['number']}.json"
            if js.exists() or not md.exists():
                continue
            text = md.read_text()
            write_json(js, {
                "period": {k: v for k, v in p.items()
                           if not k.startswith("_")},
                "dossier": text,
                "web_sources": sorted(set(URL_RE.findall(text))),
                "model": "claude-code-session",
            })
            n += 1
        print(f"{iso3}: wrapped {n} dossiers")


if __name__ == "__main__":
    main()
