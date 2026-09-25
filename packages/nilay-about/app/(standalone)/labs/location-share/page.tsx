import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { LocationShareClient } from './location-share-client';

export const metadata = labsToolMetadata('location-share');

export default function LocationSharePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('location-share')} />
      <LocationShareClient />
      <RelatedTools slug="location-share" />
    </>
  );
}
