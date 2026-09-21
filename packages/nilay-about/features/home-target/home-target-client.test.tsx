import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomeTargetClient } from './home-target-client';

describe('target calculator', () => {
  it('shows valid results and blocks PDF downloads while an input is empty', () => {
    render(<HomeTargetClient />);
    expect(screen.getByText('160.5 cm')).toBeVisible();
    const button = screen.getByRole('button', { name: 'Get Target' });
    const eyeHeight = screen.getByLabelText('目の高さ');
    expect(button).toBeEnabled();
    fireEvent.change(eyeHeight, { target: { value: '' } });
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.change(eyeHeight, { target: { value: '180' } });
    expect(button).toBeEnabled();
    expect(screen.getByText('169.5 cm')).toBeVisible();
  });

  it('keeps the discipline dialog inside the lab theme and toggles preset fields', () => {
    render(
      <div data-testid="lab" className="standalone-app">
        <HomeTargetClient />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: '競技種目を編集' }));
    expect(screen.getByTestId('lab')).toContainElement(screen.getByRole('dialog'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'AR10' } });
    expect(screen.getByLabelText('射撃距離')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CUSTOM' } });
    expect(screen.getByLabelText('射撃距離')).not.toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('射撃距離'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('button', { name: 'Get Target' })).toBeDisabled();
  });
});
