import { act, render } from '@testing-library/react';
import { useReportWebVitals } from 'next/web-vitals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleAnalytics } from '@/components/google-analytics';

const { scripts } = vi.hoisted(() => ({ scripts: new Map<string, { onReady?: () => void; src?: string }>() }));

vi.mock('next/script', () => ({
  default: (props: { id?: string; src?: string; onReady?: () => void }) => {
    scripts.set(props.id ?? props.src ?? '', props);
    return null;
  },
}));

vi.mock('next/web-vitals', () => ({ useReportWebVitals: vi.fn() }));

beforeEach(() => {
  scripts.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.gtag;
});

describe('GoogleAnalytics with Web Vitals', () => {
  it('does not load scripts or collect metrics without an enabled GA property', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const { container } = render(<GoogleAnalytics />);
    expect(container).toBeEmptyDOMElement();
    expect(scripts.size).toBe(0);
    expect(useReportWebVitals).not.toHaveBeenCalled();
  });

  it('starts reporting after GA initialization and retains one callback across renders', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST');
    const { rerender } = render(<GoogleAnalytics />);
    expect(scripts.has('https://www.googletagmanager.com/gtag/js?id=G-TEST')).toBe(true);
    expect(useReportWebVitals).not.toHaveBeenCalled();

    window.gtag = vi.fn();
    act(() => scripts.get('google-analytics')!.onReady!());
    const callback = vi.mocked(useReportWebVitals).mock.calls[0]![0];
    callback({
      name: 'LCP',
      value: 1234.5,
      delta: 1234.5,
      id: 'lcp-id',
      rating: 'good',
      navigationType: 'navigate',
      entries: [],
    });
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'LCP',
      expect.objectContaining({ send_to: 'G-TEST', metric_value: 1234.5 }),
    );

    rerender(<GoogleAnalytics />);
    expect(vi.mocked(useReportWebVitals).mock.calls.at(-1)![0]).toBe(callback);
    expect(window.gtag).toHaveBeenCalledTimes(1);
  });
});
