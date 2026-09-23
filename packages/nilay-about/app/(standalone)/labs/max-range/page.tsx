import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { MaxRangeClient } from './max-range-client';

export const metadata = labsToolMetadata('max-range');

export default function MaxRangePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('max-range')} />
      <MaxRangeClient />
      <RelatedTools slug="max-range" />
    </>
  );
}
