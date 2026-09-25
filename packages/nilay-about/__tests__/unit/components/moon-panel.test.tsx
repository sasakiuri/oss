import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MoonPanel } from '@/app/(standalone)/labs/hunting-hours/moon-panel';

describe('the moon panel', () => {
  it('shows rise, set, age and lit fraction for a day and place', () => {
    render(
      <MoonPanel
        language="en"
        date={{ year: 2026, month: 10, day: 15 }}
        location={{ latitude: 35.6581, longitude: 139.7414 }}
      />,
    );
    expect(screen.getByText('Moonrise')).toBeInTheDocument();
    expect(screen.getByText('Age at noon')).toBeInTheDocument();
    expect(screen.getByText('Waxing')).toBeInTheDocument();
  });

  it('asks for a date and a place while either is missing', () => {
    render(<MoonPanel language="ja" date={null} location={null} />);
    expect(screen.getByText('日付と地点を入力してください。')).toBeInTheDocument();
  });

  it('declines a year outside the formulae', () => {
    render(
      <MoonPanel language="ja" date={{ year: 2300, month: 1, day: 1 }} location={{ latitude: 35, longitude: 139 }} />,
    );
    expect(screen.getByText('月は 1900〜2100 年の日付だけ計算します。')).toBeInTheDocument();
  });
});
