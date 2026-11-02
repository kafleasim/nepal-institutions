import { useMemo } from "react";
import type { Merge, Point } from "../data";

type Node = { id: string; k: number; cid: number; size: number; height: number; children: Node[]; x?: number; leafIds: number[] };

type Props = {
  merges: Merge[];
  points: Point[];
  kMax: number;
  k: number; // current cut
  colorAtK: (id: number) => string;
  nameAtK: (id: number) => string;
  width?: number;
  height?: number;
};

/**
 * The top of the Ward tree: its leaves are the clusters at k_max, and each
 * merge above them joins two clusters into one at the next lower k. The
 * heights are Ward's merge cost (the increase in within-cluster sum of
 * squares), on a log scale because the last few merges dwarf the rest.
 * cutree renumbers clusters at every k, so the id a cluster keeps between
 * two cuts is read off the points, which carry every cut's label.
 */
export function Dendrogram({ merges, points, kMax, k, colorAtK, nameAtK, width = 640, height = 300 }: Props) {
  const tree = useMemo(() => {
    // id mapping from clusters at k_from to k_to, read from any point.
    const mapBetween = (kf: number, kt: number) => {
      const m = new Map<number, number>();
      for (const p of points) {
        const a = p[`ward_k${kf}`] as number;
        const b = p[`ward_k${kt}`] as number;
        if (!m.has(a)) m.set(a, b);
      }
      return m;
    };
    const counts = new Map<number, number>();
    for (const p of points) {
      const c = p[`ward_k${kMax}`] as number;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let level = new Map<number, Node>();
    for (const [cid, size] of counts) level.set(cid, { id: `${kMax}-${cid}`, k: kMax, cid, size, height: 0, children: [], leafIds: [cid] });
    const sorted = [...merges].sort((a, b) => b.k_from - a.k_from);
    for (const m of sorted) {
      const map = mapBetween(m.k_from, m.k_to);
      const next = new Map<number, Node>();
      for (const [cid, node] of level) {
        const target = map.get(cid)!;
        if (cid === m.a || cid === m.b) {
          const existing = next.get(target);
          if (existing) {
            existing.children.push(node);
            existing.size += node.size;
            existing.leafIds.push(...node.leafIds);
          } else {
            next.set(target, { id: `${m.k_to}-${target}`, k: m.k_to, cid: target, size: node.size, height: m.height, children: [node], leafIds: [...node.leafIds] });
          }
        } else {
          next.set(target, { ...node, id: `${m.k_to}-${target}`, k: m.k_to, cid: target });
        }
      }
      level = next;
    }
    const root = [...level.values()][0];
    // x positions: leaves in DFS order, internal nodes at the mean of children.
    let x = 0;
    const leaves: Node[] = [];
    const place = (n: Node): number => {
      if (n.children.length === 0) {
        n.x = x++;
        leaves.push(n);
        return n.x;
      }
      const xs = n.children.map(place);
      n.x = xs.reduce((a, b) => a + b, 0) / xs.length;
      return n.x;
    };
    place(root);
    return { root, leaves };
  }, [merges, points, kMax]);

  // The cut for k: between the merge that produced k clusters (k+1 -> k) and
  // the one that would produce k-1.
  const heightBelow = merges.find((m) => m.k_to === k)?.height ?? 0; // merge from k+1 to k
  const heightAbove = merges.find((m) => m.k_from === k)?.height ?? tree.root.height * 1.3;
  const cutH = Math.exp((Math.log(Math.max(heightBelow, 1)) + Math.log(Math.max(heightAbove, 1))) / 2);

  const maxH = Math.max(tree.root.height, heightAbove) * 1.15;
  const minH = Math.max(1, Math.min(...merges.map((m) => m.height)) * 0.6);
  const top = 22, bottom = height - 56, left = 44, right = width - 12;
  const yOf = (h: number) => bottom - ((Math.log(Math.max(h, minH)) - Math.log(minH)) / (Math.log(maxH) - Math.log(minH))) * (bottom - top);
  const xOf = (x: number) => left + (x / Math.max(tree.leaves.length - 1, 1)) * (right - left);

  // Colour: each node takes the colour of the cluster it belongs to at the
  // current k, if it sits at or below the cut; grey above.
  const idAtK = (n: Node) => {
    // find a point in one of this node's k_max leaves and read its label at k
    const leaf = n.leafIds[0];
    const p = points.find((q) => (q[`ward_k${kMax}`] as number) === leaf);
    return p ? (p[`ward_k${k}`] as number) : 0;
  };

  const segs: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  const walk = (n: Node) => {
    const belowCut = n.height <= cutH;
    const color = belowCut ? colorAtK(idAtK(n)) : "#9a9a9a";
    for (const c of n.children) {
      segs.push({ x1: xOf(n.x!), y1: yOf(n.height), x2: xOf(c.x!), y2: yOf(n.height), color });
      segs.push({ x1: xOf(c.x!), y1: yOf(n.height), x2: xOf(c.x!), y2: yOf(c.height), color: c.height <= cutH ? colorAtK(idAtK(c)) : "#9a9a9a" });
      walk(c);
    }
  };
  walk(tree.root);

  // Labels under the cut: one per cluster at k, spanning its leaves.
  const groups = new Map<number, { xs: number[]; size: number }>();
  for (const l of tree.leaves) {
    const id = idAtK(l);
    const g = groups.get(id) ?? { xs: [], size: 0 };
    g.xs.push(l.x!);
    g.size += l.size;
    groups.set(id, g);
  }

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`}>
      {segs.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={2} strokeLinecap="round" />
      ))}
      <line x1={left - 6} x2={right} y1={yOf(cutH)} y2={yOf(cutH)} stroke="#333" strokeDasharray="4 3" strokeWidth={1} />
      <text x={left - 8} y={yOf(cutH) + 4} fontSize={10.5} textAnchor="end" fill="#333">k = {k}</text>
      {tree.leaves.map((l) => (
        <g key={l.id}>
          <circle cx={xOf(l.x!)} cy={bottom} r={Math.max(2.5, Math.sqrt(l.size) * 0.55)} fill={colorAtK(idAtK(l))} opacity={0.85} />
          <text x={xOf(l.x!)} y={bottom + 14} fontSize={9.5} textAnchor="middle" fill="#7c7c7c">{l.size}</text>
        </g>
      ))}
      {[...groups.entries()].map(([id, g]) => {
        const cx = xOf((Math.min(...g.xs) + Math.max(...g.xs)) / 2);
        return (
          <text key={id} x={cx} y={bottom + 30} fontSize={10.5} textAnchor="middle" fill={colorAtK(id)} fontWeight={600}>
            {nameAtK(id)}
          </text>
        );
      })}
      <text x={left} y={top - 4} fontSize={10} textAnchor="start" fill="#7c7c7c">merge cost (log scale) ↑</text>
    </svg>
  );
}
