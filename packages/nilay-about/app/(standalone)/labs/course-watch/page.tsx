import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { CourseWatchClient } from './course-watch-client';

export const metadata = labsToolMetadata('course-watch');

export default function CourseWatchPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('course-watch')} />
      <CourseWatchClient />
      <RelatedTools slug="course-watch" />
    </>
  );
}
