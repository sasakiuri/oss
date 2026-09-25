import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { LicenseExamClient } from './license-exam-client';

export const metadata = labsToolMetadata('license-exam');

export default function LicenseExamPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('license-exam')} />
      <LicenseExamClient />
      <RelatedTools slug="license-exam" />
    </>
  );
}
