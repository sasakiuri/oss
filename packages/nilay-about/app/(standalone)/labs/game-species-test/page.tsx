import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { GameSpeciesTestClient } from './game-species-test-client';

export const metadata = labsToolMetadata('game-species-test');

export default function GameSpeciesTestPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('game-species-test')} />
      <GameSpeciesTestClient />
      <RelatedTools slug="game-species-test" />
    </>
  );
}
