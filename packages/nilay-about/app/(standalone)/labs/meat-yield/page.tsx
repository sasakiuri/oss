import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { MeatYieldClient } from './meat-yield-client';

export const metadata = labsToolMetadata('meat-yield');

export default function MeatYieldPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('meat-yield')} />
      <MeatYieldClient />
      <RelatedTools slug="meat-yield" />
    </>
  );
}
