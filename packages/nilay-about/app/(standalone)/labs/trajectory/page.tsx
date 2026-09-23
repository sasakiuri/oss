import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrajectoryClient } from './trajectory-client';

export const metadata = labsToolMetadata('trajectory');

export default function TrajectoryPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trajectory')} />
      <TrajectoryClient />
      <RelatedTools slug="trajectory" />
    </>
  );
}
