/**
 * Label and selector helpers for portal pages, shared by the scanner and the guards' DOM side.
 * Adapted from tools/mca-recorder/content.js. They read structure only, never a control's value.
 */

export const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const textOf = (el: Element | null | undefined): string =>
  clean((el as HTMLElement | null)?.innerText || el?.textContent || '');

/** The text a person reads as this control's label. */
export function labelFor(el: Element): string {
  const doc = el.ownerDocument;
  const id = el.getAttribute('id');
  if (id) {
    const l = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (textOf(l)) return textOf(l).slice(0, 200);
  }
  const wrap = el.closest('label');
  if (wrap && textOf(wrap)) return textOf(wrap).slice(0, 200);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const l = doc.getElementById(labelledBy);
    if (textOf(l)) return textOf(l).slice(0, 200);
  }
  const box = el.closest('fieldset, .guideFieldNode, .form-group, .field, .form-field, .cmp-form-text, .cmp-form-options, .row');
  if (box) {
    const lab = box.querySelector('legend, label, .guideFieldLabel, .label, .control-label');
    if (lab && textOf(lab)) return textOf(lab).slice(0, 200);
  }
  return '';
}

export function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (s: string) => string } };
  if (g.CSS?.escape) return g.CSS.escape(value);
  return value.replace(/["\\\]\[#.:>+~*^$|=()\s]/g, '\\$&');
}

/** A short CSS path that finds the element again: id, then name, then nth-of-type steps. */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && parts.length < 6) {
    const tag = cur.tagName.toLowerCase();
    const id = cur.getAttribute('id');
    if (id) {
      parts.unshift(`${tag}#${cssEscape(id)}`);
      break;
    }
    const name = cur.getAttribute('name');
    if (name && cur.tagName !== 'FORM') {
      const sameName = el.ownerDocument.querySelectorAll(`${tag}[name="${cssEscape(name)}"]`);
      if (sameName.length === 1 || cur.getAttribute('type') !== 'radio') {
        parts.unshift(`${tag}[name="${cssEscape(name)}"]`);
        break;
      }
    }
    let step = tag;
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) step += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(step);
    cur = parent;
  }
  return parts.join(' > ');
}

/** Visible on screen: has a box, and no ancestor hides it. jsdom has no layout, so it checks styles. */
export function isVisible(el: Element): boolean {
  const html = el as HTMLElement;
  if (html.hidden) return false;
  if ((el as HTMLInputElement).type === 'hidden') return false;
  const view = el.ownerDocument.defaultView;
  let cur: Element | null = el;
  while (cur) {
    if ((cur as HTMLElement).hidden) return false;
    const style = view?.getComputedStyle(cur);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    cur = cur.parentElement;
  }
  return true;
}

/** The nearest section heading above a control, for the resolver's context. */
export function sectionFor(el: Element): string {
  const section = el.closest('section, fieldset, .guidePanelNode');
  const h = section?.querySelector('h1, h2, h3, h4, legend');
  return textOf(h).slice(0, 80);
}
