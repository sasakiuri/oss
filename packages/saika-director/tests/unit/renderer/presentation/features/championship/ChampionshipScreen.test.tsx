// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addNotification, championshipState, createChampionship, loadChampionshipDetail, saveParticipants } = vi.hoisted(
  () => ({
    addNotification: vi.fn(),
    championshipState: {
      selectedChampionship: null,
      selectedEventId: null,
      participants: [],
      firingPointAssignments: [],
    } as Record<string, unknown>,
    createChampionship: vi.fn(),
    loadChampionshipDetail: vi.fn(),
    saveParticipants: vi.fn(),
  }),
);

vi.mock('@/renderer/presentation/stores/domain/championship.store', () => ({
  useChampionshipStore: (selector: (state: Record<string, unknown>) => unknown) => selector(championshipState),
}));

vi.mock('@/renderer/presentation/stores/ui/notifications.store', () => ({
  useNotificationStore: (selector: (state: { addNotification: typeof addNotification }) => unknown) =>
    selector({ addNotification }),
}));

vi.mock('@/renderer/presentation/hooks/useChampionshipActions', () => ({
  useChampionshipActions: () => ({
    loadChampionshipDetail,
    loadParticipants: vi.fn(),
    loadFiringPointAssignments: vi.fn(),
    createChampionship,
    updateChampionship: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    saveParticipants,
    saveFiringPointAssignments: vi.fn(),
    setSelectedEventId: vi.fn(),
  }),
}));

vi.mock('@/renderer/presentation/features/championship/components/ChampionshipList', () => ({
  ChampionshipList: ({ onCreate, onSelect }: { onCreate: () => void; onSelect: (championship: unknown) => void }) => (
    <div>
      <button type="button" onClick={onCreate}>
        Create New Test
      </button>
      <button type="button" onClick={() => onSelect(championshipState.selectedChampionship)}>
        Select Championship Test
      </button>
    </div>
  ),
}));

vi.mock('@/renderer/presentation/features/championship/components/ChampionshipForm', () => ({
  ChampionshipForm: ({ onSubmit }: { onSubmit: (data: { name: string; date: string; venue: string }) => void }) => (
    <button type="button" onClick={() => onSubmit({ name: 'Championship', date: '2026-08-27', venue: 'Tokyo' })}>
      Submit Creation Test
    </button>
  ),
}));

vi.mock('@/renderer/presentation/features/championship/components/IncidentReportsView', () => ({
  IncidentReportsView: ({ eventId }: { eventId: string }) => <div>incident workspace {eventId}</div>,
}));

vi.mock('@/renderer/presentation/features/championship/components/EquipmentRegistryPanel', () => ({
  EquipmentRegistryPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/championship/components/EstChampionshipInspectionPanel', () => ({
  EstChampionshipInspectionPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/championship/components/ResultsBookPanel', () => ({
  ResultsBookPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/championship/components/PostCompetitionEquipmentControlPanel', () => ({
  PostCompetitionEquipmentControlPanel: ({ eventId }: { eventId: string }) => (
    <div>equipment control workspace {eventId}</div>
  ),
}));

vi.mock('@/renderer/presentation/features/athlete-sanctions', () => ({
  AthleteSanctionsPanel: () => null,
}));

import { ChampionshipScreen } from '@/renderer/presentation/features/championship/ChampionshipScreen';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';

const selectedChampionship = {
  id: CHAMPIONSHIP_ID,
  name: 'Confirmation Championship',
  date: '2026-08-27',
  venue: 'Tokyo',
  createdAt: '2026-08-27T00:00:00.000Z',
  events: [
    {
      id: EVENT_ID,
      name: 'BR60S',
      eventType: 'BR60S',
      round: 'Qualification' as const,
      sortOrder: 0,
    },
  ],
};

const participant = {
  id: PARTICIPANT_ID,
  playerName: 'Alex Smith',
  affiliation: 'Tokyo',
  logoPath: null,
  sortOrder: 0,
};

describe('ChampionshipScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(championshipState, {
      selectedChampionship: null,
      selectedEventId: null,
      participants: [],
      firingPointAssignments: [],
    });
    if (useConfirmDialogStore.getState().isOpen) useConfirmDialogStore.getState().handleCancel();
  });

  it('keeps the form open when championship creation fails', async () => {
    createChampionship.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to save' },
    });
    render(<ChampionshipScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Create New Test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Creation Test' }));

    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Failed to save'));
    expect(screen.getByRole('button', { name: 'Submit Creation Test' })).toBeInTheDocument();
  });

  it('confirms before deleting assignments and confirmed results linked to a participant', async () => {
    Object.assign(championshipState, {
      selectedChampionship,
      selectedEventId: EVENT_ID,
      participants: [participant],
    });
    loadChampionshipDetail.mockResolvedValue({ success: true, data: selectedChampionship });
    saveParticipants.mockResolvedValue({ success: true, data: { participants: [] } });
    render(<ChampionshipScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alex Smith' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveParticipants).not.toHaveBeenCalled();
    expect(useConfirmDialogStore.getState()).toMatchObject({
      isOpen: true,
      message: expect.stringMatching(
        /Delete 1 participant.*firing-point assignments and confirmed results.*cannot be undone/,
      ),
    });

    act(() => useConfirmDialogStore.getState().handleConfirm());

    await waitFor(() =>
      expect(saveParticipants).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        participants: [],
        participantIdsToDelete: [PARTICIPANT_ID],
      }),
    );
  });

  it('opens the event-level incident workspace before results exist', async () => {
    Object.assign(championshipState, {
      selectedChampionship,
      selectedEventId: EVENT_ID,
      participants: [participant],
    });
    loadChampionshipDetail.mockResolvedValue({ success: true, data: selectedChampionship });
    render(<ChampionshipScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Incidents' }));

    expect(screen.getByText(`incident workspace ${EVENT_ID}`)).toBeInTheDocument();
  });

  it('opens post-competition equipment control as an event-level workspace', async () => {
    Object.assign(championshipState, {
      selectedChampionship,
      selectedEventId: EVENT_ID,
      participants: [participant],
    });
    loadChampionshipDetail.mockResolvedValue({ success: true, data: selectedChampionship });
    render(<ChampionshipScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Equipment Control' }));

    expect(screen.getByText(`equipment control workspace ${EVENT_ID}`)).toBeInTheDocument();
  });
});
