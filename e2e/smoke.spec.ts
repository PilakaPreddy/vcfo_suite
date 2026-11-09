import { expect, test as base, type Cookie, type Page } from '@playwright/test';
import { closeLivePopups, login, type DemoRole } from './helpers/login';

/**
 * Smoke suite: every main page renders for every role.
 *
 * Run with `npm run e2e:smoke` after any UI or backend change. It needs the
 * demo data (`npm run db:seed && npm run db:seed-demo`) and reuses a running
 * dev server (`npm run dev`) or starts one.
 *
 * Each page must load with an OK status, stay signed in, show the shell's
 * `<main>` landmark with content, show no error boundary or Next.js error
 * overlay, and log no `console.error` or uncaught page error. The pages split
 * in the 2026-10 refactor (Credentials, MobileHome, Firm People, Create
 * Project, Account Settings, the milestone response form) also get a short
 * interaction check, because they have no component tests.
 *
 * Each role signs in once per worker; the session cookies are then copied
 * into every test's own context, so the project's device settings (the
 * Pixel 7 for `@mobile`) still apply.
 */

/** The demo engagement every demo role can see (client kestrel, PM anita, lead divya). */
const PROJECT = 'demo-kestrel-robotics';
/** Checklist step with a client form, so the staff step page renders the milestone form. */
const FORM_STEP = 'pre-1';

/**
 * Console errors that are noise, not page failures. Keep each entry narrow
 * and say why it is harmless.
 */
const CONSOLE_ALLOWLIST: RegExp[] = [
  // React dev-only hint printed once per tab; not an error in the page.
  /Download the React DevTools/,
];

/** Text shown by app/app/error.tsx and every nested route error.tsx. */
const ERROR_BOUNDARY_TEXT = /Something went wrong|A temporary error occurred/;

const test = base.extend<
  { signIn: (role: DemoRole) => Promise<void>; problems: string[] },
  { cookiesFor: (role: DemoRole) => Promise<Cookie[]> }
>({
  cookiesFor: [
    async ({ browser }, provide, workerInfo) => {
      const cache = new Map<DemoRole, Promise<Cookie[]>>();
      const baseURL = workerInfo.project.use.baseURL;
      await provide((role) => {
        if (!cache.has(role)) {
          cache.set(
            role,
            (async () => {
              const context = await browser.newContext({ baseURL });
              const page = await context.newPage();
              await login(page, role);
              const cookies = await context.cookies();
              await context.close();
              return cookies;
            })(),
          );
        }
        return cache.get(role)!;
      });
    },
    { scope: 'worker' },
  ],
  signIn: async ({ context, cookiesFor }, provide) => {
    await provide(async (role) => {
      await context.addCookies(await cookiesFor(role));
    });
  },
  problems: async ({ page }, provide) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (CONSOLE_ALLOWLIST.some((re) => re.test(text))) return;
      problems.push(`console.error: ${text.slice(0, 500)}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message.slice(0, 500)}`));
    await provide(problems);
  },
});

/** Visit a page and run the generic render checks. */
async function visit(page: Page, problems: string[], path: string) {
  await closeLivePopups(page);
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response, `no response for ${path}`).not.toBeNull();
  expect(response!.status(), `HTTP status for ${path}`).toBeLessThan(400);
  expect(page.url(), `${path} bounced to the login page`).not.toContain('/login');

  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
  // Let the page's client queries finish so their errors surface.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  // Some client-portal pages (Documents, Compliances) have no heading element by
  // design, so the generic check is that the main landmark has rendered content.
  await expect(page.locator('main').first()).not.toBeEmpty({ timeout: 15_000 });

  await expect(page.getByText(ERROR_BOUNDARY_TEXT), `error boundary on ${path}`).toHaveCount(0);
  await expect(page.locator('[data-nextjs-dialog]'), `Next.js error overlay on ${path}`).toHaveCount(0);
  expect(problems, `console errors on ${path}`).toEqual([]);
}

type RouteCheck = (page: Page) => Promise<void>;
type Route = string | [path: string, check: RouteCheck];

/** Account Settings (split into src/views/settings/account/). */
const accountSettings: RouteCheck = async (page) => {
  await expect(page.getByText('About you', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Sign-in and security', { exact: true }).first()).toBeVisible();
};

/** The firm settings store (G-02), on the admin page and the super admin's Firm tab. */
const firmSettings: RouteCheck = async (page) => {
  await expect(page.getByText('Firm settings', { exact: true }).first()).toBeVisible();
};

/** The milestone response form on a staff step page (split into milestone-form/). */
const milestoneForm: RouteCheck = async (page) => {
  await expect(page.getByText(/Couldn.t load this step/)).toHaveCount(0);
  await expect(page.locator('form, [role="tabpanel"], input, textarea').first()).toBeVisible({
    timeout: 20_000,
  });
};

/** Create Project: every section tab opens and shows its fields. */
const createProjectForm: RouteCheck = async (page) => {
  const tabs = page.getByRole('tablist', { name: 'Project details' });
  await expect(tabs).toBeVisible();
  await expect(page.locator('#create-company-name')).toBeVisible();
  const sections: Array<[string, () => ReturnType<Page['locator']>]> = [
    ['Entity details', () => page.locator('#create-subsidiary-legal-name, #create-parent-entity-name').first()],
    ['Team', () => page.getByText(/Project lead/).first()],
    ['Client portal', () => page.locator('#create-section-client')],
    ['Questionnaire', () => page.locator('#create-section-questionnaire')],
  ];
  for (const [label, content] of sections) {
    const tab = tabs.getByRole('tab', { name: label });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(content()).toBeVisible();
  }
};

/** Firm People: the role groups render and the create dialog opens. */
const firmPeople: RouteCheck = async (page) => {
  await expect(page.getByRole('heading', { name: 'People' }).first()).toBeVisible();
  // Admins see a Managers group; a manager sees only their Project leads.
  await expect(page.getByRole('heading', { name: /^(Managers|Project leads)$/ }).first()).toBeVisible();
  const create = page.getByRole('button', { name: 'Create person' });
  if (await create.isVisible()) {
    await create.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
};

/** Client Credentials: identifiers and the workbook render, and every sheet opens. */
const credentials: RouteCheck = async (page) => {
  await expect(page.getByRole('heading', { name: 'Credentials' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Company identifiers' })).toBeVisible();
  const workbook = page.getByRole('region', { name: 'Workbook' });
  await expect(workbook).toBeVisible();
  const sheets = workbook.getByRole('tablist', { name: 'Sheets' }).getByRole('tab');
  await expect(sheets.first()).toBeVisible({ timeout: 20_000 });
  const count = await sheets.count();
  for (let i = 0; i < count; i += 1) {
    await sheets.nth(i).click();
    await expect(sheets.nth(i)).toHaveAttribute('aria-selected', 'true');
  }
};

/** R-52: the client's board resolution (NOC) page: the head, "Passed by" and the decision tree. */
const clientBoardResolution: RouteCheck = async (page) => {
  await expect(page.getByRole('heading', { name: /Board resolution \(NOC\)/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^Passed by: Board of /)).toBeVisible();
  await expect(page.getByText('Why VCFO chose this template')).toBeVisible();
  const replay = page.getByRole('button', { name: 'Replay the chosen path' });
  await replay.click();
  await expect(page.getByText('Project setup · Ownership type')).toBeVisible();
};

/** R-52: the staff board resolution (NOC) page: the head, the template card and the evidence. */
const staffBoardResolution: RouteCheck = async (page) => {
  await expect(page.getByRole('heading', { name: /Board resolution \(NOC\)/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Template', exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('region', { name: 'Why VCFO chose this template' })).toBeVisible();
  await page.getByRole('button', { name: 'Compare versions' }).click();
  await expect(page.getByRole('dialog', { name: 'Compare versions' })).toBeVisible();
  await page.keyboard.press('Escape');
};

const STAFF_COMMON = [
  'announcements',
  'audit-log',
  'compliance',
  'compliance/tracker',
  'compliances',
  'compliances/calendar',
  'compliances/filings',
  'compliances/obligations',
  // R-51: the practice block's staff Incorporation page.
  'incorporation',
  'registrations',
  'labour-registers',
  'budgets',
  'payroll',
  'knowledge-bank',
  'mail',
  'notifications',
  'vault',
];

const ROUTES: Record<DemoRole, Route[]> = {
  super: [
    '/app/super/dashboard',
    '/app/super/projects',
    '/app/super/risks',
    '/app/super/practice/incorporation',
    [`/app/super/projects/${PROJECT}/board-resolution`, staffBoardResolution],
    '/app/super/practice/registrations',
    '/app/super/practice/labour-registers',
    '/app/super/practice/budgets',
    '/app/super/practice/payroll',
    '/app/super/team',
    '/app/super/growth',
    '/app/super/reports',
    '/app/super/announcements',
    '/app/super/notifications',
    ['/app/super/settings?tab=profile', accountSettings],
    ['/app/super/settings', firmSettings],
    '/app/dev/overview',
    '/app/dev/connections',
    '/app/dev/messages',
    '/app/dev/jobs',
    '/app/dev/logs',
    '/app/dev/deploys',
    '/app/dev/access',
    '/app/dev/data',
    '/app/dev/audit',
    ['/app/dev/profile', accountSettings],
  ],
  admin: [
    '/app/admin/dashboard',
    ['/app/admin/firm-settings', firmSettings],
    '/app/admin/overview',
    '/app/admin/analytics',
    '/app/admin/approvals',
    '/app/admin/ask-vcfo/gaps',
    '/app/admin/ask-vcfo/sources',
    '/app/admin/engagements',
    '/app/admin/team',
    ['/app/admin/people', firmPeople],
    '/app/admin/projects',
    ['/app/admin/projects/new', createProjectForm],
    '/app/admin/projects/recycle-bin',
    `/app/admin/projects/${PROJECT}`,
    `/app/admin/projects/${PROJECT}/documents`,
    `/app/admin/projects/${PROJECT}/edit`,
    [`/app/admin/projects/${PROJECT}/step/${FORM_STEP}`, milestoneForm],
    [`/app/admin/projects/${PROJECT}/board-resolution`, staffBoardResolution],
    ['/app/admin/settings', accountSettings],
    ...STAFF_COMMON.map((p) => `/app/admin/${p}`),
  ],
  manager: [
    '/app/manager/dashboard',
    '/app/manager/overview',
    '/app/manager/analytics',
    '/app/manager/approvals',
    '/app/manager/engagements',
    '/app/manager/team',
    ['/app/manager/people', firmPeople],
    '/app/manager/projects',
    ['/app/manager/projects/new', createProjectForm],
    `/app/manager/projects/${PROJECT}`,
    `/app/manager/projects/${PROJECT}/documents`,
    `/app/manager/projects/${PROJECT}/edit`,
    [`/app/manager/projects/${PROJECT}/step/${FORM_STEP}`, milestoneForm],
    [`/app/manager/projects/${PROJECT}/board-resolution`, staffBoardResolution],
    ['/app/manager/settings', accountSettings],
    ...STAFF_COMMON.map((p) => `/app/manager/${p}`),
  ],
  lead: [
    '/app/intern/today',
    '/app/intern/analytics',
    '/app/intern/clients',
    '/app/intern/requests',
    '/app/intern/tasks',
    `/app/intern/engagements/${PROJECT}`,
    `/app/intern/engagements/${PROJECT}/documents`,
    [`/app/intern/engagements/${PROJECT}/board-resolution`, staffBoardResolution],
    [`/app/intern/engagements/${PROJECT}/step/${FORM_STEP}`, milestoneForm],
    ['/app/intern/settings', accountSettings],
    ...STAFF_COMMON.map((p) => `/app/intern/${p}`),
  ],
  client: [
    '/app/client/overview',
    '/app/client/progress',
    '/app/client/incorporation',
    '/app/client/incorporation/phase/1',
    `/app/client/incorporation/step/${FORM_STEP}`,
    ['/app/client/board-resolution', clientBoardResolution],
    ['/app/client/credentials', credentials],
    '/app/client/documents',
    '/app/client/library',
    '/app/client/messages',
    '/app/client/team',
    '/app/client/compliances',
    '/app/client/compliances/calendar',
    '/app/client/compliances/filings',
    '/app/client/compliances/obligations',
    '/app/client/registrations',
    '/app/client/labour-registers',
    '/app/client/budgets',
    '/app/client/payroll',
    '/app/client/announcements',
    '/app/client/notifications',
    '/app/client/audit',
    ['/app/client/settings', accountSettings],
  ],
};

for (const [role, routes] of Object.entries(ROUTES) as Array<[DemoRole, Route[]]>) {
  test.describe(`smoke ${role}`, () => {
    // One worker per role, so each role signs in once. A failure does not skip
    // the rest: the worker restarts and signs in again.
    test.describe.configure({ mode: 'default' });

    for (const route of routes) {
      const [path, check] = typeof route === 'string' ? [route, undefined] : route;
      test(`${role} ${path}`, async ({ page, signIn, problems }) => {
        await signIn(role);
        await visit(page, problems, path);
        if (check) {
          await check(page);
          expect(problems, `console errors after interacting with ${path}`).toEqual([]);
        }
      });
    }
  });
}

test.describe('smoke client phone', () => {
  // MobileHome was retired in the Spectrum port (3a800fd): phones get the responsive home page.
  test('client home on a phone renders the responsive home @mobile', async ({ page, signIn, problems }) => {
    await signIn('client');
    await visit(page, problems, '/app/client/overview');
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
    const box = await main.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    expect(problems).toEqual([]);
  });
});
