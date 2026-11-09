import { pageMetadata } from '@/lib/shell/page-metadata';
import { BudgetWorkspace } from '@/views/budget/BudgetWorkspace';

export const metadata = pageMetadata('Budget', 'One annual cost budget');

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BudgetWorkspace budgetId={id} shellBase="/app/admin" />;
}
