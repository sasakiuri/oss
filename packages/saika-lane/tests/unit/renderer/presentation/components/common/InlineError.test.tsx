// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineError } from '@/renderer/presentation/components/common/InlineError';

describe('InlineError', () => {
  it('renders a red alert paragraph', () => {
    render(<InlineError>Save failed</InlineError>);

    const alert = screen.getByRole('alert');
    expect(alert.tagName).toBe('P');
    expect(alert).toHaveTextContent('Save failed');
    expect(alert.className).toBe('text-red-400');
  });
});
