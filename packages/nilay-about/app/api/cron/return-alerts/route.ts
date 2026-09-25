import { labsNotify } from '@/features/labs-notify/server/runtime';

// A scheduled job reads and writes shared state: never cached, always run in full.
export const dynamic = 'force-dynamic';
// Up to 280 s (a Pro plan limit), which the check's worst case fits (RETURN_RUN_TIMING).
export const maxDuration = 280;

export const GET = labsNotify.cronReturnAlerts;
