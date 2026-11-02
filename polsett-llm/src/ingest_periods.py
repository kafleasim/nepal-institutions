"""Ingest periodization results from the in-session workflow into
output/<ISO3>/periods.json (same format stage1_periods.run produces).

Usage: .venv/bin/python src/ingest_periods.py <results.json>
where results.json is [{"key": "PAK", "periods": [...]}, ...]
"""

import sys

from common import ESID, is_codeable_type, out_dir, read_json, write_json

NAMES = {"PAK": "Pakistan", "KHM": "Cambodia", "ECU": "Ecuador",
         "BOL": "Bolivia"}
END_YEAR = 2026


def main():
    results = read_json(sys.argv[1])
    for entry in results:
        iso3, periods = entry["key"], entry["periods"]
        if not periods:
            print(f"!! {iso3}: no periods returned"); continue
        esid_path = ESID / f"{iso3}.json"
        in_esid = esid_path.exists()
        esid_periods = read_json(esid_path)["periods"] if in_esid else []
        base = 100 if in_esid else 0
        for i, p in enumerate(sorted(periods, key=lambda x: x["start"])):
            p["number"] = base + i + 1
            p["source"] = "llm"
            p["codeable"] = is_codeable_type(p.get("type", ""))
        doc = {
            "country": NAMES.get(iso3, iso3), "iso3": iso3,
            "end_year": END_YEAR,
            "esid_periods": esid_periods, "llm_periods": periods,
            "sources": ["in-session workflow research"],
        }
        write_json(out_dir(iso3) / "periods.json", doc)
        print(f"--- {iso3}")
        for p in periods:
            flag = "" if p["codeable"] else "  (not coded)"
            print(f"  p{p['number']} {p['start']}-{p['end']} "
                  f"{p['leader']:<28} [{p['type']}]{flag}")


if __name__ == "__main__":
    main()
