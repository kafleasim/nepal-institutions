import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Country } from "../types";
import { useFingerprints } from "../lib/useFingerprints";
import { GL } from "../lib/glTokens";

type Props = {
  focus: Country;
  countries: Country[];
  // Comparator chosen in PeerSection / PeerAnomaliesSection. Null until the
  // initial peer list resolves.
  selectedIso: string | null;
};

type Point = {
  year: number;
  // Root-mean-square z-difference per indicator — see note below on why the
  // raw L2 norm is not comparable across years.
  dNorm: number | null;
  // Raw Euclidean distance, carried for the tooltip so this chart reconciles
  // with the `d = ...` values listed in PeerSection.
  dRaw: number | null;
  nTags: number;
  // Median normalised distance from the focus country to every other country
  // in that year — the "typical country" reference.
  baseline: number | null;
  rank: number | null;
  nCountries: number;
};

// Euclidean distance over the tags both countries carry. Mirrors derivePeers.
function pairDistance(
  a: Map<string, number>,
  b: Map<string, number>,
): { d: number; n: number } | null {
  let sum = 0;
  let n = 0;
  for (const [tag, za] of a) {
    const zb = b.get(tag);
    if (zb === undefined) continue;
    const diff = za - zb;
    sum += diff * diff;
    n++;
  }
  return n === 0 ? null : { d: Math.sqrt(sum), n };
}

export function PeerDistanceTrendSection({
  focus,
  countries,
  selectedIso,
}: Props) {
  const fps = useFingerprints();

  const compareCountry = useMemo(
    () => countries.find((c) => c.iso3 === selectedIso) ?? null,
    [countries, selectedIso],
  );

  const points = useMemo<Point[] | null>(() => {
    if (fps.status !== "ready" || !selectedIso) return null;
    return fps.index.years.map((year) => {
      const empty: Point = {
        year,
        dNorm: null,
        dRaw: null,
        nTags: 0,
        baseline: null,
        rank: null,
        nCountries: 0,
      };
      const yearMap = fps.index.byYear(year);
      const f = yearMap?.get(focus.iso3);
      const p = yearMap?.get(selectedIso);
      if (!yearMap || !f || !p) return empty;

      const pair = pairDistance(f, p);
      if (!pair) return empty;
      const dNorm = pair.d / Math.sqrt(pair.n);

      // Every distance from the focus country, for the median reference and
      // the closeness rank. ~180 countries x ~200 tags per year — cheap.
      const others: number[] = [];
      for (const [iso3, row] of yearMap) {
        if (iso3 === focus.iso3) continue;
        const r = pairDistance(f, row);
        if (r) others.push(r.d / Math.sqrt(r.n));
      }
      others.sort((x, y) => x - y);

      return {
        year,
        dNorm,
        dRaw: pair.d,
        nTags: pair.n,
        baseline: others.length ? others[Math.floor(others.length / 2)] : null,
        rank: others.filter((v) => v < dNorm).length + 1,
        nCountries: others.length,
      };
    });
  }, [fps, focus.iso3, selectedIso]);

  // Pad the domain around whatever is plotted, including the reference line so
  // it never falls outside the view. Not zero-based: the informative range is
  // narrow, and the median line gives the reader an anchor for scale.
  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (!points) return undefined;
    const vals = points
      .flatMap((p) => [p.dNorm, p.baseline])
      .filter((v): v is number => v !== null);
    if (vals.length === 0) return undefined;
    const lo = Math.floor(Math.min(...vals) * 10 - 1) / 10;
    const hi = Math.ceil(Math.max(...vals) * 10 + 1) / 10;
    return [Math.max(0, lo), hi];
  }, [points]);

  const observed = points?.filter((p) => p.dNorm !== null) ?? [];
  const missing = points?.filter((p) => p.dNorm === null).map((p) => p.year) ?? [];

  return (
    <section className="mt-12">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">Distance over time</h2>
        <p className="mt-0.5 text-xs text-gl-muted">
          How far {focus.name} and{" "}
          {compareCountry ? compareCountry.name : "the selected country"} sit
          apart in the z-scored V-Dem space, at each cross-section year. Points
          are the six observed years; the curve between them is monotone-cubic
          interpolation, not data. Plotted as root-mean-square z-difference per
          indicator — the raw Euclidean distance shown in the peer list grows
          with the number of indicators kept in a year (168 in 2025 vs 217 in
          2005), so dividing by the square root of that count is what makes the
          years comparable. The dashed line is {focus.name}'s median distance to
          all other countries that year.
        </p>
      </div>

      {!compareCountry ? (
        <p className="text-sm text-gl-muted">Pick a country to compare.</p>
      ) : fps.status === "loading" || fps.status === "idle" ? (
        <p className="text-sm text-gl-muted">Loading fingerprints…</p>
      ) : fps.status === "error" ? (
        <p className="text-sm text-gl-highlight">
          Failed to load fingerprints: {fps.error.message}
        </p>
      ) : observed.length === 0 ? (
        <p className="text-sm text-gl-muted">
          {focus.name} and {compareCountry.name} are not both present in any
          cross-section year.
        </p>
      ) : (
        <div className="rounded border border-gl-border bg-white px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: GL.blue }}
              />
              <span className="font-medium">
                {focus.name} ↔ {compareCountry.name}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-4 border-t border-dashed"
                style={{ borderColor: GL.muted }}
              />
              <span className="text-gl-muted">
                Median distance from {focus.name}
              </span>
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart
                data={points ?? []}
                margin={{ top: 6, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={GL.border} strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  ticks={points?.map((p) => p.year)}
                  tick={{ fontSize: 10, fill: GL.muted }}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain ?? ["auto", "auto"]}
                  tick={{ fontSize: 10, fill: GL.muted }}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) =>
                    typeof v === "number" ? v.toFixed(2) : String(v)
                  }
                  label={{
                    value: "z-SD per indicator",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 10, fill: GL.muted, textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  labelFormatter={(y) => `${y}`}
                  content={<DistanceTooltip focusName={focus.name} />}
                />
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke={GL.muted}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="dNorm"
                  stroke={GL.blue}
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: GL.blue, stroke: GL.blue }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {missing.length > 0 && (
            <p className="mt-2 px-1 text-[11px] text-gl-muted">
              No shared observation in {missing.join(", ")} — one of the two
              countries is absent from the V-Dem panel that year.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: { payload: Point }[];
  focusName: string;
};

function DistanceTooltip({ active, payload, focusName }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.dNorm === null) return null;
  return (
    <div className="rounded border border-gl-border bg-white px-2.5 py-2 text-[11px] shadow-sm">
      <div className="mb-1 font-semibold">{p.year}</div>
      <div className="tabular-nums">
        {p.dNorm.toFixed(3)} z-SD per indicator
      </div>
      <div className="tabular-nums text-gl-muted">
        raw d = {p.dRaw?.toFixed(2)} over {p.nTags} indicators
      </div>
      {p.baseline !== null && (
        <div className="tabular-nums text-gl-muted">
          median from {focusName} = {p.baseline.toFixed(3)}
        </div>
      )}
      {p.rank !== null && (
        <div className="mt-1 text-gl-muted">
          {ordinal(p.rank)} closest of {p.nCountries}
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
