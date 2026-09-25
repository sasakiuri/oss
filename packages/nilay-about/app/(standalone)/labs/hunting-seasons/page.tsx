import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { HuntingSeasonsClient } from './hunting-seasons-client';

export const metadata = labsToolMetadata('hunting-seasons');

export default function HuntingSeasonsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('hunting-seasons')} />
      <HuntingSeasonsClient />
      <RelatedTools slug="hunting-seasons" />
    </>
  );
}
