/**
 * THE AGENT CATALOG — the four VCFO Assist agents and their sub-agents, as the side panel lists
 * them (docs/specs/vcfo-assist-agents/PLAN.md). Pure data and helpers.
 *
 * `stepId` is the checklist step (`src/data/checklist.ts`) a finished run advances; compliance
 * filings have no checklist step and name their compliance activity (`activityId`,
 * `src/data/compliance-activities.ts`) instead. `srnField` is the existing staff response field on
 * that step the SRN is appended to; a sub-agent without one keeps its SRN on the run only.
 *
 * `status`: `beta` has a recipe checked against the mock portal; `later` has none yet. No
 * sub-agent is `ready` until a supervised live run has verified its recipe (PLAN phase 4).
 */

export type AssistAgentId = 'incorporation' | 'post-incorporation' | 'registration' | 'compliance';
export type AssistSubAgentStatus = 'ready' | 'beta' | 'later';
export type AssistPortal = 'mca' | 'gst' | 'udyam' | 'dgft' | 'state';

export interface AssistSubAgent {
  id: string;
  agent: AssistAgentId;
  title: string;
  /** The form's own name, for example `SPICe+ Part A`. */
  form: string;
  status: AssistSubAgentStatus;
  portal: AssistPortal;
  /** The live portal host; null where the portal is a state site that differs by state. */
  portalHost: string | null;
  recipeId: string | null;
  stepId: string | null;
  activityId?: string;
  srnField?: string;
}

export interface AssistAgent {
  id: AssistAgentId;
  title: string;
  subAgents: AssistSubAgent[];
}

const MCA_HOST = 'www.mca.gov.in';

const sub = (agent: AssistAgentId, rest: Omit<AssistSubAgent, 'agent'>): AssistSubAgent => ({ agent, ...rest });

export const ASSIST_AGENTS: readonly AssistAgent[] = [
  {
    id: 'incorporation',
    title: 'Incorporation',
    subAgents: [
      sub('incorporation', {
        id: 'spice-a',
        title: 'Name reservation',
        form: 'SPICe+ Part A',
        status: 'beta',
        portal: 'mca',
        portalHost: MCA_HOST,
        recipeId: 'spice-a',
        stepId: 'pre-4',
        srnField: 'nameApplicationFilingNotes',
      }),
      sub('incorporation', {
        id: 'spice-b',
        title: 'Incorporation form',
        form: 'SPICe+ Part B',
        status: 'later',
        portal: 'mca',
        portalHost: MCA_HOST,
        recipeId: null,
        stepId: 'pre-10',
        srnField: 'spicePartBAndAgileFiledNotes',
      }),
      // The linked forms are filed with Part B under its SRN, so only Part B writes the SRN back.
      sub('incorporation', { id: 'agile-pro-s', title: 'GST, EPFO, ESIC and bank', form: 'AGILE-PRO-S', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: 'pre-10' }),
      sub('incorporation', { id: 'emoa', title: 'Memorandum of association', form: 'e-MoA (INC-33)', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: 'pre-10' }),
      sub('incorporation', { id: 'eaoa', title: 'Articles of association', form: 'e-AoA (INC-34)', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: 'pre-10' }),
      sub('incorporation', { id: 'inc-9', title: 'Subscriber and director declaration', form: 'INC-9', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: 'pre-10' }),
    ],
  },
  {
    id: 'post-incorporation',
    title: 'Post-incorporation',
    subAgents: [
      sub('post-incorporation', {
        id: 'inc-20a',
        title: 'Commencement of business',
        form: 'INC-20A',
        status: 'later',
        portal: 'mca',
        portalHost: MCA_HOST,
        recipeId: null,
        stepId: 'post-6',
        srnField: 'inc20aNotes',
      }),
      // post-2 has no filing note field, so the ADT-1 SRN stays on the run.
      sub('post-incorporation', { id: 'adt-1', title: 'Auditor appointment', form: 'ADT-1', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: 'post-2' }),
    ],
  },
  {
    id: 'registration',
    title: 'Registration',
    subAgents: [
      // GST, Udyam and IEC return an ARN or a certificate number, not an MCA SRN; it stays on the run.
      sub('registration', { id: 'gst-reg-01', title: 'GST registration', form: 'GST REG-01', status: 'later', portal: 'gst', portalHost: 'reg.gst.gov.in', recipeId: null, stepId: 'reg-4' }),
      sub('registration', { id: 'udyam', title: 'Udyam (MSME) registration', form: 'Udyam', status: 'later', portal: 'udyam', portalHost: 'udyamregistration.gov.in', recipeId: null, stepId: 'reg-15' }),
      sub('registration', { id: 'iec', title: 'Import Export Code', form: 'IEC', status: 'later', portal: 'dgft', portalHost: 'www.dgft.gov.in', recipeId: null, stepId: 'reg-8' }),
      sub('registration', { id: 'shops-establishment', title: 'Shops and establishments', form: 'Shops and Establishments', status: 'later', portal: 'state', portalHost: null, recipeId: null, stepId: 'reg-9' }),
      sub('registration', { id: 'pt', title: 'Professional tax', form: 'PT registration', status: 'later', portal: 'state', portalHost: null, recipeId: null, stepId: 'reg-7' }),
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance',
    subAgents: [
      sub('compliance', { id: 'dir-3-kyc', title: 'Director KYC', form: 'DIR-3 KYC', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: null, activityId: 'ACT-M08' }),
      sub('compliance', { id: 'aoc-4', title: 'Financial statements', form: 'AOC-4', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: null, activityId: 'ACT-015-AOC4' }),
      sub('compliance', { id: 'mgt-7', title: 'Annual return', form: 'MGT-7 / MGT-7A', status: 'later', portal: 'mca', portalHost: MCA_HOST, recipeId: null, stepId: null, activityId: 'ACT-015-MGT7' }),
    ],
  },
];

export function allSubAgents(): AssistSubAgent[] {
  return ASSIST_AGENTS.flatMap((agent) => agent.subAgents);
}

export function findSubAgent(id: string): AssistSubAgent | undefined {
  return allSubAgents().find((s) => s.id === id);
}

/**
 * Live portal hosts stay off until the written CS opinion is recorded (PLAN §4): runs go against
 * the mock only. `ASSIST_LIVE_PORTALS=true` turns them on; nothing else does.
 */
export function assistLivePortalsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ASSIST_LIVE_PORTALS?.trim().toLowerCase() === 'true';
}

/** Hosts that count as the mock portal (`ASSIST_MOCK_HOSTS`, comma separated; localhost by default). */
export function assistMockHosts(env: Record<string, string | undefined> = process.env): string[] {
  const named = (env.ASSIST_MOCK_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return named.length ? named : ['localhost', '127.0.0.1'];
}

/** True when a run may start against this host: always on the mock, on a live host only once enabled. */
export function assistHostAllowed(host: string, env: Record<string, string | undefined> = process.env): boolean {
  const bare = host.trim().toLowerCase().replace(/:\d+$/, '');
  return assistMockHosts(env).includes(bare) || assistLivePortalsEnabled(env);
}
