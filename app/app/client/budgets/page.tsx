import { pageMetadata } from '@/lib/shell/page-metadata';
import { BudgetListPage } from '@/views/budget/BudgetListPage';

export const metadata = pageMetadata('Budgets', 'Annual cost budgets, client by client');

export default function Page() {
  // The portal reverts Tailwind's reset outside a `.cp-tw` island, and this view is all Tailwind.
  return (
    <div className="cp-tw">
      <BudgetListPage shellBase="/app/client" isClient />
    </div>
  );
}
