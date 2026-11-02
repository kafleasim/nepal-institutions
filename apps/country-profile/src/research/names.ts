// Cluster colours and the hand-written names for the default cut.
//
// Cluster ids come from R's cutree and are numbered by first appearance in
// the pooled matrix, so they carry no meaning and change from one k to the
// next. Names are written only for the cut we settled on (Ward, k = 6) after
// reading the profiles in the Packages tab; every other cut is labelled by
// its id and described by its top indicators.
import { GL_PALETTE } from "../lib/glTokens";
import type { Method } from "./data";

export const K_DEFAULT = 6;

export const CLUSTER_COLORS: string[] = [...GL_PALETTE, "#5B8E7D", "#B56576", "#6D597A"];
export const clusterColor = (id: number) => CLUSTER_COLORS[(id - 1) % CLUSTER_COLORS.length];

type Named = { name: string; short: string; blurb: string };

export const WARD_NAMES: Record<number, Record<number, Named>> = {
  6: {
    1: {
      name: "Contested, uneven regimes",
      short: "Contested",
      blurb:
        "Elections are held but unevenly administered; political violence, anti-system movements and mobilisation on both sides are high; public-sector corruption and subnational unevenness are the weak points. Pakistan, Bangladesh, Cambodia, Ethiopia, Thailand and, in 2025, Russia.",
    },
    2: {
      name: "Open electoral democracies",
      short: "Electoral",
      blurb:
        "Multiparty competition with few barriers to parties, judicial review and open civil society, but vote buying and executive discretion remain. Most of Latin America outside the Southern Cone, India, Ghana, Kenya, the Philippines.",
    },
    3: {
      name: "Consolidated liberal democracies",
      short: "Liberal",
      blurb:
        "Impartial administration, clean elections, transparent law and a free press, with the executive constrained. Western Europe, North America, Japan, Korea, Taiwan, the Southern Cone and Costa Rica.",
    },
    4: {
      name: "Repressive personalist autocracies",
      short: "Repressive",
      blurb:
        "The head of state appoints, vetoes and dissolves at will; torture, political killings and censorship are common; assembly and discussion are curtailed. Myanmar, Egypt, Iran, Syria, Belarus, Venezuela, Sudan, Afghanistan.",
    },
    5: {
      name: "One-party mobilising states",
      short: "Party-state",
      blurb:
        "A single organised party with branches, cohesion and state-run mass organisations; state ownership of the economy and weak property rights; no independent unions or media. China, Vietnam, Laos, Cuba, North Korea.",
    },
    6: {
      name: "Party-less monarchies and city-states",
      short: "Monarchies",
      blurb:
        "Parties are absent or banned and mass politics is thin, but the judiciary and administration function and the executive dominates. The Gulf monarchies, Hong Kong and Singapore.",
    },
  },
};

export function clusterName(method: Method, k: number, id: number): string {
  if (method === "ward") {
    const n = WARD_NAMES[k]?.[id];
    if (n) return n.name;
  }
  return `Cluster ${id}`;
}
export function clusterShort(method: Method, k: number, id: number): string {
  if (method === "ward") {
    const n = WARD_NAMES[k]?.[id];
    if (n) return n.short;
  }
  return `C${id}`;
}
export function clusterBlurb(method: Method, k: number, id: number): string | null {
  return method === "ward" ? WARD_NAMES[k]?.[id]?.blurb ?? null : null;
}

export const PS_COLORS: Record<string, string> = {
  "0": "#EAC218", // agriculture
  "1": "#7C6760", // construction
  "2": "#A42DE2", // electronics
  "3": "#36B250", // chemicals & metals
  "4": "#266798", // machinery
  "5": "#757777", // minerals
  "6": "#C64646", // apparel
  "7": "#D1852A", // textile & home
  NA: "#c8c8c8",
};
