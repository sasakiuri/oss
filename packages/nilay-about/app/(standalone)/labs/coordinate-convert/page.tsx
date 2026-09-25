import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { CoordinateConvertClient } from './coordinate-convert-client';

export const metadata = labsToolMetadata('coordinate-convert');

export default function CoordinateConvertPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('coordinate-convert')} />
      <CoordinateConvertClient />
      <RelatedTools slug="coordinate-convert" />
    </>
  );
}
