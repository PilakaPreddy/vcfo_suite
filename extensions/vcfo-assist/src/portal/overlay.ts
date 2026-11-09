/**
 * OVERLAY — a Shadow DOM layer over the portal page. It draws boxes only; it never intercepts
 * clicks (pointer-events: none), so the user's own Submit and Pay clicks go straight to the page.
 *
 *   filling  brand outline round the field being written
 *   refused  danger badge "Refused: captcha (G2)" on a secret field
 *   human    pulsing teal outline and "You click this" on Submit, Pay and other human steps
 *   banner   one line at the top, for example the teach-mode prompt
 */
type Kind = 'filling' | 'refused' | 'human' | 'done';

interface Mark {
  el: Element;
  kind: Kind;
  text: string;
  box: HTMLDivElement;
}

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; font: 600 11px/1.3 "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
.box { position: fixed; border-radius: 6px; box-sizing: border-box; transition: all .15s ease; }
.box .tag { position: absolute; left: -2px; top: -20px; padding: 2px 6px; border-radius: 4px; color: #fff; white-space: nowrap; }
.filling { border: 2px solid oklch(57.8% .235 278); background: oklch(57.8% .235 278 / .08); }
.filling .tag { background: oklch(57.8% .235 278); }
.done { border: 2px solid oklch(51% .125 154); }
.done .tag { background: oklch(51% .125 154); }
.refused { border: 2px dashed oklch(51.9% .197 22); background: oklch(51.9% .197 22 / .06); }
.refused .tag { background: oklch(51.9% .197 22); }
.human { border: 3px solid oklch(55% .1 200); animation: pulse 1.2s ease-in-out infinite; }
.human .tag { background: oklch(55% .1 200); font-size: 12px; }
.banner { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px; background: oklch(26% .06 251); color: #fff; font-size: 13px; box-shadow: 0 4px 16px rgb(0 0 0 / .2); }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 oklch(55% .1 200 / .55); } 50% { box-shadow: 0 0 0 8px oklch(55% .1 200 / 0); } }
@media (prefers-reduced-motion: reduce) { .human { animation: none; } .box { transition: none; } }
`;

export class Overlay {
  private host: HTMLElement | null = null;
  private layer: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;
  private marks: Mark[] = [];
  private raf = 0;

  constructor(private readonly doc: Document) {}

  private ensure(): HTMLDivElement {
    if (this.layer && this.host?.isConnected) return this.layer;
    const host = this.doc.createElement('vcfo-assist-overlay');
    const root = host.attachShadow({ mode: 'closed' });
    const style = this.doc.createElement('style');
    style.textContent = CSS;
    const layer = this.doc.createElement('div');
    layer.className = 'layer';
    root.append(style, layer);
    this.doc.documentElement.append(host);
    this.host = host;
    this.layer = layer;
    const view = this.doc.defaultView;
    view?.addEventListener('scroll', () => this.schedule(), true);
    view?.addEventListener('resize', () => this.schedule());
    return layer;
  }

  private schedule(): void {
    const view = this.doc.defaultView;
    if (!view || this.raf) return;
    this.raf = view.requestAnimationFrame(() => {
      this.raf = 0;
      this.place();
    });
  }

  private place(): void {
    // A plain attribute on the host lets tests see what is drawn without opening the closed root.
    this.host?.setAttribute('data-marks', this.marks.map((m) => m.kind).join(','));
    for (const m of this.marks) {
      const r = m.el.getBoundingClientRect();
      Object.assign(m.box.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
    }
  }

  mark(el: Element, kind: Kind, text: string): void {
    const layer = this.ensure();
    const existing = this.marks.find((m) => m.el === el);
    if (existing) {
      existing.kind = kind;
      existing.text = text;
      existing.box.className = `box ${kind}`;
      existing.box.querySelector('.tag')!.textContent = text;
    } else {
      const box = this.doc.createElement('div');
      box.className = `box ${kind}`;
      const tag = this.doc.createElement('span');
      tag.className = 'tag';
      tag.textContent = text;
      box.append(tag);
      layer.append(box);
      this.marks.push({ el, kind, text, box });
    }
    this.place();
  }

  unmarkKind(kind: Kind): void {
    this.marks = this.marks.filter((m) => {
      if (m.kind !== kind) return true;
      m.box.remove();
      return false;
    });
  }

  setBanner(text: string | null): void {
    const layer = this.ensure();
    if (!text) {
      this.banner?.remove();
      this.banner = null;
      return;
    }
    if (!this.banner) {
      this.banner = this.doc.createElement('div');
      this.banner.className = 'banner';
      layer.append(this.banner);
    }
    this.banner.textContent = text;
  }

  clear(): void {
    for (const m of this.marks) m.box.remove();
    this.marks = [];
    this.setBanner(null);
  }

  /** For tests: what is drawn now. */
  snapshot(): Array<{ kind: Kind; text: string }> {
    return this.marks.map((m) => ({ kind: m.kind, text: m.text }));
  }
}
