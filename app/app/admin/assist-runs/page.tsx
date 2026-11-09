import { pageMetadata } from '@/lib/shell/page-metadata';
import AssistRunsPage from '@/views/assist/AssistRunsPage';

export const metadata = pageMetadata('Assist runs', 'VCFO Assist agent runs and the recipe fixes waiting for review');

export default function Page() {
  return <AssistRunsPage />;
}
