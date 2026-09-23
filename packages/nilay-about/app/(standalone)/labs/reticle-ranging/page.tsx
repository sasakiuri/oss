import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ReticleRangingClient } from './reticle-ranging-client';

export const metadata = labsToolMetadata('reticle-ranging');

export default function ReticleRangingPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('reticle-ranging')} />
      <ReticleRangingClient />
      <RelatedTools slug="reticle-ranging" />
    </>
  );
}
