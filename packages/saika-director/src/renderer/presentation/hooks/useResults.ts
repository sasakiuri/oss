import { useState, useCallback, useEffect, useRef } from 'react';
import type { RankedResultDto } from '@/shared/ipc/contracts/results.contract';
import { resultsService } from '@/renderer/services';

interface UseResultsState {
  results: RankedResultDto[];
  loading: boolean;
  error: string | null;
}

export function useResults() {
  const [state, setState] = useState<UseResultsState>({
    results: [],
    loading: false,
    error: null,
  });
  const latestResultsRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      latestResultsRequestIdRef.current += 1;
    },
    [],
  );

  const getEventResults = useCallback(async (eventId: string) => {
    const requestId = ++latestResultsRequestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await resultsService.getByEvent({ eventId });
      if (!response.success) throw new Error(response.error?.message ?? 'Failed to load results');
      if (requestId === latestResultsRequestIdRef.current) {
        setState({
          results: response.data.results,
          loading: false,
          error: null,
        });
      }
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load results';
      if (requestId === latestResultsRequestIdRef.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      }
      return null;
    }
  }, []);

  const getRelayResults = useCallback(async (eventId: string, relayNumber: number) => {
    const requestId = ++latestResultsRequestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await resultsService.getByRelay({ eventId, relayNumber });
      if (!response.success) throw new Error(response.error?.message ?? 'Failed to load relay results');
      if (requestId === latestResultsRequestIdRef.current) {
        setState({
          results: response.data.results,
          loading: false,
          error: null,
        });
      }
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load relay results';
      if (requestId === latestResultsRequestIdRef.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      }
      return null;
    }
  }, []);

  const confirmResults = useCallback(async (eventId: string, resultIds: string[]) => {
    const requestId = ++latestResultsRequestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await resultsService.confirm({
        eventId,
        resultIds,
      });
      if (!response.success) throw new Error(response.error?.message ?? 'Failed to confirm results');
      if (requestId !== latestResultsRequestIdRef.current) return null;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: null,
      }));
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to confirm results';
      if (requestId === latestResultsRequestIdRef.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      }
      return null;
    }
  }, []);

  const clearResults = useCallback(() => {
    latestResultsRequestIdRef.current += 1;
    setState({
      results: [],
      loading: false,
      error: null,
    });
  }, []);

  return {
    results: state.results,
    loading: state.loading,
    error: state.error,
    getEventResults,
    getRelayResults,
    confirmResults,
    clearResults,
  };
}
