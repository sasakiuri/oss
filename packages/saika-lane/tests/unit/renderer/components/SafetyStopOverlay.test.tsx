import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SafetyStopOverlay } from '@/renderer/presentation/components/SafetyStopOverlay';
import { CLEAR_SAFETY_STATE, useSafetyStopStore } from '@/renderer/presentation/stores/safetyStopStore';

describe('SafetyStopOverlay', () => {
  beforeEach(() => useSafetyStopStore.getState().setState(CLEAR_SAFETY_STATE));

  it('is non-dismissible and announces STOP / UNLOAD while latched', () => {
    useSafetyStopStore.getState().setState({
      ...CLEAR_SAFETY_STATE,
      status: 'STOPPED',
      safetyStopId: '77777777-7777-4777-8777-777777777777',
      reason: 'Emergency',
      stoppedBy: 'CRO One',
      stoppedAt: '2026-09-01T01:00:00.000Z',
    });
    render(<SafetyStopOverlay />);
    expect(screen.getByRole('alert')).toHaveTextContent('STOP');
    expect(screen.getByRole('alert')).toHaveTextContent('UNLOAD');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing after explicit clearance', () => {
    const { container } = render(<SafetyStopOverlay />);
    expect(container).toBeEmptyDOMElement();
  });
});
