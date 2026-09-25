import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShootDecisionClient } from './shoot-decision-client';

export const metadata = labsToolMetadata('shoot-decision');

export default function ShootDecisionPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shoot-decision')} />
      <ShootDecisionClient />
      <RelatedTools slug="shoot-decision" />
    </>
  );
}
