import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { HomeTargetClient } from './home-target-client';

export const metadata = labsToolMetadata('home-target');

export default function HomeTargetPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('home-target')} />
      <HomeTargetClient />
      <RelatedTools slug="home-target" />
    </>
  );
}
