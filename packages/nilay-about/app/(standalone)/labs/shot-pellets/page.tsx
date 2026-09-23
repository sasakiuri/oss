import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShotPelletsClient } from './shot-pellets-client';

export const metadata = labsToolMetadata('shot-pellets');

export default function ShotPelletsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shot-pellets')} />
      <ShotPelletsClient />
      <RelatedTools slug="shot-pellets" />
    </>
  );
}
