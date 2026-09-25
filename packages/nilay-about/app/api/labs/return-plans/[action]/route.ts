import { labsNotify } from '@/features/labs-notify/server/runtime';

// Shorter than the 90-second plan lock these actions take, so a stopped request never outlives it.
export const maxDuration = 60;

export const POST = labsNotify.returnPlanAction;
