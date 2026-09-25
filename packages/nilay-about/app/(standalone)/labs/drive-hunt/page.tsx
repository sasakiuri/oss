import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { DriveHuntClient } from './drive-hunt-client';

export const metadata = labsToolMetadata('drive-hunt');

export default function DriveHuntPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('drive-hunt')} />
      <DriveHuntClient />
      <RelatedTools slug="drive-hunt" />
    </>
  );
}
