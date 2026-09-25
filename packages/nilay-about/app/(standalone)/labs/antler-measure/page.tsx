import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { AntlerMeasureClient } from './antler-measure-client';

export const metadata = labsToolMetadata('antler-measure');

export default function AntlerMeasurePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('antler-measure')} />
      <AntlerMeasureClient />
      <RelatedTools slug="antler-measure" />
    </>
  );
}
