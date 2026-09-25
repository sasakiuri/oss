import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ReturnAlertClient } from './return-alert-client';

export const metadata = labsToolMetadata('return-alert');

export default function ReturnAlertPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('return-alert')} />
      <ReturnAlertClient />
      <RelatedTools slug="return-alert" />
    </>
  );
}
