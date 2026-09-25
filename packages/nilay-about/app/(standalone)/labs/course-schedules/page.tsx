import { JsonLd } from '@/components/json-ld';
import { RelatedTools } from '@/components/labs';
import { labsToolJsonLd, labsToolMetadata } from '@/lib/seo';

import { CourseSchedulesClient } from './course-schedules-client';

export const metadata = labsToolMetadata('course-schedules');

export default function CourseSchedulesPage() {
  return (
    <>
      <JsonLd data={labsToolJsonLd('course-schedules')} />
      <CourseSchedulesClient />
      <RelatedTools slug="course-schedules" />
    </>
  );
}
