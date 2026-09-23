import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { WoundedGameClient } from './wounded-game-client';

export const metadata = labsToolMetadata('wounded-game');

export default function WoundedGamePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('wounded-game')} />
      <WoundedGameClient />
      <RelatedTools slug="wounded-game" />
    </>
  );
}
