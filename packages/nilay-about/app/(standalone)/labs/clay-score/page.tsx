import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ClayScoreClient } from './clay-score-client';

export const metadata = labsToolMetadata('clay-score');

export default function ClayScorePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('clay-score')} />
      <ClayScoreClient />
      <RelatedTools slug="clay-score" />
    </>
  );
}
