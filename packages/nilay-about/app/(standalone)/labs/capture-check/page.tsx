import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { CaptureCheckClient } from './capture-check-client';

export const metadata = labsToolMetadata('capture-check');

export default function CaptureCheckPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('capture-check')} />
      <CaptureCheckClient />
      <RelatedTools slug="capture-check" />
    </>
  );
}
