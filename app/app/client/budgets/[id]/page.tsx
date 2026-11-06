import { pageMetadata } from '@/lib/shell/page-metadata';
import { BudgetWorkspace } from '@/views/budget/BudgetWorkspace';

export const metadata = pageMetadata('Budget', 'One annual cost budget');

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The portal reverts Tailwind's reset outside a `.cp-tw` island, and this view is all Tailwind.
  return (
    <div className="cp-tw">
      <BudgetWorkspace budgetId={id} shellBase="/app/client" />
    </div>
  );
}
