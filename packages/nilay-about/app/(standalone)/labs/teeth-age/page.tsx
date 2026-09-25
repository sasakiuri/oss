import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TeethAgeClient } from './teeth-age-client';

export const metadata = labsToolMetadata('teeth-age');

export default function TeethAgePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('teeth-age')} />
      <TeethAgeClient />
      <RelatedTools slug="teeth-age" />
    </>
  );
}
