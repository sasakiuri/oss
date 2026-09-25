import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TargetScoreClient } from './target-score-client';

export const metadata = labsToolMetadata('target-score');

export default function TargetScorePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('target-score')} />
      <TargetScoreClient />
      <RelatedTools slug="target-score" />
    </>
  );
}
