"""Build a standalone HTML comparison report: LLM coders vs ESID human coders.

Reads validation.json / aggregated.json for a country and writes a
self-contained page (inline CSS+JS, embedded data) to output/<ISO3>/report.html.

Usage: .venv/bin/python src/report.py KHM "Cambodia"

Two adjustments relative to validate.py's console summary:
  * SDs and MAE are reported scale-normalized (divided by the item's scale
    range), so 1-4 ordinals and 0-100 percentages are comparable.
  * The 27 self-reported *_confidence items are separated from the 95
    substantive items; they measure how sure a coder felt, not what they coded.
"""

import html
import json
import statistics
import sys

from common import out_dir, read_json
from schema_build import load_items

CSS = """
:root{--ink:#1a1a1a;--muted:#6b7280;--rule:#e5e7eb;--bg:#fff;--panel:#f9fafb;
--blue:#2F87C8;--blue-dk:#1A5A8E;--red:#CC4948;--amber:#D97706}
@media (prefers-color-scheme:dark){:root{--ink:#e8e8e8;--muted:#9aa1ab;
--rule:#2e333b;--bg:#14171a;--panel:#1c2025}}
*{box-sizing:border-box}
body{margin:0;padding:2.5rem 1.5rem 5rem;background:var(--bg);color:var(--ink);
font:16px/1.6 "Source Serif 4",Georgia,serif;-webkit-font-smoothing:antialiased}
main{max-width:60rem;margin:0 auto}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 .3rem;font-weight:600}
h2{font-size:1.15rem;margin:2.75rem 0 .75rem;font-weight:600;
padding-bottom:.35rem;border-bottom:1px solid var(--rule)}
h3{font-size:.95rem;margin:1.5rem 0 .5rem;font-weight:600}
p{margin:0 0 .9rem;max-width:46rem}
.sub{color:var(--muted);font-size:.9rem;margin-bottom:2rem}
.note{background:var(--panel);border-left:3px solid var(--amber);
padding:.8rem 1rem;font-size:.9rem;margin:1.2rem 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));
gap:.75rem;margin:1.25rem 0}
.stat{background:var(--panel);border:1px solid var(--rule);border-radius:4px;
padding:.8rem .9rem}
.stat .v{font-size:1.5rem;font-weight:600;font-variant-numeric:tabular-nums;
line-height:1.1}
.stat .k{font-size:.72rem;color:var(--muted);text-transform:uppercase;
letter-spacing:.04em;margin-top:.3rem}
.stat .n{font-size:.78rem;color:var(--muted);margin-top:.35rem}
.wrap{overflow-x:auto;margin:1rem 0}
table{border-collapse:collapse;width:100%;font-size:.85rem;
font-family:"Inter",system-ui,sans-serif}
th,td{padding:.4rem .55rem;text-align:right;border-bottom:1px solid var(--rule);
white-space:nowrap}
th{font-weight:600;font-size:.75rem;text-transform:uppercase;
letter-spacing:.03em;color:var(--muted);cursor:pointer;user-select:none;
position:sticky;top:0;background:var(--bg)}
th:hover{color:var(--ink)}
td.l,th.l{text-align:left;white-space:normal;min-width:14rem}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--panel)}
tbody tr.on{background:var(--panel);box-shadow:inset 2px 0 0 var(--blue)}
.num{font-variant-numeric:tabular-nums}
.neg{color:var(--red)}
.tabs{display:flex;gap:.4rem;margin:1rem 0 .5rem}
.tabs button{font:inherit;font-family:"Inter",system-ui,sans-serif;
font-size:.82rem;padding:.3rem .8rem;border:1px solid var(--rule);
background:var(--bg);color:var(--muted);border-radius:3px;cursor:pointer}
.tabs button.on{background:var(--blue);border-color:var(--blue);color:#fff;
font-weight:500}
#detail{background:var(--panel);border:1px solid var(--rule);border-radius:4px;
padding:1rem 1.1rem;margin:1rem 0;min-height:5rem}
#detail .hd{font-size:.9rem;font-weight:600;margin-bottom:.15rem}
#detail .mt{font-size:.78rem;color:var(--muted);
font-family:"Inter",system-ui,sans-serif;margin-bottom:.8rem}
.legend{font-size:.75rem;color:var(--muted);
font-family:"Inter",system-ui,sans-serif;display:flex;gap:1.1rem;
flex-wrap:wrap;margin-top:.6rem}
.legend i{display:inline-block;width:.75rem;height:.75rem;margin-right:.3rem;
vertical-align:-1px;border-radius:2px}
svg{display:block;max-width:100%;height:auto}
footer{margin-top:3.5rem;padding-top:1rem;border-top:1px solid var(--rule);
font-size:.8rem;color:var(--muted)}
code{font-family:ui-monospace,monospace;font-size:.85em;background:var(--panel);
padding:.1em .35em;border-radius:3px}
"""

JS = """
const D = window.__DATA__;
let tab = 'substantive', sortKey = 'r', sortDir = -1, sel = null;

const fmt = (v, d = 2) => v === null || v === undefined ? '—' : v.toFixed(d);
const cls = v => (v !== null && v < 0) ? ' class="num neg"' : ' class="num"';

function rows() {
  return D.items.filter(i => i.group === tab).slice().sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'string') return sortDir * x.localeCompare(y);
    return sortDir * (x - y);
  });
}

function drawTable() {
  const cols = [
    ['var', 'Item', 'l'], ['r', 'r'], ['mae_norm', 'MAE (norm)'],
    ['coverage', 'In human range'], ['human_sd_norm', 'Human SD'],
    ['llm_sd_norm', 'LLM SD'], ['n_periods', 'n'],
  ];
  const head = cols.map(([k, lab, c]) =>
    `<th class="${c || ''}" data-k="${k}">${lab}${sortKey === k ? (sortDir < 0 ? ' \\u25be' : ' \\u25b4') : ''}</th>`).join('');
  const body = rows().map(i => `<tr data-v="${i.var}"${sel === i.var ? ' class="on"' : ''}>
    <td class="l"><strong>${i.var}</strong><br><span style="color:var(--muted)">${i.label}</span></td>
    <td${cls(i.r)}>${fmt(i.r)}</td><td class="num">${fmt(i.mae_norm)}</td>
    <td class="num">${fmt(i.coverage)}</td><td class="num">${fmt(i.human_sd_norm)}</td>
    <td class="num">${fmt(i.llm_sd_norm)}</td><td class="num">${i.n_periods}</td></tr>`).join('');
  document.getElementById('tbl').innerHTML =
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  document.querySelectorAll('#tbl th').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = -1; }
    drawTable();
  });
  document.querySelectorAll('#tbl tbody tr').forEach(tr => tr.onclick = () => {
    sel = tr.dataset.v; drawTable(); drawDetail();
  });
}

function drawDetail() {
  const it = D.items.find(i => i.var === sel);
  const el = document.getElementById('detail');
  if (!it) { el.innerHTML = '<p style="margin:0;color:var(--muted)">Select an item above to see the period-by-period comparison.</p>'; return; }
  const ps = it.periods;
  const W = 720, H = 260, ml = 46, mr = 130, mt = 14, mb = 34;
  const iw = W - ml - mr, ih = H - mt - mb;
  const lo = Math.min(it.min, ...ps.map(p => Math.min(p.human_min, p.llm_mean)));
  const hi = Math.max(it.max, ...ps.map(p => Math.max(p.human_max, p.llm_mean)));
  const y = v => mt + ih - ((v - lo) / ((hi - lo) || 1)) * ih;
  const x = i => ml + (ps.length === 1 ? iw / 2 : (i / (ps.length - 1)) * iw);
  let s = '';
  ps.forEach((p, i) => {
    s += `<line x1="${x(i)}" y1="${y(p.human_min)}" x2="${x(i)}" y2="${y(p.human_max)}" stroke="var(--muted)" stroke-width="7" opacity=".28" stroke-linecap="round"/>`;
  });
  const path = k => ps.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[k])}`).join(' ');
  s += `<path d="${path('human_mean')}" fill="none" stroke="var(--blue)" stroke-width="2"/>`;
  s += `<path d="${path('llm_mean')}" fill="none" stroke="var(--amber)" stroke-width="2" stroke-dasharray="6 3"/>`;
  ps.forEach((p, i) => {
    s += `<circle cx="${x(i)}" cy="${y(p.human_mean)}" r="3.5" fill="var(--blue)"/>`;
    s += `<circle cx="${x(i)}" cy="${y(p.llm_mean)}" r="3.5" fill="var(--amber)"/>`;
    s += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="Inter,sans-serif">${p.label}</text>`;
  });
  [lo, (lo + hi) / 2, hi].forEach(v => {
    s += `<line x1="${ml}" y1="${y(v)}" x2="${ml + iw}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/>`;
    s += `<text x="${ml - 8}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="Inter,sans-serif">${(+v.toFixed(1))}</text>`;
  });
  const last = ps.length - 1;
  s += `<text x="${ml + iw + 10}" y="${y(ps[last].human_mean) + 3.5}" font-size="11" fill="var(--blue)" font-family="Inter,sans-serif">ESID experts</text>`;
  s += `<text x="${ml + iw + 10}" y="${y(ps[last].llm_mean) + 3.5}" font-size="11" fill="var(--amber)" font-family="Inter,sans-serif">LLM coders</text>`;
  el.innerHTML = `<div class="hd">${it.var}</div><div class="mt">${it.label} &middot; scale ${it.min}\\u2013${it.max} &middot; r = ${fmt(it.r)} &middot; ${ps.length} shared periods</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Period comparison for ${it.var}">${s}</svg>
    <div class="legend"><span><i style="background:var(--blue)"></i>ESID expert mean</span>
    <span><i style="background:var(--amber)"></i>LLM coder mean</span>
    <span><i style="background:var(--muted);opacity:.4"></i>ESID coder min\\u2013max range</span></div>`;
}

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(o => o.classList.remove('on'));
  b.classList.add('on'); tab = b.dataset.g; sel = null; drawTable(); drawDetail();
});
drawTable(); drawDetail();
"""


def _norm(v, rng):
    return None if v is None else round(v / rng, 4)


def _pct(xs):
    return round(100 * statistics.mean(xs), 1) if xs else None


def build(iso3, country):
    val = read_json(out_dir(iso3) / "validation.json")
    agg = read_json(out_dir(iso3) / "aggregated.json")
    schema = {i["var"]: i for i in load_items()}

    periods = {p["period"]["number"]: p["period"] for p in agg["periods"]}
    n_coders = {p["period"]["number"]: p["n_coders"] for p in agg["periods"]}

    items = []
    for var, v in val["items"].items():
        it = schema.get(var, {})
        lo, hi = it.get("min", 0), it.get("max", 1)
        rng = (hi - lo) or 1
        items.append({
            "var": var,
            "label": v["label"],
            "group": "confidence" if var.endswith("_confidence")
                     else "substantive",
            "min": lo, "max": hi,
            "r": v["r"],
            "mae_norm": v["mae_norm"],
            "coverage": v["coverage"],
            "human_sd_norm": _norm(v["human_sd"], rng),
            "llm_sd_norm": _norm(v["llm_sd"], rng),
            "n_periods": v["n_periods"],
            "periods": [{
                "label": f"{periods[r['period']]['start']}–"
                         f"{periods[r['period']]['end']}",
                "human_mean": round(r["human_mean"], 3),
                "human_min": r["human_min"], "human_max": r["human_max"],
                "llm_mean": r["llm_mean"],
            } for r in v["periods"] if r["period"] in periods],
        })

    sub = [i for i in items if i["group"] == "substantive"]
    rs = [i["r"] for i in sub if i["r"] is not None]
    stats = {
        "n_sub": len(sub),
        "n_conf": len(items) - len(sub),
        "median_r": round(statistics.median(rs), 3) if rs else None,
        "share_r50": _pct([1 if r > 0.5 else 0 for r in rs]),
        "share_rneg": _pct([1 if r < 0 else 0 for r in rs]),
        "mae_norm": round(statistics.mean(
            i["mae_norm"] for i in sub), 3) if sub else None,
        "coverage": _pct([i["coverage"] for i in sub]),
        "hsd": round(statistics.mean(
            i["human_sd_norm"] for i in sub if i["human_sd_norm"] is not None), 3),
        "lsd": round(statistics.mean(
            i["llm_sd_norm"] for i in sub if i["llm_sd_norm"] is not None), 3),
        "unanimous": _pct([1 if i["llm_sd_norm"] == 0 else 0 for i in sub]),
    }
    shared = max((i["n_periods"] for i in items), default=0)
    complete = sum(1 for n in n_coders.values() if n >= 3)

    data = json.dumps({"items": items}, separators=(",", ":"))
    e = html.escape
    doc = f"""<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(country)} — LLM coders vs ESID experts</title>
<style>{CSS}</style>
<main>
<h1>{e(country)}: LLM survey coders vs ESID human coders</h1>
<p class="sub">PolSett instrument (Schulz &amp; Kelsall 2020) &middot;
{stats['n_sub']} substantive items + {stats['n_conf']} confidence items &middot;
{shared} shared periods &middot; {complete} of {len(periods)} periods coded by all 3 simulated coders</p>

<div class="note"><strong>Read as provisional.</strong> These figures come from a
partial run. Correlations over {shared} periods carry wide sampling error, and any
period coded by fewer than three simulated coders contributes an unaveraged value.
The PolSett dataset has been public since 2020 and is plausibly in the model's
training data, so agreement here may overstate what to expect on an unseen country.</div>

<h2>Does the LLM track the expert consensus?</h2>
<div class="grid">
<div class="stat"><div class="v">{stats['median_r']}</div><div class="k">Median r</div>
<div class="n">LLM mean vs expert mean, across periods</div></div>
<div class="stat"><div class="v">{stats['share_r50']}%</div><div class="k">Items with r &gt; 0.5</div>
<div class="n">{stats['share_rneg']}% correlate negatively</div></div>
<div class="stat"><div class="v">{stats['mae_norm']}</div><div class="k">Mean absolute error</div>
<div class="n">As a share of each item's scale range</div></div>
<div class="stat"><div class="v">{stats['coverage']}%</div><div class="k">Inside expert range</div>
<div class="n">LLM mean within the coders' min–max</div></div>
</div>
<p>The middle two figures matter more than the median. A median r near
{stats['median_r']} with {stats['share_rneg']}% of items correlating negatively
describes a set of items that split into ones the model tracks well and ones where
it moves opposite to the experts, rather than uniform moderate agreement. Sorting
the table below by <code>r</code> shows which is which.</p>

<h2>Do the simulated coders disagree the way experts do?</h2>
<div class="grid">
<div class="stat"><div class="v">{stats['hsd']}</div><div class="k">Expert inter-coder SD</div>
<div class="n">Normalized to scale range</div></div>
<div class="stat"><div class="v">{stats['lsd']}</div><div class="k">LLM inter-coder SD</div>
<div class="n">Normalized to scale range</div></div>
<div class="stat"><div class="v">{stats['unanimous']}%</div><div class="k">Unanimous items</div>
<div class="n">All three simulated coders identical</div></div>
</div>
<p>This is the sharper finding. Human experts disagree with each other
substantially; the simulated coders barely do, and on {stats['unanimous']}% of items
they return identical values. The three personas share a single dossier per period,
so their errors are correlated in a way three independent experts' are not. The
spread across simulated coders should therefore not be read as an uncertainty
estimate — it understates the real uncertainty by roughly the ratio of the first two
figures above.</p>

<h2>Item-level detail</h2>
<p>Click any row for the period-by-period comparison. Confidence items are the
coder's self-reported certainty, not a substantive judgment, and are excluded from
the summary figures above.</p>
<div class="tabs">
<button class="on" data-g="substantive">Substantive ({stats['n_sub']})</button>
<button data-g="confidence">Confidence ({stats['n_conf']})</button>
</div>
<div id="detail"></div>
<div class="wrap"><table id="tbl"></table></div>

<footer>Generated by <code>polsett-llm/src/report.py</code> from
<code>output/{iso3}/validation.json</code>. Expert data: ESID Political Settlements
coder-level dataset. Metrics normalized by item scale range where noted.</footer>
</main>
<script>window.__DATA__={data};</script>
<script>{JS}</script>"""

    path = out_dir(iso3) / "report.html"
    path.write_text(doc)
    print(f"  report -> {path}")
    print(f"  substantive items={stats['n_sub']} median_r={stats['median_r']} "
          f"r>0.5={stats['share_r50']}% r<0={stats['share_rneg']}% "
          f"MAE(norm)={stats['mae_norm']} coverage={stats['coverage']}%")
    print(f"  inter-coder SD (norm): experts={stats['hsd']} llm={stats['lsd']} "
          f"| unanimous on {stats['unanimous']}% of items")
    return path


if __name__ == "__main__":
    build(sys.argv[1].upper(), sys.argv[2])
