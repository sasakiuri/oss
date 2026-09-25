import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { CureMixClient } from './cure-mix-client';

export const metadata = labsToolMetadata('cure-mix');

export default function CureMixPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('cure-mix')} />
      <CureMixClient />
      <RelatedTools slug="cure-mix" />
    </>
  );
}
