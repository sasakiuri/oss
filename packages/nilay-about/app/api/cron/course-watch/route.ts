import { labsNotify } from '@/features/labs-notify/server/runtime';

// A scheduled job reads and writes shared state: never cached, always run in full.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = labsNotify.cronCourseWatch;
