import { notFound } from 'next/navigation';
import { askFlags } from '@/lib/ask/config';
import { pageMetadata } from '@/lib/shell/page-metadata';
import WatchPage from '@/views/watch/WatchPage';

export const metadata = pageMetadata('Official updates', 'Official changes in the law, checked and reviewed before they are sent');

export default function Page() {
  if (!askFlags().watch) notFound();
  return <WatchPage />;
}
