import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { GunFitClient } from './gun-fit-client';

export const metadata = labsToolMetadata('gun-fit');

export default function GunFitPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('gun-fit')} />
      <GunFitClient />
      <RelatedTools slug="gun-fit" />
    </>
  );
}
