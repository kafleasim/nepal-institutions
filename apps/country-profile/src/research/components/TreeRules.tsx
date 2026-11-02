import type { Tree, TreeNode } from "../data";

type Props = { tree: Tree; nameOf: (id: number) => string; colorOf: (id: number) => string };

/**
 * The rpart tree as nested rules. Node numbers follow rpart: the children of
 * node n are 2n (left) and 2n + 1 (right). Thresholds are on the z-scored
 * indicator, so "< 0" means "below the pooled average".
 */
export function TreeRules({ tree, nameOf, colorOf }: Props) {
  const byId = new Map<number, TreeNode>(tree.nodes.map((n) => [n.id, n]));
  const render = (id: number, rule: string | null): JSX.Element | null => {
    const n = byId.get(id);
    if (!n) return null;
    if (n.leaf) {
      return (
        <li key={id}>
          {rule && <span className="rule">{rule} → </span>}
          <span className="leaf" style={{ color: colorOf(n.class) }}>{nameOf(n.class)}</span>{" "}
          <span className="n">({n.n} country-years, {Math.round(n.purity * 100)}% of them in this cluster)</span>
        </li>
      );
    }
    const lower = `${n.name} z < ${n.threshold!.toFixed(2)}`;
    const higher = `${n.name} z ≥ ${n.threshold!.toFixed(2)}`;
    const leftRule = n.left_is_lower ? lower : higher;
    const rightRule = n.left_is_lower ? higher : lower;
    return (
      <li key={id}>
        {rule && <span className="rule">{rule}</span>}
        {rule && <span className="n"> ({n.n})</span>}
        <ul>
          {render(2 * id, leftRule)}
          {render(2 * id + 1, rightRule)}
        </ul>
      </li>
    );
  };
  return (
    <div className="tree">
      <ul style={{ borderLeft: "none", paddingLeft: 0 }}>{render(1, null)}</ul>
    </div>
  );
}
