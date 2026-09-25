import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShotDangerClient } from './shot-danger-client';

export const metadata = labsToolMetadata('shot-danger');

export default function ShotDangerPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shot-danger')} />
      <ShotDangerClient />
      <RelatedTools slug="shot-danger" />
    </>
  );
}
