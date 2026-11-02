"""Aggregate coder-level LLM answers to period-level values, mirroring the
ESID aggregation (codebook 2.1.3): simple mean (_sm) and confidence-weighted
mean (_wm). ESID's core distance-and-confidence weighting needs full-sample
distance normalization, so the simple mean is exported as the core value here
(the three methods correlate at ~0.99 in ESID's own data)."""

import re
import statistics

from common import out_dir, read_json, write_json
from schema_build import load_items

CONF_RE = re.compile(r"^q(\d+)_confidence$")


def conf_weight(conf, q):
    if conf is None:
        return 0.5
    if q == 1:  # 1-3 scale (codebook fn. 12)
        return {3: 1.0, 2: 0.75, 1: 0.25}.get(int(conf), 0.5)
    return {4: 1.0, 3: 0.75, 2: 0.5, 1: 0.25}.get(int(conf), 0.5)


def run(iso3, plan, n_coders=3):
    items = load_items()
    coding_dir = out_dir(iso3) / "coding"
    periods_out = []
    for period in plan:
        recs = []
        for k in range(n_coders):
            p = coding_dir / f"p{period['number']}_c{k}.json"
            if p.exists():
                recs.append(read_json(p))
        if not recs:
            continue
        values = {}
        for it in items:
            var = it["var"]
            if it["kind"] == "text":
                texts = [r["values"].get(var) for r in recs
                         if r["values"].get(var)]
                values[var] = {"coders": texts}
                continue
            m = CONF_RE.match(var)
            q = m.group(1) if m else str(it["q"])
            pairs = []
            for r in recs:
                v = r["values"].get(var)
                if v is None:
                    continue
                conf = r["values"].get(f"q{it['q']}_confidence")
                pairs.append((float(v), conf_weight(conf, it["q"])))
            if not pairs:
                values[var] = None
                continue
            vals = [v for v, _ in pairs]
            wsum = sum(w for _, w in pairs)
            values[var] = {
                "sm": round(statistics.mean(vals), 4),
                "wm": round(sum(v * w for v, w in pairs) / wsum, 4)
                      if wsum else None,
                "sd": round(statistics.stdev(vals), 4) if len(vals) > 1 else 0.0,
                "n": len(vals),
            }
        periods_out.append({
            "period": {k: v for k, v in period.items()
                       if not k.startswith("_")},
            "n_coders": len(recs),
            "values": values,
        })
    doc = {"iso3": iso3, "periods": periods_out}
    write_json(out_dir(iso3) / "aggregated.json", doc)
    return doc
