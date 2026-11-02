"""Validate LLM answers against ESID human coders on shared periods.

For every numeric item and every ESID-coded period, compares the LLM coder
distribution to the human coder distribution. Headline metrics per item:
  r          Pearson correlation of LLM mean with human mean across periods
  mae        mean |LLM mean - human mean|, in scale units
  mae_norm   mae / (scale range), comparable across items
  coverage   share of periods where the LLM mean lies within the human
             coders' [min, max]
  human_sd   average human inter-coder SD (the noise floor: an LLM 'coder'
             as good as a human should sit inside this band)
  llm_sd     average LLM inter-coder SD
"""

import statistics

from common import ESID, out_dir, read_json, write_json
from schema_build import load_items


def _pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    sx = statistics.pstdev(xs)
    sy = statistics.pstdev(ys)
    if sx == 0 or sy == 0:
        return None
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / n
    return round(cov / (sx * sy), 4)


def run(iso3, n_coders=3):
    esid = read_json(ESID / f"{iso3}.json")
    agg = read_json(out_dir(iso3) / "aggregated.json")
    items = [i for i in load_items() if i["kind"] != "text"]

    llm_by_period = {p["period"]["number"]: p for p in agg["periods"]
                     if p["period"].get("source") == "esid"}

    per_item = {}
    for it in items:
        var = it["var"]
        rng = (it["max"] - it["min"]) or 1
        rows = []
        for pnum, coders in esid["human_coders"].items():
            pnum = int(pnum)
            if pnum not in llm_by_period:
                continue
            hvals = [float(c[var]) for c in coders.values() if var in c]
            lcell = llm_by_period[pnum]["values"].get(var)
            if len(hvals) < 2 or not lcell or not isinstance(lcell, dict) \
                    or lcell.get("sm") is None:
                continue
            rows.append({
                "period": pnum,
                "human_mean": statistics.mean(hvals),
                "human_sd": statistics.stdev(hvals) if len(hvals) > 1 else 0,
                "human_min": min(hvals), "human_max": max(hvals),
                "llm_mean": lcell["sm"], "llm_sd": lcell["sd"],
            })
        if len(rows) < 3:
            continue
        hm = [r["human_mean"] for r in rows]
        lm = [r["llm_mean"] for r in rows]
        mae = statistics.mean(abs(h - l) for h, l in zip(hm, lm))
        per_item[var] = {
            "q": it["q"], "label": it["label"], "n_periods": len(rows),
            "r": _pearson(hm, lm),
            "mae": round(mae, 3),
            "mae_norm": round(mae / rng, 3),
            "coverage": round(statistics.mean(
                1.0 if r["human_min"] <= r["llm_mean"] <= r["human_max"]
                else 0.0 for r in rows), 3),
            "human_sd": round(statistics.mean(r["human_sd"] for r in rows), 3),
            "llm_sd": round(statistics.mean(r["llm_sd"] for r in rows), 3),
            "periods": rows,
        }

    scored = [v for v in per_item.values() if v["r"] is not None]
    summary = {
        "iso3": iso3,
        "n_items_scored": len(per_item),
        "median_r": round(statistics.median(
            v["r"] for v in scored), 3) if scored else None,
        "mean_mae_norm": round(statistics.mean(
            v["mae_norm"] for v in per_item.values()), 3) if per_item else None,
        "mean_coverage": round(statistics.mean(
            v["coverage"] for v in per_item.values()), 3) if per_item else None,
        "mean_human_sd": round(statistics.mean(
            v["human_sd"] for v in per_item.values()), 3) if per_item else None,
        "mean_llm_sd": round(statistics.mean(
            v["llm_sd"] for v in per_item.values()), 3) if per_item else None,
    }
    doc = {"summary": summary, "items": per_item}
    write_json(out_dir(iso3) / "validation.json", doc)

    print(f"\nVALIDATION {iso3}: {summary['n_items_scored']} items | "
          f"median r={summary['median_r']} | "
          f"MAE(norm)={summary['mean_mae_norm']} | "
          f"coverage={summary['mean_coverage']} | "
          f"human SD={summary['mean_human_sd']} vs LLM SD={summary['mean_llm_sd']}")
    return doc
