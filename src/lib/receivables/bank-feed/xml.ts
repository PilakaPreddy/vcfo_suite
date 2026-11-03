/**
 * A small XML reader for bank statement files (ISO 20022 camt). It builds a plain element tree:
 * names without their namespace prefix, attributes, text and children. It handles declarations,
 * comments, CDATA, self-closing tags and the five standard entities, which is all a camt file
 * uses. It does not resolve DTDs or external entities, so a hostile file cannot reach out.
 */

export type XmlNode = { name: string; attrs: Record<string, string>; text: string; children: XmlNode[] };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const local = (name: string) => name.slice(name.indexOf(':') + 1);

export function parseXml(input: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, text: '', children: [] };
  const stack: XmlNode[] = [root];
  const src = input.replace(/^\uFEFF/, '');
  const tag = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.text += decode(src.slice(last, m.index));
    last = tag.lastIndex;
    if (m[1] !== undefined) {
      top.text += m[1];
      continue;
    }
    if (!m[3]) continue; // comment, declaration, doctype
    const name = local(m[3]);
    if (m[2] === '/') {
      if (stack.length > 1 && stack[stack.length - 1].name === name) stack.pop();
      else throw new Error(`xml_mismatched_tag:${name}`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[4].matchAll(/([\w.:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[local(a[1])] = decode(a[3] ?? a[4] ?? '');
    const node: XmlNode = { name, attrs, text: '', children: [] };
    top.children.push(node);
    if (m[5] !== '/') stack.push(node);
  }
  if (stack.length !== 1) throw new Error('xml_unclosed_tag');
  return root;
}

/** The first child at the end of a path of names, e.g. child(n, 'Amt'), child(n, 'RltdPties', 'Dbtr', 'Nm'). */
export function child(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let cur = node;
  for (const p of path) cur = cur?.children.find((c) => c.name === p);
  return cur;
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}

/** Every descendant with this name, depth first. */
export function descendants(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function textOf(node: XmlNode | undefined): string {
  return node ? node.text.trim() : '';
}
