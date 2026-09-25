import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrapAlertsClient } from './trap-alerts-client';

export const metadata = labsToolMetadata('trap-alerts');

export default function TrapAlertsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trap-alerts')} />
      <TrapAlertsClient />
      <RelatedTools slug="trap-alerts" />
    </>
  );
}
