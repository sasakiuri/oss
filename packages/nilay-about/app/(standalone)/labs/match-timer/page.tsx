import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { MatchTimerClient } from './match-timer-client';

export const metadata = labsToolMetadata('match-timer');

export default function MatchTimerPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('match-timer')} />
      <MatchTimerClient />
      <RelatedTools slug="match-timer" />
    </>
  );
}
