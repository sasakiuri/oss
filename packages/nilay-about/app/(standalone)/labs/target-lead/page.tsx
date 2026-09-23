import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TargetLeadClient } from './target-lead-client';

export const metadata = labsToolMetadata('target-lead');

export default function TargetLeadPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('target-lead')} />
      <TargetLeadClient />
      <RelatedTools slug="target-lead" />
    </>
  );
}
