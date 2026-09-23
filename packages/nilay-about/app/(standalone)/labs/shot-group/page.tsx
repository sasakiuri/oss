import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShotGroupClient } from './shot-group-client';

export const metadata = labsToolMetadata('shot-group');

export default function ShotGroupPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shot-group')} />
      <ShotGroupClient />
      <RelatedTools slug="shot-group" />
    </>
  );
}
