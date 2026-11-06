import { describe, expect, it } from 'vitest';
import { METRICS } from '../catalog';
import { contentWords, matchCompany, matchMetric, metricsForRole, routerMetricFilters } from '../match';

const bag = (phrase: string) => [...new Set(contentWords(phrase))].sort().join(' ');

describe('the catalog', () => {
  it('holds at least the planned metrics, each with a unique name', () => {
    expect(METRICS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(METRICS.map((m) => m.name)).size).toBe(METRICS.length);
  });

  it('never shares an alias between two metrics, and no alias is all filler', () => {
    const owners = new Map<string, string>();
    for (const metric of METRICS) {
      for (const alias of metric.aliases) {
        const key = bag(alias);
        expect(key, `${metric.name}: "${alias}"`).not.toBe('');
        const owner = owners.get(key);
        if (owner) expect(owner, `"${alias}" is on ${owner} and ${metric.name}`).toBe(metric.name);
        owners.set(key, metric.name);
      }
    }
  });

  it('only offers a client what a client may read', () => {
    const names = metricsForRole('client').map((m) => m.name);
    expect(names).toContain('filings.overdue');
    for (const staffOnly of ['clients.total', 'projects.active', 'approvals.pending', 'tasks.open', 'invoices.outstanding', 'people.team']) {
      expect(names).not.toContain(staffOnly);
    }
    expect(metricsForRole('intern').map((m) => m.name)).not.toContain('invoices.outstanding');
  });
});

describe('matchMetric', () => {
  it.each([
    ['How many companies are incorporated this year?', 'companies.incorporated', { period: 'this_fy' }],
    ['how many companies were incorporated last year', 'companies.incorporated', { period: 'last_fy' }],
    ['Number of companies incorporated in FY 2025-26', 'companies.incorporated', { fyStartYear: 2025 }],
    ['Companies incorporated so far', 'companies.incorporated', { period: 'all_time' }],
    ['is saal kitni companies incorporate hui', 'companies.incorporated', { period: 'this_fy' }],
    ['kitne clients hain', 'clients.total', {}],
    ['How many companies do we have?', 'clients.total', {}],
    ['pichle mahine kitne naye client', 'clients.new', { period: 'last_month' }],
    ['How many approvals are pending?', 'approvals.pending', {}],
    ['kitne approvals baki hain', 'approvals.pending', {}],
    ['How many filings are overdue?', 'filings.overdue', {}],
    ['How many GST filings are overdue?', 'filings.overdue', { area: 'GST' }],
    ['overdue income tax filings', 'filings.overdue', { area: 'Income Tax' }],
    ['Upcoming filings', 'filings.due_soon', {}],
    ['filings filed this month', 'filings.filed', { period: 'this_month' }],
    ['aaj ke tasks', 'tasks.due_today', {}],
    ['How many projects are at risk?', 'projects.active', { status: 'at-risk' }],
    ['updates this week', 'updates.this_week', {}],
    ['how many invoices are overdue?', 'invoices.overdue', {}],
  ] as const)('%s', (question, name, filters) => {
    const match = matchMetric(question, 'admin');
    expect(match?.metric.name).toBe(name);
    expect(match?.filters).toMatchObject(filters);
    expect(match?.companyWords).toEqual([]);
  });

  it('keeps the default period when none is asked', () => {
    expect(matchMetric('companies incorporated', 'admin')?.filters).toEqual({ period: 'this_fy' });
  });

  it('hands leftover words on as a possible company', () => {
    expect(matchMetric('overdue filings for Kestrel', 'admin')?.companyWords).toEqual(['kestrel']);
  });

  it.each([
    'Why are filings overdue?',
    'how many directors can a company have',
    'What is the penalty for overdue filings?',
    'Which clients are not incorporated yet and why?',
    'how many days to file',
    'Should we register for GST?',
    'how many',
  ])('does not settle "%s" on its own', (question) => {
    const match = matchMetric(question, 'admin');
    // Either no metric at all, or leftover words that no company name will match.
    if (match) expect(match.companyWords.length).toBeGreaterThan(0);
  });

  it('does not stretch a metric with no period over a period question', () => {
    expect(matchMetric('overdue filings last year', 'admin')).toBeNull();
    expect(matchMetric('how many approvals are pending this month', 'admin')).toBeNull();
  });

  it('does not match a metric the role lacks', () => {
    expect(matchMetric('how many approvals are pending', 'client')).toBeNull();
    expect(matchMetric('outstanding invoices', 'intern')).toBeNull();
  });

  it('never answers "not" as if it were the plain count', () => {
    const match = matchMetric('companies not incorporated', 'admin');
    expect(match?.metric.name).toBe('companies.in_progress');
  });
});

describe('routerMetricFilters', () => {
  const metric = (name: string) => METRICS.find((m) => m.name === name)!;

  it('reads the period and the area in code', () => {
    expect(routerMetricFilters(metric('filings.filed'), 'How many GST returns were filed last financial year?')).toEqual({
      period: 'last_fy',
      area: 'GST',
    });
  });

  it('refuses a time the metric cannot honour', () => {
    expect(routerMetricFilters(metric('filings.overdue'), 'filings overdue in March')).toBeNull();
    expect(routerMetricFilters(metric('companies.incorporated'), 'companies incorporated in 2024')).toBeNull();
    expect(routerMetricFilters(metric('approvals.pending'), 'approvals pending last month')).toBeNull();
  });

  it('keeps a time word that is the metric itself', () => {
    expect(routerMetricFilters(metric('tasks.due_today'), 'tasks due today')).toEqual({});
    expect(routerMetricFilters(metric('updates.this_week'), 'updates this week')).toEqual({});
  });
});

describe('matchCompany', () => {
  const companies = [
    { companyName: 'Kestrel Robotics Pvt Ltd' },
    { companyName: 'Northwind India Private Limited' },
    { companyName: 'Northstar Foods LLP' },
  ];
  it('finds one company by the start of its name', () => {
    expect(matchCompany(['kestrel'], companies)).toBe(companies[0]);
    expect(matchCompany(['northwind'], companies)).toBe(companies[1]);
  });
  it('refuses none, several, or only noise words', () => {
    expect(matchCompany(['penalty'], companies)).toBeNull();
    expect(matchCompany(['pvt', 'ltd'], companies)).toBeNull();
    expect(matchCompany([], companies)).toBeNull();
    expect(matchCompany(['foods'], companies)).toBeNull();
  });
});
