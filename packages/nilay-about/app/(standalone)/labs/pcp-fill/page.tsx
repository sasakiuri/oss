import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { PcpFillClient } from './pcp-fill-client';

export const metadata = labsToolMetadata('pcp-fill');

export default function PcpFillPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('pcp-fill')} />
      <PcpFillClient />
      <RelatedTools slug="pcp-fill" />
    </>
  );
}
