import { useCallback, useEffect, useRef } from 'react';
import { useChampionshipStore } from '../stores/domain/championship.store';
import { championshipService } from '@/renderer/services';
import type {
  CreateChampionshipPayload,
  UpdateChampionshipPayload,
  CreateEventPayload,
  UpdateEventPayload,
  SaveParticipantsPayload,
  SaveFiringPointAssignmentsPayload,
} from '@/shared/ipc/contracts/championship.contract';

export function useChampionshipActions() {
  const setSelectedChampionshipInStore = useChampionshipStore((state) => state.setSelectedChampionship);
  const setSelectedEventId = useChampionshipStore((state) => state.setSelectedEventId);
  const setParticipants = useChampionshipStore((state) => state.setParticipants);
  const setFiringPointAssignments = useChampionshipStore((state) => state.setFiringPointAssignments);
  const resetStore = useChampionshipStore((state) => state.reset);
  const championshipDetailRequestIdRef = useRef(0);
  const participantRequestIdRef = useRef(0);
  const firingPointAssignmentRequestIdRef = useRef(0);

  const setSelectedChampionship = useCallback(
    (championship: Parameters<typeof setSelectedChampionshipInStore>[0]) => {
      championshipDetailRequestIdRef.current += 1;
      setSelectedChampionshipInStore(championship);
    },
    [setSelectedChampionshipInStore],
  );

  useEffect(
    () => () => {
      championshipDetailRequestIdRef.current += 1;
      participantRequestIdRef.current += 1;
      firingPointAssignmentRequestIdRef.current += 1;
    },
    [],
  );

  const loadChampionships = useCallback(async () => {
    const response = await championshipService.getChampionships();
    if (response.success) {
      useChampionshipStore.getState().setChampionships(response.data.championships);
    }
    return response;
  }, []);

  const loadChampionshipDetail = useCallback(async (id: string) => {
    const requestId = ++championshipDetailRequestIdRef.current;
    const response = await championshipService.getChampionshipDetail({ id });
    if (response.success && requestId === championshipDetailRequestIdRef.current) {
      useChampionshipStore.getState().setSelectedChampionship(response.data);
    }
    return response;
  }, []);

  const loadParticipants = useCallback(async (eventId: string) => {
    const requestId = ++participantRequestIdRef.current;
    const response = await championshipService.getParticipants({ eventId });
    if (
      response.success &&
      requestId === participantRequestIdRef.current &&
      useChampionshipStore.getState().selectedEventId === eventId
    ) {
      useChampionshipStore.getState().setParticipants(response.data.participants);
    }
    return response;
  }, []);

  const loadFiringPointAssignments = useCallback(async (eventId: string) => {
    const requestId = ++firingPointAssignmentRequestIdRef.current;
    const response = await championshipService.getFiringPointAssignments({ eventId });
    if (
      response.success &&
      requestId === firingPointAssignmentRequestIdRef.current &&
      useChampionshipStore.getState().selectedEventId === eventId
    ) {
      useChampionshipStore.getState().setFiringPointAssignments(response.data.assignments);
    }
    return response;
  }, []);

  const createChampionship = useCallback(
    async (payload: CreateChampionshipPayload) => {
      const result = await championshipService.createChampionship(payload);
      if (result.success) {
        await loadChampionships();
      }
      return result;
    },
    [loadChampionships],
  );

  const updateChampionship = useCallback(
    async (payload: UpdateChampionshipPayload) => {
      const result = await championshipService.updateChampionship(payload);
      if (result.success) {
        await loadChampionships();
        if (useChampionshipStore.getState().selectedChampionship?.id === payload.id) {
          await loadChampionshipDetail(payload.id);
        }
      }
      return result;
    },
    [loadChampionships, loadChampionshipDetail],
  );

  const deleteChampionship = useCallback(
    async (id: string) => {
      const result = await championshipService.deleteChampionship({ id });
      if (result.success) {
        await loadChampionships();
        if (useChampionshipStore.getState().selectedChampionship?.id === id) {
          setSelectedChampionship(null);
        }
      }
      return result;
    },
    [loadChampionships, setSelectedChampionship],
  );

  const createEvent = useCallback(
    async (payload: CreateEventPayload) => {
      const result = await championshipService.createEvent(payload);
      if (result.success) {
        await loadChampionshipDetail(payload.championshipId);
      }
      return result;
    },
    [loadChampionshipDetail],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const result = await championshipService.deleteEvent({ id });
      if (result.success) {
        const currentChampionship = useChampionshipStore.getState().selectedChampionship;
        if (currentChampionship) {
          await loadChampionshipDetail(currentChampionship.id);
        }
      }
      return result;
    },
    [loadChampionshipDetail],
  );

  const updateEvent = useCallback(
    async (payload: UpdateEventPayload) => {
      const result = await championshipService.updateEvent(payload);
      if (result.success) {
        const currentId = useChampionshipStore.getState().selectedChampionship?.id;
        if (currentId) {
          await loadChampionshipDetail(currentId);
        }
      }
      return result;
    },
    [loadChampionshipDetail],
  );

  const saveParticipants = useCallback(async (payload: SaveParticipantsPayload) => {
    const requestId = ++participantRequestIdRef.current;
    const result = await championshipService.saveParticipants(payload);
    if (
      result.success &&
      requestId === participantRequestIdRef.current &&
      useChampionshipStore.getState().selectedEventId === payload.eventId
    ) {
      useChampionshipStore.getState().setParticipants(result.data.participants);
    }
    return result;
  }, []);

  const saveFiringPointAssignments = useCallback(async (payload: SaveFiringPointAssignmentsPayload) => {
    const requestId = ++firingPointAssignmentRequestIdRef.current;
    const result = await championshipService.saveFiringPointAssignments(payload);
    if (
      result.success &&
      requestId === firingPointAssignmentRequestIdRef.current &&
      useChampionshipStore.getState().selectedEventId === payload.eventId
    ) {
      useChampionshipStore.getState().setFiringPointAssignments(result.data.assignments);
    }
    return result;
  }, []);

  return {
    // Store actions
    setSelectedChampionship,
    setSelectedEventId,
    setParticipants,
    setFiringPointAssignments,
    reset: resetStore,
    // IPC actions
    loadChampionships,
    loadChampionshipDetail,
    loadParticipants,
    loadFiringPointAssignments,
    createChampionship,
    updateChampionship,
    deleteChampionship,
    createEvent,
    updateEvent,
    deleteEvent,
    saveParticipants,
    saveFiringPointAssignments,
  };
}
