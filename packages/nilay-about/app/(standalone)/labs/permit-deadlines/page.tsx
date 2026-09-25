import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { PermitDeadlinesClient } from './permit-deadlines-client';

export const metadata = labsToolMetadata('permit-deadlines');

export default function PermitDeadlinesPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('permit-deadlines')} />
      <PermitDeadlinesClient />
      <RelatedTools slug="permit-deadlines" />
    </>
  );
}
