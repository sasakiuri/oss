import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { AmmoPurchasePlanClient } from './ammo-purchase-plan-client';

export const metadata = labsToolMetadata('ammo-purchase-plan');

export default function AmmoPurchasePlanPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('ammo-purchase-plan')} />
      <AmmoPurchasePlanClient />
      <RelatedTools slug="ammo-purchase-plan" />
    </>
  );
}
