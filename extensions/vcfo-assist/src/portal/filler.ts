/**
 * DOM FILLER (content script) — the fallback when guideBridge is absent or did not take.
 *
 * It writes through the prototype's native value setter and then fires input, change and blur,
 * which React, Angular and AEM all listen to. Selects are matched by option text; radio groups by
 * the option's label. Every write calls the guards first (`guardFill`), and a refused control is
 * never touched.
 */
import { guardFill } from '../guards/dom';
import { clean, labelFor } from './label';
import type { GuardRefusal } from '../shared/types';

/** Plain optional fields (not a union), so it narrows the same under strict and non-strict tsc. */
export interface FillResult {
  ok: boolean;
  via?: 'dom' | 'guideBridge';
  refused?: GuardRefusal;
  reason?: string;
}

const norm = (s: string): string => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** The option whose text best matches `value`: exact, then a "62 - …" style code prefix, then contains. */
export function pickOption(options: string[], value: string): number {
  const v = norm(value);
  if (!v) return -1;
  let i = options.findIndex((o) => norm(o) === v);
  if (i >= 0) return i;
  i = options.findIndex((o) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(norm(o)));
  if (i >= 0) return i;
  const containing = options.map((o, idx) => ({ o: norm(o), idx })).filter((x) => x.o.includes(v) || (x.o.length > 2 && v.includes(x.o)));
  return containing.length === 1 ? containing[0]!.idx : -1;
}

function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fire(el: Element, types: string[]): void {
  const view = el.ownerDocument.defaultView ?? window;
  for (const type of types) {
    const ev = type === 'blur' || type === 'focus' ? new view.FocusEvent(type) : new view.Event(type, { bubbles: true });
    el.dispatchEvent(ev);
  }
}

/** True when the control already shows `value` (so the guideBridge write took). */
export function showsValue(el: Element, value: string): boolean {
  if (el instanceof el.ownerDocument.defaultView!.HTMLSelectElement) {
    const opt = el.options[el.selectedIndex];
    return Boolean(opt) && (norm(opt!.text) === norm(value) || pickOption([opt!.text], value) === 0 || opt!.value === value);
  }
  if ((el as HTMLInputElement).type === 'radio') {
    const doc = el.ownerDocument;
    const checked = doc.querySelector<HTMLInputElement>(`input[type="radio"][name="${(el as HTMLInputElement).name}"]:checked`);
    return Boolean(checked) && (norm(labelFor(checked!)) === norm(value) || checked!.value.toLowerCase() === value.toLowerCase());
  }
  return (el as HTMLInputElement).value === value;
}

export function fillElement(el: Element, value: string): FillResult {
  const refused = guardFill(el);
  if (refused) return { ok: false, refused, reason: `${refused.code}: ${refused.reason}` };
  const view = el.ownerDocument.defaultView!;

  if (el instanceof view.HTMLSelectElement) {
    const idx = pickOption(Array.from(el.options).map((o) => o.text), value);
    const byValue = Array.from(el.options).findIndex((o) => o.value === value);
    const pick = idx >= 0 ? idx : byValue;
    if (pick < 0) return { ok: false, reason: 'no matching option' };
    fire(el, ['focus']);
    setNative(el, el.options[pick]!.value);
    fire(el, ['input', 'change', 'blur']);
    return { ok: true, via: 'dom' };
  }

  if (el instanceof view.HTMLInputElement && el.type === 'radio') {
    const group = Array.from(el.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${el.name}"]`));
    const labels = group.map((r) => labelFor(r) || r.value);
    let idx = pickOption(labels, value);
    if (idx < 0) idx = group.findIndex((r) => r.value.toLowerCase() === value.toLowerCase());
    if (idx < 0) return { ok: false, reason: 'no matching option' };
    const radio = group[idx]!;
    const refusedRadio = guardFill(radio);
    if (refusedRadio) return { ok: false, refused: refusedRadio, reason: refusedRadio.reason };
    if (!radio.checked) radio.click();
    fire(radio, ['input', 'change', 'blur']);
    return { ok: true, via: 'dom' };
  }

  if (el instanceof view.HTMLInputElement || el instanceof view.HTMLTextAreaElement) {
    if (el.disabled || el.readOnly) return { ok: false, reason: 'control is read-only' };
    fire(el, ['focus']);
    setNative(el, value);
    fire(el, ['input', 'change', 'blur']);
    return { ok: true, via: 'dom' };
  }
  return { ok: false, reason: 'not a form control' };
}
