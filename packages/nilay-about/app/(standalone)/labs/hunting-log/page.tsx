import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { HuntingLogClient } from './hunting-log-client';

export const metadata = labsToolMetadata('hunting-log');

export default function HuntingLogPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('hunting-log')} />
      <HuntingLogClient />
      <RelatedTools slug="hunting-log" />
    </>
  );
}
