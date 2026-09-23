import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { ElectricFenceClient } from './electric-fence-client';

export const metadata = labsToolMetadata('electric-fence');

export default function ElectricFencePage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('electric-fence')} />
      <ElectricFenceClient />
      <RelatedTools slug="electric-fence" />
    </>
  );
}
