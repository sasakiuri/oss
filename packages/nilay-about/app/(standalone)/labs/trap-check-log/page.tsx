import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { TrapCheckLogClient } from './trap-check-log-client';

export const metadata = labsToolMetadata('trap-check-log');

export default function TrapCheckLogPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('trap-check-log')} />
      <TrapCheckLogClient />
      <RelatedTools slug="trap-check-log" />
    </>
  );
}
