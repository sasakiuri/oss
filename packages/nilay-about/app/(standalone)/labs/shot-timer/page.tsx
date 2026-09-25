import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ShotTimerClient } from './shot-timer-client';

export const metadata = labsToolMetadata('shot-timer');

export default function ShotTimerPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('shot-timer')} />
      <ShotTimerClient />
      <RelatedTools slug="shot-timer" />
    </>
  );
}
