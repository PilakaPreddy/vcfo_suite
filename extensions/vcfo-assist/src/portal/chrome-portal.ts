/**
 * The engine's PortalPort over chrome APIs, for one portal tab.
 *
 * Most requests go to the content script (`entrypoints/portal.content.ts`), which runs the guards
 * in front of every write and click. Only two calls run in the page's MAIN world, because
 * `window.guideBridge` lives there: reading the model, and setting one field's value by SOM after
 * the content script has already guarded that control.
 */
import { SECRET_FIELD_PATTERN } from '../guards';
import { bridgeSetValue, readBridgeModel } from './bridge';
import type { PortalPort, TeachResult } from '../engine/ports';
import type { PortalRequest } from './agent';

export const CONTENT_SCRIPT_FILE = '/content-scripts/portal.js';

export class ChromePortal implements PortalPort {
  constructor(private readonly tabId: number) {}

  private async ensureContent(): Promise<void> {
    try {
      const pong = await chrome.tabs.sendMessage(this.tabId, { vcfo: 'portal', req: { type: 'ping' } });
      if (pong) return;
    } catch {
      // Not injected yet (for example the tab was open before the extension loaded).
    }
    await chrome.scripting.executeScript({ target: { tabId: this.tabId }, files: [CONTENT_SCRIPT_FILE] });
  }

  private async ask<T>(req: PortalRequest): Promise<T> {
    await this.ensureContent();
    const res = await chrome.tabs.sendMessage(this.tabId, { vcfo: 'portal', req });
    return res as T;
  }

  async tabInfo() {
    try {
      const tab = await chrome.tabs.get(this.tabId);
      return tab.url ? { url: tab.url, active: Boolean(tab.active) } : null;
    } catch {
      return null;
    }
  }

  async readBridge() {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: this.tabId }, world: 'MAIN', func: readBridgeModel });
    return (r?.result as ReturnType<typeof readBridgeModel>) ?? { present: false, nodes: [] };
  }

  async bridgeSet(som: string, value: string) {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      world: 'MAIN',
      func: bridgeSetValue,
      args: [som, value, SECRET_FIELD_PATTERN.source],
    });
    return (r?.result as ReturnType<typeof bridgeSetValue>) ?? { ok: false, reason: 'no result' };
  }

  scan: PortalPort['scan'] = (opts) => this.ask({ type: 'scan', opts });
  prepareFill: PortalPort['prepareFill'] = (target, label) => this.ask({ type: 'prepareFill', target, label });
  fill: PortalPort['fill'] = (target, value, label, bridgeTried) => this.ask({ type: 'fill', target, value, label, bridgeTried });
  click: PortalPort['click'] = (target, label, resultCss) => this.ask({ type: 'click', css: target.css, text: target.text, label, resultCss });
  attach: PortalPort['attach'] = (css, name, base64) => this.ask({ type: 'attach', css, name, base64 });
  highlightHuman: PortalPort['highlightHuman'] = (gates) => this.ask({ type: 'highlightHuman', gates });
  readSrn: PortalPort['readSrn'] = (pattern) => this.ask({ type: 'readSrn', pattern });
  teach = (label: string): Promise<TeachResult> => this.ask({ type: 'teach', label, timeoutMs: 180_000 });

  async cancelTeach(): Promise<void> {
    await this.ask({ type: 'cancelTeach' }).catch(() => undefined);
  }

  async banner(text: string | null): Promise<void> {
    await this.ask({ type: 'banner', text }).catch(() => undefined);
  }
}
