'use client';

import { useReportWebVitals } from 'next/web-vitals';

import { reportWebVital, type WebVital } from '@/lib/web-vitals';

// A stable callback avoids replaying previously reported measurements on each render.
function handleWebVital(metric: WebVital) {
  reportWebVital(metric, process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
}

export function WebVitals() {
  useReportWebVitals(handleWebVital);
  return null;
}
