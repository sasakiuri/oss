import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { HunterMapClient } from './hunter-map-client';

export const metadata = labsToolMetadata('hunter-map');

export default function HunterMapPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('hunter-map')} />
      <HunterMapClient />
      <RelatedTools slug="hunter-map" />
    </>
  );
}
