import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrailCameraClient } from './trail-camera-client';

export const metadata = labsToolMetadata('trail-camera');

export default function TrailCameraPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trail-camera')} />
      <TrailCameraClient />
      <RelatedTools slug="trail-camera" />
    </>
  );
}
