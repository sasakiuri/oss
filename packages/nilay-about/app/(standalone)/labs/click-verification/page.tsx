import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ClickVerificationClient } from './click-verification-client';

export const metadata = labsToolMetadata('click-verification');

export default function ClickVerificationPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('click-verification')} />
      <ClickVerificationClient />
      <RelatedTools slug="click-verification" />
    </>
  );
}
