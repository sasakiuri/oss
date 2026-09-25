import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { HuntingCostsClient } from './hunting-costs-client';

export const metadata = labsToolMetadata('hunting-costs');

export default function HuntingCostsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('hunting-costs')} />
      <HuntingCostsClient />
      <RelatedTools slug="hunting-costs" />
    </>
  );
}
