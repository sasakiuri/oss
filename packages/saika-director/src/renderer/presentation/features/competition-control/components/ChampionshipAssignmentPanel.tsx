// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useChampionshipActions } from '@/renderer/presentation/hooks/useChampionshipActions';
import { useChampionshipStore } from '@/renderer/presentation/stores/domain/championship.store';
import type { ChampionshipResultContext } from '@/renderer/presentation/stores/domain/competitionControl.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';
import { Card } from '../../shared/common/Card';
import { buildFiringPointAssignmentPlan, type FiringPointAssignmentPlan } from '../assignmentPlanning';

type SupportedCompetitionType = 'BR60S' | 'BP60';

interface ChampionshipAssignmentPanelProps {
  activeCompetitionTypeId: string | null;
  lanes: DirectorLaneSnapshotDto[];
  disabled: boolean;
  onCompetitionTypeChange: (competitionTypeId: SupportedCompetitionType) => void;
  onApply: (plan: FiringPointAssignmentPlan, resultContext: ChampionshipResultContext) => Promise<void>;
}

export type { ChampionshipResultContext } from '@/renderer/presentation/stores/domain/competitionControl.store';

function asSupportedCompetitionType(eventType: string | undefined): SupportedCompetitionType | null {
  return eventType === 'BR60S' || eventType === 'BP60' ? eventType : null;
}

function formatFiringPoints(firingPointNumbers: number[]): string {
  return firingPointNumbers.map((number) => `firing point ${number}`).join(', ');
}

export function ChampionshipAssignmentPanel({
  activeCompetitionTypeId,
  lanes,
  disabled,
  onCompetitionTypeChange,
  onApply,
}: ChampionshipAssignmentPanelProps) {
  const championships = useChampionshipStore((state) => state.championships);
  const selectedChampionship = useChampionshipStore((state) => state.selectedChampionship);
  const selectedEventId = useChampionshipStore((state) => state.selectedEventId);
  const participants = useChampionshipStore((state) => state.participants);
  const firingPointAssignments = useChampionshipStore((state) => state.firingPointAssignments);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const {
    loadChampionships,
    loadChampionshipDetail,
    loadParticipants,
    loadFiringPointAssignments,
    setSelectedChampionship,
    setSelectedEventId,
    setParticipants,
    setFiringPointAssignments,
  } = useChampionshipActions();

  const [selectedChampionshipId, setSelectedChampionshipId] = useState(
    () => useChampionshipStore.getState().selectedChampionship?.id ?? '',
  );
  const [selectedRelay, setSelectedRelay] = useState<number | null>(null);
  const [loadingSelection, setLoadingSelection] = useState(false);

  useEffect(() => {
    void loadChampionships();
  }, [loadChampionships]);

  const selectedEvent = useMemo(
    () => selectedChampionship?.events.find((event) => event.id === selectedEventId) ?? null,
    [selectedChampionship, selectedEventId],
  );
  const selectedCompetitionType = asSupportedCompetitionType(selectedEvent?.eventType);
  const relayNumbers = useMemo(
    () => [...new Set(firingPointAssignments.map((assignment) => assignment.relayNumber))].sort((a, b) => a - b),
    [firingPointAssignments],
  );

  useEffect(() => {
    setSelectedRelay((current) =>
      current !== null && relayNumbers.includes(current) ? current : (relayNumbers[0] ?? null),
    );
  }, [relayNumbers]);

  useEffect(() => {
    if (activeCompetitionTypeId === null && selectedCompetitionType !== null) {
      onCompetitionTypeChange(selectedCompetitionType);
    }
  }, [activeCompetitionTypeId, onCompetitionTypeChange, selectedCompetitionType]);

  const assignmentPlan = useMemo(
    () =>
      selectedRelay === null
        ? null
        : buildFiringPointAssignmentPlan({
            relayNumber: selectedRelay,
            assignments: firingPointAssignments,
            participants,
            lanes,
          }),
    [firingPointAssignments, lanes, participants, selectedRelay],
  );

  const handleChampionshipChange = useCallback(
    async (championshipId: string) => {
      setSelectedChampionshipId(championshipId);
      setSelectedRelay(null);
      setSelectedChampionship(null);
      if (!championshipId) return;

      setLoadingSelection(true);
      try {
        const response = await loadChampionshipDetail(championshipId);
        if (!response.success) addNotification('error', response.error.message);
        else if (response.data === null) addNotification('error', 'The selected championship was not found');
      } finally {
        setLoadingSelection(false);
      }
    },
    [addNotification, loadChampionshipDetail, setSelectedChampionship],
  );

  const handleEventChange = useCallback(
    async (eventId: string) => {
      setSelectedEventId(eventId || null);
      setSelectedRelay(null);
      setParticipants([]);
      setFiringPointAssignments([]);
      if (!eventId) return;

      setLoadingSelection(true);
      try {
        const [participantResponse, assignmentResponse] = await Promise.all([
          loadParticipants(eventId),
          loadFiringPointAssignments(eventId),
        ]);
        if (!participantResponse.success) addNotification('error', participantResponse.error.message);
        if (!assignmentResponse.success) addNotification('error', assignmentResponse.error.message);
      } finally {
        setLoadingSelection(false);
      }
    },
    [
      addNotification,
      loadFiringPointAssignments,
      loadParticipants,
      setFiringPointAssignments,
      setParticipants,
      setSelectedEventId,
    ],
  );

  const competitionTypeMismatch =
    activeCompetitionTypeId !== null &&
    selectedCompetitionType !== null &&
    activeCompetitionTypeId !== selectedCompetitionType;
  const applyDisabled =
    disabled ||
    loadingSelection ||
    activeCompetitionTypeId === null ||
    selectedCompetitionType === null ||
    competitionTypeMismatch ||
    assignmentPlan === null ||
    assignmentPlan.assignments.length === 0;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-vscode-text">Championship assignment</h3>
          <p className="mt-0.5 text-xs text-vscode-text-muted">Load athletes from a saved relay.</p>
        </div>
        <Button
          size="sm"
          disabled={applyDisabled}
          onClick={() => {
            if (assignmentPlan && selectedEventId && selectedRelay !== null) {
              void onApply(assignmentPlan, { eventId: selectedEventId, relayNumber: selectedRelay });
            }
          }}
        >
          Apply assignments
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
          Championship
          <select
            value={selectedChampionshipId}
            disabled={loadingSelection}
            onChange={(event) => void handleChampionshipChange(event.target.value)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text disabled:opacity-50"
          >
            <option value="">Select a championship</option>
            {championships.map((championship) => (
              <option key={championship.id} value={championship.id}>
                {championship.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
          Event
          <select
            value={selectedEventId ?? ''}
            disabled={loadingSelection || selectedChampionship === null}
            onChange={(event) => void handleEventChange(event.target.value)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text disabled:opacity-50"
          >
            <option value="">Select an event</option>
            {selectedChampionship?.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name} ({event.eventType})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
          Relay
          <select
            value={selectedRelay ?? ''}
            disabled={loadingSelection || relayNumbers.length === 0}
            onChange={(event) => setSelectedRelay(event.target.value ? Number(event.target.value) : null)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text disabled:opacity-50"
          >
            <option value="">Select a relay</option>
            {relayNumbers.map((relayNumber) => (
              <option key={relayNumber} value={relayNumber}>
                Relay {relayNumber}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 space-y-1 border-t border-vscode-border pt-2.5 text-xs" aria-live="polite">
        {activeCompetitionTypeId === null ? (
          <p className="text-vscode-text-muted">Create or select a competition before applying an assignment.</p>
        ) : championships.length === 0 ? (
          <p className="text-vscode-text-muted">No saved championship assignments.</p>
        ) : null}
        {selectedEvent && selectedCompetitionType === null && (
          <p className="text-vscode-warning">This event type is not supported by the current Lane control.</p>
        )}
        {competitionTypeMismatch && (
          <p className="text-vscode-warning">
            The selected event ({selectedCompetitionType}) does not match the active competition (
            {activeCompetitionTypeId}).
          </p>
        )}
        {assignmentPlan && (
          <>
            <p className="text-vscode-text">
              Relay {assignmentPlan.relayNumber}: {assignmentPlan.assignments.length}/{assignmentPlan.totalAssignments}{' '}
              assignments can be applied.
            </p>
            <p className="text-vscode-dimmed">Start numbers use the one-based participant-list order.</p>
            {assignmentPlan.missingLaneFiringPointNumbers.length > 0 && (
              <p className="text-vscode-warning">
                Missing Lanes: {formatFiringPoints(assignmentPlan.missingLaneFiringPointNumbers)}
              </p>
            )}
            {assignmentPlan.ambiguousLaneFiringPointNumbers.length > 0 && (
              <p className="text-vscode-warning">
                Duplicate Lanes: {formatFiringPoints(assignmentPlan.ambiguousLaneFiringPointNumbers)}
              </p>
            )}
            {assignmentPlan.duplicateAssignmentFiringPointNumbers.length > 0 && (
              <p className="text-vscode-warning">
                Duplicate assignments: {formatFiringPoints(assignmentPlan.duplicateAssignmentFiringPointNumbers)}
              </p>
            )}
            {assignmentPlan.missingParticipantIds.length > 0 && (
              <p className="text-vscode-warning">Some assignments reference missing participants.</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
