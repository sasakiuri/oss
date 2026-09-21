import type { useReportWebVitals } from 'next/web-vitals';

export type WebVital = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

interface WebVitalEvent {
  send_to: string;
  value: number;
  metric_id: string;
  metric_value: number;
  metric_delta: number;
  metric_rating: WebVital['rating'];
  navigation_type: WebVital['navigationType'];
  non_interaction: true;
}

declare global {
  interface Window {
    gtag?: (command: 'event', name: WebVital['name'], event: WebVitalEvent) => void;
  }
}

export function reportWebVital(metric: WebVital, measurementId: string | undefined) {
  if (!measurementId || typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }

  // GA4 accepts fractional values. Deltas can be summed; metric_value retains the final measurement.
  // Keep the event explicit: entries and attribution may contain DOM text or resource URLs.
  window.gtag('event', metric.name, {
    send_to: measurementId,
    value: metric.delta,
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    navigation_type: metric.navigationType,
    non_interaction: true,
  });
}
