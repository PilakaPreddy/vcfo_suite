/**
 * Content script on portal pages (MCA hosts and the local mock). It answers the run engine's
 * requests through the PortalAgent, which runs the guards before every write and click, and it
 * tells the background when the page changes so the human gates can notice the SRN.
 */
import { defineContentScript } from 'wxt/utils/define-content-script';
import { PortalAgent, type PortalRequest } from '../src/portal/agent';

export default defineContentScript({
  matches: ['https://*.mca.gov.in/*', 'http://127.0.0.1/*'],
  runAt: 'document_idle',
  main() {
    const w = window as unknown as { __vcfoAssistPortal?: boolean };
    if (w.__vcfoAssistPortal) return;
    w.__vcfoAssistPortal = true;

    const agent = new PortalAgent(document);
    chrome.runtime.onMessage.addListener((msg: { vcfo?: string; req?: PortalRequest }, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id || msg?.vcfo !== 'portal' || !msg.req) return undefined;
      agent.handle(msg.req).then(sendResponse, (err: unknown) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        chrome.runtime.sendMessage({ vcfo: 'portalChanged' }).catch(() => undefined);
      }, 700);
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  },
});
