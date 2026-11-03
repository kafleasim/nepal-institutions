/* Regime explorer for khan-axes.html. Reads window.REGIMES (export_regimes.R).
   A regime is a run of years with one V-Dem regime identifier. For the selected
   regime the panel leads with the size of the support and opposition groups,
   then who held office, which groups back and oppose the regime, and which
   group holds each of V-Dem's five single-choice roles. */
(function () {
"use strict";
const R = window.REGIMES;
if (!R) return;

const GROUP = ["Aristocracy", "Agrarian elites", "Party elites", "Business elites", "State bureaucracy", "Military",
  "Ethnic or racial group(s)", "Religious group(s)", "Local elites and chiefs", "Urban working class",
  "Urban middle class", "Rural working class", "Rural middle class", "Foreign government"];
const FAMILIES = [
  { key: "f1", name: "Ruling party and state", g: [2, 4, 5] },
  { key: "f2", name: "Economic and hereditary elites", g: [0, 1, 3] },
  { key: "f3", name: "Identity and local groups", g: [6, 7, 8] },
  { key: "f4", name: "Social classes", g: [9, 10, 11, 12] },
  { key: "f5", name: "Foreign", g: [13] }
];
const FAM_OF = {}; FAMILIES.forEach(f => f.g.forEach(g => { FAM_OF[g] = f.key; }));
const SIZE_BAND = ["About 1% or less", "1–5%", "5–15%", "15–30%", "More than 30%"];
const SIZE_NAME = ["extremely small", "very small", "small", "moderate", "large"];
const LOC = ["abroad", "the capital", "urban areas outside the capital", "rural areas", "no particular area"];
const PATH = ["force (coup or rebellion)", "appointment by a foreign power", "appointment by the ruling party",
  "appointment by a royal council", "hereditary succession", "appointment by the military",
  "appointment by the legislature", "popular election", "another route"];
const ENDTYPE = ["Military coup", "Coup by groups other than the military", "Self-coup by the sitting leader",
  "Assassination of the sitting leader", "Natural death of the sitting leader", "Loss in civil war",
  "Loss in inter-state war", "Foreign intervention", "Popular uprising",
  "Liberalisation guided by the regime's leaders", "Other transformation guided by the regime's leaders",
  "Liberalisation not guided by the regime's leaders", "Other process", "Still in place"];
const ROLES = [
  { k: "imp", name: "Relied on most", short: "relied on most", tag: "v2regimpgroup",
    def: "The group whose withdrawal of support would most endanger the regime." },
  { k: "impo", name: "Most important opposition", short: "main opposition", tag: "v2regimpoppgroup",
    def: "The opposition group that poses the largest threat to the regime." },
  { k: "pow", name: "Most powerful over survival", short: "most powerful", tag: "v2regpower",
    def: "The group most able to affect whether the regime stays in power, whatever its stance toward it." },
  { k: "pro", name: "Strongest pro-regime preferences", short: "most pro-regime", tag: "v2regproreg",
    def: "The group most in favour of the regime, whatever its capacity to act." },
  { k: "anti", name: "Strongest anti-regime preferences", short: "most anti-regime", tag: "v2regantireg",
    def: "The group most opposed to the regime, whatever its capacity to act." }
];
const VP_GROUP = ["No specific group", "Aristocracy", "Agrarian elites", "Business elites", "Military",
  "Ethnic or racial group(s)", "Religious group(s)", "Local elites and chiefs", "Urban working class",
  "Urban middle class", "Rural working class", "Rural middle class", "Regional groups or separatists", "Women", "Other groups"];
const VP_SCALE = {
  disa: ["almost complete disagreement among party elites; many have left", "high visible disagreement; some elites have left",
         "some visible disagreement; none have left", "negligible visible disagreement", "virtually no visible disagreement"],
  ind: ["not focused on one leader", "occasionally focused on one leader", "somewhat focused on one leader",
        "mainly focused on one leader", "solely focused on one leader"],
  act: ["negligible", "minor", "noticeable", "significant", "widespread"]
};
const RANGES = [["1900", 1900], ["1946", 1946], ["1990", 1990]];

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tip = document.getElementById("tip");
function showTip(html, ev) {
  tip.innerHTML = html; tip.style.opacity = 1;
  const pad = 14, r = tip.getBoundingClientRect();
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
}
function hideTip() { tip.style.opacity = 0; }
const docTip = tag => {
  const d = R.docs[tag]; if (!d) return "";
  return `<b>${esc(d.name)}</b> <span class="dim">${esc(tag)}</span><br>${esc(d.question)}`;
};
const info = tag => `<button type="button" class="rg-info" data-doc="${tag}" aria-label="What V-Dem asks">?</button>`;

/* ---------- data access ---------- */
const cache = {};
function country(iso) {
  if (cache[iso]) return cache[iso];
  const c = R.countries[iso];
  // Repeated rows and strings are stored as 1: carry the previous value forward.
  ["hos", "hosp", "hog", "sg", "og", "oa"].forEach(k => {
    const a = c[k]; for (let i = 1; i < a.length; i++) if (a[i] === 1) a[i] = a[i - 1];
  });
  const n = c.rid.length, years = d3.range(c.y0, c.y0 + n);
  c.rows = years.map((y, i) => ({
    y, rid: c.rid[i], int: c.int[i], sup: c.sup[i], supl: c.supl[i], suph: c.suph[i],
    opp: c.opp[i], oppl: c.oppl[i], opph: c.opph[i], imp: c.imp[i], impo: c.impo[i], pow: c.pow[i],
    pro: c.pro[i], anti: c.anti[i], sloc: c.sloc[i], oloc: c.oloc[i], hos: c.hos[i], hosp: c.hosp[i],
    hog: c.hog[i], path: c.path[i], poly: c.poly[i], sg: c.sg[i], og: c.og[i], oa: c.oa[i]
  }));
  c.parties = c.parties || [];
  cache[iso] = c; return c;
}
const rowsOf = (c, reg) => c.rows.filter(r => r.y >= reg.y0 && r.y <= reg.y1);
const mean = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? d3.mean(v) : null; };
const band = v => v == null ? null : Math.max(0, Math.min(4, Math.round(v)));
function runs(rows, f) {
  const out = [];
  rows.forEach(r => {
    const v = f(r), last = out[out.length - 1];
    if (last && last.v === v && last.y1 === r.y - 1) last.y1 = r.y; else out.push({ v, y0: r.y, y1: r.y });
  });
  return out;
}
function modal(rows, k) {
  const cnt = d3.rollup(rows.filter(r => r[k] != null), v => v.length, r => r[k]);
  let best = null, n = 0; cnt.forEach((v, g) => { if (v > n) { n = v; best = g; } });
  return best;
}
// Summary for the selected regime, or a single year of it.
function summary(c, reg, year) {
  const rows = year == null ? rowsOf(c, reg) : c.rows.filter(r => r.y === year);
  const coded = rows.filter(r => r.sg);
  const avgShares = k => GROUP.map((_, g) => mean(coded.map(r => r[k] ? r[k][g] : null)));
  return {
    rows, coded,
    sup: mean(rows.map(r => r.sup)), supl: mean(rows.map(r => r.supl)), suph: mean(rows.map(r => r.suph)),
    opp: mean(rows.map(r => r.opp)), oppl: mean(rows.map(r => r.oppl)), opph: mean(rows.map(r => r.opph)),
    sg: avgShares("sg"), og: avgShares("og"), oa: avgShares("oa"),
    roles: Object.fromEntries(ROLES.map(ro => [ro.k, modal(rows, ro.k)])),
    sloc: modal(rows, "sloc"), oloc: modal(rows, "oloc")
  };
}

/* ---------- state ---------- */
const st = { iso: "UGA", reg: null, year: null, from: 1946 };
const isos = Object.keys(R.countries).sort((a, b) => R.countries[a].name.localeCompare(R.countries[b].name));
const search = document.getElementById("rg-search"), list = document.getElementById("rg-list");
isos.forEach(i => { const o = document.createElement("option"); o.value = R.countries[i].name; list.appendChild(o); });
search.addEventListener("change", () => {
  const iso = isos.find(i => R.countries[i].name.toLowerCase() === search.value.trim().toLowerCase());
  if (iso) select(iso);
});
const rangeHost = document.getElementById("rg-range");
rangeHost.innerHTML = RANGES.map(([l, y]) => `<button type="button" class="chip" data-from="${y}">Since ${l}</button>`).join("");
rangeHost.addEventListener("click", ev => {
  const b = ev.target.closest("[data-from]"); if (!b) return;
  st.from = +b.dataset.from; renderTime();
});
document.getElementById("regimes").addEventListener("mousemove", ev => {
  const b = ev.target.closest(".rg-info"); if (b) showTip(docTip(b.dataset.doc), ev);
});
document.getElementById("regimes").addEventListener("mouseout", ev => { if (ev.target.closest(".rg-info")) hideTip(); });
document.getElementById("regimes").addEventListener("focusin", ev => {
  const b = ev.target.closest(".rg-info"); if (!b) return;
  const r = b.getBoundingClientRect(); showTip(docTip(b.dataset.doc), { clientX: r.right, clientY: r.bottom });
});
document.getElementById("regimes").addEventListener("focusout", hideTip);

function select(iso, keepScroll) {
  if (!R.countries[iso]) return;
  st.iso = iso; search.value = R.countries[iso].name;
  const c = country(iso);
  st.reg = c.regimes[c.regimes.length - 1]; st.year = null;
  renderAll();
}
window.REGIME_SELECT = select;
function selectRegime(reg, year) {
  st.reg = reg; st.year = year == null ? null : year; renderAll();
}

/* ---------- Figure 11: regimes over time ---------- */
const widthOf = id => Math.max(300, document.getElementById(id).clientWidth);
function renderTime() {
  rangeHost.querySelectorAll("[data-from]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.from === st.from));
  const host = document.getElementById("rg-time"); host.innerHTML = "";
  const c = country(st.iso);
  const from = Math.max(st.from, c.y0), to = c.y0 + c.rows.length - 1;
  const rows = c.rows.filter(r => r.y >= from);
  const regs = c.regimes.filter(r => r.y1 >= from);
  const W = widthOf("rg-time"), m = { l: 140, r: 12 };
  const regH = 34, hosH = 22, gap = 8, chartT = regH + hosH + gap * 2 + 4, chartH = 190, H = chartT + chartH + 30;
  const x = d3.scaleLinear().domain([from, to + 1]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, 4]).range([chartT + chartH, chartT + 6]);
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `${c.name}: regimes, heads of government, and the size of regime support and opposition groups`);

  // row labels
  [["Regime", regH / 2], ["Head of government", regH + gap + hosH / 2]].forEach(([t, yy]) =>
    svg.append("text").attr("x", m.l - 8).attr("y", yy + 4).attr("text-anchor", "end").attr("class", "strong").text(t));

  // regimes band
  const gR = svg.append("g");
  regs.forEach((reg, i) => {
    const x0 = x(Math.max(reg.y0, from)), x1 = x(reg.y1 + 1), sel = st.reg && reg.id === st.reg.id && reg.y0 === st.reg.y0;
    const g = gR.append("g").attr("class", "rg-reg").attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", `${reg.name}, ${reg.y0} to ${reg.y1}`).style("cursor", "pointer")
      .on("click", () => selectRegime(reg))
      .on("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectRegime(reg); } })
      .on("mousemove", ev => showTip(`<b>${esc(reg.name)}</b><br>${esc(reg.start || reg.y0)} – ${reg.end === "E" ? "present" : esc(reg.end || reg.y1)}<br><span class="dim">Ended by: ${ENDTYPE[reg.endtype] || "–"}</span>`, ev))
      .on("mouseleave", hideTip);
    g.append("rect").attr("x", x0 + 1).attr("width", Math.max(1, x1 - x0 - 2)).attr("y", 0).attr("height", regH).attr("rx", 3)
      .style("fill", sel ? "var(--ink)" : i % 2 ? "var(--rg-reg-b)" : "var(--rg-reg-a)");
    const label = fitText(reg.name, x1 - x0 - 10);
    if (label) g.append("text").attr("x", x0 + 6).attr("y", regH / 2 + 4).style("fill", sel ? "var(--paper)" : "var(--ink-2)")
      .style("font-weight", sel ? 600 : 400).style("pointer-events", "none").text(label);
  });

  // heads of state
  const hr = runs(rows, r => govHead(r) || null).filter(h => h.v);
  const gH = svg.append("g").attr("transform", `translate(0,${regH + gap})`);
  hr.forEach((h, i) => {
    const x0 = x(h.y0), x1 = x(h.y1 + 1), r0 = rows.find(r => r.y === h.y0);
    gH.append("rect").attr("x", x0 + 0.5).attr("width", Math.max(1, x1 - x0 - 1)).attr("height", hosH).attr("rx", 2)
      .style("fill", i % 2 ? "var(--rg-reg-b)" : "var(--rg-reg-a)")
      .on("mousemove", ev => showTip(r0 && r0.hog
        ? `<b>${esc(h.v)}</b><br>Head of government, ${h.y0}–${h.y1}${r0.hos ? `<br><span class="dim">Head of state: ${esc(r0.hos)}</span>` : ""}`
        : `<b>${esc(h.v)}</b><br>Head of state and government, ${h.y0}–${h.y1}${r0 && r0.hosp ? "<br>" + esc(r0.hosp) : ""}${r0 && r0.path != null ? `<br><span class="dim">Reached office by ${PATH[r0.path]}</span>` : ""}`, ev))
      .on("mouseleave", hideTip);
    const label = fitText(surname(h.v), x1 - x0 - 6, 11);
    if (label) gH.append("text").attr("x", x0 + 4).attr("y", hosH / 2 + 4).style("font-size", "11px").style("fill", "var(--ink-2)").style("pointer-events", "none").text(label);
  });

  // size chart: bands on the y axis
  const gC = svg.append("g");
  if (st.reg) {
    const s0 = Math.max(st.reg.y0, from);
    gC.append("rect").attr("x", x(s0)).attr("width", x(st.reg.y1 + 1) - x(s0)).attr("y", chartT).attr("height", chartH)
      .style("fill", "var(--panel)");
  }
  SIZE_BAND.forEach((b, i) => {
    gC.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(i)).attr("y2", y(i)).style("stroke", "var(--grid)");
    gC.append("text").attr("x", m.l - 8).attr("y", y(i) + 4).attr("text-anchor", "end").text(b);
  });
  regs.forEach(reg => { if (reg.y0 > from) gC.append("line").attr("x1", x(reg.y0)).attr("x2", x(reg.y0)).attr("y1", 0).attr("y2", chartT + chartH).style("stroke", "var(--ink-4)").style("stroke-width", 1); });
  const xt = x.ticks(Math.max(3, Math.floor((W - m.l) / 70))).filter(t => Number.isInteger(t));
  xt.forEach(t => gC.append("text").attr("x", x(t + 0.5)).attr("y", chartT + chartH + 18).attr("text-anchor", "middle").text(t));

  const series = [["sup", "supl", "suph", "var(--pos)", "Support groups"], ["opp", "oppl", "opph", "var(--neg)", "Opposition groups"]];
  series.forEach(([k, lo, hi, col]) => {
    gC.append("path").datum(rows).attr("d", d3.area().defined(r => r[lo] != null && r[hi] != null)
      .x(r => x(r.y + 0.5)).y0(r => y(r[lo])).y1(r => y(r[hi])))
      .style("fill", col).style("fill-opacity", 0.12);
    gC.append("path").datum(rows).attr("d", d3.line().defined(r => r[k] != null).x(r => x(r.y + 0.5)).y(r => y(r[k])))
      .style("fill", "none").style("stroke", col).style("stroke-width", 2);
  });

  // hover / click layer
  const cross = gC.append("line").attr("y1", chartT).attr("y2", chartT + chartH).style("stroke", "var(--ink-3)").style("opacity", 0);
  if (st.year != null && st.year >= from) gC.append("line").attr("x1", x(st.year + 0.5)).attr("x2", x(st.year + 0.5)).attr("y1", chartT).attr("y2", chartT + chartH).style("stroke", "var(--ink)").style("stroke-width", 2);
  gC.append("rect").attr("x", m.l).attr("width", W - m.l - m.r).attr("y", chartT).attr("height", chartH).style("fill", "transparent").style("cursor", "pointer")
    .on("mousemove", ev => {
      const yr = Math.floor(x.invert(d3.pointer(ev)[0])), r = rows.find(q => q.y === yr); if (!r) return;
      cross.attr("x1", x(yr + 0.5)).attr("x2", x(yr + 0.5)).style("opacity", 1);
      const reg = c.regimes.find(q => q.id === r.rid && yr >= q.y0 && yr <= q.y1);
      showTip(`<b>${yr}</b>${reg ? " · " + esc(reg.name) : ""}${govHead(r) ? "<br>" + esc(govHead(r)) + (r.hog ? " (head of government)" : "") : ""}` +
        (r.int === 0 ? "<br>Interregnum: no identifiable regime" :
        `<br>Support groups: ${r.sup == null ? "–" : SIZE_BAND[band(r.sup)]} <span class="dim">(${r.sup == null ? "–" : r.sup.toFixed(2)})</span>` +
        `<br>Opposition groups: ${r.opp == null ? "–" : SIZE_BAND[band(r.opp)]} <span class="dim">(${r.opp == null ? "–" : r.opp.toFixed(2)})</span>` +
        (r.imp != null ? `<br>Relied on most: ${GROUP[r.imp]}` : "") + (r.impo != null ? `<br>Main opposition: ${GROUP[r.impo]}` : "")) +
        `<br><span class="dim">Click to show this year</span>`, ev);
    })
    .on("mouseleave", () => { cross.style("opacity", 0); hideTip(); })
    .on("click", ev => {
      const yr = Math.floor(x.invert(d3.pointer(ev)[0])), r = rows.find(q => q.y === yr); if (!r) return;
      const reg = c.regimes.find(q => q.id === r.rid && yr >= q.y0 && yr <= q.y1); if (reg) selectRegime(reg, yr);
    });
}
// V-Dem leaves the head-of-government name empty when the head of state also
// heads the government (v2exhoshog = 1), so the head of state stands in.
const govHead = r => r.hog || r.hos;
function surname(n) { const p = n.split(/\s+/); return p.length > 2 ? p[0] + " " + p[p.length - 1] : n; }
const measure = (() => { const cv = document.createElement("canvas").getContext("2d"); return (t, px) => { cv.font = `${px}px Inter, Helvetica, Arial, sans-serif`; return cv.measureText(t).width; }; })();
function fitText(t, w, px = 12) {
  if (w < 24) return "";
  if (measure(t, px) <= w) return t;
  let s = t; while (s.length > 3 && measure(s + "…", px) > w) s = s.slice(0, -1);
  return s.length > 3 ? s + "…" : "";
}

/* ---------- detail panel ---------- */
const fmtDate = s => {
  if (!s || s === "E") return "present";
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return s;
  return `${+m[1]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1]} ${m[3]}`;
};
const pctTxt = v => v == null ? "–" : Math.round(v) + "%";
const famSw = g => `<i class="rg-sw rg-${FAM_OF[g]}"></i>`;

function sizeBars(s) {
  const pos = v => (v / 4 * 100).toFixed(2) + "%";
  const bar = (v, lo, hi, cls, label, tag) => `
    <div class="rg-size-lab">${label} ${info(tag)}</div>
    <div class="rg-size-track">
      ${SIZE_BAND.map((_, i) => `<i class="rg-size-tick" style="left:${pos(i)}"></i>`).join("")}
      ${v == null ? `<span class="rg-none">not coded</span>` : `
      <i class="rg-size-fill ${cls}" style="width:${pos(v)}"></i>
      ${lo != null && hi != null ? `<i class="rg-size-ci" style="left:${pos(lo)};width:${(Math.max(0, hi - lo) / 4 * 100).toFixed(2)}%"></i>` : ""}`}
    </div>
    <div class="rg-size-val">${v == null ? "–" : `<b>${SIZE_BAND[band(v)]}</b><span>${SIZE_NAME[band(v)]} · ${v.toFixed(2)}</span>`}</div>`;
  return `<div class="rg-size">
    ${bar(s.sup, s.supl, s.suph, "sup", "Support groups", "v2regsupgroupssize")}
    ${bar(s.opp, s.oppl, s.opph, "opp", "Opposition groups", "v2regoppgroupssize")}
    <div></div><div class="rg-size-axis">${SIZE_BAND.map((b, i) => `<span style="left:${pos(i)}">${b}</span>`).join("")}</div><div></div>
  </div>`;
}

function narrative(c, reg, s) {
  if (!s.coded.length) return `<p>V-Dem's experts did not code support and opposition groups for this ${st.year == null ? "regime" : "year"}${s.rows.some(r => r.int === 0) ? ", which V-Dem treats as an interregnum with no identifiable regime" : ""}.</p>`;
  const when = st.year == null ? `Across ${reg.y0 === reg.y1 ? reg.y0 : reg.y0 + "–" + reg.y1}` : `In ${st.year}`;
  const R0 = s.roles, out = [];
  out.push(`${when}, V-Dem's country experts place the groups the regime depends on at <b>${SIZE_BAND[band(s.sup)].toLowerCase()}</b> of the adult population, and the groups that want it replaced and could under favourable conditions remove it at <b>${SIZE_BAND[band(s.opp)].toLowerCase()}</b>.`);
  const diff = s.sup - s.opp;
  out.push(Math.abs(diff) < 0.5 ? "The two are of similar size." : diff > 0 ? "The support base is the larger of the two." : "The opposition is the larger of the two.");
  if (R0.imp != null) out.push(`The regime relies most on <b>${GROUP[R0.imp].toLowerCase()}</b>${R0.impo != null ? `; the most important opposition is <b>${GROUP[R0.impo].toLowerCase()}</b>` : ""}.`);
  if (R0.imp != null && R0.imp === R0.impo) out.push(`V-Dem's fourteen categories are broad, so the support and opposition groups named here are likely different groups within the same category, for example different ethnic groups.`);
  if (R0.pow != null) {
    const sv = s.sg[R0.pow], ov = s.og[R0.pow];
    const stance = sv == null ? "" : sv >= 50 && (ov == null || ov < 50) ? ", and most coders list it as a support group" :
      ov >= 50 && sv < 50 ? ", and most coders list it as an opposition group" :
      sv >= 50 && ov >= 50 ? "; most coders list it among both the regime's supporters and its opponents" : "; most coders list it as neither a support nor an opposition group";
    out.push(`The group most able to affect whether the regime survives is <b>${GROUP[R0.pow].toLowerCase()}</b>${stance}.`);
  }
  return `<p>${out.join(" ")}</p>`;
}

function inCharge(c, reg) {
  const rows = rowsOf(c, reg);
  // Heads of government first (the head of state where they are the same
  // person), then separate heads of state.
  const gov = runs(rows, r => govHead(r) ? govHead(r) + "|" + (r.hog ? "g" : "sg") : null).filter(h => h.v);
  const hos = runs(rows.filter(r => r.hog), r => r.hos || null).filter(h => h.v);
  const li = (h, name, kind) => {
    const r0 = rows.find(r => r.y === h.y0), isHos = kind !== "Head of government";
    return `<li><b>${esc(name)}</b> <span class="rg-yrs">${h.y0 === h.y1 ? h.y0 : h.y0 + "–" + h.y1}</span>
      <div class="rg-sub">${kind}${isHos && r0 && r0.hosp ? " · " + esc(r0.hosp) : ""}${isHos && r0 && r0.path != null ? " · reached office by " + PATH[r0.path] : ""}</div></li>`;
  };
  const people = gov.map(h => { const [n, k] = h.v.split("|"); return li(h, n, k === "g" ? "Head of government" : "Head of state and government"); }).join("") +
    hos.map(h => li(h, h.v, "Head of state")).join("");
  const parties = c.parties.filter(p => p.y >= reg.y0 && p.y <= reg.y1);
  const meter = (v, scale) => v == null ? "–" : `<span class="rg-meter" title="${esc(VP_SCALE[scale][band(v)])}">${[0, 1, 2, 3].map(i => `<i class="${v >= i + 0.5 ? "on" : ""}"></i>`).join("")}</span><span class="rg-mval">${v.toFixed(1)}</span>`;
  const ptable = parties.length ? `
    <div class="tbl-wrap"><table class="rg-ptab">
      <thead><tr><th>Election</th><th>Governing party</th><th class="num">Vote %</th><th class="num">Seat %</th>
        <th>Cohesion ${info("v2padisa")}</th><th>Personalisation ${info("v2paind")}</th><th>Local presence ${info("v2paactcom")}</th></tr></thead>
      <tbody>${parties.map(p => `<tr>
        <td>${p.y}</td>
        <td title="${esc(p.groups.filter(g => g > 0).map(g => VP_GROUP[g]).join(", "))}"><b>${esc(p.short || "")}</b> ${esc(p.name)}${p.role === 1 ? ' <span class="rg-sub">junior partner</span>' : ""}</td>
        <td class="num">${p.vote == null ? "–" : p.vote.toFixed(0)}</td><td class="num">${p.seat == null ? "–" : p.seat.toFixed(0)}</td>
        <td>${meter(p.disa, "disa")}</td><td>${meter(p.ind, "ind")}</td><td>${meter(p.act, "act")}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="note">V-Party, elections to 2019, parties above 5% of the vote. Scales run 0–4. Cohesion: 4 = virtually no visible disagreement among party elites, 0 = almost complete disagreement with many elites leaving. Personalisation: 4 = the party is solely a vehicle for one leader. Local presence: permanent activity of party activists in local communities. Hover over a party for the social groups V-Party records as its core supporters.</p>` :
    `<p class="note">V-Party records no governing party for an election in these years. It covers elections to 2019 and parties with more than 5% of the vote.</p>`;
  return [`<ul class="rg-people">${people}</ul>`, ptable];
}

function rolesHtml(c, reg, s) {
  const rows = st.year == null ? rowsOf(c, reg) : s.rows;
  return `<div class="rg-roles">${ROLES.map(ro => {
    const g = s.roles[ro.k];
    const rs = runs(rows.filter(r => r[ro.k] != null), r => r[ro.k]);
    const other = st.year == null && rs.length > 1 ? `<div class="rg-sub">${rs.filter(r => r.v !== g).map(r => `${r.y0 === r.y1 ? r.y0 : r.y0 + "–" + r.y1}: ${GROUP[r.v].toLowerCase()}`).join("; ")}</div>` : "";
    return `<div class="rg-role">
      <div class="rg-role-k">${ro.name} ${info(ro.tag)}</div>
      <div class="rg-role-v">${g == null ? "not coded" : famSw(g) + esc(GROUP[g])}</div>${other}
    </div>`;
  }).join("")}</div>`;
}

function groupsHtml(s) {
  const roleTags = g => ROLES.filter(ro => s.roles[ro.k] === g).map(ro => `<span class="rg-tag rg-tag-${ro.k}">${ro.short}</span>`).join("");
  const row = g => {
    const sv = s.sg[g], ov = s.og[g], av = s.oa[g];
    return `<div class="rg-g-sup" aria-label="${GROUP[g]}: support ${pctTxt(sv)}">
        <span class="rg-g-num">${pctTxt(sv)}</span><span class="rg-g-track"><i class="rg-g-bar sup" style="width:${sv == null ? 0 : sv}%"></i></span></div>
      <div class="rg-g-lab">${famSw(g)}<span>${GROUP[g]}</span>${roleTags(g)}</div>
      <div class="rg-g-opp" aria-label="${GROUP[g]}: opposition ${pctTxt(ov)}, active ${pctTxt(av)}">
        <span class="rg-g-track"><i class="rg-g-bar opp" style="width:${ov == null ? 0 : ov}%"></i><i class="rg-g-bar act" style="width:${av == null ? 0 : av}%"></i></span>
        <span class="rg-g-num">${pctTxt(ov)} <span class="rg-dim">${av == null ? "" : pctTxt(av) + " active"}</span></span></div>`;
  };
  return `<div class="rg-groups">
    <div class="rg-g-head sup">Named as a support group ${info("v2regsupgroups")}</div><div></div>
    <div class="rg-g-head opp">Named as an opposition group ${info("v2regoppgroups")} · active ${info("v2regoppgroupsact")}</div>
    ${FAMILIES.map(f => `<div class="rg-g-fam">${f.name}</div>${f.g.map(row).join("")}`).join("")}
  </div>`;
}

function renderRoleStrip(c, reg) {
  const host = document.getElementById("rg-rolestrip"); host.innerHTML = "";
  const rows = rowsOf(c, reg);
  if (rows.length < 2) { host.parentElement.hidden = true; return; }
  host.parentElement.hidden = false;
  const W = widthOf("rg-rolestrip"), m = { l: 200, r: 8 }, rh = 26, H = ROLES.length * (rh + 4) + 24;
  const x = d3.scaleLinear().domain([reg.y0, reg.y1 + 1]).range([m.l, W - m.r]);
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Group holding each role, by year");
  ROLES.forEach((ro, i) => {
    const yy = i * (rh + 4);
    svg.append("text").attr("x", m.l - 8).attr("y", yy + rh / 2 + 4).attr("text-anchor", "end").text(ro.name);
    runs(rows, r => r[ro.k]).forEach(run => {
      const x0 = x(run.y0), x1 = x(run.y1 + 1);
      const g = svg.append("g");
      g.append("rect").attr("x", x0 + 0.5).attr("y", yy).attr("width", Math.max(1, x1 - x0 - 1)).attr("height", rh).attr("rx", 2)
        .attr("class", run.v == null ? "rg-cell-none" : "rg-cell rg-" + FAM_OF[run.v])
        .on("mousemove", ev => showTip(`<b>${ro.name}</b><br>${run.y0 === run.y1 ? run.y0 : run.y0 + "–" + run.y1}: ${run.v == null ? "not coded" : GROUP[run.v]}`, ev))
        .on("mouseleave", hideTip);
      const label = run.v == null ? "" : fitText(GROUP[run.v], x1 - x0 - 8, 11);
      if (label) g.append("text").attr("x", x0 + 5).attr("y", yy + rh / 2 + 4).style("font-size", "11px").style("fill", "var(--ink)").style("pointer-events", "none").text(label);
    });
  });
  if (st.year != null) svg.append("rect").attr("x", x(st.year)).attr("width", x(st.year + 1) - x(st.year)).attr("y", -2).attr("height", ROLES.length * (rh + 4)).style("fill", "none").style("stroke", "var(--ink)").style("stroke-width", 2);
  const xt = x.ticks(Math.max(2, Math.floor((W - m.l) / 70))).filter(t => Number.isInteger(t) && t <= reg.y1);
  xt.forEach(t => svg.append("text").attr("x", x(t + 0.5)).attr("y", H - 6).attr("text-anchor", "middle").text(t));
}

function renderDetail() {
  const c = country(st.iso), reg = st.reg;
  const s = summary(c, reg, st.year);
  const dur = reg.y1 - reg.y0 + 1;
  document.getElementById("rg-title").textContent = reg.name;
  document.getElementById("rg-sub").innerHTML =
    `${c.name} · ${fmtDate(reg.start)} – ${fmtDate(reg.end)} · ${dur} year${dur > 1 ? "s" : ""} in V-Dem's country-year data · ` +
    `${reg.endtype === 13 ? "still in place" : "ended by: " + (ENDTYPE[reg.endtype] || "–").toLowerCase()} ${info("v2regendtype")}`;
  const mode = document.getElementById("rg-mode");
  mode.innerHTML = st.year == null
    ? `Showing the regime average, ${reg.y0 === reg.y1 ? reg.y0 : reg.y0 + "–" + reg.y1}. Click a year in Figure 11 to show that year alone.`
    : `Showing ${st.year} only. <button type="button" class="chip" id="rg-avg">Show the regime average</button>`;
  const avgBtn = document.getElementById("rg-avg"); if (avgBtn) avgBtn.onclick = () => selectRegime(reg);
  document.getElementById("rg-size").innerHTML = sizeBars(s) +
    (s.sloc != null || s.oloc != null ? `<p class="note">Where support groups are concentrated: ${s.sloc == null ? "–" : LOC[s.sloc]} ${info("v2regsuploc")}. Where opposition groups are concentrated: ${s.oloc == null ? "–" : LOC[s.oloc]} ${info("v2regopploc")}.</p>` : "");
  document.getElementById("rg-narr").innerHTML = narrative(c, reg, s);
  const [people, ptable] = inCharge(c, reg);
  document.getElementById("rg-charge").innerHTML = people;
  document.getElementById("rg-party").innerHTML = ptable;
  document.getElementById("rg-roles").innerHTML = rolesHtml(c, reg, s);
  document.getElementById("rg-groups").innerHTML = s.coded.length ? groupsHtml(s) : `<p class="note">Not coded for this ${st.year == null ? "regime" : "year"}.</p>`;
  renderRoleStrip(c, reg);
}

function renderAll() { renderTime(); renderDetail(); }
select(st.iso);
let rt, lastW = window.innerWidth;
window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rt); rt = setTimeout(renderAll, 150); });
})();
