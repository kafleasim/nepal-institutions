import { useEffect, useState } from "react";
import "./research.css";
import { useResearchData, type Method } from "./data";
import { K_DEFAULT } from "./names";
import { Ctrl, Seg } from "./components/ui";
import { ClustersView } from "./views/ClustersView";
import { PackagesView } from "./views/PackagesView";
import { TrajectoriesView } from "./views/TrajectoriesView";
import { ComplexityView } from "./views/ComplexityView";
import { ProductSpaceView } from "./views/ProductSpaceView";
import { DiversificationView } from "./views/DiversificationView";
import { OutliersView } from "./views/OutliersView";
import { MechanismsView } from "./views/MechanismsView";
import { EventsView } from "./views/EventsView";
import { ScreenView } from "./views/ScreenView";
import { WithinView } from "./views/WithinView";

// /research is not linked from the profile tool. It is a separate register:
// one page of tabs, each a thread of analysis, each carrying its own method
// note, in the manner of the g20 atlas. The profile tool's routes are left
// as they are.

const TABS = [
  { key: "clusters", label: "Clusters", blurb: "Partitioning the country space" },
  { key: "packages", label: "Packages", blurb: "What each cluster is made of" },
  { key: "trajectories", label: "Trajectories", blurb: "Who moved between clusters" },
  { key: "outliers", label: "Outliers", blurb: "Countries unlike their neighbours" },
  { key: "complexity", label: "Complexity", blurb: "ECI by cluster, income held fixed" },
  { key: "product-space", label: "Product space", blurb: "Do cluster-mates make the same things" },
  { key: "diversification", label: "Diversification", blurb: "Entry, relatedness and co-movement" },
  { key: "mechanisms", label: "Mechanisms", blurb: "Which related products get entered" },
  { key: "screen", label: "Indicators", blurb: "Working backwards, one indicator at a time" },
  { key: "within", label: "Within", blurb: "Fiscal base and new exports inside countries" },
  { key: "events", label: "Events", blurb: "What follows a change of cluster" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function readHash(): TabKey {
  const h = window.location.hash.replace(/^#/, "");
  return (TABS.find((t) => t.key === h)?.key ?? "clusters") as TabKey;
}

export function ResearchPage() {
  const { data, error } = useResearchData();
  const [tab, setTab] = useState<TabKey>(readHash);
  const [k, setK] = useState(K_DEFAULT);
  const [method, setMethod] = useState<Method>("ward");

  useEffect(() => {
    const onHash = () => setTab(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = "Research — Institutional Complexity";
    const id = "rs-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const go = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, "", `#${key}`);
  };

  const kMax = data?.meta.k_max ?? 12;
  const ctx = data ? { data, k, method } : null;

  return (
    <div className="rs">
      <header className="masthead">
        <div>
          <h1>Institutional clusters and economic complexity</h1>
          <p className="standfirst">
            The country space in this tool places countries by their V-Dem institutional fingerprint. This page partitions it into clusters, reads off what institutional package each cluster is, and asks whether the clusters differ in what their economies make, where they sit in the product space, and how they diversify.
          </p>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`tab${tab === t.key ? " is-active" : ""}`} aria-current={tab === t.key ? "page" : undefined} onClick={() => go(t.key)}>
              <span className="tab-label">{t.label}</span>
              <span className="tab-blurb">{t.blurb}</span>
            </button>
          ))}
        </nav>
        <div className="global-controls">
          <Ctrl label="Partition">
            <Seg
              value={method}
              options={[{ value: "ward" as Method, label: "Ward" }, { value: "kmeans" as Method, label: "k-means" }, { value: "louvain" as Method, label: "Louvain" }]}
              onChange={setMethod}
              disabled={tab !== "clusters"}
            />
          </Ctrl>
          <Ctrl label={`Clusters  k = ${k}`}>
            <input type="range" min={2} max={kMax} value={k} onChange={(e) => setK(Number(e.target.value))} disabled={method === "louvain" && tab === "clusters"} />
          </Ctrl>
          <span className="stat" style={{ paddingBottom: 6, maxWidth: 420 }}>
            The k slider moves the Ward cut used on every tab. k-means and Louvain can be compared on the Clusters tab only; the other tabs always read the Ward partition.
          </span>
        </div>
      </header>

      <main>
        {error && <p className="note">Could not load the research data: {error.message}. Run the scripts in analyses/research/ to rebuild public/research/.</p>}
        {!data && !error && <p className="loading">Loading the cluster data…</p>}
        {ctx && tab === "clusters" && <ClustersView {...ctx} />}
        {ctx && tab === "packages" && <PackagesView {...ctx} />}
        {ctx && tab === "trajectories" && <TrajectoriesView {...ctx} />}
        {ctx && tab === "complexity" && <ComplexityView {...ctx} />}
        {ctx && tab === "product-space" && <ProductSpaceView {...ctx} />}
        {ctx && tab === "diversification" && <DiversificationView {...ctx} />}
        {ctx && tab === "outliers" && <OutliersView {...ctx} />}
        {ctx && tab === "mechanisms" && <MechanismsView {...ctx} />}
        {ctx && tab === "screen" && <ScreenView {...ctx} />}
        {ctx && tab === "within" && <WithinView {...ctx} />}
        {ctx && tab === "events" && <EventsView {...ctx} />}
      </main>

      <footer className="colophon">
        Institutions: V-Dem v15 component indicators, six benchmark years 1975–2025, the same selection as the animated country space. Trade and complexity: Atlas of Economic Complexity, HS92 four-digit goods, 2000–2024, via the Growth Lab database. Pipeline in analyses/research/ (R); everything on this page is computed from the files it writes, some of it in the browser so the k slider can move.
      </footer>
    </div>
  );
}
