// Builds the 10-day production test plan from one data list.
// Output: docs/specs/uat/test-plan-a3.html (print source), test-plan-a3.pdf (A3 landscape, for the wall)
// and TEST-PLAN.md (the same plan as text, so Claude can read it in later sessions).
// Run: node scripts/build-uat-plan.mjs        (add --no-pdf to skip the PDF)
// The text is written in ASD-STE100 Simplified Technical English.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs/specs/uat');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- data

const META = {
  title: 'VCFO Suite — Production Test Plan',
  subtitle: '10 days · real users · one real client · test and build at the same time',
  window: 'Day 0: Mon 9 Nov 2026 · Day 1 to Day 10: Tue 10 Nov to Thu 19 Nov 2026',
  version: 'v2 · 9 Nov 2026',
};

const DAYS = [
  ['D0', 'Mon 9'], ['D1', 'Tue 10'], ['D2', 'Wed 11'], ['D3', 'Thu 12'], ['D4', 'Fri 13'],
  ['D5', 'Sat 14'], ['D6', 'Sun 15'], ['D7', 'Mon 16'], ['D8', 'Tue 17'], ['D9', 'Wed 18'], ['D10', 'Thu 19'],
];

// Build status from the code on `main` (f0af9f9) and docs/context/STATE.md on 9 Nov.
const BUILD = {
  live: { label: 'Live since 3 Nov', cls: 'b-live' },
  main: { label: 'In main · first deploy D0', cls: 'b-main' },
  fresh: { label: 'In main · never tested', cls: 'b-fresh' },
  off: { label: 'Built · switched off', cls: 'b-off' },
  ops: { label: 'Operations task', cls: 'b-ops' },
};

const ROLES = ['A', 'M', 'L', 'C']; // admin, manager, lead (intern), client

const GROUPS = [
  { key: 'base', name: 'Base', color: 'g-base' },
  { key: 'pre', name: 'Pre-incorporation', color: 'g-pre' },
  { key: 'post', name: 'Post-incorporation', color: 'g-post' },
  { key: 'reg', name: 'Registration', color: 'g-reg' },
  { key: 'comp', name: 'Compliance', color: 'g-comp' },
  { key: 'ops', name: 'Labour registers · Payroll · Budgets', color: 'g-ops' },
  { key: 'ask', name: 'Chatbot', color: 'g-ask' },
  { key: 'msg', name: 'Emails and WhatsApp', color: 'g-msg' },
  { key: 'end', name: 'Close', color: 'g-end' },
];

// track: A = the real client project, B = the sandbox project with test data and a past CIN date.
const TESTS = [
  {
    id: 'T-01', group: 'base', name: 'Data reset and deploy', days: [0], track: '—', build: 'ops',
    roles: ['S'], before: 'Day 0 checklist (sheet 1) is open. Owner has AWS console access.',
    steps: [
      'Make an RDS snapshot. Copy the S3 bucket to a backup prefix.',
      'Delete all data rows and S3 objects. Keep the schema and the super_admin login.',
      'Apply migrations 0035 to 0049 on RDS.',
      'Set CREDENTIALS_ENCRYPTION_KEY and ASK_VCFO_ENABLED=true on App Runner.',
      'Run npm run check on main. Deploy main.',
      'Open each sidebar page as super_admin.',
    ],
    pass: ['Snapshot status is "available".', 'RDS shows 50 migrations.', 'Deploy status is SUCCEEDED.', 'No page shows old data or an error.'],
    msg: '—',
  },
  {
    id: 'T-02', group: 'base', name: 'Logins, roles and access', days: [0, 1], track: '—', build: 'live',
    roles: ['A', 'M', 'L', 'C'], before: 'T-01 is done. The name and email of each tester are known.',
    steps: [
      'super_admin creates 1 admin, 1 manager and 2 or 3 project leads.',
      'Each person sets a password and two-step sign-in.',
      'Each person opens each page in their sidebar.',
      'Each person types the URL of a page of a different role.',
      'Enter a wrong two-step code ten times on one test login.',
      'Each lead connects Outlook in Settings.',
    ],
    pass: ['Each person sees only the pages of their role.', 'A wrong-role URL redirects.', 'Ten wrong codes lock the login.', 'Outlook shows "Connected".'],
    msg: 'Welcome email · password reset email',
  },
  {
    id: 'T-03', group: 'base', name: 'Project creation and client invite', days: [1], track: 'A + B', build: 'live',
    roles: ['A', 'C'], before: 'Real client data: company name, type, directors, contact email.',
    steps: [
      'Admin creates the real project (Track A). Set Dependent or Independent.',
      'Admin creates the sandbox project (Track B) with test data.',
      'Assign the manager and one lead to each project.',
      'Invite the client to Track A. Invite a team email to Track B as client.',
      'The client accepts the invite, sets a password and signs in.',
    ],
    pass: ['Each project shows on the admin, manager and lead dashboards.', 'The client sees only their own project.', 'Parent entity fields show only for Dependent.'],
    msg: 'Invite email · assignment email to manager and lead',
  },
  {
    id: 'T-04', group: 'pre', name: 'Client questionnaire (Part A)', days: [1, 2], track: 'A', build: 'live',
    roles: ['L', 'C'], before: 'T-03 is done. The client has the incorporation details.',
    steps: [
      'Client opens Incorporation and fills each Part A section.',
      'Client leaves one required field empty and tries to submit.',
      'Client searches and selects the NIC code.',
      'Client submits. The lead opens the same answers.',
      'Lead fills the missing fields and requests approval.',
    ],
    pass: ['Answers save after a page reload.', 'An empty required field stops the submit.', 'The lead sees the same answers as the client.'],
    msg: 'Manager gets "step submitted" · bell',
  },
  {
    id: 'T-05', group: 'pre', name: 'SPICe+ checklist (Part B)', days: [2, 3], track: 'A', build: 'live',
    roles: ['L', 'C'], before: 'Part A is approved. Capital, office and director data are known.',
    steps: [
      'Lead fills Capital Structure (step 13).',
      'Lead fills Registered Office (step 14).',
      'Lead adds each proposed director (step 15).',
      'Lead fills the remaining Part B steps in sequence.',
      'Open a step that is not yet open.',
      'Compare the progress value on the lead, manager and client pages.',
    ],
    pass: ['Steps open only in the correct sequence.', 'Each director shows in the director list.', 'Progress is the same value for each role.'],
    msg: 'Manager gets each request for approval',
  },
  {
    id: 'T-06', group: 'pre', name: 'KYC, DSC and document vault', days: [2, 3], track: 'A', build: 'live',
    roles: ['M', 'L', 'C'], before: 'Real KYC files for each director (PAN, Aadhaar, photo, address proof).',
    steps: [
      'Lead sends a document request to the client.',
      'Client uploads each KYC file from the portal.',
      'Lead marks the DSC status for each director.',
      'Manager opens Vault › Client view and opens each file.',
      'Client downloads all documents as a ZIP.',
    ],
    pass: ['Each file opens in the viewer.', 'Files are in the correct folder.', 'The ZIP holds all files.', 'A client cannot see the files of a different client.'],
    msg: 'Client gets the document request email',
  },
  {
    id: 'T-07', group: 'pre', name: 'Manager approvals and step visibility', days: [2, 3, 4], track: 'A', build: 'live',
    roles: ['M', 'L', 'C'], before: 'At least three steps wait for approval.',
    steps: [
      'Manager accepts one step from the step page.',
      'Manager rejects one step with a reason.',
      'Manager requests a change on one step.',
      'Manager accepts one step from the bell and one from Approvals.',
      'Client opens the steps before and after each decision.',
    ],
    pass: ['A rejected step goes back to the lead with the reason.', 'The client sees a step only after the manager accepts it.', 'A lead draft is not visible to the manager.'],
    msg: 'Lead gets reject email · client gets "approved" email · WhatsApp nudge (if on)',
  },
  {
    id: 'T-08', group: 'pre', name: 'MCA document pack', days: [4], track: 'A', build: 'live',
    roles: ['M', 'L'], before: 'All Part B steps are approved.',
    steps: [
      'Lead generates each incorporation document.',
      'Lead generates the drafts for each director.',
      'Lead downloads the document pack as a ZIP.',
      'Manager compares each document with the answers.',
    ],
    pass: ['Each .docx opens in Word without a repair message.', 'Names, addresses, capital and NIC agree with the answers.', 'No field shows a blank or a placeholder.'],
    msg: '—',
  },
  {
    id: 'T-09', group: 'pre', name: 'Board resolutions', days: [4], track: 'A', build: 'live',
    roles: ['M', 'L'], before: 'T-08 is done.',
    steps: [
      'Lead generates the board resolutions.',
      'Lead changes one answer (for example the date).',
      'Lead generates the resolutions again.',
      'Manager reads each resolution.',
    ],
    pass: ['The .docx opens.', 'The new value shows in the second file.', 'Parent entity data is correct (Dependent only).'],
    msg: '—',
  },
  {
    id: 'T-10', group: 'post', name: 'Incorporation close (CIN) and stage change', days: [5], track: 'B (A when CIN comes)', build: 'live',
    roles: ['A', 'M', 'C'], before: 'Track B project has a past CIN date (for example 1 Aug 2026).',
    steps: [
      'Manager enters the CIN and the incorporation date.',
      'Manager uploads the certificate of incorporation.',
      'Admin moves the project to Post-Incorporation.',
      'Lead does the post-incorporation steps.',
      'Client opens the dashboard and the compliance pages.',
    ],
    pass: ['The stage changes on each dashboard.', 'The pre-incorporation notice goes away.', 'Compliance due dates start from the CIN date.'],
    msg: 'Client gets the incorporation email',
  },
  {
    id: 'T-11', group: 'post', name: 'Board meetings', days: [5], track: 'B', build: 'live',
    roles: ['M', 'L'], before: 'T-10 is done. The lead has Outlook connected.',
    steps: [
      'Lead creates the first board meeting from Compliances › Obligations.',
      'Lead sends the notice for approval.',
      'Manager approves the notice.',
      'Open the notice email and the calendar entry.',
    ],
    pass: ['The notice has a Word file.', 'The calendar entry has a Teams link.', 'A failed email shows in the bell.'],
    msg: 'Directors get the notice email',
  },
  {
    id: 'T-12', group: 'reg', name: 'Registrations', days: [6], track: 'B', build: 'main',
    roles: ['M', 'L', 'C'], before: 'T-10 is done. Sample certificates (PDF) are ready.',
    steps: [
      'Lead opens Registrations and starts GST.',
      'Lead starts PF, ESI, PT and Shops and Establishment.',
      'Lead uploads a certificate for two registrations.',
      'Manager approves the registrations.',
      'Client opens Registrations in the portal.',
    ],
    pass: ['Each registration shows the correct status.', 'Certificates show in the Vault.', 'The client sees the same status.', 'New obligations show in the compliance calendar.'],
    msg: 'Client gets request and completion emails',
  },
  {
    id: 'T-13', group: 'comp', name: 'Compliance calendar and filings', days: [7], track: 'B', build: 'live',
    roles: ['A', 'M', 'L', 'C'], before: 'T-10 and T-12 are done.',
    steps: [
      'Each role opens Compliances › Calendar and Filings.',
      'Compare 5 due dates with the statutory due dates.',
      'Lead marks one filing as filed and uploads the proof.',
      'Manager approves the filing.',
      'Admin opens the firm-wide compliance view.',
    ],
    pass: ['Due dates are correct.', 'Status words and colours are the same for each role.', 'The filed item shows as done for the client.'],
    msg: '—',
  },
  {
    id: 'T-14', group: 'comp', name: 'Reminders and overdue items', days: [7, 8, 9, 10], track: 'B', build: 'live',
    roles: ['M', 'L', 'C'], before: 'T-13 is done. One filing is due in the next 7 days, one is past due.',
    steps: [
      'Make sure one filing is due soon and one is overdue.',
      'Wait for the daily reminder job.',
      'Each role opens the bell.',
      'Record the time each reminder arrives, each day until D10.',
    ],
    pass: ['One reminder for each filing for each day, not more.', 'The overdue item shows in red.', 'Health of the project changes to at-risk or overdue.'],
    msg: 'Reminder email · WhatsApp reminder (if on)',
  },
  {
    id: 'T-15', group: 'ops', name: 'Labour registers', days: [8], track: 'B', build: 'main',
    roles: ['M', 'L', 'C'], before: 'An employee sheet with at least 10 employees and one month of attendance and wages.',
    steps: [
      'Lead uploads the employee data.',
      'Lead maps the columns and checks the verification page.',
      'Lead generates the registers for one month.',
      'Manager closes the month.',
      'Client opens Labour registers in the portal and downloads one register.',
    ],
    pass: ['Each register downloads and opens.', 'Totals agree with the uploaded sheet.', 'The client sees the registers after the close.'],
    msg: 'Client gets "registers ready" email',
  },
  {
    id: 'T-16', group: 'ops', name: 'Payroll', days: [8], track: 'B', build: 'main',
    roles: ['M', 'L', 'C'], before: 'T-15 is done (same employees).',
    steps: [
      'Lead adds two salary updates (one increase, one new employee).',
      'Lead opens the payroll summary for the month.',
      'Manager compares the totals with a manual calculation.',
      'Compare the payroll totals with the wage register.',
      'Client opens Payroll in the portal.',
    ],
    pass: ['Totals agree with the manual calculation.', 'Payroll and wage register agree.', 'The client sees only their own payroll.'],
    msg: '—',
  },
  {
    id: 'T-17', group: 'ops', name: 'Budgets and variance', days: [9], track: 'B', build: 'fresh',
    roles: ['M', 'L', 'C'], before: 'A sample budget in Excel. Two months of actual costs.',
    steps: [
      'Lead creates a budget and fills each section.',
      'Manager approves the budget.',
      'Lead opens Variance, enters the actual costs and submits.',
      'Manager sends the variance back one time, then approves it.',
      'Export the budget to Excel and PDF.',
      'Client opens Budgets in the portal.',
    ],
    pass: ['Variance agrees with a manual calculation.', 'Advance tax agrees with a manual calculation.', 'Excel and PDF open.', 'The client cannot see the Variance tab.'],
    msg: 'Client gets the budget email',
  },
  {
    id: 'T-18', group: 'ask', name: 'Ask VCFO (chatbot)', days: [9], track: 'A + B', build: 'live',
    roles: ['L', 'C'], before: 'A list of 10 real questions: 5 about the project, 5 about compliance law.',
    steps: [
      'Lead asks the 5 project questions.',
      'Lead asks the 5 compliance law questions.',
      'Client asks 3 questions about their own project.',
      'Client asks about a different company name.',
      'Lead pastes director details. Lead accepts one review card.',
    ],
    pass: ['Answers are correct and use only the data of the same client.', 'A different company gets no data.', 'The accepted card changes the correct field only.'],
    msg: '—',
  },
  {
    id: 'T-19', group: 'msg', name: 'Email', days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], track: 'A + B', build: 'live',
    roles: ['A', 'M', 'L', 'C'], before: 'SES is out of sandbox mode (Day 0 checklist).',
    steps: [
      'Each tester keeps each email from the app in one folder.',
      'Each evening, compare the emails with the email column on this plan.',
      'Click each link in each email.',
      'Record a missing, late or wrong email as a defect.',
    ],
    pass: ['Each event sends one email to the correct people.', 'No email goes to a wrong client.', 'Each link opens the correct page.'],
    msg: 'All',
  },
  {
    id: 'T-20', group: 'msg', name: 'WhatsApp', days: [1, 5, 7, 10], track: 'A + B', build: 'off',
    roles: ['A', 'M', 'L', 'C'], before: 'The six templates are approved. WHATSAPP_ENABLED=true.',
    steps: [
      'Each tester gives consent and adds a phone number in Settings.',
      'Do one event for each of the six templates.',
      'Turn on the kill switch. Do one event.',
      'Turn off the kill switch.',
    ],
    pass: ['Each nudge arrives.', 'With the kill switch on, no nudge goes and the email still goes.', 'A failed number shows as "failed".'],
    msg: 'All six templates',
  },
  {
    id: 'T-21', group: 'end', name: 'Regression, security and sign-off', days: [10], track: 'A + B', build: 'ops',
    roles: ['A', 'M', 'L', 'C'], before: 'All earlier tests are ticked or have a defect ID.',
    steps: [
      'Do T-02 to T-07 again, quickly, on the last build.',
      'Client tries each staff URL. Client tries the ID of the other project.',
      'Count the open defects by severity.',
      'Owner decides: go live, or go live with a list, or delay.',
    ],
    pass: ['0 open S1 defects.', 'Each open S2 defect has an owner and a date.', 'The client sees no staff-only data.'],
    msg: 'All earlier emails still arrive',
  },
];

const DAY0 = [
  'Make an RDS snapshot. Wait for "available".',
  'Copy the S3 bucket to a backup prefix.',
  'Write down the deployed image tag (for rollback).',
  'Delete all data rows. Keep the super_admin login.',
  'Delete all S3 objects of the old data.',
  'Apply migrations 0035 to 0049 on RDS.',
  'Set CREDENTIALS_ENCRYPTION_KEY on App Runner.',
  'Set ASK_VCFO_ENABLED=true.',
  'Make sure SES is out of sandbox mode.',
  'Check the six WhatsApp templates. Set WHATSAPP_ENABLED only if approved.',
  'Run npm run check on main. It must pass.',
  'Deploy main. Status must be SUCCEEDED.',
  'Read the App Runner logs for 10 minutes. No errors.',
  'Create the staff logins (T-02).',
];

const LOOP = [
  ['09:30', 'Smoke', 'Each tester signs in and opens their sidebar pages on the new build.'],
  ['10:00', 'Test', 'Do the tests of the day in ID sequence. Tick each step.'],
  ['13:30', 'Triage', 'Read the new defects. Set severity and owner. Give S1 and S2 to Claude.'],
  ['14:00', 'Build', 'Claude fixes on a branch. Each fix gets a test. npm run check passes.'],
  ['18:30', 'Deploy', 'Merge, apply new migrations, deploy. Write the build tag on the daily log.'],
  ['09:30+1', 'Retest', 'Do the failed steps again on the new build. Close or reopen the defect.'],
];

const SEVERITY = [
  ['S1', 'Stops the workflow, loses data or shows data of a different client.', 'Fix the same day'],
  ['S2', 'Wrong result. A workaround is possible.', 'Fix in 2 days'],
  ['S3', 'Text, layout or colour problem.', 'Fix after D10'],
];

const REPORT = [
  'Test ID and step number (for example T-07 step 2)',
  'Role and login email',
  'Page URL',
  'What you did, in steps',
  'What you expected',
  'What happened',
  'Screenshot',
];

const BUILD_NOTES = [
  ['Live since 3 Nov', 'Deployed before. Expect few defects.'],
  ['In main · first deploy D0', 'Built and merged, never in production. Expect defects.'],
  ['In main · never tested', 'Built with no tests. Expect many defects. Give extra time.'],
  ['Built · switched off', 'Works only after setup outside the app.'],
];

// ---------------------------------------------------------------- html

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const box = (cls = '', mark = '') => `<span class="box ${cls} ${mark ? `m-${mark}` : ''}">${{ ok: '✓', bad: '✗', person: 'P', blocked: '!' }[mark] ?? ''}</span>`;

// Results of the acceptance run, when there is one (--results): each step gets ✓, ✗, P (a person
// must check) or ! (blocked); the Done box gets the test's overall mark.
const RESULTS_FILE = join(root, 'e2e/uat/results/records.jsonl');
const useResults = process.argv.includes('--results') && existsSync(RESULTS_FILE);
const RECS = useResults ? readFileSync(RESULTS_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
function stepMark(id, n) {
  const r = RECS.filter((x) => x.test === id && String(x.step) === String(n));
  if (!r.length) return '';
  if (r.some((x) => x.status === 'fail')) return 'bad';
  if (r.some((x) => x.status === 'blocked')) return 'blocked';
  if (r.every((x) => x.status === 'untestable')) return 'person';
  return 'ok';
}
function testMark(id) {
  const r = RECS.filter((x) => x.test === id);
  if (!r.length) return '';
  if (r.some((x) => x.status === 'fail')) return 'bad';
  if (r.some((x) => x.status === 'blocked')) return 'blocked';
  if (!r.some((x) => x.status === 'pass')) return 'person';
  return 'ok';
}
const groupOf = (k) => GROUPS.find((g) => g.key === k);

function sheetHead(n, total, title) {
  return `<header class="sh">
    <div class="sh-l"><div class="brand">VCFO&nbsp;Suite</div><div class="sh-t">${esc(title)}</div></div>
    <div class="sh-r"><span>${esc(META.window)}</span><span class="pg">Sheet ${n} of ${total}</span></div>
  </header>`;
}

function timeline() {
  const head = DAYS.map(([d, date]) => `<th class="tl-d"><b>${d}</b><small>${date}</small></th>`).join('');
  const rows = TESTS.map((t) => {
    const g = groupOf(t.group);
    const cells = DAYS.map((_, i) => `<td class="tl-c">${t.days.includes(i) ? `<span class="bar ${g.color}"></span>` : ''}</td>`).join('');
    return `<tr><td class="tl-id mono">${t.id}</td><td class="tl-n">${esc(t.name)}</td>${cells}<td class="tl-x">${box()}</td></tr>`;
  }).join('');
  return `<table class="tl"><thead><tr><th class="tl-id">ID</th><th class="tl-n">Feature</th>${head}<th class="tl-x">Done</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sheet1(total) {
  return `<section class="sheet">
  ${sheetHead(1, total, 'Plan, team and Day 0')}
  <div class="hero">
    <div>
      <h1>${esc(META.title)}</h1>
      <p class="sub">${esc(META.subtitle)}</p>
    </div>
    <div class="hero-meta">
      <div><small>Version</small><b>${esc(META.version)}</b></div>
      <div><small>Tests</small><b>${TESTS.length}</b></div>
      <div><small>Steps</small><b>${TESTS.reduce((n, t) => n + t.steps.length, 0)}</b></div>
      <div><small>Go-live decision</small><b>D10 · Thu 19 Nov</b></div>
    </div>
  </div>

  <div class="grid1">
    <div class="card">
      <h2><span class="num">1</span>How to use this plan</h2>
      <ol class="how">
        <li>Do the tests in ID sequence. Each test has a day on the schedule (right).</li>
        <li>Tick each step box when the step is done and correct.</li>
        <li>If a step fails, write a defect on sheet 4. Write the defect ID in the test row. Continue with the next step if you can.</li>
        <li>Tick the role boxes when each role saw the correct result.</li>
        <li>Tick "Done" only when all steps and all roles pass. Write your initials and the date.</li>
      </ol>
      <h3>Two tracks</h3>
      <table class="mini">
        <tr><td class="mono b">Track A</td><td>The real client project. It moves at the speed of the real client.</td></tr>
        <tr><td class="mono b">Track B</td><td>A sandbox project with test data and a past CIN date. It lets you test post-incorporation, registrations and compliance on schedule.</td></tr>
      </table>
      <h3>Build status in each row</h3>
      <table class="mini">${BUILD_NOTES.map(([a, b], i) => `<tr><td><span class="badge ${Object.values(BUILD)[i].cls}">${a}</span></td><td>${b}</td></tr>`).join('')}</table>
    </div>

    <div class="card">
      <h2><span class="num">2</span>Test team</h2>
      <table class="team">
        <thead><tr><th>Code</th><th>Role in app</th><th>Name</th><th>Login email</th><th>Login made</th><th>Two-step</th></tr></thead>
        <tbody>
          ${[['S', 'super_admin (owner)'], ['A', 'admin'], ['M', 'manager'], ['L', 'project lead (intern) 1'], ['L', 'project lead (intern) 2'], ['L', 'project lead (intern) 3'], ['C', 'client (Track A, real)'], ['C', 'client (Track B, team)']]
            .map(([c, r]) => `<tr><td><span class="role r-${c}">${c}</span></td><td>${r}</td><td class="line"></td><td class="line"></td><td class="c">${box()}</td><td class="c">${box()}</td></tr>`).join('')}
        </tbody>
      </table>
      <h2 class="mt"><span class="num">3</span>Daily loop: test and build</h2>
      <table class="loop">${LOOP.map(([t, a, b]) => `<tr><td class="mono b">${t}</td><td class="b">${a}</td><td>${b}</td></tr>`).join('')}</table>
      <h3>Severity</h3>
      <table class="mini sev">${SEVERITY.map(([s, d, f]) => `<tr><td><span class="sv sv-${s}">${s}</span></td><td>${d}</td><td class="b nowrap">${f}</td></tr>`).join('')}</table>
    </div>

    <div class="card">
      <h2><span class="num">4</span>Day 0 checklist · Mon 9 Nov</h2>
      <p class="note">Do the items in sequence. Stop if an item fails. The data delete cannot be undone.</p>
      <ol class="checks">${DAY0.map((s) => `<li>${box()}<span>${esc(s)}</span></li>`).join('')}</ol>
      <h3>Give Claude each defect with</h3>
      <ol class="report">${REPORT.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    </div>
  </div>

</section>`;
}

function sheetSchedule(n, total) {
  const legend = GROUPS.map((g) => `<span class="lg"><span class="sw ${g.color}"></span>${esc(g.name)}</span>`).join('');
  return `<section class="sheet">
  ${sheetHead(n, total, 'Schedule')}
  <div class="card tl-card big">
    <h2><span class="num">5</span>Schedule: one bar for each day of work</h2>
    <div class="legend">${legend}</div>
    ${timeline()}
  </div>
  <div class="foot"><span>Track A is the real client. Track B is the sandbox project. A test on Track A can move if the real client is late; Track B keeps the schedule.</span><span>Tick "Done" here when the test row is done.</span></div>
</section>`;
}

function matrix(tests, n, total, title) {
  let lastGroup = null;
  const rows = tests.map((t) => {
    const g = groupOf(t.group);
    const b = BUILD[t.build];
    const band = t.group !== lastGroup ? `<tr class="band ${g.color}"><td colspan="${7 + ROLES.length}">${esc(g.name)}</td></tr>` : '';
    lastGroup = t.group;
    const roleCells = ROLES.map((r) => `<td class="rc">${t.roles.includes(r) ? box() : '<span class="na">—</span>'}</td>`).join('');
    const dayLabel = t.days.length > 2 ? `D${t.days[0]}–D${t.days[t.days.length - 1]}` : t.days.map((d) => `D${d}`).join(', ');
    return `${band}<tr class="tr">
      <td class="done">${box('lg', testMark(t.id))}<div class="sig">Initials<br>Date</div></td>
      <td class="idc"><div class="tid mono">${t.id}</div><div class="day">${dayLabel}</div>${t.track === '—' ? '' : `<div class="trk">Track ${esc(t.track)}</div>`}</td>
      <td class="feat"><div class="fn">${esc(t.name)}</div><span class="badge ${b.cls}">${b.label}</span><div class="bf"><b>Before you start</b>${esc(t.before)}</div></td>
      <td class="steps"><ol>${t.steps.map((s, i) => `<li>${box('', stepMark(t.id, i + 1))}<span class="sn mono">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol></td>
      <td class="pass"><ul>${t.pass.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></td>
      <td class="msg">${t.msg === '—' ? '<span class="na">—</span>' : `${box()}<span>${esc(t.msg)}</span>`}</td>
      ${roleCells}
      <td class="def"></td>
    </tr>`;
  }).join('');
  return `<section class="sheet">
  ${sheetHead(n, total, title)}
  <table class="mx">
    <colgroup><col class="c-done"><col class="c-id"><col class="c-feat"><col class="c-steps"><col class="c-pass"><col class="c-msg">${ROLES.map(() => '<col class="c-role">').join('')}<col class="c-def"></colgroup>
    <thead><tr>
      <th>Done</th><th>Test</th><th>Feature · build · data</th><th>Steps (tick each)</th><th>Pass when</th><th>Email / WhatsApp</th>
      ${ROLES.map((r) => `<th class="rc"><span class="role r-${r}">${r}</span></th>`).join('')}<th>Defect IDs</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot"><span>Roles: <b>A</b> admin · <b>M</b> manager · <b>L</b> project lead · <b>C</b> client · <b>—</b> not in this test</span><span>Tick "Done" only when all steps and all roles pass.</span></div>
</section>`;
}

function sheet4(total) {
  const defRows = Array.from({ length: 13 }, () => `<tr>${'<td></td>'.repeat(9)}<td class="c">${box()}</td></tr>`).join('');
  const dayRows = DAYS.map(([d, date]) => `<tr><td class="mono b">${d}</td><td>${date}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  return `<section class="sheet">
  ${sheetHead(total, total, 'Defect log and daily log')}
  <div class="card">
    <h2><span class="num">6</span>Defect log</h2>
    <p class="note">ID format: D-day-number, for example D3-02. Give each S1 and S2 defect to Claude at the 13:30 triage.</p>
    <table class="log">
      <thead><tr><th class="w-id">Defect ID</th><th class="w-t">Test · step</th><th class="w-r">Role</th><th>Page URL</th><th>What happened (and what you expected)</th><th class="w-s">Sev.</th><th class="w-o">Owner</th><th class="w-b">Fixed in build</th><th class="w-b">Retest by · date</th><th class="w-x">Closed</th></tr></thead>
      <tbody>${defRows}</tbody>
    </table>
  </div>
  <div class="card mt">
    <h2><span class="num">7</span>Daily log</h2>
    <table class="log daily">
      <thead><tr><th class="w-id">Day</th><th class="w-t">Date</th><th>Tests done</th><th class="w-s">New S1</th><th class="w-s">Open S1</th><th class="w-s">Open S2</th><th>Build deployed (tag)</th><th class="w-b">Owner initials</th></tr></thead>
      <tbody>${dayRows}</tbody>
    </table>
  </div>
  <div class="foot"><span>Exit rule on D10: 0 open S1 defects. Each open S2 defect has an owner and a date.</span><span>Plan source: scripts/build-uat-plan.mjs</span></div>
</section>`;
}

const PARTS = [TESTS.slice(0, 7), TESTS.slice(7, 14), TESTS.slice(14)];
const TOTAL = 3 + PARTS.length;
const partTitle = (p) => `${p[0].id} to ${p[p.length - 1].id} · ${[...new Set(p.map((t) => groupOf(t.group).name))].join(' · ')}`;

const CSS = `
@page { size: A3 landscape; margin: 0; }
:root {
  --ink: #14161f; --ink-2: #4a4f63; --ink-3: #868b9e; --line: #d7d9e2; --line-2: #eceef3; --paper: #fff; --wash: #f6f7fa;
  --brand: #3a3fd8; --brand-ink: #23279b;
  --base: #5b6178; --pre: #3a3fd8; --post: #7b3fd8; --reg: #0f8a8a; --comp: #c2410c; --ops: #15803d; --ask: #b4234f; --msg: #a16207; --end: #14161f;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: #e9ebf0; color: var(--ink); font-family: 'Public Sans', 'Inter', Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.mono { font-family: 'IBM Plex Mono', 'DejaVu Sans Mono', monospace; }
.b { font-weight: 700; } .c { text-align: center; } .nowrap { white-space: nowrap; }
.sheet { width: 420mm; height: 297mm; padding: 11mm 12mm 9mm; background: var(--paper); margin: 0 auto 10mm; display: flex; flex-direction: column; gap: 4.5mm; overflow: hidden; page-break-after: always; break-after: page; }
@media print { html, body { background: #fff; } .sheet { margin: 0; } }
.sh { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid var(--ink); padding-bottom: 2.5mm; }
.sh-l { display: flex; align-items: baseline; gap: 4mm; }
.brand { font-weight: 800; font-size: 13pt; letter-spacing: -0.01em; color: var(--brand); }
.sh-t { font-size: 11pt; font-weight: 600; }
.sh-r { display: flex; gap: 6mm; font-size: 8.5pt; color: var(--ink-2); }
.pg { font-weight: 700; color: var(--ink); }
.hero { display: flex; justify-content: space-between; align-items: flex-end; }
h1 { margin: 0; font-size: 26pt; letter-spacing: -0.02em; line-height: 1.05; }
.sub { margin: 1.5mm 0 0; font-size: 11pt; color: var(--ink-2); }
.hero-meta { display: flex; gap: 3mm; }
.hero-meta div { border: 1px solid var(--line); border-radius: 2mm; padding: 2mm 4mm; min-width: 30mm; }
.hero-meta small { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); }
.hero-meta b { font-size: 12pt; }
.grid1 { flex: 1; display: grid; grid-template-columns: 1fr 1.25fr 1fr; gap: 4.5mm; }
.card { border: 1px solid var(--line); border-radius: 2.5mm; padding: 4mm 4.5mm; }
h2 { margin: 0 0 2.5mm; font-size: 11.5pt; display: flex; align-items: center; gap: 2mm; }
h2.mt { margin-top: 4mm; }
h3 { margin: 3.5mm 0 1.5mm; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-2); }
.num { display: inline-grid; place-items: center; width: 5.5mm; height: 5.5mm; border-radius: 50%; background: var(--ink); color: #fff; font-size: 8pt; }
.note { margin: 0 0 2mm; font-size: 8pt; color: var(--ink-2); }
ol, ul { margin: 0; padding: 0; }
.how { padding-left: 4.5mm; font-size: 9.5pt; line-height: 1.45; } .how li { margin-bottom: 1mm; }
.report { padding-left: 4.5mm; font-size: 8.5pt; line-height: 1.5; columns: 2; column-gap: 5mm; }
table { border-collapse: collapse; width: 100%; }
.mini td { font-size: 9pt; padding: 1.8mm 1.5mm; border-bottom: 1px solid var(--line-2); vertical-align: top; }
.mini td:first-child { width: 1%; white-space: nowrap; }
.team th, .log th { font-size: 7.3pt; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); text-align: left; padding: 1.2mm 1.5mm; border-bottom: 1.5px solid var(--ink); }
.team td { font-size: 9pt; padding: 1.4mm 1.5mm; border-bottom: 1px solid var(--line); height: 9mm; }
.team td.line { min-width: 30mm; }
.loop td { font-size: 9pt; padding: 2mm 1.5mm; border-bottom: 1px solid var(--line-2); vertical-align: top; }
.loop td:first-child, .loop td:nth-child(2) { width: 1%; white-space: nowrap; }
.checks { list-style: none; counter-reset: c; }
.checks li { display: flex; gap: 2mm; align-items: flex-start; font-size: 9.3pt; line-height: 1.35; padding: 2mm 0; border-bottom: 1px dotted var(--line); counter-increment: c; }
.checks li::after { content: counter(c); margin-left: auto; font-size: 7pt; color: var(--ink-3); font-family: 'IBM Plex Mono', monospace; }
.box { display: inline-block; flex: none; width: 4mm; height: 4mm; border: 1.3px solid var(--ink); border-radius: .6mm; background: #fff; vertical-align: middle; }
.box.lg { width: 7mm; height: 7mm; border-width: 1.8px; border-radius: 1mm; }
.role { display: inline-grid; place-items: center; width: 5mm; height: 5mm; border-radius: 1mm; font-size: 7.5pt; font-weight: 800; color: #fff; }
.r-S { background: var(--ink); } .r-A { background: #3a3fd8; } .r-M { background: #7b3fd8; } .r-L { background: #0f8a8a; } .r-C { background: #c2410c; }
.badge { display: inline-block; font-size: 6.8pt; font-weight: 700; padding: .5mm 1.6mm; border-radius: 4mm; white-space: nowrap; border: 1px solid; }
.b-live { color: #15803d; border-color: #15803d; background: #effaf2; }
.b-main { color: #a16207; border-color: #ca8a04; background: #fef9e7; }
.b-fresh { color: #b91c1c; border-color: #b91c1c; background: #fdf0f0; }
.b-off { color: #5b6178; border-color: #8b90a3; background: #f2f3f6; }
.b-ops { color: #14161f; border-color: #14161f; background: #fff; }
.sv { display: inline-block; font-weight: 800; font-size: 8pt; padding: .3mm 1.6mm; border-radius: 1mm; color: #fff; }
.sv-S1 { background: #b91c1c; } .sv-S2 { background: #ca8a04; } .sv-S3 { background: #5b6178; }
.g-base { --g: var(--base); } .g-pre { --g: var(--pre); } .g-post { --g: var(--post); } .g-reg { --g: var(--reg); } .g-comp { --g: var(--comp); } .g-ops { --g: var(--ops); } .g-ask { --g: var(--ask); } .g-msg { --g: var(--msg); } .g-end { --g: var(--end); }
.legend { display: flex; flex-wrap: wrap; gap: 2mm 5mm; margin: -1mm 0 2mm; font-size: 8pt; }
.lg { display: inline-flex; align-items: center; gap: 1.5mm; }
.sw { width: 3.5mm; height: 3.5mm; border-radius: .7mm; background: var(--g); }
.tl-card { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.tl th { font-size: 7.5pt; color: var(--ink-2); padding: 1mm; border-bottom: 1.5px solid var(--ink); text-align: left; }
.tl th.tl-d { text-align: center; } .tl th small { display: block; font-weight: 500; color: var(--ink-3); }
.tl td { font-size: 8.3pt; padding: .55mm 1mm; border-bottom: 1px solid var(--line-2); height: 4.9mm; }
.tl .tl-id { width: 12mm; } .tl .tl-n { width: 72mm; } .tl .tl-x { width: 12mm; text-align: center; }
.tl td.tl-c { border-left: 1px solid var(--line-2); padding: .6mm .5mm; }
.tl-card.big .tl td { font-size: 10.5pt; height: 9.6mm; } .tl-card.big .tl th { font-size: 9pt; } .tl-card.big .tl .tl-n { width: 95mm; } .tl-card.big .bar { height: 5.5mm; } .tl-card.big .legend { font-size: 9.5pt; margin-bottom: 3mm; }
.bar { display: block; height: 3.2mm; border-radius: .8mm; background: var(--g); }
/* matrix */
.mx { table-layout: fixed; }
.mx col.c-done { width: 15mm; } .mx col.c-id { width: 22mm; } .mx col.c-feat { width: 62mm; } .mx col.c-steps { width: auto; }
.mx col.c-pass { width: 72mm; } .mx col.c-msg { width: 38mm; } .mx col.c-role { width: 8.5mm; } .mx col.c-def { width: 24mm; }
.mx th { font-size: 7.3pt; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); text-align: left; padding: 1.4mm 1.6mm; border-bottom: 2px solid var(--ink); }
.mx th.rc { text-align: center; padding: 1mm 0; }
.mx td { vertical-align: top; padding: 1.9mm 1.8mm; border-bottom: 1px solid var(--line); font-size: 9pt; line-height: 1.3; }
.mx tr.band td { padding: 1mm 2mm; font-size: 7.6pt; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #fff; background: var(--g); border: 0; }
.mx td.done { text-align: center; border-left: 3px solid transparent; }
.sig { margin-top: 1.5mm; font-size: 6pt; line-height: 1.6; color: var(--ink-3); text-transform: uppercase; letter-spacing: .05em; }
.tid { font-size: 13pt; font-weight: 700; }
.day { font-size: 8pt; font-weight: 700; margin-top: .6mm; } .trk { font-size: 7pt; color: var(--ink-2); margin-top: .4mm; }
.fn { font-size: 10.8pt; font-weight: 700; line-height: 1.2; margin-bottom: 1.2mm; }
.bf { margin-top: 1.4mm; font-size: 8.4pt; color: var(--ink-2); } .bf b { display: block; font-size: 6.6pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-3); }
.steps ol { list-style: none; }
.steps li { display: flex; gap: 1.8mm; align-items: flex-start; padding: .45mm 0; }
.steps .box { margin-top: .2mm; }
.box { display: inline-grid; place-items: center; font-weight: 800; font-size: 8pt; line-height: 1; }
.box.lg { font-size: 15pt; }
.m-ok { color: #15803d; border-color: #15803d; } .m-bad { color: #b91c1c; border-color: #b91c1c; } .m-person { color: #5b6178; } .m-blocked { color: #a16207; border-color: #a16207; }
.sn { flex: none; width: 3mm; font-size: 7pt; color: var(--ink-3); padding-top: .3mm; }
.pass ul { padding-left: 3.5mm; } .pass li { margin-bottom: .6mm; }
.msg { display: table-cell; } .msg .box { float: left; margin: .2mm 1.5mm 0 0; }
.mx td.rc { text-align: center; border-left: 1px solid var(--line-2); padding-top: 2.2mm; }
.na { color: var(--ink-3); }
.mx td.def { border-left: 1px solid var(--line-2); background: repeating-linear-gradient(to bottom, transparent 0 5.4mm, var(--line-2) 5.4mm 5.6mm); }
.foot { display: flex; justify-content: space-between; font-size: 7.8pt; color: var(--ink-2); border-top: 1px solid var(--line); padding-top: 2mm; margin-top: auto; }
/* logs */
.log td { border: 1px solid var(--line); height: 8.6mm; font-size: 8pt; }
.log th { border-bottom: 1.5px solid var(--ink); }
.log .w-id { width: 22mm; } .log .w-t { width: 24mm; } .log .w-r { width: 14mm; } .log .w-s { width: 14mm; } .log .w-o { width: 24mm; } .log .w-b { width: 30mm; } .log .w-x { width: 15mm; text-align: center; }
.daily td { height: 7.4mm; padding: 0 2mm; }
.mt { margin-top: 0; }
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VCFO Test Plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Public+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
${sheet1(TOTAL)}
${sheetSchedule(2, TOTAL)}
${PARTS.map((p, i) => matrix(p, 3 + i, TOTAL, `Test matrix ${i + 1} of ${PARTS.length} · ${partTitle(p)}`)).join('\n')}
${sheet4(TOTAL)}
</body></html>`;

const STEM = useResults ? 'test-plan-a3-results' : 'test-plan-a3';
writeFileSync(join(outDir, `${STEM}.html`), html);

// ---------------------------------------------------------------- markdown

const md = [];
md.push(`# ${META.title}`, '', `${META.subtitle}. ${META.window}.`, '');
md.push('Generated by `scripts/build-uat-plan.mjs`; edit the data there, then run it again. The A3 print is `test-plan-a3.pdf`. Text is in ASD-STE100 Simplified Technical English.', '');
md.push('## Day 0 checklist', '', ...DAY0.map((s) => `- [ ] ${s}`), '');
md.push('## Daily loop', '', '| Time | Phase | What |', '|---|---|---|', ...LOOP.map((r) => `| ${r.join(' | ')} |`), '');
md.push('## Severity', '', '| Severity | Meaning | Fix target |', '|---|---|---|', ...SEVERITY.map((r) => `| ${r.join(' | ')} |`), '');
md.push('## Tests', '', '| Done | ID | Days | Track | Feature | Build | Roles | Steps | Pass when | Email / WhatsApp |', '|---|---|---|---|---|---|---|---|---|---|');
for (const t of TESTS) {
  md.push(`| [ ] | ${t.id} | ${t.days.map((d) => `D${d}`).join(', ')} | ${t.track} | ${t.name} | ${BUILD[t.build].label} | ${t.roles.join(' ')} | ${t.steps.map((s, i) => `${i + 1}. ${s}`).join('<br>')} | ${t.pass.join('<br>')} | ${t.msg} |`);
}
md.push('', '## Report a defect to Claude with', '', ...REPORT.map((s) => `- ${s}`), '');
if (!useResults) writeFileSync(join(outDir, 'TEST-PLAN.md'), md.join('\n'));

// ---------------------------------------------------------------- pdf

if (!process.argv.includes('--no-pdf')) {
  // Use the project's Playwright if it has one, else the machine-wide install.
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = req('@playwright/test')); } catch { ({ chromium } = req('playwright')); }
  const browser = await chromium.launch({ executablePath: process.env.UAT_CHROMIUM || undefined });
  const page = await browser.newPage();
  await page.goto('file://' + join(outDir, `${STEM}.html`), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(outDir, `${STEM}.pdf`), format: 'A3', landscape: true, printBackground: true, preferCSSPageSize: true });
  await browser.close();
}
console.log('Wrote docs/specs/uat/test-plan-a3.html, test-plan-a3.pdf and TEST-PLAN.md');
