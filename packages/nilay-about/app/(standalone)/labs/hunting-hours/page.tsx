import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { HuntingHoursClient } from './hunting-hours-client';

export const metadata = labsToolMetadata('hunting-hours');

export default function HuntingHoursPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('hunting-hours')} />
      <HuntingHoursClient />
      <RelatedTools slug="hunting-hours" />
    </>
  );
}
