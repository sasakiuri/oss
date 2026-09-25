import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { VillageCheckClient } from './village-check-client';

export const metadata = labsToolMetadata('village-check');

export default function VillageCheckPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('village-check')} />
      <VillageCheckClient />
      <RelatedTools slug="village-check" />
    </>
  );
}
