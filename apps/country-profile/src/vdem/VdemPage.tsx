import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import "../research/research.css";
import "./vdem.css";
import { GL_PALETTE } from "../lib/glTokens";
import { Ctrl, MethodBlock, Seg } from "../research/components/ui";
import {
  KIND_LABEL, TRANSFORM_LABEL, VARTYPE_LABEL, fmt, isDiscrete, labelFor, onResponseScale, quantile, selectableVersions,
  shortLabel, transform, useIndex, useVar, versionLabel,
  type Index, type Kind, type Transform, type VarData, type VarMeta,
} from "./data";
import {
  CAT_COLORS, CategoryStrip, DistOverTime, Histogram, OptionBars, OptionHeat, TimeChart, VersionScatter, seqColor,
  type AxisCats, type Marker, type Obs, type Series,
} from "./charts";

// /vdem: the whole V-Dem country-year file, one variable at a time, with its
// codebook entry. Not linked from the profile tool's shell, like /research.
// Built from public/vdem-codebook/ (scripts/export_vdem_codebook.R).

const DEFAULT_TAG = "v2pepwrsoc";
const DEFAULT_COUNTRIES = ["PAK", "KEN", "IND"];

const KIND_FILTERS: { value: "all" | Kind | "index"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ordinal", label: "Expert-coded" },
  { value: "continuous", label: "Continuous" },
  { value: "binary", label: "Binary" },
  { value: "ordinal_raw", label: "Discrete" },
  { value: "nominal", label: "Nominal" },
  { value: "multi", label: "Multiple selection" },
];

export function VdemPage() {
  const { index, error } = useIndex();
  const [params, setParams] = useSearchParams();
  const tag = params.get("v") ?? DEFAULT_TAG;
  const countries = (params.get("c") ?? DEFAULT_COUNTRIES.join(",")).split(",").filter(Boolean);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    document.title = "V-Dem codebook explorer";
    const id = "rs-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div className="rs vx">
      <header className="masthead">
        <div>
          <h1>V-Dem codebook explorer</h1>
          <p className="standfirst">
            Every variable in the V-Dem country-year file, with its codebook entry and its data. For each one the page shows the selected countries over time, the spread of all countries in one year, and every country-year since coding began. Expert-coded variables can be read in each version V-Dem publishes, from the coders' raw mean to the measurement-model estimate, and any version can be shown as coded, as a z-score or as a percentile.
          </p>
        </div>
      </header>
      {error && <p className="note">Could not load the codebook index: {error.message}. Run scripts/export_vdem_codebook.R to rebuild public/vdem-codebook/.</p>}
      {!index && !error && <p className="loading">Loading the codebook…</p>}
      {index && (
        <div className="vx-layout">
          <VarList index={index} tag={tag} onPick={(t) => set({ v: t, ver: null, t: null })} />
          <VarView index={index} tag={tag} countries={countries} params={params} set={set} />
        </div>
      )}
      <footer className="colophon">
        Source: {index?.source ?? "V-Dem"}. Exported {index?.built}. Countries are keyed by V-Dem's own country codes and include historical units. Pipeline: apps/country-profile/scripts/export_vdem_codebook.R. The codebook text is V-Dem's; category assignments for variables the codebook leaves uncategorised follow the tag prefix.
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function VarList({ index, tag, onPick }: { index: Index; tag: string; onPick: (t: string) => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]["value"]>("all");
  const [cat, setCat] = useState("all");
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".vx-item.is-active");
    const box = el?.closest<HTMLElement>(".vx-list");
    if (el && box) box.scrollTop = el.offsetTop - box.offsetTop - box.clientHeight / 3;
  }, [tag]);
  const ql = q.trim().toLowerCase();
  const hits = index.variables.filter((v) =>
    (kind === "all" || v.kind === kind) && (cat === "all" || v.category === cat) &&
    (!ql || v.tag.toLowerCase().includes(ql) || v.name.toLowerCase().includes(ql) || (v.question ?? "").toLowerCase().includes(ql)));
  const groups = index.categories.map((c) => ({ c, vs: hits.filter((v) => v.category === c) })).filter((g) => g.vs.length);
  return (
    <aside className="vx-side">
      <input type="search" className="vx-search" placeholder="Search tag, name or question" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="vx-side-filters">
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind of variable">
          {KIND_FILTERS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {index.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="stat">{hits.length} of {index.variables.length} variables</div>
      <div className="vx-list">
        {groups.map((g) => (
          <Fragment key={g.c}>
            <div className="vx-list-cat">{g.c} <span className="dim">{g.vs.length}</span></div>
            {g.vs.map((v) => (
              <button key={v.tag} type="button" className={`vx-item${v.tag === tag ? " is-active" : ""}`} onClick={() => onPick(v.tag)}>
                <span className="vx-item-name">{v.name}</span>
                <span className="vx-item-tag">{v.tag}<span className={`vx-badge k-${v.kind}`}>{KIND_LABEL[v.kind]}</span></span>
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function VarView({ index, tag, countries, params, set }: {
  index: Index; tag: string; countries: string[]; params: URLSearchParams; set: (p: Record<string, string | null>) => void;
}) {
  const { data, error, loading } = useVar(index, tag);
  const meta = index.variables.find((v) => v.tag === tag);
  if (!meta) return <main className="vx-main"><p className="note">No variable called {tag}.</p></main>;
  return (
    <main className="vx-main">
      <Codebook index={index} meta={meta} data={data} onPick={(t) => set({ v: t, ver: null, t: null })} />
      {error && <p className="note">Could not load {tag}: {error.message}</p>}
      {loading && !data && <p className="loading">Loading the series…</p>}
      {data && data.meta.tag === tag && <Panels index={index} data={data} countries={countries} params={params} set={set} />}
    </main>
  );
}

const TAG_RE = /\b((?:v[23]|e_)[A-Za-z0-9_]+)\b/g;

function Linked({ text, index, onPick, self }: { text: string; index: Index; onPick: (t: string) => void; self: string }) {
  const tags = useMemo(() => new Set(index.variables.map((v) => v.tag)), [index]);
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const t = m[1], i = m.index ?? 0;
    if (!tags.has(t) || t === self) continue;
    out.push(text.slice(last, i));
    out.push(<button key={i} type="button" className="vx-taglink" onClick={() => onPick(t)}>{t}</button>);
    last = i + t.length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function Codebook({ index, meta, data, onPick }: { index: Index; meta: VarMeta; data?: VarData; onPick: (t: string) => void }) {
  const f = data?.meta.tag === meta.tag ? data.file : undefined;
  const sameList = meta.rkey ? index.variables.filter((v) => v.rkey === meta.rkey && v.tag !== meta.tag) : [];
  const L = (s?: string | null) => (s ? <Linked text={s} index={index} onPick={onPick} self={meta.tag} /> : null);
  return (
    <section className="vx-card">
      <div className="vx-card-head">
        <h2>{meta.name}</h2>
        <code className="vx-code">{meta.tag}</code>
      </div>
      <div className="vx-facts">
        <span>{meta.category}</span>
        <span>{VARTYPE_LABEL[meta.vartype] ?? meta.vartype}</span>
        <span>{KIND_LABEL[meta.kind]}</span>
        <span>{meta.n_countries} countries · {meta.y0}–{meta.y1} · {meta.n_obs.toLocaleString()} country-years</span>
      </div>
      {meta.question && <p className="vx-question">{L(meta.question)}</p>}
      {f?.clarification && <p className="vx-clar">{L(f.clarification)}</p>}
      {f && (f.responses?.length ? (
        <ol className="vx-resp">
          {f.responses.map((r) => (
            <li key={r.v}><span className="vx-resp-v">{r.v}</span><span>{r.label}</span></li>
          ))}
        </ol>
      ) : f.responses_raw ? <p className="vx-clar"><b>Responses:</b> {L(f.responses_raw)}</p> : null)}
      <dl className="vx-dl">
        {meta.scale && <><dt>Scale</dt><dd>{meta.scale}</dd></>}
        {f?.crosscoder && <><dt>Across coders</dt><dd>{L(f.crosscoder)}</dd></>}
        {f?.cy_aggregation && <><dt>Within a year</dt><dd>{f.cy_aggregation}</dd></>}
        {f?.notes && <><dt>Notes</dt><dd>{L(f.notes)}</dd></>}
        {f?.convergence && <><dt>Convergence</dt><dd>{f.convergence}</dd></>}
        {f?.pm && <><dt>Project manager</dt><dd>{f.pm}</dd></>}
        {f?.release && <><dt>Releases</dt><dd>{f.release}</dd></>}
        {sameList.length > 0 && <><dt>Same response list</dt><dd className="vx-sibs">{sameList.map((v) => (
          <button key={v.tag} type="button" className="vx-taglink" onClick={() => onPick(v.tag)} title={v.name}>{v.tag}</button>
        ))}</dd></>}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------

const VERSION_NOTE: Record<string, string> = {
  point: "The measurement model's estimate. For expert-coded (C) variables this is on the model's latent scale: unbounded, centred near zero across all country-years, with coders weighted by estimated reliability and adjusted for how each uses the scale. Most V-Dem work uses this version. The band is the 68% interval.",
  osp: "The model estimate mapped back onto the response scale, so 2.4 reads as between options 2 and 3. Continuous; the band is its 68% interval.",
  ord: "The response option the model estimate falls in: the most likely category, as an integer.",
  mean: "The plain average of the coders' answers, before the model. Not adjusted for differences between coders.",
  nr: "How many coders rated this country-year. Few coders mean wide intervals.",
};

const TRANSFORM_NOTE: Record<Transform, string> = {
  raw: "Values as published for the version chosen above.",
  zpool: "Subtract the mean and divide by the standard deviation of every country-year in the data. A country's movement over time is kept.",
  zyear: "Subtract that year's mean across countries and divide by that year's standard deviation. Shows position relative to the world in each year; a global trend is removed.",
  pctyear: "The share of countries with a lower value that year, from 0 to 100, ties counted at half.",
};

function versionNote(meta: VarMeta, v: string): string {
  if (meta.kind === "multi") return "Share of coders who ticked this option, from 0 to 1. Each option is a separate column in V-Dem.";
  if (v === "point" && meta.kind === "nominal") return meta.vartype === "C"
    ? "The modal answer across coders, as a category code; the codebook's cross-coder rule above says how ties are broken."
    : "The coded category.";
  if (v === "point" && meta.vartype !== "C") return "The series as published. For derived (D) indices the band, where shown, is the 68% interval V-Dem reports.";
  return VERSION_NOTE[v] ?? "";
}

function Panels({ index, data, countries, params, set }: {
  index: Index; data: VarData; countries: string[]; params: URLSearchParams; set: (p: Record<string, string | null>) => void;
}) {
  const meta = data.meta;
  const versions = selectableVersions(meta);
  const version = versions.includes(params.get("ver") ?? "") ? params.get("ver")! : versions[0];
  const nominal = meta.kind === "nominal" && version === "point";
  const tRaw = (params.get("t") ?? "raw") as Transform;
  const t: Transform = nominal ? "raw" : tRaw;
  const discrete = isDiscrete(meta, version) && t === "raw";

  const windows = [meta.y0, 1900, 1960].filter((y, i, a) => y >= meta.y0 && y < meta.y1 && a.indexOf(y) === i).sort((a, b) => a - b);
  const from = Number(params.get("from")) || Math.max(meta.y0, 1900);
  const wy0 = windows.includes(from) ? from : windows[0] ?? meta.y0;
  const year = clampYear(Number(params.get("y")) || meta.y1, wy0, meta.y1);

  const tr = useMemo(() => transform(data, version, t), [data, version, t]);
  const nameOf = useMemo(() => new Map(index.countries.map((c) => [c.iso, c.name])), [index]);
  const colorOf = (i: number) => GL_PALETTE[i % GL_PALETTE.length];

  const years = data.years.filter((y) => y >= wy0);
  const off = wy0 - data.y0;
  const sel = countries.filter((c) => tr.values.has(c) || nameOf.has(c));
  const series: Series[] = sel.map((iso, i) => {
    const a = tr.values.get(iso);
    return {
      iso, name: nameOf.get(iso) ?? iso, color: colorOf(i),
      values: a ? a.subarray(off) : new Float64Array(years.length).fill(NaN),
      lo: tr.lo?.get(iso)?.subarray(off), hi: tr.hi?.get(iso)?.subarray(off),
    };
  });

  // Categories for discrete axes and the response-scale annotations.
  const resp = data.file.responses ?? [];
  const catsAll: AxisCats = useMemo(() => {
    const seen = new Set<number>();
    for (const a of tr.values.values()) for (const v of a) if (!Number.isNaN(v)) seen.add(v);
    if (!discrete) return [];
    const vals = Array.from(seen).sort((a, b) => a - b);
    const base = resp.length ? resp.map((r) => r.v) : [];
    const merged = Array.from(new Set([...base, ...vals])).sort((a, b) => a - b);
    return merged.map((v) => ({ v, label: labelFor(data.file, v) ?? String(v) }));
  }, [tr, discrete, resp, data.file]);
  const respCats: AxisCats | null = discrete ? catsAll : t === "raw" && onResponseScale(meta, version) && resp.length ? resp.map((r) => ({ v: r.v, label: r.label })) : null;
  const catColor = (v: number) => {
    const i = catsAll.findIndex((c) => c.v === v);
    return meta.kind === "nominal" ? CAT_COLORS[i % CAT_COLORS.length] : seqColor(i, catsAll.length);
  };

  // Domain over the whole window, so axes hold still as the year moves.
  const domain = useMemo<[number, number]>(() => {
    let a = Infinity, b = -Infinity;
    const scan = (m?: Map<string, Float64Array>) => m?.forEach((arr) => { for (let i = off; i < arr.length; i++) { const v = arr[i]; if (!Number.isNaN(v)) { if (v < a) a = v; if (v > b) b = v; } } });
    scan(tr.values); scan(tr.lo); scan(tr.hi);
    if (respCats?.length) { a = Math.min(a, respCats[0].v); b = Math.max(b, respCats[respCats.length - 1].v); }
    return Number.isFinite(a) ? [a, b] : [0, 1];
  }, [tr, off, respCats]);

  const yi = year - data.y0;
  const yearObs: Obs[] = [];
  for (const [iso, a] of tr.values) if (!Number.isNaN(a[yi])) yearObs.push({ iso, name: nameOf.get(iso) ?? iso, v: a[yi] });
  const markers: Marker[] = series.flatMap((s) => (Number.isNaN(s.values[year - wy0]) ? [] : [{ iso: s.iso, name: s.name, color: s.color, v: s.values[year - wy0] }]));

  const pooled: Obs[] = [];
  for (const [iso, a] of tr.values) for (let i = off; i < a.length; i++) if (!Number.isNaN(a[i])) pooled.push({ iso, name: "", v: a[i] });
  const pv = pooled.map((o) => o.v).sort((a, b) => a - b);
  const pmu = pv.reduce((s, v) => s + v, 0) / Math.max(1, pv.length);
  const psd = Math.sqrt(pv.reduce((s, v) => s + (v - pmu) ** 2, 0) / Math.max(1, pv.length - 1));

  const addCountry = (iso: string) => { if (!countries.includes(iso)) set({ c: [...countries, iso].join(",") }); };
  const removeCountry = (iso: string) => set({ c: countries.filter((c) => c !== iso).join(",") });

  const vlab = versionLabel(meta, version);
  const unitLabel = t === "raw" ? vlab : `${vlab}, ${TRANSFORM_LABEL[t].toLowerCase()}`;

  return (
    <>
      <section className="vx-controls">
        <Ctrl label={meta.kind === "multi" ? "Option" : "Version"}>
          {meta.kind === "multi" ? (
            <select value={version} onChange={(e) => set({ ver: e.target.value })} className="vx-opt">
              {versions.map((v) => <option key={v} value={v}>{v}: {versionLabel(meta, v)}</option>)}
            </select>
          ) : (
            <Seg value={version} options={versions.map((v) => ({ value: v, label: versionLabel(meta, v) }))} onChange={(v) => set({ ver: v })} />
          )}
        </Ctrl>
        <Ctrl label="Shown as">
          <Seg value={t} options={(Object.keys(TRANSFORM_LABEL) as Transform[]).map((k) => ({ value: k, label: TRANSFORM_LABEL[k] }))} onChange={(v) => set({ t: v === "raw" ? null : v })} disabled={nominal} />
        </Ctrl>
        {windows.length > 1 && (
          <Ctrl label="From">
            <Seg value={wy0} options={windows.map((w) => ({ value: w, label: String(w) }))} onChange={(v) => set({ from: String(v) })} />
          </Ctrl>
        )}
        <p className="vx-explain">
          <b>{vlab}.</b> {versionNote(meta, version)}{" "}
          {nominal ? <span>These are unordered categories, so z-scores and percentiles are not offered: the numbers are codes, not amounts.</span> : <span><b>{TRANSFORM_LABEL[t]}.</b> {TRANSFORM_NOTE[t]}</span>}
        </p>
        <CountryPicker index={index} countries={countries} colorOf={colorOf} nameOf={nameOf} onAdd={addCountry} onRemove={removeCountry} has={(iso) => tr.values.has(iso)} />
      </section>

      <section className="section">
        <h3>Selected countries over time</h3>
        <p className="caption">{unitLabel}. Click the chart to move the year used below ({year}).{tr.lo && !nominal ? " Shaded bands: 68% intervals." : ""}</p>
        {nominal ? (
          <>
            <CategoryStrip years={years} series={series} cats={catsAll} colorOf={catColor} year={year} onYear={(y) => set({ y: String(y) })} />
            <CatLegend cats={catsAll} colorOf={catColor} />
          </>
        ) : (
          <TimeChart years={years} series={series} domain={domain} cats={respCats} t={t} year={year} onYear={(y) => set({ y: String(y) })} />
        )}
      </section>

      {meta.kind === "multi" && <MultiPanels data={data} countries={series} year={year} wy0={wy0} nameOf={nameOf} set={set} />}

      <section className="section">
        <div className="vx-yearbar">
          <h3>All countries in {year}</h3>
          <input type="range" min={wy0} max={meta.y1} value={year} onChange={(e) => set({ y: e.target.value })} aria-label="Year" />
        </div>
        <p className="caption">{yearObs.length} countries have a value in {year}. Hover over a bar for the countries in it; the lines mark the selected countries.</p>
        <Histogram obs={yearObs} domain={domain} cats={discrete ? catsAll : null} discrete={discrete} markers={markers} t={t} catColor={discrete ? catColor : undefined} />
      </section>

      <section className="section">
        <h3>All countries, every year</h3>
        <p className="caption">
          {discrete
            ? "Share of countries in each category, year by year."
            : "Grey bands: the 10th to 90th and 25th to 75th percentiles across countries in each year, with the median. Coloured lines: the selected countries."}{" "}
          Click to move the year.
        </p>
        <DistOverTime years={years} all={Array.from(tr.values.values()).map((a) => a.subarray(off))} series={series} domain={domain} cats={discrete ? catsAll : null}
          discrete={discrete} colorOf={catColor} t={t} year={year} onYear={(y) => set({ y: String(y) })} />
        {discrete && <CatLegend cats={catsAll} colorOf={catColor} />}
        <h3>Pooled distribution, {wy0}–{meta.y1}</h3>
        <p className="caption">
          All {pooled.length.toLocaleString()} country-years in the window. {nominal ? "" : `Mean ${fmt(pmu, t)}, standard deviation ${fmt(psd, t)}, median ${fmt(quantile(pv, 0.5), t)}. `}
          The lines mark the selected countries in {year}. This is the distribution a pooled z-score standardises against.
        </p>
        <Histogram obs={pooled} domain={domain} cats={discrete ? catsAll : null} discrete={discrete} markers={markers} t={t} unit="country-years"
          refLines={discrete ? undefined : [{ v: pmu, label: "mean" }, { v: pmu - psd, label: "−1 SD" }, { v: pmu + psd, label: "+1 SD" }]} catColor={discrete ? catColor : undefined} />
      </section>

      {meta.versions.includes("mean") && meta.versions.includes("point") && (
        <VersionsCompare data={data} year={year} series={series} nameOf={nameOf} resp={resp.length ? resp.map((r) => ({ v: r.v, label: r.label })) : null} />
      )}

      <RankTable data={data} tr={tr} year={year} t={t} version={version} selected={countries} nameOf={nameOf} colorOf={(iso) => series.find((s) => s.iso === iso)?.color}
        onAdd={addCountry} nominal={nominal} />

      <MethodBlock title="How V-Dem's versions relate" summary="Coders, the measurement model, and what each column is">
        <p>Expert-coded (C) variables are answered by several country experts per country-year, usually five or more, each choosing one of the response options listed above. V-Dem publishes the answers in several forms.</p>
        <ul>
          <li><b>Coder mean</b> (<code>_mean</code>) is the average of those answers. It is on the response scale but treats every coder alike.</li>
          <li><b>Model estimate</b> (no suffix) comes from a Bayesian item-response model that estimates each coder's reliability and their thresholds between options (one coder's "2" may be another's "3"), using bridge and lateral coders who rate several countries to put countries on one scale. The result is a latent score with no fixed range, near zero on average across all country-years. Intervals (<code>_codelow</code>, <code>_codehigh</code>) cover the central 68% of the posterior.</li>
          <li><b>Original scale</b> (<code>_osp</code>) maps the latent score back onto the 0 to K range of the response options, using the estimated thresholds. It is continuous.</li>
          <li><b>Ordinal category</b> (<code>_ord</code>) rounds that to the most likely option.</li>
          <li><b>Number of coders</b> (<code>_nr</code>).</li>
        </ul>
        <p>Indices (D) aggregate several components and are mostly on 0 to 1. Factual (A) variables are coded by research assistants from documents. Multiple-selection questions ("check all that apply") have one column per option, each the share of coders who ticked it. Nominal questions such as the most important regime support group report the modal answer as a category code; the numbers carry no order.</p>
        <p>The z-scores and percentiles on this page are computed in the browser from whichever version is selected. A pooled z-score is a linear rescaling of the series, so it does not change the shape of any chart; it changes the axis. A within-year z-score or percentile does change the picture, since it removes movements shared by all countries.</p>
      </MethodBlock>
    </>
  );
}

function clampYear(y: number, a: number, b: number) { return Math.min(b, Math.max(a, Math.round(y))); }

function CatLegend({ cats, colorOf }: { cats: AxisCats; colorOf: (v: number) => string }) {
  return (
    <div className="vx-legend">
      {cats.map((c) => <span key={c.v}><span className="swatch" style={{ background: colorOf(c.v) }} />{c.v}: {shortLabel(c.label, 60)}</span>)}
    </div>
  );
}

function CountryPicker({ index, countries, colorOf, nameOf, onAdd, onRemove, has }: {
  index: Index; countries: string[]; colorOf: (i: number) => string; nameOf: Map<string, string>;
  onAdd: (iso: string) => void; onRemove: (iso: string) => void; has: (iso: string) => boolean;
}) {
  const [q, setQ] = useState("");
  const pick = (s: string) => {
    const hit = index.countries.find((c) => c.name.toLowerCase() === s.toLowerCase() || c.iso.toLowerCase() === s.toLowerCase());
    if (hit) { onAdd(hit.iso); setQ(""); }
  };
  return (
    <div className="vx-picker">
      <span className="ctrl-label">Countries</span>
      <div className="chips">
        {countries.map((iso, i) => (
          <span key={iso} className="vx-chip" style={{ borderColor: colorOf(i) }} title={has(iso) ? undefined : "No data for this variable"}>
            <span className="vx-dot" style={{ background: colorOf(i) }} />{nameOf.get(iso) ?? iso}{!has(iso) && <span className="dim"> (no data)</span>}
            <button type="button" onClick={() => onRemove(iso)} aria-label={`Remove ${nameOf.get(iso) ?? iso}`}>×</button>
          </span>
        ))}
        <input type="text" list="vx-countries" value={q} placeholder="Add a country" onChange={(e) => { setQ(e.target.value); if (index.countries.some((c) => c.name === e.target.value)) pick(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") pick(q); }} />
        <datalist id="vx-countries">{index.countries.map((c) => <option key={c.iso} value={c.name} />)}</datalist>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MultiPanels({ data, countries, year, wy0, nameOf, set }: {
  data: VarData; countries: Series[]; year: number; wy0: number; nameOf: Map<string, string>; set: (p: Record<string, string | null>) => void;
}) {
  const options = data.meta.options ?? [];
  const [focus, setFocus] = useState<string | null>(null);
  const who = countries.find((c) => c.iso === focus) ?? countries[0];
  const yi = year - data.y0;
  const rows = options.map((o) => {
    const shares: Obs[] = [];
    for (const iso of data.isos) { const v = data.get(o.k, iso)?.[yi]; if (v != null && !Number.isNaN(v)) shares.push({ iso, name: nameOf.get(iso) ?? iso, v }); }
    return { k: o.k, shares };
  });
  const markers = countries.map((c) => ({ iso: c.iso, name: c.name, color: c.color, shares: Object.fromEntries(options.map((o) => [o.k, data.get(o.k, c.iso)?.[yi] ?? NaN])) }));
  return (
    <section className="section">
      <h3>All options for one country</h3>
      <p className="caption">Each row is one option; darker cells mean a larger share of coders ticked it that year. Click a cell to move the year.</p>
      {countries.length > 1 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {countries.map((c) => <button key={c.iso} type="button" className={`chip${c.iso === who?.iso ? " is-active" : ""}`} onClick={() => setFocus(c.iso)}>{c.name}</button>)}
        </div>
      )}
      {who ? <OptionHeat years={data.years.filter((y) => y >= wy0)} options={options} get={(k) => data.get(k, who.iso)?.subarray(wy0 - data.y0)} year={year} onYear={(y) => set({ y: String(y) })} />
        : <p className="stat">Add a country to see its options.</p>}
      <h3>All options, all countries in {year}</h3>
      <p className="caption">Bars: the share of countries where at least half of the coders ticked the option. Dots: the selected countries' share of coders. Hover over a bar for the countries.</p>
      <OptionBars options={options} rows={rows} markers={markers} />
    </section>
  );
}

function VersionsCompare({ data, year, series, nameOf, resp }: { data: VarData; year: number; series: Series[]; nameOf: Map<string, string>; resp: AxisCats | null }) {
  const yi = year - data.y0;
  const pts = data.isos.flatMap((iso) => {
    const x = data.get("mean", iso)?.[yi], y = data.get("point", iso)?.[yi];
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return [];
    return [{ iso, name: nameOf.get(iso) ?? iso, x, y, color: series.find((s) => s.iso === iso)?.color }];
  });
  const pts2 = data.meta.versions.includes("osp") ? data.isos.flatMap((iso) => {
    const x = data.get("mean", iso)?.[yi], y = data.get("osp", iso)?.[yi];
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return [];
    return [{ iso, name: nameOf.get(iso) ?? iso, x, y, color: series.find((s) => s.iso === iso)?.color }];
  }) : [];
  return (
    <section className="section">
      <h3>The coders' mean against the model, {year}</h3>
      <p className="caption">One dot per country. Where the model and the raw mean disagree, the model has adjusted for the particular coders (their reliability and how they use the scale). Countries off the main curve are where that adjustment matters.</p>
      <div className="row">
        <div className="col"><VersionScatter pts={pts} xLabel="Coder mean" yLabel="Model estimate (latent)" cats={resp} /></div>
        {pts2.length > 0 && <div className="col"><VersionScatter pts={pts2} xLabel="Coder mean" yLabel="Original scale" cats={resp} /></div>}
      </div>
    </section>
  );
}

function RankTable({ data, tr, year, t, version, selected, nameOf, colorOf, onAdd, nominal }: {
  data: VarData; tr: ReturnType<typeof transform>; year: number; t: Transform; version: string; selected: string[];
  nameOf: Map<string, string>; colorOf: (iso: string) => string | undefined; onAdd: (iso: string) => void; nominal: boolean;
}) {
  const [q, setQ] = useState("");
  const yi = year - data.y0;
  const meta = data.meta;
  const cols = meta.kind === "multi" ? [] : meta.versions.filter((v) => v !== version || t !== "raw");
  const rows = data.isos.flatMap((iso) => {
    const v = tr.values.get(iso)?.[yi];
    return v == null || Number.isNaN(v) ? [] : [{ iso, name: nameOf.get(iso) ?? iso, v }];
  }).sort((a, b) => b.v - a.v);
  const ql = q.trim().toLowerCase();
  const shown = rows.map((r, i) => ({ ...r, rank: i + 1 })).filter((r) => !ql || r.name.toLowerCase().includes(ql));
  const pinned = shown.filter((r) => selected.includes(r.iso));
  const rest = shown.filter((r) => !selected.includes(r.iso));
  const cell = (iso: string, v: string) => fmt(data.get(v, iso)?.[yi]);
  const head = (v: string) => (v === "codelow" ? "low" : v === "codehigh" ? "high" : v === "osp_codelow" ? "osp low" : v === "osp_codehigh" ? "osp high" : versionLabel(meta, v));
  const Row = ({ r }: { r: (typeof shown)[number] }) => (
    <tr className={selected.includes(r.iso) ? "is-sel" : undefined} onClick={() => onAdd(r.iso)} title="Add to the charts">
      <td className="num">{nominal ? "" : r.rank}</td>
      <td>{colorOf(r.iso) && <span className="vx-dot" style={{ background: colorOf(r.iso) }} />}{r.name}</td>
      <td className="num"><b>{fmt(r.v, t)}</b></td>
      {nominal && <td>{shortLabel(labelFor(data.file, r.v) ?? "", 50)}</td>}
      {cols.map((v) => <td key={v} className="num">{cell(r.iso, v)}</td>)}
    </tr>
  );
  return (
    <section className="section">
      <div className="vx-yearbar">
        <h3>Ranking, {year}</h3>
        <input type="search" placeholder="Find a country" value={q} onChange={(e) => setQ(e.target.value)} className="vx-search small" />
      </div>
      <p className="caption">{nominal ? "Countries by category code." : "Highest first."} The other columns give every version V-Dem publishes for the same country-year, as coded, for comparison. Click a row to add the country to the charts.</p>
      <div className="table-wrap vx-table">
        <table>
          <thead>
            <tr>
              <th className="num">#</th><th>Country</th><th className="num">{t === "raw" ? versionLabel(meta, version) : TRANSFORM_LABEL[t]}</th>
              {nominal && <th>Category</th>}
              {cols.map((v) => <th key={v} className="num">{head(v)}</th>)}
            </tr>
          </thead>
          <tbody>
            {pinned.map((r) => <Row key={r.iso} r={r} />)}
            {pinned.length > 0 && rest.length > 0 && <tr className="vx-gap"><td colSpan={99} /></tr>}
            {rest.map((r) => <Row key={r.iso} r={r} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
