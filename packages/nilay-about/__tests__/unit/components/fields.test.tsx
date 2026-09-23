import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NumberField } from '@/components/labs';

describe('NumberField', () => {
  it('names the number with its unit and offers the unit in the same field', () => {
    const onUnit = vi.fn();
    render(
      <NumberField
        label="初速"
        value={800}
        onChange={() => {}}
        units={{
          value: 'mps',
          label: '初速の単位',
          options: [
            { value: 'mps', label: 'm/s' },
            { value: 'fps', label: 'fps' },
          ],
          onChange: onUnit,
        }}
      />,
    );
    expect(screen.getByRole('spinbutton', { name: '初速 (m/s)' })).toHaveValue(800);
    fireEvent.change(screen.getByRole('combobox', { name: '初速の単位' }), { target: { value: 'fps' } });
    expect(onUnit).toHaveBeenCalledWith('fps');
  });

  it('reads an emptied field as no number, and explains an invalid one', () => {
    const onChange = vi.fn();
    render(
      <NumberField
        label="風速"
        unit="m/s"
        value={4}
        onChange={onChange}
        invalid
        errorText="0 以上の数値を入力してください。"
      />,
    );
    const field = screen.getByRole('spinbutton', { name: '風速 (m/s)' });
    expect(field).toHaveAccessibleDescription('0 以上の数値を入力してください。');
    fireEvent.change(field, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(NaN);
  });
});
