/**
 * FIELD SCANNER (content script). Lists the visible inputs, selects, textareas and radio groups
 * with their label, name, aria label and SOM path. Values are never read.
 *
 * The SOM path comes from a `data-som` attribute on the field box, or from the guideBridge model
 * that the MAIN-world helper read (`bridge.ts`), matched by name. Each control gets a uid that
 * lives in this script's memory only; the page DOM is not changed.
 */
import { fieldFacts } from '../guards/dom';
import { allowFill, isSecretField } from '../guards';
import { cssPath, isVisible, labelFor, sectionFor, clean } from './label';
import type { RecipeField, ScanResult, ScannedField } from '../shared/types';
import type { BridgeNode } from './bridge';

const registry = new Map<string, Element>();
let counter = 0;

export function elementFor(uid: string): Element | undefined {
  const el = registry.get(uid);
  return el && el.isConnected ? el : undefined;
}

function uidFor(el: Element): string {
  for (const [uid, known] of registry) if (known === el) return uid;
  counter += 1;
  const uid = `v${counter}`;
  registry.set(uid, el);
  return uid;
}

function somFor(el: Element, bridgeByName: Map<string, BridgeNode>): string | null {
  const box = el.closest('[data-som]');
  if (box) return box.getAttribute('data-som');
  const name = el.getAttribute('name');
  return (name && bridgeByName.get(name)?.som) || null;
}

function radioGroupLabel(first: Element): string {
  const fieldset = first.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend) return clean(legend.textContent).slice(0, 200);
  const box = first.closest('.guideFieldNode, [role="radiogroup"]');
  const lab =
    box?.querySelector('.guideFieldLabel') ??
    Array.from(box?.querySelectorAll('label') ?? []).find((l) => !l.querySelector('input'));
  return clean(lab?.textContent ?? box?.getAttribute('aria-label') ?? '').slice(0, 200);
}

export interface ScanOptions {
  bridge?: BridgeNode[];
  hasGuideBridge?: boolean;
  probes?: Array<Pick<RecipeField, 'key' | 'som' | 'css'>>;
}

export function scanDocument(doc: Document, opts: ScanOptions = {}): ScanResult {
  const bridgeByName = new Map((opts.bridge ?? []).filter((n) => n.name).map((n) => [n.name!, n]));
  const fields: ScannedField[] = [];
  const url = doc.location?.href ?? '';
  const seenRadio = new Set<string>();
  let loginVisible = false;

  const controls = Array.from(doc.querySelectorAll('input, select, textarea')).filter((el) => {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    return !['hidden', 'button', 'submit', 'reset', 'image', 'file'].includes(type);
  });

  for (const el of controls) {
    const visible = isVisible(el);
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    const facts = fieldFacts(el);
    const secret = isSecretField(facts);
    if (secret && visible) loginVisible = true;

    if (type === 'radio') {
      const name = el.getAttribute('name') ?? '';
      if (!name || seenRadio.has(name)) continue;
      seenRadio.add(name);
      const group = Array.from(doc.querySelectorAll(`input[type="radio"][name="${name}"]`));
      const options = group.map((r) => labelFor(r) || r.getAttribute('value') || '');
      fields.push({
        uid: uidFor(el),
        tag: 'radio',
        type: 'radio',
        name,
        id: el.getAttribute('id') ?? '',
        label: radioGroupLabel(el),
        aria: el.closest('[role="radiogroup"]')?.getAttribute('aria-label') ?? '',
        placeholder: '',
        som: somFor(el, bridgeByName),
        css: `input[type="radio"][name="${name}"]`,
        visible: group.some(isVisible),
        section: sectionFor(el),
        options,
        refused: allowFill({ ...facts, label: radioGroupLabel(el) }, url),
      });
      continue;
    }

    const tag = el.tagName.toLowerCase() as ScannedField['tag'];
    fields.push({
      uid: uidFor(el),
      tag,
      type: type || tag,
      name: el.getAttribute('name') ?? '',
      id: el.getAttribute('id') ?? '',
      label: facts.label ?? '',
      aria: facts.aria ?? '',
      placeholder: facts.placeholder ?? '',
      som: somFor(el, bridgeByName),
      css: cssPath(el),
      visible,
      section: sectionFor(el),
      options: tag === 'select' ? Array.from((el as HTMLSelectElement).options).map((o) => clean(o.text)) : undefined,
      refused: allowFill(facts, url),
    });
  }

  const probes: Record<string, string | null> = {};
  for (const p of opts.probes ?? []) {
    let hit: ScannedField | undefined;
    if (p.som) hit = fields.find((f) => f.som === p.som);
    if (!hit && p.css) {
      let el: Element | null = null;
      try {
        el = doc.querySelector(p.css);
      } catch {
        el = null;
      }
      if (el) {
        const name = el.getAttribute('name');
        hit = fields.find((f) => elementFor(f.uid) === el || (f.tag === 'radio' && f.name === name));
      }
    }
    probes[p.key] = hit?.uid ?? null;
  }

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  return { url, host, fields, probes, loginVisible, hasGuideBridge: Boolean(opts.hasGuideBridge) };
}

/** Find a control again: by uid, then SOM box, then CSS, then name. */
export function locate(doc: Document, target: { uid: string; som: string | null; css: string; name: string }): Element | null {
  const byUid = elementFor(target.uid);
  if (byUid) return byUid;
  if (target.som) {
    const box = doc.querySelector(`[data-som="${target.som.replace(/"/g, '\\"')}"]`);
    const inner = box?.querySelector('input, select, textarea');
    if (inner) return inner;
  }
  try {
    const el = doc.querySelector(target.css);
    if (el) return el;
  } catch {
    // An invalid selector falls through to the name.
  }
  return target.name ? doc.querySelector(`[name="${target.name.replace(/"/g, '\\"')}"]`) : null;
}
