import { useState, useCallback, useEffect, useRef } from 'react';
import type { MixedTeamFinalResultDto } from '@/shared/ipc/contracts';
import type { FinalRankedResultDto, RankedResultDto } from '@/shared/ipc/contracts';
import { resultsService, teamResultsService } from '@/renderer/services';
import { errorMessage, unwrap, type DataResponse } from '@/renderer/services/serviceError';

interface UseResultsState {
  results: RankedResultDto[];
  loading: boolean;
  error: string | null;
  confirmError: string | null;
}

/**
 * Qualification results of an event or relay and their confirmation. A query resolves the loaded data and the
 * confirmation its response, or null when they failed. Queries and the confirmation share one request counter and
 * loading flag: the latest request wins, and an older one changes nothing and resolves null.
 * A failed query replaces the results with `error`; a failed confirmation keeps them and sets `confirmError`,
 * which the next request clears.
 */
export function useResults() {
  const [state, setState] = useState<UseResultsState>({
    results: [],
    loading: false,
    error: null,
    confirmError: null,
  });
  const latestResultsRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      latestResultsRequestIdRef.current += 1;
    },
    [],
  );

  const loadResults = useCallback(
    async <T extends { results: RankedResultDto[] }>(
      request: () => Promise<DataResponse<T>>,
      failure: string,
    ): Promise<T | null> => {
      const requestId = ++latestResultsRequestIdRef.current;
      setState((prev) => ({ ...prev, loading: true, error: null, confirmError: null }));

      try {
        const data = unwrap(await request(), failure);
        if (requestId === latestResultsRequestIdRef.current) {
          setState({
            results: data.results,
            loading: false,
            error: null,
            confirmError: null,
          });
        }
        return data;
      } catch (err) {
        if (requestId === latestResultsRequestIdRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: errorMessage(err, failure),
          }));
        }
        return null;
      }
    },
    [],
  );

  const getEventResults = useCallback(
    (eventId: string) => loadResults(() => resultsService.getByEvent({ eventId }), 'Failed to load results'),
    [loadResults],
  );

  const getRelayResults = useCallback(
    (eventId: string, relayNumber: number) =>
      loadResults(() => resultsService.getByRelay({ eventId, relayNumber }), 'Failed to load relay results'),
    [loadResults],
  );

  const confirmResults = useCallback(async (eventId: string, resultIds: string[]) => {
    const requestId = ++latestResultsRequestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null, confirmError: null }));

    try {
      const response = await resultsService.confirm({
        eventId,
        resultIds,
      });
      unwrap(response, 'Failed to confirm results');
      if (requestId !== latestResultsRequestIdRef.current) return null;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: null,
      }));
      return response;
    } catch (err) {
      if (requestId === latestResultsRequestIdRef.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          confirmError: errorMessage(err, 'Failed to confirm results'),
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
      confirmError: null,
    });
  }, []);

  return {
    results: state.results,
    loading: state.loading,
    error: state.error,
    confirmError: state.confirmError,
    getEventResults,
    getRelayResults,
    confirmResults,
    clearResults,
  };
}

/**
 * Final and Mixed Team Final results of an event, loaded together. A newer load, or `cancel`, discards the response
 * of an older one. Either query failing fails the load; the Final failure is shown first.
 */
export function useFinalResults(eventId: string) {
  const [results, setResults] = useState<FinalRankedResultDto[]>([]);
  const [mixedTeamResults, setMixedTeamResults] = useState<MixedTeamFinalResultDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  /** Loads the results again and keeps the shown ones until they arrive. */
  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [response, mixedResponse] = await Promise.all([
        resultsService.getFinalByEvent({ eventId }),
        teamResultsService.getMixedFinal({ eventId }),
      ]);
      if (requestId !== requestIdRef.current) return;
      const finalData = unwrap(response, 'Failed to load results');
      const mixedFinalResults = unwrap(mixedResponse, 'Failed to load Mixed Team results');
      setResults(finalData.results);
      setMixedTeamResults(mixedFinalResults);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(errorMessage(err, 'Failed to load results'));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [eventId]);

  /** Clears the shown results and loads them. */
  const load = useCallback(() => {
    setResults([]);
    setMixedTeamResults([]);
    return refresh();
  }, [refresh]);

  /** Discards the response of the running load. */
  const cancel = useCallback(() => {
    requestIdRef.current += 1;
  }, []);

  return { results, mixedTeamResults, loading, error, load, refresh, cancel };
}
