"""Post-run finalization without API access: coding plan -> aggregate ->
validate (if ESID country) -> frontend export. Used by the in-session
(subagent) execution backend; the API pipeline reaches the same stages via
run.py.

Usage: .venv/bin/python src/finalize.py <ISO3> "<Country Name>" [model_label]
"""

import sys

import aggregate
import export_frontend
import stage1_periods
import validate
from common import DEFAULT_CODERS, ESID, out_dir, read_json


def main():
    iso3 = sys.argv[1].upper()
    country = sys.argv[2]
    model_label = sys.argv[3] if len(sys.argv) > 3 else "claude (in-session)"

    periods_doc = read_json(out_dir(iso3) / "periods.json")
    esid_path = ESID / f"{iso3}.json"
    esid_data = read_json(esid_path) if esid_path.exists() else None
    plan = stage1_periods.coding_plan(periods_doc, esid_data)
    print(f"{country} ({iso3}): {len(plan)} periods in plan")

    aggregate.run(iso3, plan, n_coders=DEFAULT_CODERS)
    if esid_data:
        validate.run(iso3, n_coders=DEFAULT_CODERS)
    export_frontend.run(iso3, country, model_label, DEFAULT_CODERS)


if __name__ == "__main__":
    main()
