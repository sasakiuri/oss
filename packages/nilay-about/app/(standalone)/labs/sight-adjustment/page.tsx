import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { SightAdjustmentClient } from './sight-adjustment-client';

export const metadata = labsToolMetadata('sight-adjustment');

export default function SightAdjustmentPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('sight-adjustment')} />
      <SightAdjustmentClient />
      <RelatedTools slug="sight-adjustment" />
    </>
  );
}
