import { useMemo } from "react";
import type { Country } from "../types";
import { GL } from "../lib/glTokens";
import { usePolSettPanel, type PolSettPanelAccess } from "../lib/usePolSett";

// ---------------------------------------------------------------------------
// Vertical-power decomposition
//
// The Vertical Power Index aggregates four indicators that fall along two
// conceptual axes:
//   LB ↔ CLB axis      — power ratio between the leadership and contingent
//                        leadership blocs, plus the likelihood the CLB defects
//   LB internal axis   — how hierarchical and how cohesive the LB itself is
//
// Each input has a different scale so we normalise to [0, 1] for visual
// comparison; tooltips keep the raw value.

type VertInputKey =
  | "x_lbvsclbpowerratio"
  | "q3_clbsplit"
  | "q8_hierarchy_lb"
  | "q9_cohesiveness_lb";

type VertInput = {
  tag: VertInputKey;
  label: string;
  group: "LB ↔ CLB" | "LB internal cohesion";
  // Codebook scale max — used to normalise the bar.
  max: number;
  formatRaw: (v: number) => string;
};

const VERT_INPUTS: VertInput[] = [
  {
    tag: "x_lbvsclbpowerratio",
    label: "LB vs CLB power ratio",
    group: "LB ↔ CLB",
    max: 5,
    formatRaw: (v) => v.toFixed(2),
  },
  {
    tag: "q3_clbsplit",
    label: "Stability vs CLB defection",
    group: "LB ↔ CLB",
    max: 3,
    formatRaw: (v) => v.toFixed(2),
  },
  {
    tag: "q8_hierarchy_lb",
    label: "LB hierarchy",
    group: "LB internal cohesion",
    max: 6,
    formatRaw: (v) => v.toFixed(2),
  },
  {
    tag: "q9_cohesiveness_lb",
    label: "LB cohesiveness",
    group: "LB internal cohesion",
    max: 4,
    formatRaw: (v) => v.toFixed(2),
  },
];

type Props = {
  focus: Country;
  selectedYear: number | null;
  // Period-specific label for the focus bar — typically the leader's name
  // for the selected political settlement. Falls back to the country name
  // when null/undefined.
  focusLabel?: string | null;
};

export function VerticalPowerDecomp({
  focus,
  selectedYear,
  focusLabel,
}: Props) {
  const panel = usePolSettPanel(true);

  if (panel.status === "loading" || panel.status === "idle") {
    return (
      <DecompFrame title="Vertical power, decomposed">
        <p className="text-xs text-gl-muted">Loading decomposition…</p>
      </DecompFrame>
    );
  }
  if (panel.status === "error") {
    return (
      <DecompFrame title="Vertical power, decomposed">
        <p className="text-xs text-red-600">
          Failed to load: {panel.error.message}
        </p>
      </DecompFrame>
    );
  }

  return (
    <VerticalPowerBody
      focus={focus}
      selectedYear={selectedYear}
      focusLabel={focusLabel}
      panel={panel}
    />
  );
}

function VerticalPowerBody({
  focus,
  selectedYear,
  focusLabel,
  panel,
}: Props & { panel: PolSettPanelAccess }) {
  const barLabel = focusLabel?.trim() || focus.name;
  const rows = useMemo(() => {
    if (selectedYear == null) return null;
    return VERT_INPUTS.map((inp) => {
      const focusVal = panel.getValue(inp.tag, focus.iso3, selectedYear);
      const slice = panel.getYearSlice(inp.tag, selectedYear);
      const medianVal = median(slice.map((s) => s.value));
      return {
        ...inp,
        focusVal,
        medianVal,
      };
    });
  }, [focus.iso3, selectedYear, panel]);

  if (selectedYear == null) {
    return (
      <DecompFrame title="Vertical power, decomposed">
        <p className="text-xs text-gl-muted">
          Select a political settlement above to view the decomposition.
        </p>
      </DecompFrame>
    );
  }
  if (!rows) return null;

  const focusMissing = rows.every((r) => r.focusVal == null);

  return (
    <DecompFrame
      title="Vertical power, decomposed"
      subtitle={
        <>
          How concentrated is power inside the governing coalition? Two
          conceptual axes: <b>LB ↔ CLB</b> (does the leadership bloc dominate the
          contingent leadership bloc, or are they nearly equal?) and{" "}
          <b>LB internal cohesion</b> (within the LB itself, is power
          hierarchical and the bloc unified, or fragmented?).
        </>
      }
    >
      {focusMissing ? (
        <p className="text-xs text-red-600">
          {focus.name} has no observations for these inputs at the selected
          settlement.
        </p>
      ) : (
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {(["LB ↔ CLB", "LB internal cohesion"] as const).map((grp) => (
            <div key={grp}>
              <div className="mb-2 text-xs font-semibold text-gl-text">
                {grp}
              </div>
              <div className="space-y-3">
                {rows
                  .filter((r) => r.group === grp)
                  .map((r) => (
                    <BarPair
                      key={r.tag}
                      label={r.label}
                      max={r.max}
                      focusName={barLabel}
                      focusVal={r.focusVal}
                      medianVal={r.medianVal}
                      formatRaw={r.formatRaw}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DecompFrame>
  );
}

function BarPair({
  label,
  max,
  focusName,
  focusVal,
  medianVal,
  formatRaw,
}: {
  label: string;
  max: number;
  focusName: string;
  focusVal: number | null;
  medianVal: number | null;
  formatRaw: (v: number) => string;
}) {
  const focusPct = focusVal == null ? 0 : clamp01(focusVal / max);
  const medianPct = medianVal == null ? 0 : clamp01(medianVal / max);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-gl-text">{label}</span>
        <span className="font-mono text-[10px] text-gl-muted">
          / {max}
        </span>
      </div>
      <div className="space-y-1">
        <Bar
          color={GL.blue}
          widthPct={focusPct * 100}
          rightLabel={focusVal == null ? "—" : formatRaw(focusVal)}
          legend={focusName}
        />
        <Bar
          color={GL.muted}
          widthPct={medianPct * 100}
          rightLabel={medianVal == null ? "—" : formatRaw(medianVal)}
          legend="sample median"
          dim
        />
      </div>
    </div>
  );
}

function Bar({
  color,
  widthPct,
  rightLabel,
  legend,
  dim,
}: {
  color: string;
  widthPct: number;
  rightLabel: string;
  legend: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className={
          "w-[100px] shrink-0 truncate text-right " +
          (dim ? "text-gl-muted" : "text-gl-text")
        }
      >
        {legend}
      </span>
      <div className="relative h-3 flex-1 rounded bg-gl-bg">
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{
            background: color,
            width: `${widthPct}%`,
            opacity: dim ? 0.6 : 1,
          }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-[10px] text-gl-muted">
        {rightLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Social-foundation decomposition
//
// For each bloc (LB / CLB / OB), three multiplicative stages:
//   Stage 1: bloc population share              = q1_populationshare_*
//   Stage 2: × powerful share within bloc       (combined: x_*powerfulsharetotpop)
//   Stage 3: × cooptation index ∈ [0, 1]        (combined: x_*powerfulsharecoopted)
//
// Stage 3 width across all blocs sums to the country's Social Foundation
// Size — i.e. the share of the total population that is both powerful and
// coopted into the settlement (codebook §4.2.35).

type BlocKey = "lb" | "clb" | "ob";

type BlocRow = {
  key: BlocKey;
  label: string;
  description: string;
  popShare: number | null; // q1_populationshare_*  (0-100, of total pop)
  powerfulWithin: number | null; // x_*powerfulshare (0-100, of bloc)
  powerfulOfTotal: number | null; // x_*powerfulsharetotpop (0-100, of total pop)
  cooptShare: number | null; // x_*powerfulsharecoopted (0-100, of total pop)
  // Implied within-powerful coopt rate = cooptShare / powerfulOfTotal
};

const BLOC_LABELS: Record<BlocKey, { label: string; description: string }> = {
  lb: {
    label: "Leadership bloc (LB)",
    description: "The faction holding executive power",
  },
  clb: {
    label: "Contingent leadership bloc (CLB)",
    description: "Allies whose support keeps the leader in power",
  },
  ob: {
    label: "Opposition bloc (OB)",
    description: "Groups outside the governing coalition",
  },
};

const BLOC_COLORS: Record<BlocKey, string> = {
  lb: GL.blue,
  clb: GL.green,
  ob: GL.orange,
};

export function SocialFoundationDecomp({ focus, selectedYear }: Props) {
  const panel = usePolSettPanel(true);

  if (panel.status === "loading" || panel.status === "idle") {
    return (
      <DecompFrame title="Social foundation, decomposed">
        <p className="text-xs text-gl-muted">Loading decomposition…</p>
      </DecompFrame>
    );
  }
  if (panel.status === "error") {
    return (
      <DecompFrame title="Social foundation, decomposed">
        <p className="text-xs text-red-600">
          Failed to load: {panel.error.message}
        </p>
      </DecompFrame>
    );
  }
  return (
    <SocialFoundationBody
      focus={focus}
      selectedYear={selectedYear}
      panel={panel}
    />
  );
}

function SocialFoundationBody({
  focus,
  selectedYear,
  panel,
}: Props & { panel: PolSettPanelAccess }) {
  const rows = useMemo<BlocRow[] | null>(() => {
    if (selectedYear == null) return null;
    const blocs: BlocKey[] = ["lb", "clb", "ob"];
    return blocs.map((b) => {
      const { label, description } = BLOC_LABELS[b];
      return {
        key: b,
        label,
        description,
        popShare: panel.getValue(
          `q1_populationshare_${b}`,
          focus.iso3,
          selectedYear,
        ),
        powerfulWithin: panel.getValue(
          `x_${b}powerfulshare`,
          focus.iso3,
          selectedYear,
        ),
        powerfulOfTotal: panel.getValue(
          `x_${b}powerfulsharetotpop`,
          focus.iso3,
          selectedYear,
        ),
        cooptShare: panel.getValue(
          `x_${b}powerfulsharecoopted`,
          focus.iso3,
          selectedYear,
        ),
      };
    });
  }, [focus.iso3, selectedYear, panel]);

  if (selectedYear == null) {
    return (
      <DecompFrame title="Social foundation, decomposed">
        <p className="text-xs text-gl-muted">
          Select a political settlement above to view the decomposition.
        </p>
      </DecompFrame>
    );
  }
  if (!rows) return null;

  const focusMissing = rows.every(
    (r) =>
      r.popShare == null && r.powerfulOfTotal == null && r.cooptShare == null,
  );

  const sfTotal = rows.reduce(
    (s, r) => s + (r.cooptShare ?? 0),
    0,
  );

  return (
    <DecompFrame
      title="Social foundation, decomposed"
      subtitle={
        <>
          The Social Foundation Size counts the share of the population that
          is both <b>potentially powerful</b> and <b>co-opted into the
          settlement</b>. Each bloc&rsquo;s contribution is{" "}
          <span className="font-mono">
            pop&nbsp;×&nbsp;powerful&nbsp;×&nbsp;co-opted
          </span>
          ; the three sum to the country&rsquo;s SF size.
        </>
      }
    >
      {focusMissing ? (
        <p className="text-xs text-red-600">
          {focus.name} has no observations for these inputs at the selected
          settlement.
        </p>
      ) : (
        <div className="space-y-5">
          {rows.map((r) => (
            <BlocFunnel key={r.key} row={r} color={BLOC_COLORS[r.key]} />
          ))}
          <div className="flex items-baseline justify-between border-t border-gl-border pt-3 text-xs">
            <span className="font-semibold text-gl-text">
              Social Foundation Size
            </span>
            <span className="font-mono text-gl-text">
              {sfTotal.toFixed(1)}% of population
            </span>
          </div>
        </div>
      )}
    </DecompFrame>
  );
}

function BlocFunnel({ row, color }: { row: BlocRow; color: string }) {
  // Within-bloc coopt rate is implied from cooptShare ÷ powerfulOfTotal.
  const withinCoopt =
    row.powerfulOfTotal && row.powerfulOfTotal > 0 && row.cooptShare != null
      ? (row.cooptShare / row.powerfulOfTotal) * 100
      : null;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
        />
        <span className="text-xs font-semibold text-gl-text">{row.label}</span>
        <span className="text-[11px] text-gl-muted">{row.description}</span>
      </div>
      <div className="space-y-1">
        <FunnelBar
          color={color}
          opacity={0.35}
          widthPct={row.popShare ?? 0}
          leftLabel="pop"
          rightLabel={
            row.popShare == null ? "—" : `${row.popShare.toFixed(1)}% of total`
          }
        />
        <FunnelBar
          color={color}
          opacity={0.65}
          widthPct={row.powerfulOfTotal ?? 0}
          leftLabel="× powerful"
          rightLabel={
            row.powerfulWithin == null
              ? "—"
              : `${row.powerfulWithin.toFixed(0)}% of bloc = ${
                  row.powerfulOfTotal == null
                    ? "—"
                    : row.powerfulOfTotal.toFixed(1) + "% of total"
                }`
          }
        />
        <FunnelBar
          color={color}
          opacity={1}
          widthPct={row.cooptShare ?? 0}
          leftLabel="× co-opted"
          rightLabel={
            withinCoopt == null
              ? "—"
              : `${withinCoopt.toFixed(0)}% of powerful = ${
                  row.cooptShare == null
                    ? "—"
                    : row.cooptShare.toFixed(1) + "% of total"
                }`
          }
          emphasised
        />
      </div>
    </div>
  );
}

function FunnelBar({
  color,
  opacity,
  widthPct,
  leftLabel,
  rightLabel,
  emphasised,
}: {
  color: string;
  opacity: number;
  widthPct: number;
  leftLabel: string;
  rightLabel: string;
  emphasised?: boolean;
}) {
  // Width as fraction of 100% of total population.
  const w = Math.max(0, Math.min(100, widthPct));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        className={
          "w-[80px] shrink-0 text-right " +
          (emphasised ? "font-medium text-gl-text" : "text-gl-muted")
        }
      >
        {leftLabel}
      </span>
      <div className="relative h-3.5 flex-1 rounded bg-gl-bg">
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{ background: color, width: `${w}%`, opacity }}
        />
        {/* 100%-of-total reference line */}
      </div>
      <span
        className={
          "w-[180px] shrink-0 text-right font-mono text-[10px] " +
          (emphasised ? "text-gl-text" : "text-gl-muted")
        }
      >
        {rightLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function DecompFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-gl-border bg-white p-3">
      <h4 className="text-sm font-semibold text-gl-text">{title}</h4>
      {subtitle && (
        <p className="mb-3 mt-0.5 text-xs text-gl-muted">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
