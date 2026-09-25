import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TraceGaugeClient } from './trace-gauge-client';

export const metadata = labsToolMetadata('trace-gauge');

export default function TraceGaugePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trace-gauge')} />
      <TraceGaugeClient />
      <RelatedTools slug="trace-gauge" />
    </>
  );
}
