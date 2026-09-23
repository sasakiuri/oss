import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { RecoilClient } from './recoil-client';

export const metadata = labsToolMetadata('recoil');

export default function RecoilPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('recoil')} />
      <RecoilClient />
      <RelatedTools slug="recoil" />
    </>
  );
}
