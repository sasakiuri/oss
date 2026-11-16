// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addNotification,
  championshipState,
  createChampionship,
  loadChampionshipDetail,
  saveParticipants,
  updateChampionship,
  createEvent,
  updateEvent,
  deleteEvent,
  saveFiringPointAssignments,
  loadParticipants,
  loadFiringPointAssignments,
  setSelectedEventId,
} = vi.hoisted(() => ({
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
  updateChampionship: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  saveFiringPointAssignments: vi.fn(),
  loadParticipants: vi.fn(),
  loadFiringPointAssignments: vi.fn(),
  setSelectedEventId: vi.fn(),
}));

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
    loadParticipants,
    loadFiringPointAssignments,
    createChampionship,
    updateChampionship,
    createEvent,
    updateEvent,
    deleteEvent,
    saveParticipants,
    saveFiringPointAssignments,
    setSelectedEventId,
  }),
}));

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

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

vi.mock('@/renderer/presentation/features/championship/components/EventForm', () => ({
  EventForm: ({
    event,
    onSubmit,
    onCancel,
  }: {
    event?: { name: string };
    onSubmit: (data: { name: string; eventType: string }) => void;
    onCancel: () => void;
  }) => (
    <div>
      <p>{event ? `Event form for ${event.name}` : 'Event form for a new event'}</p>
      <button type="button" onClick={() => onSubmit({ name: 'Air Rifle', eventType: 'AR60' })}>
        Submit Event Test
      </button>
      <button type="button" onClick={onCancel}>
        Cancel Event Test
      </button>
    </div>
  ),
}));

vi.mock('@/renderer/presentation/features/championship/components/FiringPointAssignmentEditor', async () => {
  const { useState } = await import('react');
  return {
    FiringPointAssignmentEditor: function FiringPointAssignmentEditorTest({
      eventId,
      competitionTypeId,
      round,
      onSave,
      onAssignmentsApplied,
    }: {
      eventId: string;
      competitionTypeId: string;
      round?: string;
      onSave: (rows: { relayNumber: number; firingPointNumber: number; participantId: string }[]) => Promise<boolean>;
      onAssignmentsApplied?: () => Promise<void>;
    }) {
      const [saved, setSaved] = useState('not saved');
      return (
        <div>
          <p>
            assignment workspace {eventId} {competitionTypeId} {round}
          </p>
          <button
            type="button"
            onClick={() =>
              void onSave([
                { relayNumber: 1, firingPointNumber: 2, participantId: '33333333-3333-4333-8333-333333333333' },
              ]).then((result) => setSaved(String(result)))
            }
          >
            Save Assignments Test
          </button>
          <button type="button" onClick={() => void onAssignmentsApplied?.()}>
            Apply Assignments Test
          </button>
          <p>save result {saved}</p>
        </div>
      );
    },
  };
});

vi.mock('@/renderer/presentation/features/incident-reports/IncidentReportsView', () => ({
  IncidentReportsView: ({ eventId }: { eventId: string }) => <div>incident workspace {eventId}</div>,
}));

vi.mock('@/renderer/presentation/features/equipment-registry/EquipmentRegistryPanel', () => ({
  EquipmentRegistryPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/est-championship-inspections/EstChampionshipInspectionPanel', () => ({
  EstChampionshipInspectionPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/results-books/ResultsBookPanel', () => ({
  ResultsBookPanel: () => null,
}));

vi.mock(
  '@/renderer/presentation/features/post-competition-equipment-control/PostCompetitionEquipmentControlPanel',
  () => ({
    PostCompetitionEquipmentControlPanel: ({ eventId }: { eventId: string }) => (
      <div>equipment control workspace {eventId}</div>
    ),
  }),
);

vi.mock('@/renderer/presentation/features/athlete-sanctions', () => ({
  AthleteSanctionsPanel: () => null,
}));

import { ChampionshipScreen } from '@/renderer/presentation/features/championship/ChampionshipScreen';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { operationalArchivesService } from '@/renderer/services';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

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

  describe('commands', () => {
    const OTHER_EVENT_ID = '44444444-4444-4444-8444-444444444444';
    const NEW_EVENT_ID = '55555555-5555-4555-8555-555555555555';
    const exportCompetitionEvidence = vi.mocked(operationalArchivesService.exportCompetitionEvidence);

    beforeEach(() => {
      for (const action of [
        updateChampionship,
        createEvent,
        updateEvent,
        deleteEvent,
        saveFiringPointAssignments,
        loadParticipants,
        loadFiringPointAssignments,
        setSelectedEventId,
      ]) {
        action.mockReset();
      }
      loadParticipants.mockResolvedValue(ok({ participants: [] }));
      loadFiringPointAssignments.mockResolvedValue(ok({ assignments: [] }));
      exportCompetitionEvidence.mockReset();
    });

    async function openDetail(state: Record<string, unknown> = {}) {
      Object.assign(championshipState, {
        selectedChampionship,
        selectedEventId: EVENT_ID,
        participants: [participant],
        ...state,
      });
      loadChampionshipDetail.mockResolvedValue(ok(championshipState.selectedChampionship));
      const view = render(<ChampionshipScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));
      await screen.findByRole('button', { name: 'Edit details' });
      return view;
    }

    it.each([
      [
        'a failed response',
        () => loadChampionshipDetail.mockResolvedValue(fail('Detail unavailable')),
        'Detail unavailable',
      ],
      [
        'a missing championship',
        () => loadChampionshipDetail.mockResolvedValue(ok(null)),
        'The selected championship was not found',
      ],
      [
        'a rejected error',
        () => loadChampionshipDetail.mockRejectedValue(new Error('Detail rejected')),
        'Detail rejected',
      ],
      [
        'a rejected message object',
        () => loadChampionshipDetail.mockRejectedValue({ message: 'Detail object rejected' }),
        'Detail object rejected',
      ],
      [
        'a rejected value without a message',
        () => loadChampionshipDetail.mockRejectedValue('offline'),
        'Failed to load the championship',
      ],
    ])('stays on the championship list and reports %s while opening one', async (_case, arrange, message) => {
      Object.assign(championshipState, { selectedChampionship });
      arrange();
      render(<ChampionshipScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(loadChampionshipDetail).toHaveBeenCalledWith(CHAMPIONSHIP_ID);
      expect(screen.getByRole('button', { name: 'Create New Test' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    });

    it('returns to the championship list after creating one', async () => {
      createChampionship.mockResolvedValue(ok(CHAMPIONSHIP_ID));
      render(<ChampionshipScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Create New Test' }));
      expect(screen.getByRole('heading', { name: 'New championship' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Submit Creation Test' }));

      expect(await screen.findByRole('button', { name: 'Create New Test' })).toBeInTheDocument();
      expect(createChampionship).toHaveBeenCalledWith({ name: 'Championship', date: '2026-08-27', venue: 'Tokyo' });
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a failed response without an error',
        () => createChampionship.mockResolvedValue({ success: false }),
        'Failed to create the championship',
      ],
      ['a rejected error', () => createChampionship.mockRejectedValue(new Error('Create rejected')), 'Create rejected'],
      [
        'a rejected message object',
        () => createChampionship.mockRejectedValue({ message: 'Create object rejected' }),
        'Create object rejected',
      ],
      [
        'a rejected value without a message',
        () => createChampionship.mockRejectedValue('offline'),
        'Failed to create the championship',
      ],
    ])('keeps the creation form open and reports %s', async (_case, arrange, message) => {
      arrange();
      render(<ChampionshipScreen />);

      fireEvent.click(screen.getByRole('button', { name: 'Create New Test' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit Creation Test' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(screen.getByRole('heading', { name: 'New championship' })).toBeInTheDocument();
    });

    it('returns to the championship details after updating them', async () => {
      updateChampionship.mockResolvedValue({ success: true });
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
      expect(screen.getByRole('heading', { name: 'Edit championship' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Submit Creation Test' }));

      expect(await screen.findByRole('button', { name: 'Edit details' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Edit championship' })).not.toBeInTheDocument();
      expect(updateChampionship).toHaveBeenCalledWith({
        id: CHAMPIONSHIP_ID,
        name: 'Championship',
        date: '2026-08-27',
        venue: 'Tokyo',
      });
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      ['a failed response', () => updateChampionship.mockResolvedValue(fail('Update refused')), 'Update refused'],
      [
        'a failed response without an error',
        () => updateChampionship.mockResolvedValue({ success: false }),
        'Failed to update the championship',
      ],
      [
        'a rejected value without a message',
        () => updateChampionship.mockRejectedValue('offline'),
        'Failed to update the championship',
      ],
    ])('keeps the championship edit form open and reports %s', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit Creation Test' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(screen.getByRole('heading', { name: 'Edit championship' })).toBeInTheDocument();
    });

    it('closes the event form before loading the entries of an added event', async () => {
      createEvent.mockResolvedValue(ok(NEW_EVENT_ID));
      let finishLoading!: () => void;
      loadParticipants.mockReturnValue(
        new Promise((resolve) => (finishLoading = () => resolve(ok({ participants: [] })))),
      );
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
      expect(screen.getByText('Event form for a new event')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Submit Event Test' }));

      await waitFor(() => expect(loadParticipants).toHaveBeenCalledWith(NEW_EVENT_ID));
      expect(screen.queryByText('Event form for a new event')).not.toBeInTheDocument();
      expect(createEvent).toHaveBeenCalledWith({
        championshipId: CHAMPIONSHIP_ID,
        name: 'Air Rifle',
        eventType: 'AR60',
      });
      expect(setSelectedEventId).toHaveBeenCalledWith(NEW_EVENT_ID);
      expect(loadFiringPointAssignments).toHaveBeenCalledWith(NEW_EVENT_ID);
      expect(setSelectedEventId.mock.invocationCallOrder[0]).toBeLessThan(
        loadParticipants.mock.invocationCallOrder[0]!,
      );
      await act(async () => finishLoading());
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      ['a failed response', () => createEvent.mockResolvedValue(fail('Event refused')), 'Event refused'],
      [
        'a response without the new event',
        () => createEvent.mockResolvedValue({ success: true }),
        'Failed to add the event',
      ],
      ['a rejected value without a message', () => createEvent.mockRejectedValue('offline'), 'Failed to add the event'],
    ])('keeps the event form open and reports %s while adding an event', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit Event Test' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(screen.getByText('Event form for a new event')).toBeInTheDocument();
      expect(setSelectedEventId).not.toHaveBeenCalled();
      expect(loadParticipants).not.toHaveBeenCalled();
    });

    it.each([
      ['a rejected entry load', () => loadParticipants.mockRejectedValue(new Error('offline')), 'offline'],
      ['a rejected value', () => loadParticipants.mockRejectedValue('offline'), 'offline'],
      [
        'a failed entry response',
        () => loadParticipants.mockResolvedValue(fail('Entries unavailable')),
        'Entries unavailable',
      ],
      [
        'a failed assignment response',
        () => loadFiringPointAssignments.mockResolvedValue(fail('Assignments unavailable')),
        'Assignments unavailable',
      ],
    ])('reports %s of an added event as a load failure, not as a failure to add it', async (_case, arrange, text) => {
      createEvent.mockResolvedValue(ok(NEW_EVENT_ID));
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit Event Test' }));

      await waitFor(() =>
        expect(addNotification.mock.calls).toEqual([
          ['error', `The event was added, but loading its entries failed: ${text}`],
        ]),
      );
      expect(screen.queryByText('Event form for a new event')).not.toBeInTheDocument();
      expect(setSelectedEventId).toHaveBeenCalledWith(NEW_EVENT_ID);
    });

    it('closes the event form after updating an event', async () => {
      updateEvent.mockResolvedValue({ success: true });
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Edit BR60S' }));
      expect(screen.getByText('Event form for BR60S')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Submit Event Test' }));

      await waitFor(() => expect(screen.queryByText('Event form for BR60S')).not.toBeInTheDocument());
      expect(updateEvent).toHaveBeenCalledWith({ id: EVENT_ID, name: 'Air Rifle', eventType: 'AR60' });
      expect(createEvent).not.toHaveBeenCalled();
      expect(addNotification).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
      expect(screen.getByText('Event form for a new event')).toBeInTheDocument();
    });

    it.each([
      ['a failed response', () => updateEvent.mockResolvedValue(fail('Event update refused')), 'Event update refused'],
      [
        'a failed response without an error',
        () => updateEvent.mockResolvedValue({ success: false }),
        'Failed to update the event',
      ],
      [
        'a rejected value without a message',
        () => updateEvent.mockRejectedValue('offline'),
        'Failed to update the event',
      ],
    ])('keeps the event edit form open and reports %s', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Edit BR60S' }));
      fireEvent.click(screen.getByRole('button', { name: 'Submit Event Test' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(screen.getByText('Event form for BR60S')).toBeInTheDocument();
    });

    it('closes the event form without saving when it is cancelled', async () => {
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Edit BR60S' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel Event Test' }));

      expect(screen.queryByText('Event form for BR60S')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Participants' })).toBeInTheDocument();
      expect(updateEvent).not.toHaveBeenCalled();
    });

    it('asks before deleting an event and clears the selection when it was selected', async () => {
      deleteEvent.mockResolvedValue({ success: true });
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Delete BR60S' }));

      expect(useConfirmDialogStore.getState()).toMatchObject({ isOpen: true, message: 'Delete this event?' });
      expect(deleteEvent).not.toHaveBeenCalled();
      act(() => useConfirmDialogStore.getState().handleConfirm());
      await waitFor(() => expect(setSelectedEventId).toHaveBeenCalledWith(null));
      expect(deleteEvent).toHaveBeenCalledWith(EVENT_ID);
      expect(addNotification).not.toHaveBeenCalled();
    });

    it('keeps the event selection when another event is deleted', async () => {
      deleteEvent.mockResolvedValue({ success: true });
      await openDetail({ selectedEventId: OTHER_EVENT_ID });

      fireEvent.click(screen.getByRole('button', { name: 'Delete BR60S' }));
      await act(async () => useConfirmDialogStore.getState().handleConfirm());

      expect(deleteEvent).toHaveBeenCalledWith(EVENT_ID);
      expect(setSelectedEventId).not.toHaveBeenCalled();
    });

    it('does not delete an event when the deletion is cancelled', async () => {
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Delete BR60S' }));
      await act(async () => useConfirmDialogStore.getState().handleCancel());

      expect(deleteEvent).not.toHaveBeenCalled();
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      ['a failed response', () => deleteEvent.mockResolvedValue(fail('Event delete refused')), 'Event delete refused'],
      [
        'a failed response without an error',
        () => deleteEvent.mockResolvedValue({ success: false }),
        'Failed to delete the event',
      ],
      [
        'a rejected value without a message',
        () => deleteEvent.mockRejectedValue('offline'),
        'Failed to delete the event',
      ],
    ])('keeps the event selection and reports %s while deleting an event', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Delete BR60S' }));
      act(() => useConfirmDialogStore.getState().handleConfirm());

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(setSelectedEventId).not.toHaveBeenCalled();
    });

    it('saves the entries without asking and shows the saved participants when nobody is removed', async () => {
      saveParticipants.mockResolvedValue(ok({ participants: [{ ...participant, playerName: 'Alex Saved' }] }));
      await openDetail();

      fireEvent.change(await screen.findByPlaceholderText('Athlete name'), { target: { value: 'Alex Edited' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.getByPlaceholderText('Athlete name')).toHaveValue('Alex Saved'));
      expect(useConfirmDialogStore.getState().isOpen).toBe(false);
      expect(saveParticipants).toHaveBeenCalledTimes(1);
      expect(Object.keys(saveParticipants.mock.calls[0]![0] as object)).toEqual(['eventId', 'participants']);
      expect(saveParticipants).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        participants: [expect.objectContaining({ id: PARTICIPANT_ID, playerName: 'Alex Edited' })],
      });
      expect(addNotification).not.toHaveBeenCalled();
    });

    it('does not save the entries when removing a participant is not confirmed', async () => {
      await openDetail();

      fireEvent.click(await screen.findByRole('button', { name: 'Delete Alex Smith' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await act(async () => useConfirmDialogStore.getState().handleCancel());

      expect(saveParticipants).not.toHaveBeenCalled();
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a failed response',
        () => saveParticipants.mockResolvedValue(fail('Participants refused')),
        'Participants refused',
      ],
      [
        'a failed response without an error',
        () => saveParticipants.mockResolvedValue({ success: false }),
        'Failed to save participants',
      ],
      [
        'a rejected value without a message',
        () => saveParticipants.mockRejectedValue('offline'),
        'Failed to save participants',
      ],
    ])('reports %s while saving the entries', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.change(await screen.findByPlaceholderText('Athlete name'), { target: { value: 'Alex Edited' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(screen.getByDisplayValue('Alex Edited')).toBeInTheDocument();
    });

    it('saves the firing-point assignments of the selected event', async () => {
      saveFiringPointAssignments.mockResolvedValue(ok({ assignments: [] }));
      await openDetail();

      fireEvent.click(screen.getByRole('tab', { name: 'Firing-Point Assignment' }));
      expect(screen.getByText(`assignment workspace ${EVENT_ID} BR60S Qualification`)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save Assignments Test' }));

      expect(await screen.findByText('save result true')).toBeInTheDocument();
      expect(saveFiringPointAssignments).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        assignments: [{ relayNumber: 1, firingPointNumber: 2, participantId: PARTICIPANT_ID }],
      });
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a failed response',
        () => saveFiringPointAssignments.mockResolvedValue(fail('Assignments refused')),
        'Assignments refused',
      ],
      [
        'a failed response without an error',
        () => saveFiringPointAssignments.mockResolvedValue({ success: false }),
        'Failed to save firing-point assignments',
      ],
      [
        'a rejected value without a message',
        () => saveFiringPointAssignments.mockRejectedValue('offline'),
        'Failed to save firing-point assignments',
      ],
    ])('reports %s while saving the firing-point assignments', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('tab', { name: 'Firing-Point Assignment' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save Assignments Test' }));

      expect(await screen.findByText('save result false')).toBeInTheDocument();
      expect(addNotification.mock.calls).toEqual([['error', message]]);
    });

    it('reloads the firing-point assignments after a plan is applied', async () => {
      await openDetail();

      fireEvent.click(screen.getByRole('tab', { name: 'Firing-Point Assignment' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apply Assignments Test' }));

      await waitFor(() => expect(loadFiringPointAssignments).toHaveBeenCalledWith(EVENT_ID));
    });

    it('disables the evidence export while it runs and reports the exported bundle', async () => {
      let finishExport!: (response: unknown) => void;
      exportCompetitionEvidence.mockReturnValue(
        new Promise<unknown>((resolve) => (finishExport = resolve)) as ReturnType<typeof exportCompetitionEvidence>,
      );
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Export evidence' }));

      expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
      expect(exportCompetitionEvidence).toHaveBeenCalledWith({ championshipId: CHAMPIONSHIP_ID });
      await act(async () => finishExport(ok({ status: 'COMPLETED', fileName: 'evidence.zip' })));
      expect(addNotification.mock.calls).toEqual([['success', 'Evidence bundle exported: evidence.zip']]);
      expect(screen.getByRole('button', { name: 'Export evidence' })).toBeEnabled();
    });

    it('says nothing when the evidence export is cancelled', async () => {
      exportCompetitionEvidence.mockResolvedValue(ok({ status: 'CANCELLED' }));
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Export evidence' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Export evidence' })).toBeEnabled());
      expect(exportCompetitionEvidence).toHaveBeenCalledTimes(1);
      expect(addNotification).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a failed response',
        () => exportCompetitionEvidence.mockResolvedValue(fail('Export refused')),
        'Export refused',
      ],
      [
        'a rejected error',
        () => exportCompetitionEvidence.mockRejectedValue(new Error('Export rejected')),
        'Export rejected',
      ],
      [
        'a rejected message object',
        () => exportCompetitionEvidence.mockRejectedValue({ message: 'Export object rejected' }),
        'Export object rejected',
      ],
      [
        'a rejected value without a message',
        () => exportCompetitionEvidence.mockRejectedValue('offline'),
        'Failed to export the evidence bundle',
      ],
    ])('reports %s while exporting the evidence bundle', async (_case, arrange, message) => {
      arrange();
      await openDetail();

      fireEvent.click(screen.getByRole('button', { name: 'Export evidence' }));

      await waitFor(() => expect(addNotification.mock.calls).toEqual([['error', message]]));
      expect(screen.getByRole('button', { name: 'Export evidence' })).toBeEnabled();
    });
  });

  describe('navigation', () => {
    const OTHER_EVENT_ID = '44444444-4444-4444-8444-444444444444';

    beforeEach(() => {
      loadParticipants.mockReset();
      loadFiringPointAssignments.mockReset();
      setSelectedEventId.mockReset();
    });

    async function openDetail(state: Record<string, unknown> = {}) {
      Object.assign(championshipState, {
        selectedChampionship,
        selectedEventId: EVENT_ID,
        participants: [participant],
        ...state,
      });
      loadChampionshipDetail.mockResolvedValue(ok(championshipState.selectedChampionship));
      const view = render(<ChampionshipScreen />);
      fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));
      await screen.findByRole('button', { name: 'Edit details' });
      return view;
    }

    it('opens a selected event on its participants tab and loads its entries', async () => {
      await openDetail();
      fireEvent.click(screen.getByRole('tab', { name: 'Incidents' }));

      fireEvent.click(screen.getByRole('button', { pressed: true }));

      expect(setSelectedEventId).toHaveBeenCalledWith(EVENT_ID);
      expect(loadParticipants).toHaveBeenCalledWith(EVENT_ID);
      expect(loadFiringPointAssignments).toHaveBeenCalledWith(EVENT_ID);
      expect(await screen.findByRole('tab', { name: 'Participants' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'event-participants-panel');
    });

    it('returns to the championship list, clears the event and reopens on the participants tab', async () => {
      await openDetail();
      fireEvent.click(screen.getByRole('tab', { name: 'Incidents' }));

      fireEvent.click(screen.getByRole('button', { name: 'Championships' }));

      expect(screen.getByRole('button', { name: 'Create New Test' })).toBeInTheDocument();
      expect(setSelectedEventId).toHaveBeenCalledWith(null);
      fireEvent.click(screen.getByRole('button', { name: 'Select Championship Test' }));
      expect(await screen.findByRole('tab', { name: 'Participants' })).toHaveAttribute('aria-selected', 'true');
    });

    it('lists the event workspace tabs in order and offers the elimination plan only for elimination rounds', async () => {
      const { unmount } = await openDetail();

      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Participants',
        'Firing-Point Assignment',
        'Results',
        'Target Examination',
        'Interruptions',
        'Incidents',
        'Protests',
        'Cases',
        'Equipment Control',
      ]);
      unmount();

      await openDetail({
        selectedChampionship: {
          ...selectedChampionship,
          events: [{ ...selectedChampionship.events[0]!, round: 'Elimination' as const }],
        },
      });
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Participants',
        'Firing-Point Assignment',
        'Elimination Plan',
        'Results',
        'Target Examination',
        'Interruptions',
        'Incidents',
        'Protests',
        'Cases',
        'Equipment Control',
      ]);
    });

    it('discards an unsaved participant draft when another event is selected', async () => {
      const championshipWithTwoEvents = {
        ...selectedChampionship,
        events: [
          ...selectedChampionship.events,
          { id: OTHER_EVENT_ID, name: 'BP60', eventType: 'BP60', round: 'Qualification' as const, sortOrder: 1 },
        ],
      };
      const { rerender } = await openDetail({ selectedChampionship: championshipWithTwoEvents });

      fireEvent.click(await screen.findByRole('button', { name: 'Delete Alex Smith' }));
      expect(screen.queryByDisplayValue('Alex Smith')).not.toBeInTheDocument();
      championshipState.selectedEventId = OTHER_EVENT_ID;
      rerender(<ChampionshipScreen />);

      await waitFor(() => expect(screen.getByPlaceholderText('Athlete name')).toHaveValue('Alex Smith'));
    });
  });
});
