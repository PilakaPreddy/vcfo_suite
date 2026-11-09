import { PayrollPage } from '@/views/payroll/PayrollPage';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Payroll', 'Monthly payroll: salary updates, payroll summary and labour registers');

/** Route shell only. `?company=`, `?cycle=`, `?tab=` and `?state=` carry the choice across a refresh. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined);
  return (
    <PayrollPage
      shellBase="/app/admin"
      company={one('company')}
      cycle={one('cycle')}
      tab={one('tab')}
      stateCode={one('state')}
      canEdit={true}
    />
  );
}
