import type { Metadata } from 'next';

import { ResultsView } from './results-view';

// Each page is someone's temporary results: shared by link, never indexed.
export const metadata: Metadata = {
  title: '大会リザルト',
  robots: { index: false, follow: false },
};

export default function EventResultsViewPage() {
  return <ResultsView />;
}
