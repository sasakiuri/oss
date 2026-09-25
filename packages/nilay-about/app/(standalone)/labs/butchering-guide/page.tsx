import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ButcheringGuideClient } from './butchering-guide-client';

export const metadata = labsToolMetadata('butchering-guide');

export default function ButcheringGuidePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('butchering-guide')} />
      <ButcheringGuideClient />
      <RelatedTools slug="butchering-guide" />
    </>
  );
}
