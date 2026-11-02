import { LabourRegistersPage } from '@/views/labour-registers/LabourRegistersPage';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Labour registers', 'Statutory labour registers, state by state');

/** Route shell only. `?state=` and `?period=` carry the choice across a refresh. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined);
  return (
    <LabourRegistersPage
      shellBase="/app/intern"
      stateCode={one('state')}
      period={one('period')}
      canPrepare={true}
    />
  );
}
