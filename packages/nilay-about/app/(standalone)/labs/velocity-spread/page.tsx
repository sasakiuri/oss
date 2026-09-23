import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { VelocitySpreadClient } from './velocity-spread-client';

export const metadata = labsToolMetadata('velocity-spread');

export default function VelocitySpreadPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('velocity-spread')} />
      <VelocitySpreadClient />
      <RelatedTools slug="velocity-spread" />
    </>
  );
}
