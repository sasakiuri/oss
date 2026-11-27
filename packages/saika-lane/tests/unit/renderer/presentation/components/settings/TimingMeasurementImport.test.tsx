// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimingMeasurementImport } from '@/renderer/presentation/components/settings/TimingMeasurementImport';
import { timedTargetService } from '@/renderer/services/timedTargetService';

vi.mock('@/renderer/services/timedTargetService', () => ({ timedTargetService: { analyzeMeasurements: vi.fn() } }));
const analysis = {
  algorithm: 'SAMPLE_MAXIMUM_WITH_UNCERTAINTY_V1' as const,
  sourceName: 'capture.json',
  sourceSha256: 'a'.repeat(64),
  receiptSamples: 1,
  clockSamples: 0,
  settings: { mode: 'BOUNDED' as const, maximumReceiptDelayMilliseconds: 18, clockUncertaintyMilliseconds: null },
};
function prepare() {
  fireEvent.change(screen.getByLabelText('Measurement source name'), { target: { value: 'capture.json' } });
  fireEvent.change(screen.getByLabelText('Measurement samples (JSON)'), { target: { value: '[]' } });
  fireEvent.change(screen.getByLabelText('Reception delay margin (ms)'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Clock uncertainty margin (ms)'), { target: { value: '0' } });
}
describe('timing measurement import', () => {
  it('requires explicit margins and invalidates a previous calculation when the input changes', async () => {
    vi.mocked(timedTargetService.analyzeMeasurements).mockResolvedValue(analysis);
    const onAnalyzed = vi.fn();
    render(<TimingMeasurementImport onAnalyzed={onAnalyzed} />);
    expect(screen.getByRole('button', { name: 'Analyze timing measurements' })).toBeDisabled();
    prepare();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze timing measurements' }));
    expect(await screen.findByRole('status')).toHaveTextContent('clock uncertainty: Unknown ms');
    expect(onAnalyzed).toHaveBeenLastCalledWith({
      analysis,
      request: {
        sourceName: 'capture.json',
        content: '[]',
        receiptMarginMilliseconds: 5,
        clockMarginMilliseconds: 0,
      },
    });
    fireEvent.change(screen.getByLabelText('Reception delay margin (ms)'), { target: { value: '1' } });
    expect(onAnalyzed).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('does not deliver a calculation from an abandoned import to another profile draft', async () => {
    let complete!: (value: typeof analysis) => void;
    vi.mocked(timedTargetService.analyzeMeasurements).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const onAnalyzed = vi.fn();
    const view = render(<TimingMeasurementImport onAnalyzed={onAnalyzed} />);
    prepare();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze timing measurements' }));
    await waitFor(() => expect(complete).toBeDefined());
    view.unmount();
    complete(analysis);
    await Promise.resolve();
    expect(onAnalyzed.mock.calls.every(([value]) => value === null)).toBe(true);
  });
});
