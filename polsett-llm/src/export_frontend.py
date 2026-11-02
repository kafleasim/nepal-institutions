"""Export aggregated LLM survey results to the country-profile app.

Writes to apps/country-profile/public/polsett/llm/:
  <ISO3>.json             periods + year-expanded series (simple-mean values)
  <ISO3>_rationales.json  per-period per-question coder rationales (audit)
  index.json              registry of countries with LLM data
"""

import datetime
import re

from common import ESID, ROOT, out_dir, read_json, write_json
from schema_build import load_items

APP_LLM_DIR = (ROOT.parent / "apps" / "country-profile" / "public"
               / "polsett" / "llm")

ESID_LAST_YEAR = 2018

WARNING = ("LLM-generated survey responses (not ESID expert data). "
           "Simulated coders answered the PolSett questionnaire from "
           "research dossiers; treat as experimental estimates.")


def _year_span(period, has_esid):
    src = period.get("source", "llm")
    start, end = period["start"], period["end"]
    if has_esid:
        if src == "esid":
            end = min(end, ESID_LAST_YEAR)
        else:
            start = max(start, ESID_LAST_YEAR + 1)
    return range(start, end + 1)


def run(iso3, country, model, n_coders):
    agg = read_json(out_dir(iso3) / "aggregated.json")
    items = [i for i in load_items() if i["kind"] != "text"]
    has_esid = (ESID / f"{iso3}.json").exists()

    series = {i["var"]: [] for i in items}
    periods_meta = []
    rationales = {}
    for p in agg["periods"]:
        per = p["period"]
        periods_meta.append({
            "number": per["number"], "start": per["start"], "end": per["end"],
            "leader": per.get("leader"), "type": per.get("type"),
            "source": per.get("source", "llm"),
            "summary": per.get("summary") or per.get("break_rationale"),
        })
        for it in items:
            cell = p["values"].get(it["var"])
            if not cell or cell.get("sm") is None:
                continue
            for y in _year_span(per, has_esid):
                series[it["var"]].append(
                    {"year": y, "value": cell["sm"], "sd": cell["sd"],
                     "period": per["number"]})
    series = {k: sorted(v, key=lambda r: r["year"])
              for k, v in series.items() if v}

    coding_dir = out_dir(iso3) / "coding"
    for f in sorted(coding_dir.glob("p*_c*.json")):
        rec = read_json(f)
        m = re.match(r"p(\d+)_c(\d+)", f.stem)
        pnum, coder = m.group(1), m.group(2)
        rationales.setdefault(pnum, {})[f"coder{coder}"] = rec["rationales"]

    doc = {
        "iso3": iso3, "country": country,
        "source": "llm", "model": model, "n_coders": n_coders,
        "generated": datetime.date.today().isoformat(),
        "warning": WARNING,
        "human_in_sample": has_esid,
        "esid_last_year": ESID_LAST_YEAR if has_esid else None,
        "periods": periods_meta,
        "series": series,
    }
    APP_LLM_DIR.mkdir(parents=True, exist_ok=True)
    write_json(APP_LLM_DIR / f"{iso3}.json", doc)
    write_json(APP_LLM_DIR / f"{iso3}_rationales.json",
               {"iso3": iso3, "rationales": rationales})

    index_path = APP_LLM_DIR / "index.json"
    index = read_json(index_path) if index_path.exists() else {"countries": []}
    index["countries"] = [c for c in index["countries"]
                          if c["iso3"] != iso3] + [{
        "iso3": iso3, "country": country, "model": model,
        "generated": doc["generated"], "human_in_sample": has_esid,
    }]
    index["countries"].sort(key=lambda c: c["iso3"])
    write_json(index_path, index)
    print(f"  exported {iso3}: {len(series)} series, "
          f"{len(periods_meta)} periods -> {APP_LLM_DIR}")
    return doc
