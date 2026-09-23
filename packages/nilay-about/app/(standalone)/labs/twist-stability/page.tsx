import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TwistStabilityClient } from './twist-stability-client';

export const metadata = labsToolMetadata('twist-stability');

export default function TwistStabilityPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('twist-stability')} />
      <TwistStabilityClient />
      <RelatedTools slug="twist-stability" />
    </>
  );
}
