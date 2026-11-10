import { describe, expect, it } from 'vitest';
import type { JNode } from './journey-model';
import { layoutTree } from './layout';

const leaf = (id: string): JNode => ({ id, label: id, kind: 'step', status: 'up', done: 0, total: 1, children: [] });
const group = (id: string, children: JNode[]): JNode => ({ id, label: id, kind: 'group', status: 'up', done: 0, total: children.length, children });

const tree = group('root', [group('a', [leaf('a1'), leaf('a2'), leaf('a3')]), leaf('b')]);
const opts = { nodeW: 100, nodeH: 40, colGap: 20, rowGap: 10 };

describe('layoutTree', () => {
  it('shows only the root when nothing is expanded', () => {
    const out = layoutTree(tree, new Set(), opts);
    expect(out.nodes.map((n) => n.id)).toEqual(['root']);
    expect(out.edges).toEqual([]);
    expect(out.nodes[0]).toMatchObject({ x: 0, y: 0, depth: 0 });
  });

  it('places children one column right and centres the parent on them', () => {
    const out = layoutTree(tree, new Set(['root']), opts);
    const at = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    expect(at.a).toMatchObject({ x: 120, y: 0 });
    expect(at.b).toMatchObject({ x: 120, y: 50 });
    expect(at.root!.y).toBe(25);
    expect(out.edges).toEqual([
      { from: 'root', to: 'a' },
      { from: 'root', to: 'b' },
    ]);
  });

  it('gives every visible leaf its own row when nested groups are open', () => {
    const out = layoutTree(tree, new Set(['root', 'a']), opts);
    const at = Object.fromEntries(out.nodes.map((n) => [n.id, n]));
    expect([at.a1!.y, at.a2!.y, at.a3!.y, at.b!.y]).toEqual([0, 50, 100, 150]);
    expect(at.a!.y).toBe(50);
    expect(at.a1!.x).toBe(240);
    expect(out.nodes[0]!.id).toBe('root');
    expect(at.root!.y).toBe(100);
  });
});
