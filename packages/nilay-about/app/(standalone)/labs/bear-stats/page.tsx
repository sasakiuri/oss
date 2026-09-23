import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { BearStatsClient } from './bear-stats-client';

export const metadata = labsToolMetadata('bear-stats');

export default function BearStatsPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('bear-stats')} />
      <BearStatsClient />
      <RelatedTools slug="bear-stats" />
    </>
  );
}
