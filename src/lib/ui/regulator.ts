/** The six regulators the Spectrum area pill colours by. */
export type Regulator = 'mca' | 'gst' | 'it' | 'payroll' | 'fema' | 'labour';

/** The regulator for an area word, or undefined. "ROC" is MCA; "TDS" is income tax; PF and ESI are payroll. */
export function regOf(area: string): Regulator | undefined {
  const s = area.trim().toLowerCase();
  if (/^(mca|roc|incorporation|companies act|company law)/.test(s)) return 'mca';
  if (/^gst/.test(s)) return 'gst';
  if (/^(income tax|it|tds|tcs|direct tax)/.test(s)) return 'it';
  if (/^(payroll|pf|esi|epf|pf and esi)/.test(s)) return 'payroll';
  if (/^(fema|rbi|stpi)/.test(s)) return 'fema';
  if (/^(labour|labor|pt|professional tax|shops)/.test(s)) return 'labour';
  return undefined;
}
