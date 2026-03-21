// SPDX-License-Identifier: MIT
/**
 * Shot history management custom hook
 *
 * @description
 * Custom hook providing shot history retrieval and score calculation.
 * - Retrieve shot history
 * - Get the latest shot
 * - Subscribe to shotRecorded events
 * - Automatic score calculation (totalScore, seriesScores)
 *
 * @example
 * ```tsx
 * function ShotHistory() {
 *   const {
 *     shots,
 *     latestShot,
 *     refreshShotHistory,
 *     isLoading
 *   } = useShot();
 *
 *   if (isLoading) {
 *     return <p>Loading...</p>;
 *   }
 *
 *   return (
 *     <div>
 *       <h2>Shot History</h2>
 *       <button onClick={refreshShotHistory}>Refresh</button>
 *       {latestShot && (
 *         <div>
 *           <p>Latest shot: {latestShot.score} pts</p>
 *         </div>
 *       )}
 *       <ul>
 *         {shots.map((shot) => (
 *           <li key={shot.id}>
 *             Shot #{shot.shotNumber}: {shot.score} pts
 *           </li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { calculateSeriesScores } from '@/renderer/presentation/utils/scoreUtils';
import { sessionService } from '@/renderer/services/sessionService';
import type { ShotDto } from '@/shared/ipc/contracts';

/**
 * Return type of the useShot hook
 */
export interface UseShotResult {
  /** Shot history */
  shots: ShotDto[];
  /** Latest shot (null when there are no shots) */
  latestShot: ShotDto | null;
  /** Action to re-fetch shot history */
  refreshShotHistory: () => Promise<void>;
  /** Loading in-progress flag */
  isLoading: boolean;
}

/**
 * Shot history management custom hook
 *
 * @returns Shot history and related actions
 */
export function useShot(): UseShotResult {
  // Retrieve state from the store
  const { currentSessionId, shots, setShots, updateScores } = useSessionStore();

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Get the latest shot
   */
  const latestShot = useMemo((): ShotDto | null => {
    if (shots.length === 0) {
      return null;
    }
    return shots[shots.length - 1] ?? null;
  }, [shots]);

  /**
   * Calculate scores and update the store
   */
  const calculateScores = useCallback(
    (shotList: ShotDto[]) => {
      // Only target match-mode shots
      const recordedShots = shotList.filter((shot) => shot.isRecorded);

      // Total score
      const totalScore = recordedShots.reduce((sum, shot) => sum + shot.score, 0);

      // Score per series (every 10 shots) -- using shared utility
      const seriesScores = calculateSeriesScores(recordedShots);

      // Update the store
      updateScores(totalScore, seriesScores);
    },
    [updateScores],
  );

  /**
   * Re-fetch shot history
   */
  const refreshShotHistory = useCallback(async () => {
    if (!currentSessionId) {
      return;
    }

    setIsLoading(true);

    try {
      const { shots: fetchedShots } = await sessionService.getShotHistory({
        sessionId: currentSessionId,
      });

      // Update the entire shots array
      setShots(fetchedShots);
      // Recalculate scores
      calculateScores(fetchedShots);
    } catch {
      // Shot history refresh failure — non-critical, will retry on next event
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId, setShots, calculateScores]);

  /**
   * Recalculate scores when shots are updated
   */
  useEffect(() => {
    if (shots.length > 0) {
      calculateScores(shots);
    }
  }, [shots, calculateScores]);

  /**
   * Initial fetch of shot history when the session changes
   */
  useEffect(() => {
    if (currentSessionId) {
      void refreshShotHistory();
    }
  }, [currentSessionId, refreshShotHistory]);

  return {
    shots,
    latestShot,
    refreshShotHistory,
    isLoading,
  };
}
