// A FAKE VCFO Suite for the end-to-end test only. It serves a page to keep open in a tab, sets a
// session cookie, and answers the API calls the extension makes from inside that tab. It records
// every request so the test can check the payloads (no profile values, cookie present).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
// The recipes Suite serves, with the dev-key signature Suite makes when no production key is set
// (the bundle is generated from Suite's registry, so these are byte for byte Suite's answers).
const { recipes: SIGNED } = JSON.parse(readFileSync(path.join(here, '../src/recipes/bundled.json'), 'utf8'));

export const SENTINELS = [
  'Sentinel Alpha Private Limited',
  'Sentinel Beta Private Limited',
  'SENTINEL ALPHA PRIVATE LIMITED',
  'SENTINEL BETA PRIVATE LIMITED',
  'SENTINELWORD',
  'SENTINELA1234Z',
  'sentinel@example.test',
  'Sentinel Tower 1',
  'office@sentinel.test',
  'Subone',
  'SENTB1234C',
  'sub1@sentinel.test',
  'Dirtwo',
  'SENTE2222F',
  '09876543',
  '9000000021',
];

const PROFILE = {
  ok: true,
  schemaVersion: 1,
  companyName: 'Sentinel Alpha Private Limited',
  profile: {
    mcaLogin: { userId: '' },
    company: {
      proposedNames: ['Sentinel Alpha Private Limited', 'Sentinel Beta Private Limited'],
      type: 'New Company (Others)',
      class: 'Private',
      category: 'Company limited by shares',
      subCategory: 'Indian non-government company',
      nicCode: '62011',
      capital: { authorized: 1000000, subscribed: 100000, equity: { authorizedShares: 100000, faceValue: 10 } },
    },
    registeredOffice: { line1: 'Sentinel Tower 1', line2: 'Sentinel Road', pincode: '500081', state: 'Telangana', country: 'India', email: 'office@sentinel.test', mobile: '9000000001' },
    subscribers: [
      { index: 1, kind: 'individual', isDirector: true, firstName: 'Subone', surName: 'Sentinelson', father: { firstName: 'Fatherone' }, dob: '01/02/1980', pan: 'SENTB1234C', email: 'sub1@sentinel.test', mobile: '9000000011', shares: { equity: { number: 5000 } } },
      { index: 2, kind: 'individual', isDirector: false, firstName: 'Subtwo', surName: 'Sentineldottir', father: { firstName: 'Fathertwo' }, dob: '03/04/1985', pan: 'SENTC5678D', email: 'sub2@sentinel.test', mobile: '9000000012', shares: { equity: { number: 5000 } } },
    ],
    directors: [
      { id: 'e1', index: 1, firstName: 'Sentinel', surName: 'Sentinelli', din: '09876543', pan: 'SENTINELA1234Z', dob: '05/06/1975', email: 'sentinel@example.test', mobile: '9000000021' },
      { id: 'e4', index: 2, firstName: 'Dirtwo', surName: 'Sentinelova', pan: 'SENTE2222F', dob: '07/08/1990', email: 'dir2@sentinel.test', mobile: '9000000022' },
    ],
    agile: {},
    moa: {},
    aoa: {},
  },
  missing: [],
  notes: [],
};

// The shapes below follow docs/specs/vcfo-assist-agents/API.md. Bodies are checked as strictly as
// Suite's zod schemas: an unknown key is a 400, like the real routes.
const ALLOWED = {
  create: ['subAgent', 'portalHost', 'recipeVersion', 'fieldsTotal', 'state'],
  update: ['status', 'state', 'fieldsTotal', 'fieldsFilled', 'heals', 'refusals', 'srn', 'error'],
  resolve: ['fieldKey', 'fieldLabel', 'candidates', 'recipeId', 'runId'],
  patch: ['recipeId', 'recipeVersion', 'fieldKey', 'proposed', 'evidence', 'sourceTier', 'runId'],
};

const CATALOG = {
  ok: true,
  liveEnabled: false,
  mockHosts: ['localhost', '127.0.0.1'],
  agents: [
    { id: 'incorporation', title: 'Incorporation', subAgents: [
      { id: 'spice-a', agent: 'incorporation', title: 'Name reservation', form: 'SPICe+ Part A', status: 'beta', recipeId: 'spice-a', recipeVersion: SIGNED['spice-a'].recipe.version, stepId: 'pre-4' },
      { id: 'spice-b', agent: 'incorporation', title: 'Incorporation form', form: 'SPICe+ Part B', status: 'beta', recipeId: 'spice-b', recipeVersion: SIGNED['spice-b'].recipe.version, stepId: 'pre-10' },
    ] },
    { id: 'post-incorporation', title: 'Post-incorporation', subAgents: [{ id: 'inc-20a', title: 'Commencement of business', form: 'INC-20A', status: 'later', recipeId: null }] },
    { id: 'registration', title: 'Registration', subAgents: [{ id: 'gst-reg-01', title: 'GST registration', form: 'GST REG-01', status: 'later', recipeId: null }] },
    { id: 'compliance', title: 'Compliance', subAgents: [{ id: 'dir-3-kyc', title: 'Director KYC', form: 'DIR-3 KYC', status: 'later', recipeId: null }] },
  ],
};

export async function startFakeSuite(port = 4319) {
  const log = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      const entry = { method: req.method, path: url.pathname, body, cookie: req.headers.cookie ?? '', origin: req.headers.origin ?? '' };
      log.push(entry);
      const strict = (keys) => {
        try {
          const parsed = JSON.parse(body || '{}');
          return Object.keys(parsed).every((k) => keys.includes(k));
        } catch {
          return false;
        }
      };
      const json = (status, value) => {
        entry.status = status;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(value));
      };
      const p = url.pathname;
      if (p === '/' || p === '/suite.html') {
        entry.status = 200;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'fake-session=staff-1; Path=/; HttpOnly; SameSite=Lax' });
        res.end('<!doctype html><title>FAKE Suite</title><h1>FAKE VCFO Suite (test only)</h1><p>Signed in as a test lead.</p>');
        return;
      }
      if (p === '/__log') return json(200, log);
      if (!entry.cookie.includes('fake-session=staff-1')) return json(401, { error: 'unauthorized' });
      if (p === '/api/engagements' && req.method === 'GET') return json(200, { engagements: [{ id: 'eng-1', slug: 'sentinel', companyName: 'Sentinel Alpha Private Limited' }] });
      if (p === '/api/assist/catalog') return json(200, CATALOG);
      const recipeId = /^\/api\/assist\/recipes\/([\w-]+)$/.exec(p)?.[1];
      if (recipeId) return SIGNED[recipeId] ? json(200, { ok: true, ...SIGNED[recipeId] }) : json(404, { ok: false, error: 'not_found' });
      if (p === '/api/engagements/eng-1/assist-profile') return json(200, PROFILE);
      if (p === '/api/engagements/eng-1/assist-runs' && req.method === 'POST') {
        if (!strict(ALLOWED.create)) return json(400, { ok: false, error: 'unrecognized_keys' });
        return json(201, { ok: true, run: { id: randomUUID(), status: 'running', state: 'READY' } });
      }
      if (/^\/api\/engagements\/eng-1\/assist-runs\/[0-9a-f-]{36}$/.test(p) && req.method === 'PATCH') {
        if (!strict(ALLOWED.update)) return json(400, { ok: false, error: 'unrecognized_keys' });
        return json(200, { ok: true });
      }
      if (p === '/api/assist/resolve') {
        if (!strict(ALLOWED.resolve)) return json(400, { ok: false, error: 'unrecognized_keys' });
        return json(200, { ok: true, choice: null, confidence: 0, tier: 'T1', tokens: 0, aiCalls: 0 });
      }
      if (p === '/api/assist/patches') {
        if (!strict(ALLOWED.patch)) return json(400, { ok: false, error: 'unrecognized_keys' });
        return json(201, { ok: true });
      }
      return json(404, { error: 'not_found' });
    });
  });
  await new Promise((resolve) => server.listen(port, 'localhost', resolve));
  return { server, log };
}
