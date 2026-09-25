import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { WindPracticeClient } from './wind-practice-client';

export const metadata = labsToolMetadata('wind-practice');

export default function WindPracticePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('wind-practice')} />
      <WindPracticeClient />
      <RelatedTools slug="wind-practice" />
    </>
  );
}
