import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { BearAlertsClient } from './bear-alerts-client';

export const metadata = labsToolMetadata('bear-alerts');

export default function BearAlertsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('bear-alerts')} />
      <BearAlertsClient />
      <RelatedTools slug="bear-alerts" />
    </>
  );
}
