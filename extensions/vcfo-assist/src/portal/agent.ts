/**
 * PORTAL AGENT — what the content script does when the run engine asks. One function per
 * message, all on a Document so they can be tested in jsdom and injected into a page directly.
 *
 * The agent never decides what to do next; it scans, fills, clicks a safe action, attaches the
 * dropped PDF, highlights the human steps and reads the SRN. The guards run inside `fillElement`
 * and `clickSafe`, immediately before each write or click.
 */
import { guardClick } from '../guards/dom';
import { fillElement, showsValue, type FillResult } from './filler';
import { findSrn } from './srn';
import { Overlay } from './overlay';
import { locate, scanDocument, elementFor, type ScanOptions } from './scanner';
import { clean } from './label';
import type { FieldTarget, GuardRefusal, RecipeGate, ScanResult, ScannedField } from '../shared/types';
import { guardFill } from '../guards/dom';
import { cssPath } from './label';

export type PortalRequest =
  | { type: 'ping' }
  | { type: 'scan'; opts: ScanOptions }
  | { type: 'prepareFill'; target: FieldTarget; label: string }
  | { type: 'fill'; target: FieldTarget; value: string; label: string; bridgeTried: boolean }
  | { type: 'click'; css?: string; text?: string; label: string; resultCss?: string }
  | { type: 'attach'; css: string; name: string; base64: string }
  | { type: 'highlightHuman'; gates: RecipeGate[] }
  | { type: 'readSrn'; pattern?: string }
  | { type: 'teach'; label: string; timeoutMs?: number }
  | { type: 'cancelTeach' }
  | { type: 'banner'; text: string | null }
  | { type: 'clearOverlay' };

export interface ClickResult {
  ok: boolean;
  refused?: GuardRefusal;
  reason?: string;
  text?: string;
}

export interface PrepareResult {
  ok: boolean;
  refused?: GuardRefusal;
  reason?: string;
  som?: string | null;
}

export class PortalAgent {
  readonly overlay: Overlay;
  private teachAbort: (() => void) | null = null;

  constructor(private readonly doc: Document) {
    this.overlay = new Overlay(doc);
  }

  scan(opts: ScanOptions): ScanResult {
    const result = scanDocument(this.doc, opts);
    for (const f of result.fields) {
      if (f.refused && f.visible) {
        const el = elementFor(f.uid);
        if (el) this.overlay.mark(el, 'refused', `Refused: ${f.refused.reason} (${f.refused.code}) · you fill this`);
      }
    }
    return result;
  }

  prepareFill(target: FieldTarget): PrepareResult {
    const el = locate(this.doc, target);
    if (!el) return { ok: false, reason: 'control not found' };
    const refused = guardFill(el);
    if (refused) {
      this.overlay.mark(el, 'refused', `Refused: ${refused.reason} (${refused.code})`);
      return { ok: false, refused, reason: refused.reason };
    }
    this.overlay.mark(el, 'filling', 'Filling…');
    const box = el.closest('[data-som]');
    return { ok: true, som: box?.getAttribute('data-som') ?? target.som };
  }

  fill(target: FieldTarget, value: string, bridgeTried: boolean): FillResult {
    const el = locate(this.doc, target);
    if (!el) return { ok: false, reason: 'control not found' };
    const refused = guardFill(el);
    if (refused) {
      this.overlay.mark(el, 'refused', `Refused: ${refused.reason} (${refused.code})`);
      return { ok: false, refused, reason: refused.reason };
    }
    if (bridgeTried && showsValue(el, value)) {
      this.overlay.mark(el, 'done', 'Filled');
      return { ok: true, via: 'guideBridge' };
    }
    const result = fillElement(el, value);
    if (result.ok) {
      this.overlay.mark(el, 'done', 'Filled');
      if (!showsValue(el, value) && el.tagName !== 'SELECT' && (el as HTMLInputElement).type !== 'radio') {
        return { ok: false, reason: 'value did not stick' };
      }
    } else if (result.refused) {
      this.overlay.mark(el, 'refused', `Refused: ${result.refused.reason} (${result.refused.code})`);
    }
    return result;
  }

  /** A button by CSS selector, or by its visible text (exact, then "starts with"), case-insensitive. */
  findButton(css?: string, text?: string): Element | null {
    if (css) {
      try {
        const el = this.doc.querySelector(css);
        if (el) return el;
      } catch {
        // An invalid selector falls through to the text.
      }
    }
    if (!text) return null;
    const want = clean(text).toLowerCase();
    const buttons = Array.from(this.doc.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"], a.btn'));
    const textOf = (b: Element) => clean((b as HTMLInputElement).value && b.tagName === 'INPUT' ? (b as HTMLInputElement).value : b.textContent).toLowerCase();
    return buttons.find((b) => textOf(b) === want) ?? buttons.find((b) => textOf(b).startsWith(`${want} `)) ?? null;
  }

  async click(css?: string, text?: string, resultCss?: string): Promise<ClickResult> {
    const el = this.findButton(css, text);
    if (!el) return { ok: false, reason: 'button not found' };
    const refused = guardClick(el);
    if (refused) {
      this.overlay.mark(el, 'human', 'You click this');
      return { ok: false, refused, reason: refused.reason };
    }
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 400));
    // Without a result selector the page's text is read, so a recipe's success pattern can match it.
    const result = resultCss ? clean(this.doc.querySelector(resultCss)?.textContent) : clean((this.doc.body as HTMLElement | null)?.innerText || this.doc.body?.textContent).slice(0, 4000);
    return { ok: true, text: result };
  }

  async attach(css: string, name: string, base64: string): Promise<{ ok: boolean; sha256?: string; reason?: string }> {
    const input = this.doc.querySelector(css) as HTMLInputElement | null;
    const view = this.doc.defaultView!;
    if (!input || !(input instanceof view.HTMLInputElement) || input.type !== 'file') return { ok: false, reason: 'attach slot not found' };
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const file = new view.File([bytes], name, { type: 'application/pdf' });
    const dt = new view.DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new view.Event('input', { bubbles: true }));
    input.dispatchEvent(new view.Event('change', { bubbles: true }));
    const back = input.files?.[0];
    if (!back) return { ok: false, reason: 'file did not attach' };
    const digest = await view.crypto.subtle.digest('SHA-256', await back.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    this.overlay.mark(input, 'done', 'Signed PDF attached');
    return { ok: true, sha256 };
  }

  highlightHuman(gates: RecipeGate[]): number {
    let n = 0;
    for (const g of gates) {
      if (!g.css && !g.text) continue;
      const el = this.findButton(g.css, g.text);
      if (!el) continue;
      this.overlay.mark(el, 'human', `You click this: ${g.label.replace(/\.$/, '')}`);
      n += 1;
    }
    return n;
  }

  readSrn(pattern?: string): string | null {
    const text = (this.doc.body as HTMLElement | null)?.innerText || this.doc.body?.textContent || '';
    return findSrn(text, pattern ? new RegExp(pattern, 'g') : undefined);
  }

  /** T4 teach mode: resolves with the control the user clicks, or null on timeout or cancel. */
  teach(label: string, timeoutMs = 120_000): Promise<{ target: FieldTarget; field: Pick<ScannedField, 'label' | 'name' | 'som' | 'css'> } | { refused: GuardRefusal } | null> {
    this.teachAbort?.();
    this.overlay.setBanner(`VCFO Assist: click the field for "${label}"`);
    return new Promise((resolve) => {
      const done = (value: Parameters<typeof resolve>[0]) => {
        this.doc.removeEventListener('click', onClick, true);
        clearTimeout(timer);
        this.overlay.setBanner(null);
        this.teachAbort = null;
        resolve(value);
      };
      const onClick = (ev: Event) => {
        const raw = ev.target as Element | null;
        const el = raw?.closest?.('input, select, textarea, label');
        const control = el?.tagName === 'LABEL' ? (el as HTMLLabelElement).control : el;
        if (!control) return;
        ev.preventDefault();
        ev.stopPropagation();
        const refused = guardFill(control);
        if (refused) return done({ refused });
        const scan = scanDocument(this.doc, {});
        const hit = scan.fields.find((f) => elementFor(f.uid) === control || (f.tag === 'radio' && f.name === control.getAttribute('name')));
        const css = hit?.css ?? cssPath(control);
        done({
          target: { uid: hit?.uid ?? '', som: hit?.som ?? null, css, name: control.getAttribute('name') ?? '' },
          field: { label: hit?.label ?? '', name: control.getAttribute('name') ?? '', som: hit?.som ?? null, css },
        });
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      this.teachAbort = () => done(null);
      this.doc.addEventListener('click', onClick, true);
    });
  }

  cancelTeach(): void {
    this.teachAbort?.();
  }

  async handle(msg: PortalRequest): Promise<unknown> {
    switch (msg.type) {
      case 'ping':
        return { ok: true, url: this.doc.location?.href };
      case 'scan':
        return this.scan(msg.opts);
      case 'prepareFill':
        return this.prepareFill(msg.target);
      case 'fill':
        return this.fill(msg.target, msg.value, msg.bridgeTried);
      case 'click':
        return this.click(msg.css, msg.text, msg.resultCss);
      case 'attach':
        return this.attach(msg.css, msg.name, msg.base64);
      case 'highlightHuman':
        return this.highlightHuman(msg.gates);
      case 'readSrn':
        return this.readSrn(msg.pattern);
      case 'teach':
        return this.teach(msg.label, msg.timeoutMs);
      case 'cancelTeach':
        this.cancelTeach();
        return true;
      case 'banner':
        this.overlay.setBanner(msg.text);
        return true;
      case 'clearOverlay':
        this.overlay.clear();
        return true;
      default:
        return { ok: false, reason: 'unknown request' };
    }
  }
}
