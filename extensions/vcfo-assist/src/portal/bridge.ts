/**
 * MAIN-world helpers for AEM Adaptive Forms' `window.guideBridge`.
 *
 * These functions are passed to `chrome.scripting.executeScript({ world: 'MAIN', func })`, which
 * serialises the function's source. They must therefore be self-contained: no imports, no
 * closures, plain arguments in and plain JSON out. They are also exported for unit tests.
 *
 * The content script runs the guards on the DOM control before the background calls
 * `bridgeSetValue`; the function still refuses a node whose name or title reads like a secret,
 * using the guards' own pattern passed in as `secretSource`, so the MAIN-world path cannot be
 * used on its own to fill a login control.
 */

export interface BridgeNode {
  som: string;
  name?: string;
  title?: string;
  className?: string;
}

/** Reads `{ som, name, title }` for every field node in the guideBridge model. */
export function readBridgeModel(): { present: boolean; nodes: BridgeNode[] } {
  type Node = { somExpression?: string; name?: string; title?: string; className?: string };
  const gb = (window as unknown as { guideBridge?: { visit?: (cb: (n: Node) => void) => void } }).guideBridge;
  if (!gb || typeof gb.visit !== 'function') return { present: Boolean(gb), nodes: [] };
  const nodes: BridgeNode[] = [];
  try {
    gb.visit((n) => {
      if (n && typeof n.somExpression === 'string' && n.className && /field|textbox|dropdown|radio|textarea/i.test(n.className)) {
        nodes.push({ som: n.somExpression, name: String(n.name ?? ''), title: String(n.title ?? '').slice(0, 200), className: n.className });
      }
    });
  } catch {
    // A model that throws while visited is treated as absent.
  }
  return { present: true, nodes: nodes.slice(0, 2000) };
}

/** Sets one field through `guideBridge.resolveNode(som).value`, so the form's own rules run. */
export function bridgeSetValue(som: string, value: string, secretSource: string): { ok: boolean; reason?: string } {
  type Node = { value?: unknown; name?: string; title?: string };
  const gb = (window as unknown as { guideBridge?: { resolveNode?: (s: string) => Node | null } }).guideBridge;
  if (!gb || typeof gb.resolveNode !== 'function') return { ok: false, reason: 'no guideBridge' };
  let node: Node | null = null;
  try {
    node = gb.resolveNode(som);
  } catch {
    node = null;
  }
  if (!node) return { ok: false, reason: 'SOM not found' };
  const words = `${node.name ?? ''} ${node.title ?? ''}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .toLowerCase();
  if (new RegExp(secretSource).test(words)) return { ok: false, reason: 'refused: secret field' };
  try {
    node.value = value;
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
  return { ok: true };
}
