import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TripPlanClient } from './trip-plan-client';

export const metadata = labsToolMetadata('trip-plan');

export default function TripPlanPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trip-plan')} />
      <TripPlanClient />
      <RelatedTools slug="trip-plan" />
    </>
  );
}
