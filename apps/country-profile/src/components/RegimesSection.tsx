import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Country } from "../types";
import { GL } from "../lib/glTokens";
import {
  useRegimes,
  type Regime,
  type RegimeCountry,
  type RegimeMeta,
  type RegimeYear,
} from "../lib/useRegimes";

// V-Dem's regime survey: for each regime (a run of years with one v2regidnr),
// the size of the groups backing and opposing it, who those groups are, who
// held office, and which group holds each of five single-group roles. Ported
// from the regime explorer in analyses/polsett-proxies/khan-axes.html.

type Props = { focus: Country };

const GROUP = ["Aristocracy", "Agrarian elites", "Party elites", "Business elites", "State bureaucracy", "Military",
  "Ethnic or racial group(s)", "Religious group(s)", "Local elites and chiefs", "Urban working class",
  "Urban middle class", "Rural working class", "Rural middle class", "Foreign government"];
const FAMILIES = [
  { name: "Ruling party and state", color: GL.green, g: [2, 4, 5] },
  { name: "Economic and hereditary elites", color: GL.orange, g: [0, 1, 3] },
  { name: "Identity and local groups", color: GL.purple, g: [6, 7, 8] },
  { name: "Social classes", color: GL.yellow, g: [9, 10, 11, 12] },
  { name: "Foreign", color: GL.greyDeep, g: [13] },
];
const FAM_COLOR: Record<number, string> = {};
FAMILIES.forEach((f) => f.g.forEach((g) => (FAM_COLOR[g] = f.color)));
const SUP = GL.blue;
const OPP = GL.highlight;
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
type RoleKey = "imp" | "impo" | "pow" | "pro" | "anti";
const ROLES: { k: RoleKey; name: string; short: string; tag: string; color: string }[] = [
  { k: "imp", name: "Relied on most", short: "relied on most", tag: "v2regimpgroup", color: SUP },
  { k: "impo", name: "Most important opposition", short: "main opposition", tag: "v2regimpoppgroup", color: OPP },
  { k: "pow", name: "Most powerful over survival", short: "most powerful", tag: "v2regpower", color: GL.text },
  { k: "pro", name: "Strongest pro-regime preferences", short: "most pro-regime", tag: "v2regproreg", color: SUP },
  { k: "anti", name: "Strongest anti-regime preferences", short: "most anti-regime", tag: "v2regantireg", color: OPP },
];
const VP_GROUP = ["No specific group", "Aristocracy", "Agrarian elites", "Business elites", "Military",
  "Ethnic or racial group(s)", "Religious group(s)", "Local elites and chiefs", "Urban working class",
  "Urban middle class", "Rural working class", "Rural middle class", "Regional groups or separatists", "Women", "Other groups"];
const VP_SCALE: Record<"disa" | "ind" | "act", string[]> = {
  disa: ["almost complete disagreement among party elites; many have left", "high visible disagreement; some elites have left",
    "some visible disagreement; none have left", "negligible visible disagreement", "virtually no visible disagreement"],
  ind: ["not focused on one leader", "occasionally focused on one leader", "somewhat focused on one leader",
    "mainly focused on one leader", "solely focused on one leader"],
  act: ["negligible", "minor", "noticeable", "significant", "widespread"],
};
const RANGES = [1900, 1946, 1990];
const REG_FILL = ["#ececec", "#dcdcdc"];

/* ---------- helpers ---------- */
const band = (v: number | null) => (v == null ? 0 : Math.max(0, Math.min(4, Math.round(v))));
const mean = (a: (number | null | undefined)[]) => {
  const v = a.filter((x): x is number => x != null && isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const yrs = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v)}%`);
type Run<T> = { v: T; y0: number; y1: number };
function runs<T>(rows: RegimeYear[], f: (r: RegimeYear) => T): Run<T>[] {
  const out: Run<T>[] = [];
  for (const r of rows) {
    const v = f(r);
    const last = out[out.length - 1];
    if (last && last.v === v && last.y1 === r.y - 1) last.y1 = r.y;
    else out.push({ v, y0: r.y, y1: r.y });
  }
  return out;
}
function modal(rows: RegimeYear[], k: keyof RegimeYear): number | null {
  const cnt = new Map<number, number>();
  for (const r of rows) {
    const v = r[k];
    if (typeof v === "number") cnt.set(v, (cnt.get(v) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = 0;
  cnt.forEach((c, g) => {
    if (c > n) {
      n = c;
      best = g;
    }
  });
  return best;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(s: string | null) {
  if (!s || s === "E") return "present";
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${+m[1]} ${MONTHS[+m[2] - 1]} ${m[3]}` : s;
}
function surname(n: string) {
  const p = n.split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : n;
}
// V-Dem leaves the head-of-government name empty when the head of state also
// heads the government (v2exhoshog = 1), so the head of state stands in.
const govHead = (r: RegimeYear) => r.hog ?? r.hos;
let ctx2d: CanvasRenderingContext2D | null = null;
function fitText(t: string, w: number, px = 11) {
  if (w < 24) return "";
  ctx2d ??= document.createElement("canvas").getContext("2d");
  if (!ctx2d) return t;
  ctx2d.font = `${px}px "Source Sans 3", Inter, system-ui, sans-serif`;
  if (ctx2d.measureText(t).width <= w) return t;
  let s = t;
  while (s.length > 3 && ctx2d.measureText(s + "…").width > w) s = s.slice(0, -1);
  return s.length > 3 ? s + "…" : "";
}
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------- tooltip ---------- */
type Tip = { x: number; y: number; body: ReactNode } | null;
function TipLayer({ tip }: { tip: Tip }) {
  if (!tip) return null;
  const left = tip.x + 14 + 300 > window.innerWidth ? tip.x - 14 - 300 : tip.x + 14;
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[300px] rounded bg-gl-text px-2.5 py-2 text-xs leading-snug text-white shadow"
      style={{ left: Math.max(8, left), top: tip.y + 14 }}
    >
      {tip.body}
    </div>
  );
}

/* ---------- summary of a regime or one year ---------- */
type Summary = {
  rows: RegimeYear[];
  coded: number;
  sup: number | null; supl: number | null; suph: number | null;
  opp: number | null; oppl: number | null; opph: number | null;
  sg: (number | null)[]; og: (number | null)[]; oa: (number | null)[];
  roles: Record<RoleKey, number | null>;
  sloc: number | null; oloc: number | null;
};
function summarise(c: RegimeCountry, reg: Regime, year: number | null): Summary {
  const rows = c.rows.filter((r) => (year == null ? r.y >= reg.y0 && r.y <= reg.y1 : r.y === year));
  const coded = rows.filter((r) => r.sg);
  const avg = (k: "sg" | "og" | "oa") => GROUP.map((_, g) => mean(coded.map((r) => r[k]?.[g])));
  return {
    rows, coded: coded.length,
    sup: mean(rows.map((r) => r.sup)), supl: mean(rows.map((r) => r.supl)), suph: mean(rows.map((r) => r.suph)),
    opp: mean(rows.map((r) => r.opp)), oppl: mean(rows.map((r) => r.oppl)), opph: mean(rows.map((r) => r.opph)),
    sg: avg("sg"), og: avg("og"), oa: avg("oa"),
    roles: Object.fromEntries(ROLES.map((ro) => [ro.k, modal(rows, ro.k)])) as Record<RoleKey, number | null>,
    sloc: modal(rows, "sloc"), oloc: modal(rows, "oloc"),
  };
}

/* ---------- main section ---------- */
// A failure in this section should not take down the whole country profile.
class SectionBoundary extends Component<{ iso: string; children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError() {
    return { failed: "error" };
  }
  componentDidUpdate(prev: { iso: string }) {
    if (prev.iso !== this.props.iso && this.state.failed) this.setState({ failed: null });
  }
  render() {
    if (this.state.failed) {
      return (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Regimes, their supporters and their opponents</h2>
          <p className="mt-2 text-sm text-gl-muted">This section could not be drawn for this country.</p>
        </section>
      );
    }
    return this.props.children;
  }
}

export function RegimesSection({ focus }: Props) {
  return (
    <SectionBoundary iso={focus.iso3}>
      <RegimesInner focus={focus} />
    </SectionBoundary>
  );
}

function RegimesInner({ focus }: Props) {
  const { data, meta } = useRegimes(focus.iso3);
  const [regKey, setRegKey] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [from, setFrom] = useState(1946);
  const [tip, setTip] = useState<Tip>(null);

  useEffect(() => {
    setRegKey(null);
    setYear(null);
  }, [focus.iso3]);

  const key = (r: Regime) => `${r.id}-${r.y0}`;
  const reg = data ? data.regimes.find((r) => key(r) === regKey) ?? data.regimes[data.regimes.length - 1] : null;
  const s = useMemo(() => (data && reg ? summarise(data, reg, year) : null), [data, reg, year]);
  const show = (ev: { clientX: number; clientY: number }, body: ReactNode) => setTip({ x: ev.clientX, y: ev.clientY, body });
  const hide = () => setTip(null);
  const pick = (r: Regime, y: number | null = null) => {
    setRegKey(key(r));
    setYear(y);
  };
  const Info = ({ tag }: { tag: string }) => <InfoDot tag={tag} meta={meta} show={show} hide={hide} />;

  return (
    <section className="mt-12 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Regimes, their supporters and their opponents</h2>
        <p className="mt-1 text-sm text-gl-muted">
          V-Dem's regime survey divides each country's history into regimes, defined as the formal and informal
          rules for choosing leaders and keeping them in power. For each regime and year, country experts record
          which of fourteen social groups the regime depends on, which groups want it replaced and could under
          favourable conditions remove it, how large each set of groups is as a share of adults, and which single
          group holds each of five roles. Opposition here means opposition to the regime, not to the government: in
          a democracy, voters for an opposition party who accept the rules are not counted.
        </p>
      </div>

      {data === undefined && <p className="text-sm text-gl-muted">Loading…</p>}
      {data === null && <p className="text-sm text-gl-muted">V-Dem's regime survey does not cover {focus.name}.</p>}
      {data && reg && s && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-gl-border bg-white px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5" style={{ background: SUP }} />
              Regime support groups
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5" style={{ background: OPP }} />
              Regime opposition groups
            </span>
            <span className="text-gl-muted">Shading: measurement-model interval</span>
            <span className="ml-auto flex gap-1">
              {RANGES.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setFrom(y)}
                  className={
                    from === y
                      ? "rounded-full bg-gl-blue px-2.5 py-0.5 font-medium text-white"
                      : "rounded-full border border-gl-border px-2.5 py-0.5 text-gl-muted hover:text-gl-text"
                  }
                >
                  Since {y}
                </button>
              ))}
            </span>
          </div>

          <TimeChart data={data} reg={reg} year={year} from={from} onPick={pick} show={show} hide={hide} />
          <p className="text-xs text-gl-muted">
            Top band: regimes as V-Dem names them; click one to open it below. Middle band: heads of government (the head of state where one person holds both offices). Chart:
            estimated size of the regime's support and opposition groups as a share of adults; click a year to show
            that year alone. Regimes that began and ended within one calendar year do not appear in V-Dem's
            country-year data.
          </p>

          <div className="space-y-4 rounded border border-gl-border bg-gl-bg/60 p-4">
            <div>
              <h3 className="text-lg font-semibold">{reg.name}</h3>
              <p className="text-xs text-gl-muted">
                {fmtDate(reg.start)} – {fmtDate(reg.end)} · {reg.y1 - reg.y0 + 1} year{reg.y1 > reg.y0 ? "s" : ""} in
                V-Dem's country-year data ·{" "}
                {reg.endtype === 13 ? "still in place" : `ended by: ${(ENDTYPE[reg.endtype ?? -1] ?? "–").toLowerCase()}`}{" "}
                <Info tag="v2regendtype" />
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gl-muted">
                {year == null ? (
                  <>Showing the regime average, {yrs(reg.y0, reg.y1)}. Click a year in the chart to show that year alone.</>
                ) : (
                  <>
                    Showing {year} only.
                    <button type="button" onClick={() => setYear(null)} className="rounded-full border border-gl-border bg-white px-2 py-0.5 text-gl-text hover:border-gl-muted">
                      Show the regime average
                    </button>
                  </>
                )}
              </p>
            </div>

            <Card title="Size of the support and opposition groups">
              <SizeBars s={s} Info={Info} />
              {(s.sloc != null || s.oloc != null) && (
                <p className="text-xs text-gl-muted">
                  Where support groups are concentrated: {s.sloc == null ? "–" : LOC[s.sloc]} <Info tag="v2regsuploc" />.
                  Where opposition groups are concentrated: {s.oloc == null ? "–" : LOC[s.oloc]} <Info tag="v2regopploc" />.
                </p>
              )}
              <Narrative s={s} reg={reg} year={year} />
            </Card>

            <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
              <Card title="Who held office">
                <People data={data} reg={reg} />
              </Card>
              <Card title="Single-group roles">
                <Roles data={data} reg={reg} s={s} year={year} Info={Info} />
              </Card>
            </div>

            <Card title="Governing party and its cohesion">
              <Parties data={data} reg={reg} Info={Info} show={show} hide={hide} />
            </Card>

            <Card title="Who the groups are">
              {s.coded ? <Groups s={s} Info={Info} /> : <p className="text-sm text-gl-muted">Not coded for this {year == null ? "regime" : "year"}.</p>}
              <p className="text-xs text-gl-muted">
                Bars give the share of country experts naming each group: as one the regime relies on (left), as one
                containing noteworthy opposition (right, upper bar), and as one actively mobilising against the regime
                in the year (right, lower bar). The last two are separate questions, so the active share can exceed the
                noteworthy share. Tags mark the group named for each single-group role; colour squares mark the group
                family.
              </p>
            </Card>

            {reg.y1 > reg.y0 && (
              <Card title="Roles over the regime's life">
                <RoleStrip data={data} reg={reg} year={year} show={show} hide={hide} />
              </Card>
            )}
          </div>
        </>
      )}
      <TipLayer tip={tip} />
    </section>
  );
}

type ShowFn = (ev: { clientX: number; clientY: number }, body: ReactNode) => void;
type InfoFn = (p: { tag: string }) => ReactNode;

function InfoDot({ tag, meta, show, hide }: { tag: string; meta: RegimeMeta | null; show: ShowFn; hide: () => void }) {
  const d = meta?.docs[tag];
  if (!d) return null;
  const body = (
    <>
      <b>{d.name}</b> <span className="opacity-70">{tag}</span>
      <br />
      {d.question}
    </>
  );
  return (
    <button
      type="button"
      aria-label={`What V-Dem asks: ${d.name}`}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gl-muted align-[1px] text-[10px] font-semibold leading-none text-gl-muted hover:border-gl-blue hover:text-gl-blue"
      onMouseMove={(e) => show(e, body)}
      onMouseLeave={hide}
      onFocus={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        show({ clientX: r.right, clientY: r.bottom }, body);
      }}
      onBlur={hide}
    >
      ?
    </button>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3 rounded border border-gl-border bg-white p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gl-muted">{title}</h4>
      {children}
    </div>
  );
}

/* ---------- timeline ---------- */
function TimeChart({ data, reg, year, from: fromPref, onPick, show, hide }: {
  data: RegimeCountry; reg: Regime; year: number | null; from: number;
  onPick: (r: Regime, y?: number | null) => void; show: ShowFn; hide: () => void;
}) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const from = Math.max(fromPref, data.y0);
  const to = data.y0 + data.rows.length - 1;
  const rows = data.rows.filter((r) => r.y >= from);
  const regs = data.regimes.filter((r) => r.y1 >= from);
  const m = { l: 140, r: 12 };
  const regH = 32, hosH = 22, gap = 6, chartT = regH + hosH + gap * 2 + 6, chartH = 180, H = chartT + chartH + 26;
  const x = (y: number) => m.l + ((y - from) / (to + 1 - from)) * (W - m.l - m.r);
  const xInv = (px: number) => from + ((px - m.l) / (W - m.l - m.r)) * (to + 1 - from);
  const y = (v: number) => chartT + chartH - (v / 4) * (chartH - 8);
  const isSel = (r: Regime) => r.id === reg.id && r.y0 === reg.y0;
  const hos = runs(rows, govHead).filter((h) => h.v);
  const step = Math.max(5, Math.ceil((to - from) / Math.max(3, Math.floor((W - m.l) / 60)) / 5) * 5);
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);

  const line = (k: "sup" | "opp") => {
    let d = "";
    let pen = false;
    for (const r of rows) {
      const v = r[k];
      if (v == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${x(r.y + 0.5).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const area = (lo: "supl" | "oppl", hi: "suph" | "opph") => {
    const segs: RegimeYear[][] = [];
    let cur: RegimeYear[] = [];
    for (const r of rows) {
      if (r[lo] == null || r[hi] == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(r);
    }
    if (cur.length) segs.push(cur);
    return segs.map((sg) =>
      "M" + sg.map((r) => `${x(r.y + 0.5).toFixed(1)},${y(r[hi]!).toFixed(1)}`).join("L") +
      "L" + [...sg].reverse().map((r) => `${x(r.y + 0.5).toFixed(1)},${y(r[lo]!).toFixed(1)}`).join("L") + "Z").join("");
  };
  const rowAt = (px: number) => {
    const yr = Math.floor(xInv(px));
    return rows.find((q) => q.y === yr) ?? null;
  };
  const regOf = (r: RegimeYear) => data.regimes.find((q) => q.id === r.rid && r.y >= q.y0 && r.y <= q.y1);

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img"
        aria-label={`${data.name}: regimes, heads of government, and the size of regime support and opposition groups`}>
        <g fontSize={12} fill={GL.text}>
          <text x={m.l - 8} y={regH / 2 + 4} textAnchor="end" fontWeight={600}>Regime</text>
          <text x={m.l - 8} y={regH + gap + hosH / 2 + 4} textAnchor="end" fontWeight={600}>Head of government</text>
        </g>
        {regs.map((r, i) => {
          const x0 = x(Math.max(r.y0, from)), x1 = x(r.y1 + 1), sel = isSel(r);
          const label = fitText(r.name, x1 - x0 - 10, 12);
          return (
            <g key={`${r.id}-${r.y0}`} role="button" tabIndex={0} aria-label={`${r.name}, ${yrs(r.y0, r.y1)}`}
              className="cursor-pointer" onClick={() => onPick(r)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r); } }}
              onMouseMove={(e) => show(e, <><b>{r.name}</b><br />{fmtDate(r.start)} – {fmtDate(r.end)}<br /><span className="opacity-75">Ended by: {ENDTYPE[r.endtype ?? -1] ?? "–"}</span></>)}
              onMouseLeave={hide}>
              <rect x={x0 + 1} width={Math.max(1, x1 - x0 - 2)} height={regH} rx={3} fill={sel ? GL.text : REG_FILL[i % 2]} />
              {label && <text x={x0 + 6} y={regH / 2 + 4} fontSize={12} fill={sel ? "#fff" : GL.text} fontWeight={sel ? 600 : 400} pointerEvents="none">{label}</text>}
            </g>
          );
        })}
        <g transform={`translate(0,${regH + gap})`}>
          {hos.map((h, i) => {
            const x0 = x(h.y0), x1 = x(h.y1 + 1), r0 = rows.find((r) => r.y === h.y0);
            const label = fitText(surname(h.v!), x1 - x0 - 6, 11);
            return (
              <g key={`${h.y0}`} onMouseLeave={hide}
                onMouseMove={(e) => show(e, r0?.hog ? (
                  <><b>{h.v}</b><br />Head of government, {yrs(h.y0, h.y1)}{r0.hos && <><br /><span className="opacity-75">Head of state: {r0.hos}</span></>}</>
                ) : (
                  <><b>{h.v}</b><br />Head of state and government, {yrs(h.y0, h.y1)}{r0?.hosp && <><br />{r0.hosp}</>}{r0?.path != null && <><br /><span className="opacity-75">Reached office by {PATH[r0.path]}</span></>}</>
                ))}>
                <rect x={x0 + 0.5} width={Math.max(1, x1 - x0 - 1)} height={hosH} rx={2} fill={REG_FILL[i % 2]} />
                {label && <text x={x0 + 4} y={hosH / 2 + 4} fontSize={11} fill={GL.text} pointerEvents="none">{label}</text>}
              </g>
            );
          })}
        </g>
        {/* size chart */}
        <rect x={x(Math.max(reg.y0, from))} width={Math.max(0, x(reg.y1 + 1) - x(Math.max(reg.y0, from)))} y={chartT} height={chartH} fill={GL.bg} />
        {SIZE_BAND.map((b, i) => (
          <g key={b}>
            <line x1={m.l} x2={W - m.r} y1={y(i)} y2={y(i)} stroke={GL.border} />
            <text x={m.l - 8} y={y(i) + 4} textAnchor="end" fontSize={11} fill={GL.muted}>{b}</text>
          </g>
        ))}
        {regs.filter((r) => r.y0 > from).map((r) => (
          <line key={`b${r.id}-${r.y0}`} x1={x(r.y0)} x2={x(r.y0)} y1={0} y2={chartT + chartH} stroke={GL.muted} strokeWidth={1} />
        ))}
        {ticks.map((t) => <text key={t} x={x(t + 0.5)} y={chartT + chartH + 18} textAnchor="middle" fontSize={11} fill={GL.muted}>{t}</text>)}
        <path d={area("supl", "suph")} fill={SUP} fillOpacity={0.12} />
        <path d={area("oppl", "opph")} fill={OPP} fillOpacity={0.12} />
        <path d={line("sup")} fill="none" stroke={SUP} strokeWidth={2} />
        <path d={line("opp")} fill="none" stroke={OPP} strokeWidth={2} />
        {hover != null && <line x1={x(hover + 0.5)} x2={x(hover + 0.5)} y1={chartT} y2={chartT + chartH} stroke={GL.muted} />}
        {year != null && year >= from && <line x1={x(year + 0.5)} x2={x(year + 0.5)} y1={chartT} y2={chartT + chartH} stroke={GL.text} strokeWidth={2} />}
        <rect x={m.l} width={W - m.l - m.r} y={chartT} height={chartH} fill="transparent" className="cursor-pointer"
          onMouseMove={(e) => {
            const px = e.clientX - e.currentTarget.getBoundingClientRect().left + m.l;
            const r = rowAt(px);
            if (!r) return;
            setHover(r.y);
            const rg = regOf(r);
            show(e, (
              <>
                <b>{r.y}</b>{rg && ` · ${rg.name}`}{govHead(r) && <><br />{govHead(r)}{r.hog ? " (head of government)" : ""}</>}
                {r.int === 0 ? <><br />Interregnum: no identifiable regime</> : (
                  <>
                    <br />Support groups: {r.sup == null ? "–" : SIZE_BAND[band(r.sup)]} <span className="opacity-75">({r.sup?.toFixed(2) ?? "–"})</span>
                    <br />Opposition groups: {r.opp == null ? "–" : SIZE_BAND[band(r.opp)]} <span className="opacity-75">({r.opp?.toFixed(2) ?? "–"})</span>
                    {r.imp != null && <><br />Relied on most: {GROUP[r.imp]}</>}
                    {r.impo != null && <><br />Main opposition: {GROUP[r.impo]}</>}
                  </>
                )}
                <br /><span className="opacity-75">Click to show this year</span>
              </>
            ));
          }}
          onMouseLeave={() => { setHover(null); hide(); }}
          onClick={(e) => {
            const px = e.clientX - e.currentTarget.getBoundingClientRect().left + m.l;
            const r = rowAt(px);
            const rg = r && regOf(r);
            if (r && rg) onPick(rg, r.y);
          }}
        />
      </svg>
    </div>
  );
}

/* ---------- detail pieces ---------- */
function SizeBars({ s, Info }: { s: Summary; Info: InfoFn }) {
  const pos = (v: number) => `${((v / 4) * 100).toFixed(2)}%`;
  const Bar = ({ v, lo, hi, color, label, tag }: { v: number | null; lo: number | null; hi: number | null; color: string; label: string; tag: string }) => (
    <>
      <div className="text-sm font-semibold">{label} <Info tag={tag} /></div>
      <div className="relative h-[26px] rounded-sm bg-gl-bg">
        {SIZE_BAND.map((_, i) => <i key={i} className="absolute inset-y-0 border-l border-gl-border" style={{ left: pos(i) }} />)}
        {v == null ? (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gl-muted">not coded</span>
        ) : (
          <>
            <i className="absolute inset-y-1 left-0 rounded-r" style={{ width: pos(v), background: color }} />
            {lo != null && hi != null && (
              <i className="absolute top-1/2 h-2.5 -translate-y-1/2 border-x-2 border-gl-text" style={{ left: pos(lo), width: pos(Math.max(0, hi - lo)) }}>
                <i className="absolute inset-x-0 top-1/2 border-t-2 border-gl-text" />
              </i>
            )}
          </>
        )}
      </div>
      <div className="text-xs leading-tight text-gl-muted">
        {v == null ? "–" : (<><b className="block text-sm text-gl-text">{SIZE_BAND[band(v)]}</b>{SIZE_NAME[band(v)]} · {v.toFixed(2)}</>)}
      </div>
    </>
  );
  return (
    <div className="grid grid-cols-1 items-center gap-x-3 gap-y-2 sm:grid-cols-[150px_minmax(0,1fr)_140px]">
      <Bar v={s.sup} lo={s.supl} hi={s.suph} color={SUP} label="Support groups" tag="v2regsupgroupssize" />
      <Bar v={s.opp} lo={s.oppl} hi={s.opph} color={OPP} label="Opposition groups" tag="v2regoppgroupssize" />
      <div className="hidden sm:block" />
      <div className="relative hidden h-4 text-[11px] text-gl-muted sm:block">
        {SIZE_BAND.map((b, i) => (
          <span key={b} className="absolute whitespace-nowrap"
            style={{ left: pos(i), transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : "translateX(-50%)" }}>{b}</span>
        ))}
      </div>
    </div>
  );
}

function Narrative({ s, reg, year }: { s: Summary; reg: Regime; year: number | null }) {
  if (!s.coded) {
    return <p className="text-sm text-gl-text">V-Dem's experts did not code support and opposition groups for this {year == null ? "regime" : "year"}{s.rows.some((r) => r.int === 0) ? ", which V-Dem treats as an interregnum with no identifiable regime" : ""}.</p>;
  }
  const R0 = s.roles;
  const g = (i: number) => <b>{GROUP[i].toLowerCase()}</b>;
  const diff = (s.sup ?? 0) - (s.opp ?? 0);
  let stance = "";
  if (R0.pow != null) {
    const sv = s.sg[R0.pow], ov = s.og[R0.pow];
    stance = sv == null ? "" : sv >= 50 && (ov == null || ov < 50) ? ", and most coders list it as a support group"
      : ov != null && ov >= 50 && sv < 50 ? ", and most coders list it as an opposition group"
      : sv >= 50 && ov != null && ov >= 50 ? "; most coders list it among both the regime's supporters and its opponents"
      : "; most coders list it as neither a support nor an opposition group";
  }
  return (
    <p className="text-sm leading-relaxed text-gl-text">
      {year == null ? `Across ${yrs(reg.y0, reg.y1)}` : `In ${year}`}, V-Dem's country experts place the groups the
      regime depends on at <b>{SIZE_BAND[band(s.sup)].toLowerCase()}</b> of the adult population, and the groups that
      want it replaced and could under favourable conditions remove it at <b>{SIZE_BAND[band(s.opp)].toLowerCase()}</b>.{" "}
      {Math.abs(diff) < 0.5 ? "The two are of similar size." : diff > 0 ? "The support base is the larger of the two." : "The opposition is the larger of the two."}{" "}
      {R0.imp != null && <>The regime relies most on {g(R0.imp)}{R0.impo != null && <>; the most important opposition is {g(R0.impo)}</>}. </>}
      {R0.imp != null && R0.imp === R0.impo && <>V-Dem's fourteen categories are broad, so these are likely different groups within the same category, for example different ethnic groups. </>}
      {R0.pow != null && <>The group most able to affect whether the regime survives is {g(R0.pow)}{stance}.</>}
    </p>
  );
}

function People({ data, reg }: { data: RegimeCountry; reg: Regime }) {
  const rows = data.rows.filter((r) => r.y >= reg.y0 && r.y <= reg.y1);
  // Heads of government first (the head of state where they are the same
  // person), then separate heads of state.
  const gov = runs(rows, (r) => (govHead(r) ? `${govHead(r)}|${r.hog ? "g" : "sg"}` : null)).filter((h) => h.v);
  const hos = runs(rows.filter((r) => r.hog), (r) => r.hos).filter((h) => h.v);
  const Item = ({ h, name, kind }: { h: Run<string | null>; name: string; kind: string }) => {
    const r0 = rows.find((r) => r.y === h.y0);
    const isHos = kind !== "Head of government";
    return (
      <li className="border-l-2 border-gl-border pl-2.5">
        <span className="font-semibold">{name}</span> <span className="text-xs text-gl-muted">{yrs(h.y0, h.y1)}</span>
        <div className="text-xs text-gl-muted">
          {kind}
          {isHos && r0?.hosp && ` · ${r0.hosp}`}
          {isHos && r0?.path != null && ` · reached office by ${PATH[r0.path]}`}
        </div>
      </li>
    );
  };
  if (!gov.length && !hos.length) return <p className="text-sm text-gl-muted">No office holders recorded.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {gov.map((h) => {
        const [name, k] = h.v!.split("|");
        return <Item key={`g${h.y0}`} h={h} name={name} kind={k === "g" ? "Head of government" : "Head of state and government"} />;
      })}
      {hos.map((h) => <Item key={`s${h.y0}`} h={h} name={h.v!} kind="Head of state" />)}
    </ul>
  );
}

function Roles({ data, reg, s, year, Info }: { data: RegimeCountry; reg: Regime; s: Summary; year: number | null; Info: InfoFn }) {
  const rows = year == null ? data.rows.filter((r) => r.y >= reg.y0 && r.y <= reg.y1) : s.rows;
  return (
    <div className="space-y-2.5">
      {ROLES.map((ro) => {
        const g = s.roles[ro.k];
        const rs = runs(rows.filter((r) => r[ro.k] != null), (r) => r[ro.k] as number);
        const other = year == null && rs.length > 1 ? rs.filter((r) => r.v !== g) : [];
        return (
          <div key={ro.k} className="border-l-2 border-gl-border pl-2.5">
            <div className="text-xs text-gl-muted">{ro.name} <Info tag={ro.tag} /></div>
            <div className="flex items-center font-semibold">
              {g == null ? <span className="font-normal text-gl-muted">not coded</span> : (<><Swatch g={g} />{GROUP[g]}</>)}
            </div>
            {other.length > 0 && (
              <div className="text-xs text-gl-muted">{other.map((r) => `${yrs(r.y0, r.y1)}: ${GROUP[r.v].toLowerCase()}`).join("; ")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const Swatch = ({ g }: { g: number }) => (
  <i className="mr-1.5 inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: FAM_COLOR[g] }} />
);

function Parties({ data, reg, Info, show, hide }: { data: RegimeCountry; reg: Regime; Info: InfoFn; show: ShowFn; hide: () => void }) {
  const parties = data.parties.filter((p) => p.y >= reg.y0 && p.y <= reg.y1);
  if (!parties.length) {
    return <p className="text-sm text-gl-muted">V-Party records no governing party for an election in these years. It covers elections to 2019 and parties with more than 5% of the vote.</p>;
  }
  const Meter = ({ v, scale }: { v: number | null; scale: "disa" | "ind" | "act" }) =>
    v == null ? <span className="text-gl-muted">–</span> : (
      <span className="inline-flex items-center gap-1.5" title={VP_SCALE[scale][band(v)]}>
        <span className="inline-flex gap-0.5">
          {[0, 1, 2, 3].map((i) => <i key={i} className="block h-2 w-3 rounded-[1px]" style={{ background: v >= i + 0.5 ? GL.text : GL.border }} />)}
        </span>
        <span className="text-gl-muted">{v.toFixed(1)}</span>
      </span>
    );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-gl-border text-left">
              <th className="py-1 pr-2 font-semibold">Election</th>
              <th className="py-1 pr-2 font-semibold">Governing party</th>
              <th className="py-1 pr-2 text-right font-semibold">Vote %</th>
              <th className="py-1 pr-2 text-right font-semibold">Seat %</th>
              <th className="py-1 pr-2 font-semibold">Cohesion <Info tag="v2padisa" /></th>
              <th className="py-1 pr-2 font-semibold">Personalisation <Info tag="v2paind" /></th>
              <th className="py-1 font-semibold">Local presence <Info tag="v2paactcom" /></th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {parties.map((p, i) => {
              const groups = p.groups.filter((g) => g > 0).map((g) => VP_GROUP[g]);
              return (
                <tr key={i} className="border-b border-gl-border">
                  <td className="py-1 pr-2">{p.y}</td>
                  <td className="py-1 pr-2" onMouseLeave={hide}
                    onMouseMove={(e) => show(e, <><b>{p.name}</b><br />Core supporters (V-Party): {groups.length ? groups.join(", ") : "no specific group"}</>)}>
                    <b>{p.short}</b> {p.name}
                    {p.role === 1 && <span className="text-gl-muted"> · junior partner</span>}
                  </td>
                  <td className="py-1 pr-2 text-right">{p.vote == null ? "–" : p.vote.toFixed(0)}</td>
                  <td className="py-1 pr-2 text-right">{p.seat == null ? "–" : p.seat.toFixed(0)}</td>
                  <td className="py-1 pr-2"><Meter v={p.disa} scale="disa" /></td>
                  <td className="py-1 pr-2"><Meter v={p.ind} scale="ind" /></td>
                  <td className="py-1"><Meter v={p.act} scale="act" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gl-muted">
        V-Party, elections to 2019, parties above 5% of the vote. Scales run 0–4. Cohesion: 4 = virtually no visible
        disagreement among party elites, 0 = almost complete disagreement with many elites leaving. Personalisation:
        4 = the party is solely a vehicle for one leader. Local presence: permanent activity of party activists in
        local communities. Hover over a party for the social groups V-Party records as its core supporters.
      </p>
    </>
  );
}

function Groups({ s, Info }: { s: Summary; Info: InfoFn }) {
  const tags = (g: number) => ROLES.filter((ro) => s.roles[ro.k] === g);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,280px)_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-xs">
      <div className="pb-1.5 text-right font-semibold">Named as a support group <Info tag="v2regsupgroups" /></div>
      <div />
      <div className="pb-1.5 font-semibold">Named as opposition <Info tag="v2regoppgroups" /> · active <Info tag="v2regoppgroupsact" /></div>
      {FAMILIES.map((f) => (
        <FamilyRows key={f.name} name={f.name} groups={f.g} s={s} tags={tags} />
      ))}
    </div>
  );
}

function FamilyRows({ name, groups, s, tags }: { name: string; groups: number[]; s: Summary; tags: (g: number) => typeof ROLES }) {
  return (
    <>
      <div className="col-span-3 pt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-gl-muted">{name}</div>
      {groups.map((g) => {
        const sv = s.sg[g], ov = s.og[g], av = s.oa[g];
        return (
          <div key={g} className="contents">
            <div className="flex min-h-[26px] items-center gap-2">
              <span className="w-8 text-right text-gl-muted tabular-nums">{pct(sv)}</span>
              <span className="relative h-[26px] flex-1">
                <i className="absolute right-0 top-1/2 h-3.5 -translate-y-1/2 rounded-l" style={{ width: `${sv ?? 0}%`, background: SUP }} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1 border-x border-gl-text px-2 py-0.5">
              <Swatch g={g} />
              <span className="mr-1">{GROUP[g]}</span>
              {tags(g).map((ro) => (
                <span key={ro.k} className="whitespace-nowrap rounded-sm border px-1 text-[10px] leading-4" style={{ borderColor: ro.color, fontWeight: ro.k === "pow" ? 600 : 400 }}>
                  {ro.short}
                </span>
              ))}
            </div>
            <div className="flex min-h-[26px] items-center gap-2">
              <span className="relative h-[26px] flex-1">
                <i className="absolute left-0 top-1 h-2.5 rounded-r opacity-45" style={{ width: `${ov ?? 0}%`, background: OPP }} />
                <i className="absolute left-0 top-4 h-1.5 rounded-r" style={{ width: `${av ?? 0}%`, background: OPP }} />
              </span>
              <span className="w-24 whitespace-nowrap text-gl-muted tabular-nums">
                {pct(ov)} <span className="opacity-70">{av == null ? "" : `${pct(av)} active`}</span>
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function RoleStrip({ data, reg, year, show, hide }: { data: RegimeCountry; reg: Regime; year: number | null; show: ShowFn; hide: () => void }) {
  const [ref, W] = useWidth();
  const rows = data.rows.filter((r) => r.y >= reg.y0 && r.y <= reg.y1);
  const m = { l: 200, r: 8 }, rh = 24, H = ROLES.length * (rh + 4) + 22;
  const x = (y: number) => m.l + ((y - reg.y0) / (reg.y1 + 1 - reg.y0)) * (W - m.l - m.r);
  const span = reg.y1 - reg.y0 + 1;
  const step = span <= 12 ? 2 : span <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(reg.y0 / step) * step; t <= reg.y1; t += step) ticks.push(t);
  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Group holding each role, by year">
        {ROLES.map((ro, i) => {
          const yy = i * (rh + 4);
          return (
            <g key={ro.k}>
              <text x={m.l - 8} y={yy + rh / 2 + 4} textAnchor="end" fontSize={12} fill={GL.text}>{ro.name}</text>
              {runs(rows, (r) => r[ro.k]).map((run) => {
                const x0 = x(run.y0), x1 = x(run.y1 + 1);
                const label = run.v == null ? "" : fitText(GROUP[run.v], x1 - x0 - 8, 11);
                return (
                  <g key={run.y0} onMouseLeave={hide}
                    onMouseMove={(e) => show(e, <><b>{ro.name}</b><br />{yrs(run.y0, run.y1)}: {run.v == null ? "not coded" : GROUP[run.v]}</>)}>
                    <rect x={x0 + 0.5} y={yy} width={Math.max(1, x1 - x0 - 1)} height={rh} rx={2}
                      fill={run.v == null ? GL.bg : FAM_COLOR[run.v]} fillOpacity={run.v == null ? 1 : 0.4} />
                    {label && <text x={x0 + 5} y={yy + rh / 2 + 4} fontSize={11} fill={GL.text} pointerEvents="none">{label}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
        {year != null && (
          <rect x={x(year)} width={x(year + 1) - x(year)} y={-2} height={ROLES.length * (rh + 4)} fill="none" stroke={GL.text} strokeWidth={2} />
        )}
        {ticks.map((t) => <text key={t} x={x(t + 0.5)} y={H - 4} textAnchor="middle" fontSize={11} fill={GL.muted}>{t}</text>)}
      </svg>
    </div>
  );
}
