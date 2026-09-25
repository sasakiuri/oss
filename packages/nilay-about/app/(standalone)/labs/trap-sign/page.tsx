import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrapSignClient } from './trap-sign-client';

export const metadata = labsToolMetadata('trap-sign');

export default function TrapSignPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trap-sign')} />
      <TrapSignClient />
      <RelatedTools slug="trap-sign" />
    </>
  );
}
