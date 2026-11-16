import { useCallback, useState } from 'react';

import type { useChampionshipActions } from '@/renderer/presentation/hooks/useChampionshipActions';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { operationalArchivesService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { EventType } from '@/shared/constants/competition';
import type {
  ChampionshipDetailDto,
  ChampionshipDto,
  EventDto,
  ParticipantDto,
  SaveParticipantsPayload,
} from '@/shared/ipc/contracts';

/** The championship actions the commands run; the screen owns the single `useChampionshipActions()` instance. */
type ChampionshipScreenActions = Pick<
  ReturnType<typeof useChampionshipActions>,
  | 'loadChampionshipDetail'
  | 'loadParticipants'
  | 'loadFiringPointAssignments'
  | 'createChampionship'
  | 'updateChampionship'
  | 'createEvent'
  | 'updateEvent'
  | 'deleteEvent'
  | 'saveParticipants'
  | 'saveFiringPointAssignments'
  | 'setSelectedEventId'
>;

/** The screen's view changes that follow a successful command. They must be stable across renders. */
export interface ChampionshipScreenNavigation {
  readonly showList: () => void;
  readonly showDetail: () => void;
  /** Leaves the championship edit form for the details. */
  readonly closeChampionshipEdit: () => void;
  /** Hides the event form and keeps the event it was opened for. */
  readonly hideEventForm: () => void;
  /** Hides the event form and forgets the event it was opened for. */
  readonly closeEventForm: () => void;
}

interface ChampionshipScreenCommandsOptions {
  readonly actions: ChampionshipScreenActions;
  readonly selectedChampionship: ChampionshipDetailDto | null;
  readonly selectedEventId: string | null;
  readonly participants: readonly ParticipantDto[];
  /** The championship and the event whose edit forms are open. */
  readonly editTarget: ChampionshipDto | null;
  readonly editEventTarget: EventDto | null;
  readonly navigation: ChampionshipScreenNavigation;
}

type ChampionshipFields = { name: string; date: string; venue: string };
type EventFields = { name: string; eventType: EventType };
type AssignmentRow = { relayNumber: number; firingPointNumber: number; participantId: string };

/**
 * A failed command's notification text: the message of an error or of a `{ message }` object, else `fallback`.
 * Unlike `errorMessage` from serviceError, a rejected value without a message never prints itself.
 */
function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

/**
 * The championship screen's championship and event commands. Each reports its failure as an error notification and
 * changes the view only after it succeeded.
 */
export function useChampionshipScreenCommands({
  actions,
  selectedChampionship,
  selectedEventId,
  participants,
  editTarget,
  editEventTarget,
  navigation,
}: ChampionshipScreenCommandsOptions) {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [exportingEvidence, setExportingEvidence] = useState(false);
  const {
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
  } = actions;
  const { showList, showDetail, closeChampionshipEdit, hideEventForm, closeEventForm } = navigation;

  const openChampionship = useCallback(
    async (championship: ChampionshipDto) => {
      try {
        const detail = unwrap(await loadChampionshipDetail(championship.id));
        if (detail === null) {
          addNotification('error', 'The selected championship was not found');
          return;
        }
        showDetail();
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to load the championship'));
      }
    },
    [addNotification, loadChampionshipDetail, showDetail],
  );

  const submitNewChampionship = useCallback(
    async (data: ChampionshipFields) => {
      try {
        unwrap(await createChampionship(data), 'Failed to create the championship');
        showList();
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to create the championship'));
      }
    },
    [addNotification, createChampionship, showList],
  );

  const submitChampionshipEdit = useCallback(
    async (data: ChampionshipFields) => {
      if (!editTarget) return;
      try {
        unwrap(await updateChampionship({ id: editTarget.id, ...data }), 'Failed to update the championship');
        closeChampionshipEdit();
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to update the championship'));
      }
    },
    [addNotification, editTarget, updateChampionship, closeChampionshipEdit],
  );

  const submitNewEvent = useCallback(
    async (data: EventFields) => {
      if (!selectedChampionship) return;
      let eventId: string;
      try {
        const result = await createEvent({ championshipId: selectedChampionship.id, ...data });
        // A success without the new event's id fails like an unsuccessful response.
        if (!result.success || !result.data) {
          addNotification('error', failureMessage(result.error, 'Failed to add the event'));
          return;
        }
        hideEventForm();
        setSelectedEventId(result.data);
        eventId = result.data;
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to add the event'));
        return;
      }
      // The event exists by now: a failed load of its entries is reported on its own.
      let loadFailure: string | null;
      try {
        const responses = await Promise.all([loadParticipants(eventId), loadFiringPointAssignments(eventId)]);
        const failed = responses.find((response) => !response.success);
        loadFailure = failed && !failed.success ? failed.error.message : null;
      } catch (error) {
        loadFailure = error instanceof Error ? error.message : String(error);
      }
      if (loadFailure !== null) {
        addNotification('error', `The event was added, but loading its entries failed: ${loadFailure}`);
      }
    },
    [
      addNotification,
      selectedChampionship,
      createEvent,
      hideEventForm,
      setSelectedEventId,
      loadParticipants,
      loadFiringPointAssignments,
    ],
  );

  const submitEventEdit = useCallback(
    async (data: EventFields) => {
      if (!editEventTarget) return;
      try {
        unwrap(await updateEvent({ id: editEventTarget.id, ...data }), 'Failed to update the event');
        closeEventForm();
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to update the event'));
      }
    },
    [addNotification, editEventTarget, updateEvent, closeEventForm],
  );

  const confirmAndDeleteEvent = useCallback(
    async (eventId: string) => {
      if (!(await useConfirmDialogStore.getState().openConfirm('Delete this event?'))) return;
      try {
        unwrap(await deleteEvent(eventId), 'Failed to delete the event');
        if (selectedEventId === eventId) setSelectedEventId(null);
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to delete the event'));
      }
    },
    [addNotification, deleteEvent, selectedEventId, setSelectedEventId],
  );

  /** Resolves the saved participants, or null when nothing was saved. */
  const saveEventParticipants = useCallback(
    async (rows: SaveParticipantsPayload['participants']) => {
      if (!selectedEventId) return null;

      const submittedParticipantIds = new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
      const participantIdsToDelete = participants
        .filter((participant) => !submittedParticipantIds.has(participant.id))
        .map((participant) => participant.id);
      if (participantIdsToDelete.length > 0) {
        const confirmed = await useConfirmDialogStore
          .getState()
          .openConfirm(
            `Delete ${participantIdsToDelete.length} participant(s)? Their firing-point assignments and confirmed results will also be deleted. This action cannot be undone.`,
          );
        if (!confirmed) return null;
      }

      try {
        const saved = unwrap(
          await saveParticipants({
            eventId: selectedEventId,
            participants: rows,
            ...(participantIdsToDelete.length > 0 ? { participantIdsToDelete } : {}),
          }),
          'Failed to save participants',
        );
        return saved.participants;
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to save participants'));
        return null;
      }
    },
    [addNotification, participants, selectedEventId, saveParticipants],
  );

  /** Resolves whether the assignments were saved. */
  const saveEventAssignments = useCallback(
    async (rows: AssignmentRow[]) => {
      if (!selectedEventId) return false;
      try {
        unwrap(
          await saveFiringPointAssignments({ eventId: selectedEventId, assignments: rows }),
          'Failed to save firing-point assignments',
        );
        return true;
      } catch (error) {
        addNotification('error', failureMessage(error, 'Failed to save firing-point assignments'));
        return false;
      }
    },
    [addNotification, selectedEventId, saveFiringPointAssignments],
  );

  const exportEvidence = useCallback(async () => {
    if (!selectedChampionship) return;
    setExportingEvidence(true);
    try {
      const receipt = unwrap(
        await operationalArchivesService.exportCompetitionEvidence({ championshipId: selectedChampionship.id }),
      );
      if (receipt.status === 'COMPLETED') {
        addNotification('success', `Evidence bundle exported: ${receipt.fileName}`);
      }
    } catch (error) {
      addNotification('error', failureMessage(error, 'Failed to export the evidence bundle'));
    } finally {
      setExportingEvidence(false);
    }
  }, [addNotification, selectedChampionship]);

  return {
    exportingEvidence,
    openChampionship,
    submitNewChampionship,
    submitChampionshipEdit,
    submitNewEvent,
    submitEventEdit,
    confirmAndDeleteEvent,
    saveEventParticipants,
    saveEventAssignments,
    exportEvidence,
  };
}
