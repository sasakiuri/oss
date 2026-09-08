import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ResultsBoardScreen } from '@/renderer/presentation/features/boards/ResultsBoardScreen';

vi.mock('@/renderer/presentation/features/boards/PublishedResultsSummary', () => ({
  PublishedResultsSummary: ({ eventId, resultScope }: { eventId: string; resultScope: string }) => (
    <div>
      Publication summary: {eventId} / {resultScope}
    </div>
  ),
}));
vi.mock('@/renderer/presentation/features/championship/components/ResultsView', () => ({
  ResultsView: ({ eventId, readOnly }: { eventId: string; readOnly: boolean }) => (
    <div>
      Detailed results: {eventId} / {readOnly ? 'read only' : 'editable'}
    </div>
  ),
}));

describe('ResultsBoardScreen', () => {
  it('keeps detailed results accessible without sharing the publication label', () => {
    render(
      <ResultsBoardScreen
        config={{ type: 'results-board', eventId: 'event', round: 'Final', eventName: 'Air Rifle Final' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Air Rifle Final' })).toBeInTheDocument();
    expect(screen.getByText('Publication summary: event / FINAL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show detailed results' }));
    expect(screen.queryByText('Publication summary: event / FINAL')).not.toBeInTheDocument();
    expect(screen.getByText('Detailed results: event / read only')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show publication summary' }));
    expect(screen.getByText('Publication summary: event / FINAL')).toBeInTheDocument();
    expect(screen.queryByText('Detailed results: event / read only')).not.toBeInTheDocument();
  });

  it('requires an event before reading its publication', () => {
    render(<ResultsBoardScreen config={{ type: 'results-board' }} />);
    expect(screen.getByText('No event selected')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
