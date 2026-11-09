import { pageMetadata } from '@/lib/shell/page-metadata';
import { BudgetListPage } from '@/views/budget/BudgetListPage';

export const metadata = pageMetadata('Budgets', 'Annual cost budgets, client by client');

export default function Page() {
  return <BudgetListPage shellBase="/app/super/practice" />;
}
