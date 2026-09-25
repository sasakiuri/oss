import { labsNotify } from '@/features/labs-notify/server/runtime';

export const GET = labsNotify.viewRoom;
export const PUT = labsNotify.reportPosition;
export const DELETE = labsNotify.closeRoom;
