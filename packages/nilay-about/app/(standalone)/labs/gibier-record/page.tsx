import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { GibierRecordClient } from './gibier-record-client';

export const metadata = labsToolMetadata('gibier-record');

export default function GibierRecordPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('gibier-record')} />
      <GibierRecordClient />
      <RelatedTools slug="gibier-record" />
    </>
  );
}
