import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { SnareGaugeClient } from './snare-gauge-client';

export const metadata = labsToolMetadata('snare-gauge');

export default function SnareGaugePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('snare-gauge')} />
      <SnareGaugeClient />
      <RelatedTools slug="snare-gauge" />
    </>
  );
}
