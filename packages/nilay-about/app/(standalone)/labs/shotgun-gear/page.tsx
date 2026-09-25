import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShotgunGearClient } from './shotgun-gear-client';

export const metadata = labsToolMetadata('shotgun-gear');

export default function ShotgunGearPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shotgun-gear')} />
      <ShotgunGearClient />
      <RelatedTools slug="shotgun-gear" />
    </>
  );
}
