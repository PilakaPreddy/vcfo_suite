/**
 * Background service worker: hosts the RUN ENGINE and talks to the side panel.
 *
 * The engine (src/engine/runner.ts) is pure; this file gives it chrome-backed ports:
 *   - Suite calls run inside the open Suite tab (src/suite/tab-fetch.ts), never from here;
 *   - portal calls go to the content script or, for guideBridge, the page's MAIN world;
 *   - the run is saved in chrome.storage.session, so it resumes after a worker restart.
 */
import { defineBackground } from 'wxt/utils/define-background';
import { RunEngine, StartRefused } from '../src/engine/runner';
import { TERMINAL } from '../src/engine/machine';
import { isMockHost, liveAllowedFor } from '../src/engine/live';
import { BUNDLED_RECIPES } from '../src/recipes';
import { ChromePortal } from '../src/portal/chrome-portal';
import { DEFAULT_CATALOG, DEFAULT_SUITE_ORIGINS, SUITE_PATHS, SuiteClient } from '../src/suite/suite-client';
import { findSuiteTab, makeTabFetch, originOf } from '../src/suite/tab-fetch';
import { PANEL_PORT, type PanelCommand, type PanelState, type PortalInfo } from '../src/shared/messages';
import type { Persisted, StorePort } from '../src/engine/ports';
import type { Catalog, EngagementSummary } from '../src/shared/types';

const RUN_KEY = 'vcfo.run';
const UI_KEY = 'vcfo.ui';
const SETTINGS_KEY = 'vcfo.settings';

const sessionStore: StorePort = {
  async load() {
    const got = await chrome.storage.session.get(RUN_KEY);
    return (got[RUN_KEY] as Persisted | undefined) ?? null;
  },
  async save(p) {
    await chrome.storage.session.set({ [RUN_KEY]: p });
  },
  async clear() {
    await chrome.storage.session.remove(RUN_KEY);
  },
};

async function suiteOrigins(): Promise<string[]> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  const origins = (got[SETTINGS_KEY] as { suiteOrigins?: string[] } | undefined)?.suiteOrigins;
  return origins?.length ? origins : [...DEFAULT_SUITE_ORIGINS];
}

/** A tab is a portal tab when it is on an MCA host or on the local mock (and is not Suite). */
function isPortalUrl(url: string | undefined, origins: string[]): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (origins.includes(u.origin)) return false;
    return u.hostname === 'mca.gov.in' || u.hostname.endsWith('.mca.gov.in') || (isMockHost(u.hostname) && u.protocol === 'http:');
  } catch {
    return false;
  }
}

async function findPortalTab(): Promise<chrome.tabs.Tab | null> {
  const origins = await suiteOrigins();
  const tabs = (await chrome.tabs.query({})).filter((t) => t.id !== undefined && isPortalUrl(t.url, origins));
  tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return tabs[0] ?? null;
}

export default defineBackground(() => {
  const suite = new SuiteClient(makeTabFetch(suiteOrigins));
  const panels = new Set<chrome.runtime.Port>();
  const ui: Omit<PanelState, 'run' | 'settings' | 'portal'> & { portal?: PortalInfo; settings?: PanelState['settings'] } = {
    suite: { connected: false },
    engagements: [] as EngagementSummary[],
    catalog: DEFAULT_CATALOG as Catalog,
  };

  const engine = new RunEngine({
    suite,
    store: sessionStore,
    portalFor: (tabId) => new ChromePortal(tabId),
    bundledRecipes: BUNDLED_RECIPES,
    onChange: () => broadcast(),
  });

  async function portalInfo(): Promise<PortalInfo> {
    const tab = await findPortalTab();
    if (!tab?.url) return { mock: false, liveAllowed: false };
    const host = new URL(tab.url).hostname;
    return { tabId: tab.id, url: tab.url, host, mock: isMockHost(host), liveAllowed: liveAllowedFor(ui.catalog, host) };
  }

  let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  function broadcast(): void {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(async () => {
      broadcastTimer = null;
      const state: PanelState = {
        ...ui,
        portal: ui.portal ?? { mock: false, liveAllowed: false },
        settings: { suiteOrigins: await suiteOrigins() },
        run: engine.run,
      };
      for (const p of panels) {
        try {
          p.postMessage({ type: 'state', state });
        } catch {
          panels.delete(p);
        }
      }
    }, 30);
  }

  async function loadReadiness(id: string): Promise<void> {
    try {
      const profile = await suite.profile(id);
      ui.readiness = { engagementId: id, companyName: profile.companyName, missing: profile.missing };
    } catch (err) {
      ui.readiness = { engagementId: id, missing: [], error: (err as Error).message };
    }
  }

  async function refresh(): Promise<void> {
    const origins = await suiteOrigins();
    const tab = await findSuiteTab(origins);
    ui.portal = await portalInfo();
    if (!tab) {
      ui.suite = { connected: false, error: 'Open VCFO Suite in a tab and sign in.' };
      broadcast();
      return;
    }
    try {
      const [engagements, catalog] = await Promise.all([suite.engagements(), suite.catalog().catch(() => DEFAULT_CATALOG)]);
      ui.engagements = engagements;
      ui.catalog = catalog;
      ui.suite = { connected: true, origin: originOf(tab.url) ?? undefined };
      const saved = (await chrome.storage.session.get(UI_KEY))[UI_KEY] as { engagementId?: string } | undefined;
      const id = ui.engagementId ?? saved?.engagementId;
      if (id && engagements.some((e) => e.id === id)) {
        ui.engagementId = id;
        if (ui.readiness?.engagementId !== id) await loadReadiness(id);
      }
      ui.portal = await portalInfo();
    } catch (err) {
      ui.suite = { connected: false, origin: originOf(tab.url) ?? undefined, error: (err as Error).message };
    }
    broadcast();
  }

  async function handle(cmd: PanelCommand): Promise<void> {
    ui.notice = undefined;
    switch (cmd.cmd) {
      case 'refresh':
        await refresh();
        return;
      case 'selectEngagement':
        ui.engagementId = cmd.id || undefined;
        ui.readiness = undefined;
        await chrome.storage.session.set({ [UI_KEY]: { engagementId: ui.engagementId } });
        broadcast();
        if (cmd.id) await loadReadiness(cmd.id);
        broadcast();
        return;
      case 'start': {
        ui.portal = await portalInfo();
        const engagement = ui.engagements.find((e) => e.id === ui.engagementId);
        const sub = ui.catalog.agents.find((a) => a.id === cmd.agentId)?.subAgents.find((s) => s.id === cmd.subAgentId);
        if (!engagement) ui.notice = 'Pick a client first.';
        else if (!sub?.recipeId) ui.notice = 'This sub-agent is not built yet.';
        else if (!ui.portal.tabId) ui.notice = 'Open the portal page in a tab first.';
        else {
          try {
            if (engine.run && TERMINAL.has(engine.run.state)) await engine.reset();
            await engine.start({
              engagementId: engagement.id,
              engagementName: engagement.name,
              agentId: cmd.agentId,
              subAgentId: cmd.subAgentId,
              recipeId: sub.recipeId,
              portalTabId: ui.portal.tabId,
            });
          } catch (err) {
            ui.notice = err instanceof StartRefused ? err.message : `Could not start: ${(err as Error).message}`;
          }
        }
        broadcast();
        return;
      }
      case 'event':
        await engine.send(cmd.event);
        return;
      case 'reset':
        await engine.reset();
        broadcast();
        return;
      case 'setOrigins': {
        const origins = cmd.origins.map((o) => originOf(o.trim())).filter((o): o is string => Boolean(o));
        await chrome.storage.local.set({ [SETTINGS_KEY]: { suiteOrigins: origins.length ? origins : [...DEFAULT_SUITE_ORIGINS] } });
        await refresh();
        return;
      }
      case 'tick':
        await engine.tick();
        return;
      case 'openSuite': {
        const origin = ui.suite.origin ?? (await suiteOrigins())[0];
        await chrome.tabs.create({ url: `${origin}${SUITE_PATHS.fixInSuite(ui.engagementId ?? '')}` });
        return;
      }
    }
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT || port.sender?.id !== chrome.runtime.id) return;
    panels.add(port);
    port.onMessage.addListener((cmd: PanelCommand) => {
      void handle(cmd).catch((err) => {
        ui.notice = (err as Error).message;
        broadcast();
      });
    });
    port.onDisconnect.addListener(() => panels.delete(port));
    void refresh();
  });

  // The content script says the page changed (for example the SRN appeared): check the human gates.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg?.vcfo === 'portalChanged' && sender.tab?.id === engine.run?.portalTabId) void engine.tick();
  });

  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.status === 'complete' || info.url) {
      void portalInfo().then((p) => {
        ui.portal = p;
        broadcast();
      });
    }
  });

  setInterval(() => void engine.tick(), 2500);

  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  void engine.restore();
});
