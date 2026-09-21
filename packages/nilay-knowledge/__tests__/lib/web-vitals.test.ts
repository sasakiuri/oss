import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportWebVital, type WebVital } from '@/lib/web-vitals';

const metric: WebVital = {
  name: 'CLS',
  value: 0.125,
  delta: 0.025,
  id: 'page-load-metric',
  rating: 'needs-improvement',
  navigationType: 'navigate',
  entries: [],
};

afterEach(() => {
  delete window.gtag;
});

describe('reportWebVital', () => {
  it('does not send to an unrelated global tag when this site has no GA configuration', () => {
    window.gtag = vi.fn();
    reportWebVital(metric, undefined);
    reportWebVital(metric, '');
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('does not fail if the analytics tag is unavailable', () => {
    expect(() => reportWebVital(metric, 'G-TEST')).not.toThrow();
  });

  it.each(['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const)(
    'sends %s to the configured property with fractional deltas and no DOM or URL attribution',
    (name) => {
      window.gtag = vi.fn();
      const attributedMetric = {
        ...metric,
        name,
        attribution: { target: '<input value="private">', url: 'https://example.test/?q=private' },
      };
      reportWebVital(attributedMetric, 'G-TEST');
      expect(window.gtag).toHaveBeenCalledExactlyOnceWith('event', name, {
        send_to: 'G-TEST',
        value: 0.025,
        metric_id: 'page-load-metric',
        metric_value: 0.125,
        metric_delta: 0.025,
        metric_rating: 'needs-improvement',
        navigation_type: 'navigate',
        non_interaction: true,
      });
    },
  );
});
