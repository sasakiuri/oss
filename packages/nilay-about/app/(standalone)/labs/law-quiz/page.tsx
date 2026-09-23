import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { LawQuizClient } from './law-quiz-client';

export const metadata = labsToolMetadata('law-quiz');

export default function LawQuizPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('law-quiz')} />
      <LawQuizClient />
      <RelatedTools slug="law-quiz" />
    </>
  );
}
