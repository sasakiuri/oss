import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { UnitConverterClient } from './unit-converter-client';

export const metadata = labsToolMetadata('unit-converter');

export default function UnitConverterPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('unit-converter')} />
      <UnitConverterClient />
      <RelatedTools slug="unit-converter" />
    </>
  );
}
