import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrajectoryTruingClient } from './trajectory-truing-client';

export const metadata = labsToolMetadata('trajectory-truing');

export default function TrajectoryTruingPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trajectory-truing')} />
      <TrajectoryTruingClient />
      <RelatedTools slug="trajectory-truing" />
    </>
  );
}
