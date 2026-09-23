import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShotPatternClient } from './shot-pattern-client';

export const metadata = labsToolMetadata('shot-pattern');

export default function ShotPatternPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shot-pattern')} />
      <ShotPatternClient />
      <RelatedTools slug="shot-pattern" />
    </>
  );
}
