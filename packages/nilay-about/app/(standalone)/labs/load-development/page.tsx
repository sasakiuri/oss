import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { LoadDevelopmentClient } from './load-development-client';

export const metadata = labsToolMetadata('load-development');

export default function LoadDevelopmentPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('load-development')} />
      <LoadDevelopmentClient />
      <RelatedTools slug="load-development" />
    </>
  );
}
