/**
 * RUN ENGINE. Drives one sub-agent run through the state machine in `./machine.ts`.
 *
 * `drive()` runs the handler for the current state until the run is waiting for the user, is
 * finished, or fails. Every move is logged and saved (`StorePort`), and reported to Suite as
 * labels and counts only. On a service-worker restart `restore()` reloads the run and continues.
 *
 * Safety by construction:
 *  - Human gates (WAIT_LOGIN, WAIT_DSC, WAIT_SUBMIT_PAY) only watch the page; they never act.
 *  - `clickSafe` is the only path to a click. It accepts a recipe action of kind `safe` whose
 *    label passes the guards; the portal agent then guards the real element again.
 *  - Nothing is written before the user confirms the fill table (G13).
 *  - A live host is refused before the profile is pulled unless Suite allows it (G11).
 */
import { HUMAN_STATES, TERMINAL, appendLog, suiteStatus, transition } from './machine';
import { LIVE_BLOCKED_MESSAGE, isMockHost, liveAllowedFor } from './live';
import { validateRecipe, verifySignature } from './recipe';
import { normalizeRecipe } from '../recipes/normalize';
import { valueFor } from './values';
import { resolveField } from '../heal/ladder';
import { profileLeafValues } from '../heal/payload';
import { isForbiddenAction } from '../guards';
import type { Persisted, PortalPort, RunUpdate, StorePort, SuitePort } from './ports';
import { SuiteError } from '../suite/suite-client';
import type { FieldOutcome, ProfileResult, Recipe, RecipeAction, Run, RunState, SignedRecipe, WaitInfo } from '../shared/types';

export type UserEvent =
  | { type: 'LOGGED_IN' }
  | { type: 'CONFIRM_FILL' }
  | { type: 'SKIP_TEACH' }
  | { type: 'PDF_DROPPED'; name: string; base64: string; sha256: string; size: number }
  | { type: 'RETRY' }
  | { type: 'REFILL' }
  | { type: 'CANCEL' };

export interface StartInput {
  engagementId: string;
  engagementName?: string;
  agentId: string;
  subAgentId: string;
  recipeId: string;
  portalTabId: number;
}

export interface EngineDeps {
  suite: SuitePort;
  portalFor(tabId: number): PortalPort;
  store: StorePort;
  /** Recipes shipped in the extension, used when Suite's registry does not answer. */
  bundledRecipes?: Record<string, SignedRecipe>;
  now?: () => number;
  newId?: () => string;
  onChange?: (run: Run | null) => void;
}

export class StartRefused extends Error {}

const WAIT_TEXT: Record<WaitInfo['kind'], string> = {
  login: 'waiting for you to log in',
  confirm: 'waiting for you to confirm the fill table',
  teach: 'waiting for you to click the field',
  check_failed: 'the portal reported errors',
  dsc: 'waiting for the signed PDF',
  submit_pay: 'waiting for you to click Submit and pay',
  live_blocked: 'live portal blocked',
  suite_error: 'Suite did not answer',
};

export class RunEngine {
  private p: Persisted | null = null;
  private driving = false;
  private current: Promise<void> = Promise.resolve();
  private readonly queue: UserEvent[] = [];
  private cancelRequested = false;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  get run(): Run | null {
    return this.p?.run ?? null;
  }

  get busy(): boolean {
    return this.driving;
  }

  /** Resolves once the engine has stopped driving (it waits for the user, or the run ended). */
  async settle(): Promise<void> {
    for (let i = 0; i < 50; i += 1) {
      await this.current;
      await Promise.resolve();
      if (!this.driving && !this.queue.length) return;
    }
  }

  // ---------- lifecycle ----------

  async restore(): Promise<Run | null> {
    this.p = await this.deps.store.load();
    if (this.p && !TERMINAL.has(this.p.run.state)) {
      await this.log('info', 'run restored after a restart');
      void this.drive();
    }
    this.emit();
    return this.run;
  }

  async start(input: StartInput): Promise<Run> {
    if (this.run && !TERMINAL.has(this.run.state)) throw new StartRefused('A run is already in progress. Finish or cancel it first.');
    const portal = this.deps.portalFor(input.portalTabId);
    const tab = await portal.tabInfo();
    if (!tab) throw new StartRefused('Open the portal page in a tab first.');
    // G12: attended only — the portal must be the visible tab of its window.
    if (!tab.active) throw new StartRefused('Bring the portal tab to the front first. Runs work only in your visible tab.');
    const host = hostOf(tab.url);
    const now = this.now();
    let run: Run = {
      id: this.newId(),
      engagementId: input.engagementId,
      engagementName: input.engagementName,
      agentId: input.agentId,
      subAgentId: input.subAgentId,
      recipeId: input.recipeId,
      recipeVersion: '',
      portalTabId: input.portalTabId,
      portalHost: host,
      state: 'READY',
      page: 0,
      fields: [],
      heals: [],
      refusals: [],
      aiCalls: 0,
      aiTokens: 0,
      log: [],
      startedAt: now,
      updatedAt: now,
    };
    run = appendLog(run, 'info', `run created for ${input.subAgentId} on ${host}`, now);
    this.p = { run };
    this.cancelRequested = false;
    await this.save();
    void this.drive();
    return run;
  }

  async send(event: UserEvent): Promise<void> {
    const run = this.run;
    if (!run || TERMINAL.has(run.state)) return;
    if (event.type === 'CANCEL') {
      this.cancelRequested = true;
      if (run.wait?.kind === 'teach') await this.portal().cancelTeach();
      if (!this.driving) await this.finish('CANCELLED', 'cancelled by the user');
      return;
    }
    if (event.type === 'SKIP_TEACH') {
      await this.portal().cancelTeach();
      return;
    }
    if (this.driving) {
      this.queue.push(event);
      return;
    }
    const wait = run.wait;
    switch (event.type) {
      case 'LOGGED_IN':
        if (run.state !== 'WAIT_LOGIN') return;
        await this.log('gate', 'you confirmed the login');
        await this.move('FILL', 'login confirmed by the user');
        break;
      case 'CONFIRM_FILL':
        if (run.state !== 'FILL' || wait?.kind !== 'confirm') return;
        await this.log('gate', 'you confirmed the fill table');
        this.patch({ phase: 'write', wait: undefined });
        await this.save();
        break;
      case 'PDF_DROPPED':
        if (run.state !== 'WAIT_DSC') return;
        this.p!.pdfBase64 = event.base64;
        this.patch({ pdf: { name: event.name, size: event.size, sha256: event.sha256 } });
        await this.log('gate', `signed PDF received: ${event.name} (${event.size} bytes)`);
        await this.move('ATTACH', 'signed PDF dropped');
        break;
      case 'RETRY':
        if (wait?.kind === 'check_failed' || wait?.kind === 'suite_error') {
          this.patch({ wait: undefined });
          await this.save();
        }
        break;
      case 'REFILL':
        if (run.state === 'CHECK' && wait?.kind === 'check_failed') {
          this.patch({ phase: 'plan', fields: run.fields.filter((f) => !this.pageKeys().has(f.key)) });
          await this.move('FILL', 'refill after check errors');
        }
        break;
    }
    void this.drive();
  }

  /** Called by the background's poll timer while a human gate waits for a page change. */
  async tick(): Promise<void> {
    const run = this.run;
    if (!run || this.driving || TERMINAL.has(run.state)) return;
    if (run.state === 'WAIT_LOGIN' || run.state === 'WAIT_SUBMIT_PAY') await this.drive();
  }

  async reset(): Promise<void> {
    if (this.run && !TERMINAL.has(this.run.state)) return;
    this.p = null;
    await this.deps.store.clear();
    this.emit();
  }

  // ---------- the loop ----------

  private drive(): Promise<void> {
    if (this.driving) return this.current;
    this.driving = true;
    this.current = this.loop();
    return this.current;
  }

  private async loop(): Promise<void> {
    try {
      for (let guard = 0; guard < 200; guard += 1) {
        const run = this.run;
        if (!run || TERMINAL.has(run.state)) break;
        if (this.cancelRequested) {
          await this.finish('CANCELLED', 'cancelled by the user');
          break;
        }
        const before = `${run.state}|${run.phase ?? ''}|${run.page}`;
        const waiting = await this.step(run.state);
        if (waiting) break;
        const after = this.run;
        if (after && `${after.state}|${after.phase ?? ''}|${after.page}` === before && !after.wait) break;
      }
    } catch (err) {
      await this.finish('FAILED', (err as Error).message || String(err));
    } finally {
      this.driving = false;
      this.emit();
      const next = this.queue.shift();
      if (next) void this.send(next);
    }
  }

  /** Runs one state's handler. Returns true when the run now waits for the user. */
  private async step(state: RunState): Promise<boolean> {
    switch (state) {
      case 'READY':
        return this.onReady();
      case 'PULL_PROFILE':
        return this.onPullProfile();
      case 'WAIT_LOGIN':
        return this.onWaitLogin();
      case 'FILL':
        return this.onFill();
      case 'CHECK':
        return this.onCheck('check');
      case 'DOWNLOAD':
        return this.onDownload();
      case 'WAIT_DSC':
        return this.onWaitDsc();
      case 'ATTACH':
        return this.onAttach();
      case 'RECHECK':
        return this.onCheck('recheck');
      case 'WAIT_SUBMIT_PAY':
        return this.onWaitSubmitPay();
      case 'READ_SRN':
        return this.onReadSrn();
      case 'WRITE_BACK':
        return this.onWriteBack();
      default:
        return true;
    }
  }

  // ---------- handlers ----------

  private async onReady(): Promise<boolean> {
    const run = this.run!;
    // G11 first: nothing about the client is pulled for a host Suite has not cleared.
    if (!isMockHost(run.portalHost)) {
      let catalog = null;
      try {
        catalog = await this.deps.suite.catalog();
      } catch {
        catalog = null;
      }
      if (!liveAllowedFor(catalog, run.portalHost)) {
        this.patch({ wait: { kind: 'live_blocked', host: run.portalHost } });
        await this.log('refusal', `G11: ${run.portalHost} is a live portal. ${LIVE_BLOCKED_MESSAGE}`);
        await this.finish('FAILED', LIVE_BLOCKED_MESSAGE, { kind: 'live_blocked', host: run.portalHost });
        return true;
      }
    }
    const { recipe, from } = await this.loadRecipe(run.recipeId, run.portalHost);
    this.p!.recipe = recipe;
    this.patch({ recipeVersion: recipe.version, recipeFrom: from });
    await this.log('info', `recipe ${recipe.id}@${recipe.version} from ${from === 'suite' ? 'Suite' : 'the extension'} verified`);
    await this.move('PULL_PROFILE', `recipe ${recipe.id}@${recipe.version}`);
    return false;
  }

  private async loadRecipe(id: string, host: string): Promise<{ recipe: Recipe; from: 'suite' | 'bundled' }> {
    const candidates: Array<{ from: 'suite' | 'bundled'; signed: SignedRecipe }> = [];
    try {
      candidates.push({ from: 'suite', signed: await this.deps.suite.recipe(id) });
    } catch (err) {
      await this.log('suite', `recipe registry did not answer (${(err as Error).message}); trying the bundled recipe`);
    }
    const bundled = this.deps.bundledRecipes?.[id];
    if (bundled) candidates.push({ from: 'bundled', signed: bundled });
    const reasons: string[] = [];
    for (const c of candidates) {
      const who = c.from === 'suite' ? 'Suite' : 'bundled';
      const sig = await verifySignature(c.signed, host);
      if (!sig.ok) {
        reasons.push(`${who}: ${sig.reason}`);
        await this.log('refusal', `G15: ${who} recipe refused: ${sig.reason}`);
        continue;
      }
      let recipe: Recipe;
      try {
        recipe = normalizeRecipe(c.signed.recipe);
      } catch (err) {
        reasons.push(`${who}: ${(err as Error).message}`);
        await this.log('refusal', `G15: ${who} recipe refused: ${(err as Error).message}`);
        continue;
      }
      const problems = validateRecipe(recipe);
      if (problems.length) {
        reasons.push(`${who}: ${problems.join('; ')}`);
        await this.log('refusal', `G15: ${who} recipe refused: ${problems.join('; ')}`);
        continue;
      }
      return { recipe, from: c.from };
    }
    throw new Error(`no usable recipe for ${id}${reasons.length ? ` (${reasons.join(' | ')})` : ''}`);
  }

  private async onPullProfile(): Promise<boolean> {
    const run = this.run!;
    let profile: ProfileResult;
    try {
      profile = await this.deps.suite.profile(run.engagementId);
    } catch (err) {
      return this.waitFor({ kind: 'suite_error', message: `Could not load the profile: ${(err as Error).message}` });
    }
    this.p!.profile = profile;
    await this.log('info', `profile loaded for ${profile.companyName || run.engagementName || run.engagementId} (${profile.missing?.length ?? 0} missing in Suite)`);
    try {
      const created = await this.deps.suite.createRun(run.engagementId, this.createBody());
      if (created?.runId) this.patch({ suiteRunId: created.runId });
    } catch (err) {
      // Suite's own live-portal gate (G11, server side) stops the run like the extension's does.
      if (err instanceof SuiteError && /live_portals_disabled/.test(err.message)) {
        await this.log('refusal', `G11: Suite refused a run on ${run.portalHost}. ${LIVE_BLOCKED_MESSAGE}`);
        await this.finish('FAILED', LIVE_BLOCKED_MESSAGE, { kind: 'live_blocked', host: run.portalHost });
        return true;
      }
      await this.log('suite', `could not create the Suite run record (${(err as Error).message}); continuing`);
    }
    await this.move('WAIT_LOGIN', 'profile loaded');
    return false;
  }

  private async onWaitLogin(): Promise<boolean> {
    const portal = this.portal();
    const bridge = await portal.readBridge().catch(() => ({ present: false, nodes: [] }));
    const scan = await portal.scan({ bridge: bridge.nodes, hasGuideBridge: bridge.present });
    if (!scan.loginVisible) {
      await this.log('gate', 'no login fields visible: you are logged in');
      await this.move('FILL', 'logged in');
      return false;
    }
    return this.waitFor({ kind: 'login' });
  }

  private pageKeys(): Set<string> {
    const page = this.p?.recipe?.pages[this.run!.page];
    return new Set(page?.fields.map((f) => f.key) ?? []);
  }

  private async onFill(): Promise<boolean> {
    const run = this.run!;
    const recipe = this.p!.recipe!;
    const page = recipe.pages[run.page];
    if (!page) return this.move('CHECK', 'no more pages').then(() => false);
    if (!run.phase || run.phase === 'plan') return this.planPage();
    if (run.phase === 'confirm') return this.waitFor({ kind: 'confirm' });

    // phase === 'write': the user confirmed this exact table.
    const portal = this.portal();
    const bridge = await portal.readBridge().catch(() => ({ present: false, nodes: [] }));
    for (const f of this.run!.fields) {
      if (!this.pageKeys().has(f.key) || f.status !== 'planned' || !f.target || f.value == null) continue;
      if (this.cancelRequested) return false;
      const prep = await portal.prepareFill(f.target, f.label);
      if (!prep.ok) {
        if (prep.refused) await this.refuse(f.key, f.label, prep.refused.code, prep.refused.reason);
        else this.setField(f.key, { status: 'failed', note: prep.reason });
        continue;
      }
      let bridgeTried = false;
      const som = prep.som ?? f.target.som;
      if (bridge.present && som) {
        const r = await portal.bridgeSet(som, f.value);
        bridgeTried = r.ok;
      }
      const result = await portal.fill(f.target, f.value, f.label, bridgeTried);
      if (result.ok) {
        this.setField(f.key, { status: 'filled', via: result.via });
        await this.log('fill', `filled "${f.label}" (${f.tier}, ${result.via})`);
      } else if (result.refused) {
        await this.refuse(f.key, f.label, result.refused.code, result.refused.reason);
      } else {
        this.setField(f.key, { status: 'failed', note: result.reason });
        await this.log('error', `could not fill "${f.label}": ${result.reason}`);
      }
    }
    await this.proposePatches();
    const next = recipe.pages[run.page + 1];
    if (next) {
      const nextAction = recipe.actions.find((a) => a.role === 'next');
      if (nextAction) await this.clickSafe(nextAction);
      this.patch({ page: run.page + 1, phase: 'plan' });
      await this.move('FILL', `page ${run.page + 2}: ${next.title}`);
      return false;
    }
    await this.move('CHECK', `${this.filledCount()} of ${this.run!.fields.length} fields filled`);
    return false;
  }

  private async planPage(): Promise<boolean> {
    const run = this.run!;
    const recipe = this.p!.recipe!;
    const page = recipe.pages[run.page]!;
    const profile = this.p!.profile?.profile ?? {};
    const portal = this.portal();
    const bridge = await portal.readBridge().catch(() => ({ present: false, nodes: [] }));
    const scan = await portal.scan({
      bridge: bridge.nodes,
      hasGuideBridge: bridge.present,
      probes: page.fields.map((f) => ({ key: f.key, som: f.som, css: f.css })),
    });
    await this.log('info', `scanned ${scan.fields.length} controls on ${page.title}${bridge.present ? ' (guideBridge found)' : ''}`);

    // Every visible secret control is refused and logged once, whether or not the recipe asks for it.
    for (const f of scan.fields) {
      if (f.refused && f.visible) await this.refuse(null, f.label || f.name || f.placeholder, f.refused.code, f.refused.reason);
    }

    const redactValues = profileLeafValues(profile);
    const claimed = new Set<string>();
    const outcomes: FieldOutcome[] = this.run!.fields.filter((f) => !this.pageKeys().has(f.key));
    this.patch({ fields: outcomes });

    for (const field of page.fields) {
      if (field.askUser) {
        this.upsertField({ key: field.key, label: field.label, status: 'user', note: field.note ?? 'Suite does not hold this: you answer it on the portal' });
        await this.log('info', `"${field.label}" is yours to answer on the portal`);
        continue;
      }
      const value = valueFor(profile, field);
      if (value == null) {
        this.upsertField({ key: field.key, label: field.label, status: 'missing', note: 'not in the Suite profile: you fill this' });
        await this.log('info', `"${field.label}" has no value in Suite: you fill this`);
        continue;
      }
      const r = await resolveField(field, scan, {
        claimed,
        redactValues,
        resolve: (payload) => this.deps.suite.resolve(payload, { recipeId: recipe.id, runId: this.run!.suiteRunId }),
      });
      if (r.aiCalls || r.tokens) {
        this.patch({ aiCalls: this.run!.aiCalls + r.aiCalls, aiTokens: this.run!.aiTokens + r.tokens });
        await this.log('ai', `resolver asked about "${field.label}" (${r.tokens} tokens, labels only)`);
      }
      if (r.found) {
        claimed.add(r.candidate.uid);
        const target = { uid: r.candidate.uid, som: r.candidate.som, css: r.candidate.css, name: r.candidate.name };
        this.upsertField({ key: field.key, label: field.label, status: 'planned', tier: r.tier, target, value, foundLabel: r.candidate.label });
        if (r.tier !== 'T0') await this.heal(field.key, r.tier, field.label, r.candidate.label);
        continue;
      }
      if ('refused' in r) {
        this.upsertField({ key: field.key, label: field.label, status: 'refused', note: r.refused.reason });
        await this.refuse(field.key, field.label, r.refused.code, r.refused.reason);
        continue;
      }
      // T4: teach mode. The panel asks the user to click the field once.
      await this.log('heal', `"${field.label}" not found (${'reason' in r ? r.reason : 'no match'}); asking you to click it`);
      this.patch({ wait: { kind: 'teach', fieldKey: field.key, label: field.label } });
      await this.save();
      const taught = await portal.teach(field.label);
      this.patch({ wait: undefined });
      if (taught && 'target' in taught) {
        if (claimed.has(taught.target.uid)) {
          this.upsertField({ key: field.key, label: field.label, status: 'user', note: 'that control is already used; you fill this' });
        } else {
          claimed.add(taught.target.uid);
          this.upsertField({ key: field.key, label: field.label, status: 'planned', tier: 'T4', target: taught.target, value, foundLabel: taught.field.label });
          await this.heal(field.key, 'T4', field.label, taught.field.label);
        }
      } else if (taught && 'refused' in taught) {
        this.upsertField({ key: field.key, label: field.label, status: 'refused', note: taught.refused.reason });
        await this.refuse(field.key, field.label, taught.refused.code, taught.refused.reason);
      } else {
        this.upsertField({ key: field.key, label: field.label, status: 'user', note: 'skipped: you fill this' });
        await this.log('info', `"${field.label}" skipped: you fill this`);
      }
      if (this.cancelRequested) return false;
    }
    this.patch({ phase: 'confirm' });
    return this.waitFor({ kind: 'confirm' });
  }

  private async onCheck(role: 'check' | 'recheck'): Promise<boolean> {
    const recipe = this.p!.recipe!;
    const action = recipe.actions.find((a) => a.role === 'check');
    if (!action) {
      await this.move(role === 'check' ? 'DOWNLOAD' : 'WAIT_SUBMIT_PAY', 'recipe has no check action');
      return false;
    }
    const res = await this.clickSafe(action);
    if (!res.ok || !matches(action, res.text)) {
      return this.waitFor({ kind: 'check_failed', role, message: res.reason || res.text || 'the portal did not confirm the check' });
    }
    await this.log('info', `${action.label}: ${res.text}`);
    await this.move(role === 'check' ? 'DOWNLOAD' : 'WAIT_SUBMIT_PAY', res.text ?? 'check passed');
    return false;
  }

  private async onDownload(): Promise<boolean> {
    const recipe = this.p!.recipe!;
    const action = recipe.actions.find((a) => a.role === 'download');
    if (action) {
      const res = await this.clickSafe(action);
      if (!res.ok) return this.waitFor({ kind: 'check_failed', role: 'check', message: res.reason ?? 'download failed' });
      await this.log('info', `${action.label}: ${res.text || 'clicked'}`);
    }
    await this.move('WAIT_DSC', 'PDF downloaded; sign it with your DSC');
    return false;
  }

  private async onWaitDsc(): Promise<boolean> {
    if (!this.p!.recipe!.gates.some((g) => g.kind === 'DSC')) {
      await this.move('ATTACH', 'this form has no DSC step');
      return false;
    }
    return this.waitFor({ kind: 'dsc' });
  }

  private async onAttach(): Promise<boolean> {
    const recipe = this.p!.recipe!;
    const pdf = this.run!.pdf;
    const base64 = this.p!.pdfBase64;
    if (!recipe.attachCss) {
      this.p!.pdfBase64 = undefined;
      await this.log('gate', pdf ? 'the recipe has no attach slot: attach the signed PDF on the portal yourself' : 'nothing to attach on this form');
      await this.move('RECHECK', 'no attach slot');
      return false;
    }
    if (!pdf || !base64) {
      await this.move('WAIT_DSC', 'no signed PDF to attach');
      return false;
    }
    const res = await this.portal().attach(recipe.attachCss, pdf.name, base64);
    // G6: the attached bytes must be the dropped bytes, unchanged.
    if (!res.ok || res.sha256 !== pdf.sha256) {
      await this.log('error', `attach failed: ${res.reason ?? 'the attached file does not match the dropped file'}`);
      this.patch({ pdf: undefined });
      this.p!.pdfBase64 = undefined;
      await this.move('WAIT_DSC', 'attach failed; drop the PDF again');
      return false;
    }
    this.p!.pdfBase64 = undefined;
    await this.log('fill', `attached ${pdf.name} (sha256 ${pdf.sha256.slice(0, 12)}…, bytes unchanged)`);
    await this.move('RECHECK', 'signed PDF attached');
    return false;
  }

  private async onWaitSubmitPay(): Promise<boolean> {
    const recipe = this.p!.recipe!;
    const portal = this.portal();
    if (this.run!.wait?.kind !== 'submit_pay') {
      const humanGates = recipe.gates.filter((g) => g.kind === 'SUBMIT' || g.kind === 'PAY');
      await portal.highlightHuman(humanGates);
      await this.log('gate', 'Submit and Pay are yours: the agent never clicks them');
    }
    const srn = await portal.readSrn(recipe.expect.find((e) => e.kind === 'srn')?.pattern);
    if (srn) {
      this.patch({ srn });
      await this.move('READ_SRN', 'SRN on the page');
      return false;
    }
    return this.waitFor({ kind: 'submit_pay' });
  }

  private async onReadSrn(): Promise<boolean> {
    const run = this.run!;
    const srn = run.srn ?? (await this.portal().readSrn());
    if (!srn) return this.move('WAIT_SUBMIT_PAY', 'no SRN yet').then(() => false);
    this.patch({ srn });
    await this.log('info', `SRN read: ${srn}`);
    await this.move('WRITE_BACK', `SRN ${srn}`);
    return false;
  }

  private async onWriteBack(): Promise<boolean> {
    const run = this.run!;
    if (!run.suiteRunId) {
      try {
        const created = await this.deps.suite.createRun(run.engagementId, this.createBody());
        if (created?.runId) this.patch({ suiteRunId: created.runId });
      } catch (err) {
        return this.waitFor({ kind: 'suite_error', message: `Could not write the SRN back: ${(err as Error).message}` });
      }
    }
    try {
      await this.deps.suite.updateRun(run.engagementId, this.run!.suiteRunId!, { ...this.update(), state: 'DONE', status: 'done', srn: run.srn });
    } catch (err) {
      return this.waitFor({ kind: 'suite_error', message: `Could not write the SRN back: ${(err as Error).message}` });
    }
    await this.portal().banner(null).catch(() => undefined);
    await this.move('DONE', `SRN ${run.srn} written back to Suite`);
    return true;
  }

  // ---------- actions ----------

  /**
   * The only path to a click. A `human` action or a label the guards refuse is never sent to the
   * page; the portal agent guards the real element again before it clicks.
   */
  async clickSafe(action: RecipeAction): Promise<{ ok: boolean; text?: string; reason?: string }> {
    if (action.kind !== 'safe') {
      const code = isForbiddenAction({ text: action.label, id: action.id })?.code ?? 'G4';
      await this.refuse(null, action.label, code, 'human action; not clicked');
      return { ok: false, reason: `${action.label} is yours to click` };
    }
    const byLabel = isForbiddenAction({ text: action.label, id: action.id });
    if (byLabel) {
      await this.refuse(null, action.label, byLabel.code, byLabel.reason);
      return { ok: false, reason: `${action.label} is yours to click` };
    }
    const res = await this.portal().click({ css: action.css, text: action.text }, action.label, action.resultCss);
    if (res.refused) {
      await this.refuse(null, action.label, res.refused.code, `${res.refused.reason} (the page's button text)`);
      return { ok: false, reason: `the button on the page reads like ${res.refused.reason}; you click it` };
    }
    return res;
  }

  private async proposePatches(): Promise<void> {
    const run = this.run!;
    const recipe = this.p!.recipe!;
    for (const f of run.fields) {
      if (f.status !== 'filled' || !f.tier || f.tier === 'T0' || f.tier === 'T2' || !f.target) continue;
      try {
        await this.deps.suite.proposePatch({
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          fieldKey: f.key,
          sourceTier: f.tier,
          proposed: { som: f.target.som ?? undefined, css: f.target.css, label: f.foundLabel || undefined },
          evidence: { fieldLabel: f.label, chosenLabel: f.foundLabel || undefined, note: `healed at ${f.tier}` },
          runId: run.suiteRunId,
        });
        await this.log('heal', `patch proposed for "${f.label}" (${f.tier})`);
      } catch (err) {
        await this.log('suite', `patch proposal not sent (${(err as Error).message})`);
      }
    }
  }

  // ---------- bookkeeping ----------

  private portal(): PortalPort {
    return this.deps.portalFor(this.run!.portalTabId);
  }

  private patch(changes: Partial<Run>): void {
    if (!this.p) return;
    this.p.run = { ...this.p.run, ...changes, updatedAt: this.now() };
  }

  private setField(key: string, changes: Partial<FieldOutcome>): void {
    this.patch({ fields: this.run!.fields.map((f) => (f.key === key ? { ...f, ...changes } : f)) });
  }

  private upsertField(outcome: FieldOutcome): void {
    const fields = this.run!.fields.filter((f) => f.key !== outcome.key);
    this.patch({ fields: [...fields, outcome] });
  }

  private filledCount(): number {
    return this.run!.fields.filter((f) => f.status === 'filled').length;
  }

  private async log(kind: Run['log'][number]['kind'], text: string): Promise<void> {
    if (!this.p) return;
    this.p.run = appendLog(this.p.run, kind, text, this.now());
    await this.save();
  }

  private async refuse(key: string | null, label: string, code: Run['refusals'][number]['code'], reason: string): Promise<void> {
    const run = this.run!;
    if (key) this.setField(key, { status: 'refused', note: reason });
    if (!run.refusals.some((r) => r.label === label && r.code === code)) {
      this.patch({ refusals: [...this.run!.refusals, { code, label, reason, t: this.now() }] });
      await this.log('refusal', `${code}: refused "${label}" (${reason})`);
    }
  }

  private async heal(fieldKey: string, tier: Run['heals'][number]['tier'], label: string, found: string): Promise<void> {
    this.patch({ heals: [...this.run!.heals.filter((h) => h.fieldKey !== fieldKey), { fieldKey, tier, label }] });
    await this.log('heal', `healed "${label}" at ${tier} → "${found}"`);
  }

  private async waitFor(wait: WaitInfo): Promise<boolean> {
    const same = JSON.stringify(this.run!.wait) === JSON.stringify(wait);
    this.patch({ wait });
    if (!same) {
      await this.log(HUMAN_STATES.has(this.run!.state) ? 'gate' : 'info', `${this.run!.state}: ${WAIT_TEXT[wait.kind]}`);
      await this.reportProgress(WAIT_TEXT[wait.kind]);
    } else {
      await this.save();
    }
    return true;
  }

  private async move(to: RunState, note: string): Promise<void> {
    this.p!.run = transition(this.p!.run, to, note, this.now());
    if (to === 'FILL' && !this.p!.run.phase) this.p!.run.phase = 'plan';
    await this.save();
    await this.reportProgress(note);
  }

  private async finish(to: 'FAILED' | 'CANCELLED', reason: string, wait?: WaitInfo): Promise<void> {
    if (!this.p || TERMINAL.has(this.p.run.state)) return;
    this.p.run = transition(this.p.run, to, reason, this.now());
    this.p.run = { ...this.p.run, error: to === 'FAILED' ? reason : undefined, wait };
    this.p.pdfBase64 = undefined;
    await this.save();
    await this.portal().banner(null).catch(() => undefined);
    await this.reportProgress(reason);
  }

  /** The run-start body. Suite fills the agent and recipe id from its catalog. */
  private createBody() {
    const run = this.run!;
    const recipe = this.p?.recipe;
    return {
      subAgent: run.subAgentId,
      portalHost: run.portalHost,
      // A bundled recipe's version is not Suite's; sending it would be refused as outdated.
      ...(run.recipeFrom === 'suite' && recipe ? { recipeVersion: recipe.version } : {}),
      fieldsTotal: recipe?.pages.reduce((n, p) => n + p.fields.length, 0) ?? 0,
      state: run.state,
    };
  }

  /** The progress body: counts, keys and labels. No value is ever part of it (G9, G14). */
  update(): RunUpdate {
    const run = this.run!;
    return {
      state: run.state,
      status: suiteStatus(run),
      fieldsTotal: run.fields.length,
      fieldsFilled: this.filledCount(),
      heals: run.heals.map((h) => ({ field: h.fieldKey, tier: h.tier, ok: run.fields.find((f) => f.key === h.fieldKey)?.status !== 'failed' })),
      refusals: run.refusals.map((r) => ({ kind: REFUSAL_KIND[r.code] ?? r.code, target: r.label.slice(0, 200), ...(r.t ? { at: new Date(r.t).toISOString() } : {}) })),
      ...(run.srn ? { srn: run.srn } : {}),
      ...(run.error ? { error: run.error.slice(0, 500) } : {}),
    };
  }

  private async reportProgress(event: string): Promise<void> {
    const run = this.run!;
    if (!run.suiteRunId) return;
    try {
      await this.deps.suite.updateRun(run.engagementId, run.suiteRunId, this.update());
      void event;
    } catch (err) {
      this.p!.run = appendLog(this.p!.run, 'suite', `progress not reported (${(err as Error).message})`, this.now());
      await this.save();
    }
  }

  private async save(): Promise<void> {
    if (this.p) await this.deps.store.save(this.p);
    this.emit();
  }

  private emit(): void {
    this.deps.onChange?.(this.run);
  }
}

/** The `kind` word Suite stores for each guard. */
const REFUSAL_KIND: Record<string, string> = { G1: 'login', G2: 'captcha', G3: 'otp', G4: 'submit', G5: 'pay', G6: 'sign', G7: 'page' };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function matches(action: RecipeAction, text: string | undefined): boolean {
  if (!action.expectText) return true;
  return new RegExp(action.expectText, 'i').test(text ?? '');
}
