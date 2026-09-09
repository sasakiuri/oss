// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import { findAdvanceSeriesSource } from './progressPlanning';
import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionDefinition,
  getLaneCompetitionTiming,
  type SupportedLaneCompetitionType,
} from './supportedCompetitionTypes';

export function useCompetitionSelection(snapshot: MqttControlSnapshotDto) {
  const [selectedLaneIds, setSelectedLaneIds] = useState<Set<string>>(new Set());
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [competitionTypeId, setCompetitionTypeId] = useState<SupportedLaneCompetitionType>('BR60S');
  const [assignmentLaneId, setAssignmentLaneId] = useState('');
  useEffect(() => {
    setSelectedLaneIds((current) => {
      const available = new Set(snapshot.lanes.map((lane) => lane.laneId));
      return new Set([...current].filter((laneId) => available.has(laneId)));
    });
  }, [snapshot.lanes]);

  useEffect(() => {
    setSelectedCompetitionId((current) => {
      if (current && snapshot.competitions.some((competition) => competition.competitionId === current)) {
        return current;
      }
      if (
        snapshot.activeCompetitionId &&
        snapshot.competitions.some((competition) => competition.competitionId === snapshot.activeCompetitionId)
      ) {
        return snapshot.activeCompetitionId;
      }
      return snapshot.competitions[0]?.competitionId ?? null;
    });
  }, [snapshot.activeCompetitionId, snapshot.competitions]);

  const activeCompetition = useMemo(
    () => snapshot.competitions.find((competition) => competition.competitionId === selectedCompetitionId) ?? null,
    [selectedCompetitionId, snapshot.competitions],
  );
  const selectedCompetitionTiming = getLaneCompetitionTiming(competitionTypeId);
  const activeCompetitionType = asSupportedLaneCompetitionType(activeCompetition?.competitionTypeId);
  const activeCompetitionTiming = activeCompetitionType ? getLaneCompetitionTiming(activeCompetitionType) : null;
  const activeCompetitionDefinition = activeCompetitionType
    ? getLaneCompetitionDefinition(activeCompetitionType)
    : null;
  const displayedCompetitionTiming = activeCompetitionTiming ?? selectedCompetitionTiming;
  const competitionByLaneId = useMemo(() => {
    const byLaneId = new Map<string, (typeof snapshot.competitions)[number]>();
    const mostRecentFirst = [...snapshot.competitions].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.competitionId.localeCompare(b.competitionId),
    );
    for (const competition of mostRecentFirst) {
      for (const laneId of competition.laneIds) {
        if (!byLaneId.has(laneId)) byLaneId.set(laneId, competition);
      }
    }
    return byLaneId;
  }, [snapshot.competitions]);
  const pendingJoinLaneIds = activeCompetition?.pendingJoinLaneIds ?? [];
  const pendingSightingLaneIds = activeCompetition?.pendingSightingLaneIds ?? [];
  const canPublishResults = activeCompetition?.phase === 'MATCH' || activeCompetition?.phase === 'MATCH_COMPLETE';
  const assignmentEditingAllowed =
    activeCompetition?.phase === 'NOT_STARTED' ||
    (activeCompetition?.phase === 'MATCH_COMPLETE' && !activeCompetition.cleanupPreparedAt);
  const competitionLanes = useMemo(
    () => snapshot.lanes.filter((lane) => activeCompetition?.laneIds.includes(lane.laneId)),
    [activeCompetition, snapshot.lanes],
  );
  const selectedJoinedLaneIds = useMemo(
    () => [...selectedLaneIds].filter((laneId) => activeCompetition?.laneIds.includes(laneId)),
    [activeCompetition, selectedLaneIds],
  );
  const selectedAvailableLaneIds = useMemo(
    () => [...selectedLaneIds].filter((laneId) => !competitionByLaneId.has(laneId)),
    [competitionByLaneId, selectedLaneIds],
  );
  const selectedJoinLaneIds = useMemo(() => {
    const pendingLaneIds = new Set(pendingJoinLaneIds);
    return [...selectedLaneIds].filter((laneId) => !competitionByLaneId.has(laneId) || pendingLaneIds.has(laneId));
  }, [competitionByLaneId, pendingJoinLaneIds, selectedLaneIds]);
  const selectedLeaveLaneIds = useMemo(() => {
    if (activeCompetition?.phase === 'NOT_STARTED') return selectedJoinedLaneIds;
    if (activeCompetition?.phase !== 'SIGHTING') return [];
    const pendingLaneIds = new Set(activeCompetition.pendingSightingLaneIds ?? []);
    return selectedJoinedLaneIds.filter((laneId) => pendingLaneIds.has(laneId));
  }, [activeCompetition, selectedJoinedLaneIds]);
  const advanceSeriesSource = useMemo(
    () => (activeCompetition ? findAdvanceSeriesSource(snapshot.lanes, activeCompetition.competitionId) : null),
    [activeCompetition, snapshot.lanes],
  );
  const allLanesSelected =
    snapshot.lanes.length > 0 && snapshot.lanes.every((lane) => selectedLaneIds.has(lane.laneId));

  useEffect(() => {
    if (!competitionLanes.some((lane) => lane.laneId === assignmentLaneId)) {
      setAssignmentLaneId(competitionLanes[0]?.laneId ?? '');
    }
  }, [assignmentLaneId, competitionLanes]);

  const toggleLane = useCallback((laneId: string) => {
    setSelectedLaneIds((current) => {
      const next = new Set(current);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  }, []);

  const toggleAllLanes = useCallback(() => {
    setSelectedLaneIds((current) => {
      const everyLaneSelected = snapshot.lanes.length > 0 && snapshot.lanes.every((lane) => current.has(lane.laneId));
      return everyLaneSelected ? new Set() : new Set(snapshot.lanes.map((lane) => lane.laneId));
    });
  }, [snapshot.lanes]);

  return {
    selectedLaneIds,
    setSelectedLaneIds,
    selectedCompetitionId,
    setSelectedCompetitionId,
    competitionTypeId,
    setCompetitionTypeId,
    assignmentLaneId,
    setAssignmentLaneId,
    activeCompetition,
    activeCompetitionTiming,
    activeCompetitionDefinition,
    displayedCompetitionTiming,
    competitionByLaneId,
    pendingJoinLaneIds,
    pendingSightingLaneIds,
    canPublishResults,
    assignmentEditingAllowed,
    competitionLanes,
    selectedJoinedLaneIds,
    selectedAvailableLaneIds,
    selectedJoinLaneIds,
    selectedLeaveLaneIds,
    advanceSeriesSource,
    allLanesSelected,
    toggleLane,
    toggleAllLanes,
  };
}

export type CompetitionSelection = ReturnType<typeof useCompetitionSelection>;
