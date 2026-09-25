import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { FreezerStockClient } from './freezer-stock-client';

export const metadata = labsToolMetadata('freezer-stock');

export default function FreezerStockPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('freezer-stock')} />
      <FreezerStockClient />
      <RelatedTools slug="freezer-stock" />
    </>
  );
}
