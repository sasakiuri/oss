import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { BearBellClient } from './bear-bell-client';

export const metadata = labsToolMetadata('bear-bell');

export default function BearBellPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('bear-bell')} />
      <BearBellClient />
      <RelatedTools slug="bear-bell" />
    </>
  );
}
