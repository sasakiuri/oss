// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorAlert } from '@/renderer/presentation/components/common/ErrorAlert';

describe('ErrorAlert', () => {
  it('renders a polite atomic alert with the red box classes', () => {
    render(<ErrorAlert>Broker unreachable</ErrorAlert>);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Broker unreachable');
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
    expect(alert.className).toBe('rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400');
  });

  it('adds the side margin when inset', () => {
    render(<ErrorAlert inset>Save failed</ErrorAlert>);

    expect(screen.getByRole('alert').className).toBe(
      'mx-4 rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400',
    );
  });
});
