import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Country, GrowthIndex, HSComponentsMeta } from "../types";
import { CountryPicker } from "../components/CountryPicker";
import { PeerSection } from "../components/PeerSection";
import { PeerAnomaliesSection } from "../components/PeerAnomaliesSection";
import { PeerDistanceTrendSection } from "../components/PeerDistanceTrendSection";
import { GrowthBreaksSection } from "../components/GrowthBreaksSection";
import { VDemSection } from "../components/VDemSection";
import { VDemExplorer } from "../components/VDemExplorer";
import { BdmSection } from "../components/BdmSection";
import { StateCapacitySection } from "../components/StateCapacitySection";
import { PillarsSection } from "../components/PillarsSection";
import { HSDimensionSection } from "../components/HSDimensionSection";
import { PCTrajectoriesSection } from "../components/PCTrajectoriesSection";
import { RelatedIndicatorsSection } from "../components/RelatedIndicatorsSection";
import { PolSettTypologySection } from "../components/PolSettTypologySection";
import { PolSettExplorer } from "../components/PolSettExplorer";
import { RegimesSection } from "../components/RegimesSection";
import { SectionNav, type ChapterSpec } from "../components/SectionNav";
import { useFingerprints } from "../lib/useFingerprints";
import { derivePeers } from "../lib/derivePeers";

const CHAPTERS: ChapterSpec[] = [
  { id: "peers", label: "Peers" },
  { id: "growth-breaks", label: "Growth breaks" },
  { id: "political-settlement", label: "Political settlement" },
  { id: "regimes", label: "Regimes" },
  { id: "winning-coalition", label: "Winning coalition" },
  { id: "state-capacity", label: "State capacity" },
  { id: "pillars", label: "Pillars of Prosperity" },
  { id: "institutional-axes", label: "Institutional axes" },
  { id: "vdem", label: "Varieties of Democracy" },
];

const DEFAULT_ISO = "NPL";
const DEFAULT_N_PEERS = 5;
const TOP_K = 25;

export function CountryProfilePage() {
  const { iso } = useParams<{ iso?: string }>();
  const navigate = useNavigate();

  const [countries, setCountries] = useState<Country[] | null>(null);
  const [growth, setGrowth] = useState<GrowthIndex | null>(null);
  const [hsMeta, setHsMeta] = useState<HSComponentsMeta | null>(null);
  const [peerIsos, setPeerIsos] = useState<string[]>([]);
  const [peerYear, setPeerYear] = useState<number | null>(null);
  // Active comparator for the "Why this peer?" anomaly chart. Lifted here
  // so clicking a row in PeerSection can update it.
  const [comparePeerIso, setComparePeerIso] = useState<string | null>(null);

  const fps = useFingerprints();

  useEffect(() => {
    Promise.all([
      fetch("/countries.json").then((r) => r.json() as Promise<Country[]>),
      fetch("/growth_series.json").then((r) => r.json() as Promise<GrowthIndex>),
    ]).then(([c, g]) => {
      // Series too short for break detection are exported with breaks = {}
      // rather than null; the charts expect null.
      for (const rec of Object.values(g)) {
        if (rec.breaks && !Array.isArray(rec.breaks.years)) rec.breaks = null;
      }
      setCountries(c);
      setGrowth(g);
    });
    fetch("/hs_components_meta.json")
      .then((r) => r.json() as Promise<HSComponentsMeta>)
      .then(setHsMeta);
  }, []);

  useEffect(() => {
    if (!iso) {
      navigate(`/country/${DEFAULT_ISO}`, { replace: true });
      return;
    }
    if (iso !== iso.toUpperCase()) {
      navigate(`/country/${iso.toUpperCase()}`, { replace: true });
    }
  }, [iso, navigate]);

  const focusIso = (iso ?? DEFAULT_ISO).toUpperCase();
  const focus = useMemo(
    () => countries?.find((c) => c.iso3 === focusIso) ?? null,
    [countries, focusIso],
  );

  const availableYears = fps.status === "ready" ? fps.index.years : [];

  // Default to the latest year as soon as fingerprints arrive.
  useEffect(() => {
    if (peerYear === null && availableYears.length > 0) {
      setPeerYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, peerYear]);

  // Top-K peer ranking for the current (year, focus).
  const focusPeers = useMemo(() => {
    if (fps.status !== "ready" || !focus || peerYear === null) return [];
    return derivePeers(fps.index, peerYear, focus.iso3, TOP_K);
  }, [fps, focus, peerYear]);

  // Whenever the focus, year, or fingerprint readiness changes, reset the
  // displayed peer set to the new top-N.
  useEffect(() => {
    const next = focusPeers.slice(0, DEFAULT_N_PEERS).map((p) => p.iso3);
    setPeerIsos(next);
    // Default the comparator to the new closest peer (unless the current
    // comparator still appears in the new list — preserves intent across
    // year changes).
    setComparePeerIso((prev) =>
      prev && next.includes(prev) ? prev : next[0] ?? null,
    );
  }, [focusPeers]);

  const peerList = useMemo(() => {
    if (!countries) return [];
    return peerIsos
      .map((i) => countries.find((c) => c.iso3 === i))
      .filter((c): c is Country => !!c)
      .map((c) => ({ iso3: c.iso3, name: c.name }));
  }, [peerIsos, countries]);

  if (!countries || !growth) {
    return (
      <div className="flex h-full items-center justify-center text-gl-muted">
        Loading…
      </div>
    );
  }

  if (!focus) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-gl-muted">
          Unknown country code <span className="font-mono">{focusIso}</span>.
        </p>
        <button
          onClick={() => navigate(`/country/${DEFAULT_ISO}`)}
          className="mt-3 text-sm text-gl-blue hover:underline"
        >
          Go to {DEFAULT_ISO}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gl-muted">
            Country profile
          </p>
          <h1 className="mt-1 text-3xl font-semibold">{focus.name}</h1>
          <p className="mt-0.5 text-sm text-gl-muted">
            {focus.region} · <span className="font-mono">{focus.iso3}</span>
          </p>
        </div>
        <div className="w-72">
          <CountryPicker
            countries={countries}
            value={focus.iso3}
            onChange={(next) => navigate(`/country/${next}`)}
          />
        </div>
      </div>

      <SectionNav chapters={CHAPTERS} />

      <section id="peers" className="scroll-mt-20">
        <PeerSection
          focus={focus}
          countries={countries}
          focusPeers={focusPeers}
          peerIsos={peerIsos}
          onChange={setPeerIsos}
          selectedIso={comparePeerIso}
          onSelect={setComparePeerIso}
          years={availableYears}
          year={peerYear}
          onYearChange={setPeerYear}
          fpsStatus={fps.status}
          fpsError={fps.status === "error" ? fps.error : null}
        />

        <PeerAnomaliesSection
          focus={focus}
          countries={countries}
          selectedIso={comparePeerIso}
          onSelect={setComparePeerIso}
          year={peerYear}
        />

        <PeerDistanceTrendSection
          focus={focus}
          countries={countries}
          selectedIso={comparePeerIso}
        />
      </section>

      <section id="growth-breaks" className="scroll-mt-20">
        <GrowthBreaksSection record={growth[focus.iso3] ?? null} />
      </section>

      <section id="political-settlement" className="scroll-mt-20">
        <PolSettTypologySection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />

        <PolSettExplorer
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
          defaultCollapsed
        />
      </section>

      <section id="regimes" className="scroll-mt-20">
        <RegimesSection focus={focus} />
      </section>

      <section id="winning-coalition" className="scroll-mt-20">
        <BdmSection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />
      </section>

      <section
        id="state-capacity"
        className="mt-12 scroll-mt-20 space-y-8"
      >
        <div>
          <h2 className="text-xl font-semibold">State capacity</h2>
          <p className="mt-1 text-sm text-gl-muted">
            Hanson &amp; Sigman (2021) treat state capacity as three
            interrelated dimensions — extractive, coercive, and administrative —
            which empirically collapse into a single latent factor. Below: the
            aggregate latent indicator, then each dimension separately
            (collapsed by default), with indicator pickers drawn from the 21
            component series H&amp;S assembled. Coverage 1960–2015.
          </p>
        </div>

        <StateCapacitySection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />

        {hsMeta && (
          <>
            <HSDimensionSection
              dimension="extractive"
              meta={hsMeta}
              focus={focus}
              peers={peerList}
              growthRecord={growth[focus.iso3] ?? null}
              defaultCollapsed
            />
            <HSDimensionSection
              dimension="coercive"
              meta={hsMeta}
              focus={focus}
              peers={peerList}
              growthRecord={growth[focus.iso3] ?? null}
              defaultCollapsed
            />
            <HSDimensionSection
              dimension="administrative"
              meta={hsMeta}
              focus={focus}
              peers={peerList}
              growthRecord={growth[focus.iso3] ?? null}
              defaultCollapsed
            />
          </>
        )}
      </section>

      <section id="pillars" className="mt-12 scroll-mt-20 space-y-8">
        <div>
          <h2 className="text-xl font-semibold">Pillars of Prosperity</h2>
          <p className="mt-1 text-sm text-gl-muted">
            Besley &amp; Persson argue prosperity rests on Adam Smith's two
            drivers — <em>state capacity</em> and <em>peace</em> — with state
            capacity split into fiscal, legal, and collective dimensions. Their
            own published index is a cross-sectional snapshot; here we
            reconstruct all four pillars as annual panels and view {focus.name}
            {" "}through their lens, scoring each pillar as a within-year global
            percentile so the disparate measures (tax shares, V-Dem indices,
            life expectancy) sit on one comparable scale.
          </p>
        </div>

        <PillarsSection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />
      </section>

      <section id="institutional-axes" className="scroll-mt-20">
        <PCTrajectoriesSection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />

        <RelatedIndicatorsSection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />
      </section>

      <section id="vdem" className="scroll-mt-20">
        <VDemSection
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
        />

        <VDemExplorer
          focus={focus}
          peers={peerList}
          growthRecord={growth[focus.iso3] ?? null}
          defaultCollapsed
        />
      </section>
    </div>
  );
}
