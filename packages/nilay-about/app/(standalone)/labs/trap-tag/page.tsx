import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrapTagClient } from './trap-tag-client';

export const metadata = labsToolMetadata('trap-tag');

export default function TrapTagPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trap-tag')} />
      <TrapTagClient />
      <RelatedTools slug="trap-tag" />
    </>
  );
}
