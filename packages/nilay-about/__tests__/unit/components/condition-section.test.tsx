import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ConditionSection } from '@/components/labs';

const renderSection = (props: Partial<Parameters<typeof ConditionSection>[0]> = {}) =>
  render(
    <ConditionSection id="atmosphere" title="大気" summary="15 °C・1013.25 hPa" {...props}>
      <label>
        気温
        <input type="number" defaultValue={15} />
      </label>
    </ConditionSection>,
  );

describe('ConditionSection', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('starts closed and still says what it assumes', () => {
    renderSection();
    const toggle = screen.getByRole('button', { name: /大気/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('15 °C・1013.25 hPa');
    expect(screen.getByLabelText('気温')).not.toBeVisible();
  });

  it('opens and closes from its heading, keeping what was typed', () => {
    renderSection();
    const toggle = screen.getByRole('button', { name: /大気/ });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByLabelText('気温'), { target: { value: '30' } });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByLabelText('気温')).toHaveValue(30);
  });

  it('cannot fold away a field that needs fixing, and stays open once it is fixed', () => {
    const { rerender } = renderSection({ forceOpen: true });
    const toggle = screen.getByRole('button', { name: /大気/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Still in the tab order, only refusing to close.
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('気温')).toBeVisible();
    rerender(
      <ConditionSection id="atmosphere" title="大気" summary="15 °C・1013.25 hPa">
        <label>
          気温
          <input type="number" defaultValue={15} />
        </label>
      </ConditionSection>,
    );
    expect(screen.getByLabelText('気温')).toBeVisible();
  });

  it('opens when a link to it is followed again, with the address already pointing there', () => {
    window.history.replaceState(null, '', '/#atmosphere');
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /大気/ }));
    expect(screen.getByLabelText('気温')).not.toBeVisible();
    const link = document.createElement('a');
    link.href = '#atmosphere';
    document.body.append(link);
    fireEvent.click(link);
    expect(screen.getByLabelText('気温')).toBeVisible();
    link.remove();
  });

  it('opens when a link points into it', () => {
    window.history.replaceState(null, '', '/#atmosphere');
    renderSection();
    expect(screen.getByLabelText('気温')).toBeVisible();
  });
});
