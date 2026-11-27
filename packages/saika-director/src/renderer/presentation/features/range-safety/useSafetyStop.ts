import { useCallback, useEffect, useMemo, useState } from 'react';

import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { mqttService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { DirectorLaneSnapshotDto, SafetyStopAuditEntryDto } from '@/shared/ipc/contracts';

import {
  DEFAULT_CLEARANCE_DRAFT,
  laneClearance,
  laneClearanceReady,
  stoppedLaneGroups,
  type LaneClearanceDraft,
} from './safetyStopRules';

/**
 * Owns the safety STOP and clearance commands of the target Lanes, the per-Lane clearance drafts and the command
 * audit. Results and failures are reported as notifications.
 */
export function useSafetyStop(targetLanes: readonly DirectorLaneSnapshotDto[]) {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [clearanceDrafts, setClearanceDrafts] = useState<Record<string, LaneClearanceDraft>>({});
  const [busy, setBusy] = useState<'stop' | 'clear' | null>(null);
  const [audit, setAudit] = useState<SafetyStopAuditEntryDto[]>([]);
  const stoppedGroups = useMemo(() => stoppedLaneGroups(targetLanes), [targetLanes]);

  const refreshAudit = useCallback(async () => {
    try {
      setAudit(unwrap(await mqttService.getSafetyStopAudit({})));
    } catch {
      // Audit availability must not disable the emergency control surface.
    }
  }, []);

  useEffect(() => {
    void refreshAudit();
  }, [refreshAudit]);

  const activate = useCallback(
    async (reason: string, officialName: string) => {
      const normalizedReason = reason.trim();
      const normalizedOfficial = officialName.trim();
      if (!normalizedReason || !normalizedOfficial) {
        addNotification('error', 'Safety STOP requires a reason and responsible official');
        return;
      }

      const existingId = stoppedGroups[0]?.[0];
      const safetyStopId = existingId ?? crypto.randomUUID();
      const laneIds = targetLanes.filter((lane) => lane.safetyState?.status !== 'STOPPED').map((lane) => lane.laneId);
      if (laneIds.length === 0) return;

      setBusy('stop');
      try {
        const result = unwrap(
          await mqttService.activateSafetyStop({
            safetyStopId,
            laneIds,
            reason: normalizedReason,
            officialName: normalizedOfficial,
          }),
        );
        const completed = result.commands.filter((command) => command.success).length;
        addNotification(
          result.success ? 'success' : 'error',
          `Safety STOP acknowledged by ${completed}/${laneIds.length} Lane(s)`,
        );
        await refreshAudit();
      } catch (caught) {
        addNotification('error', errorMessage(caught, 'Failed to issue the safety STOP'));
      } finally {
        setBusy(null);
      }
    },
    [addNotification, refreshAudit, stoppedGroups, targetLanes],
  );

  const updateClearanceDraft = useCallback((laneId: string, patch: Partial<LaneClearanceDraft>) => {
    setClearanceDrafts((current) => ({
      ...current,
      [laneId]: { ...DEFAULT_CLEARANCE_DRAFT, ...current[laneId], ...patch },
    }));
  }, []);

  const clear = useCallback(
    async (
      safetyStopId: string,
      group: readonly DirectorLaneSnapshotDto[],
      clearanceReason: string,
      officialName: string,
    ) => {
      const normalizedReason = clearanceReason.trim();
      const normalizedOfficial = officialName.trim();
      const verified = group.flatMap((lane) => {
        const draft = clearanceDrafts[lane.laneId];
        return draft && laneClearanceReady(lane, draft) ? [{ lane, draft }] : [];
      });
      if (verified.length === 0 || !normalizedReason || !normalizedOfficial) return;

      setBusy('clear');
      try {
        const response = await mqttService.clearSafetyStop({
          safetyStopId,
          clearanceReason: normalizedReason,
          officialName: normalizedOfficial,
          laneClearances: verified.map(({ lane, draft }) => laneClearance(lane, draft, normalizedOfficial)),
        });
        const result = unwrap(response);
        const completed = result.commands.filter((command) => command.success).length;
        addNotification(
          result.success ? 'success' : 'error',
          `Safety latch cleared on ${completed}/${verified.length} verified Lane(s); competition timers remain stopped`,
        );
        if (result.success) {
          setClearanceDrafts((current) => {
            const next = { ...current };
            for (const { lane } of verified) delete next[lane.laneId];
            return next;
          });
        }
        await refreshAudit();
      } catch (caught) {
        addNotification('error', errorMessage(caught, 'Failed to clear the safety latch'));
      } finally {
        setBusy(null);
      }
    },
    [addNotification, clearanceDrafts, refreshAudit],
  );

  return { audit, busy, stoppedGroups, clearanceDrafts, updateClearanceDraft, activate, clear };
}
