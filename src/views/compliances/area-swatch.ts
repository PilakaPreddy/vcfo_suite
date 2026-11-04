import { regOf } from '@/lib/ui/regulator';

/** R-43 regulator swatch class for an area word; grey when the area has no regulator colour. */
const SWATCH: Record<NonNullable<ReturnType<typeof regOf>>, string> = {
  mca: 'bg-reg-mca',
  gst: 'bg-reg-gst',
  it: 'bg-reg-it',
  payroll: 'bg-reg-payroll',
  fema: 'bg-reg-fema',
  labour: 'bg-reg-labour',
};

export function areaSwatch(area: string): string {
  const reg = regOf(area);
  return reg ? SWATCH[reg] : 'bg-upcoming-mid';
}
