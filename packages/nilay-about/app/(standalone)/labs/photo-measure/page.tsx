import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { PhotoMeasureClient } from './photo-measure-client';

export const metadata = labsToolMetadata('photo-measure');

export default function PhotoMeasurePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('photo-measure')} />
      <PhotoMeasureClient />
      <RelatedTools slug="photo-measure" />
    </>
  );
}
