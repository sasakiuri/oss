import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { DeerDensityClient } from './deer-density-client';

export const metadata = labsToolMetadata('deer-density');

export default function DeerDensityPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('deer-density')} />
      <DeerDensityClient />
      <RelatedTools slug="deer-density" />
    </>
  );
}
