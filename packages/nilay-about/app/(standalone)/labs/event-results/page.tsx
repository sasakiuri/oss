import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { EventResultsClient } from './event-results-client';

export const metadata = labsToolMetadata('event-results');

export default function EventResultsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('event-results')} />
      <EventResultsClient />
      <RelatedTools slug="event-results" />
    </>
  );
}
