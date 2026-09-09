// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import { useEvent } from '@/renderer/presentation/hooks/useEvent';
import { mqttService } from '@/renderer/services';
import type { FiringWindowViolationDto, ShotObservationEvidenceDto } from '@/shared/ipc/contracts';

export function useCompetitionEvidence(selectedCompetitionId: string | null) {
  const [firingWindowViolations, setFiringWindowViolations] = useState<FiringWindowViolationDto[]>([]);
  const [shotObservationEvidence, setShotObservationEvidence] = useState<ShotObservationEvidenceDto[]>([]);
  const violationRequestIdRef = useRef(0);
  const liveViolationVersionRef = useRef(0);
  const observationRequestIdRef = useRef(0);
  const liveObservationVersionRef = useRef(0);
  useEvent('firingWindowViolationDetected', (violation) => {
    if (violation.competitionId !== selectedCompetitionId) return;
    liveViolationVersionRef.current += 1;
    setFiringWindowViolations((current) =>
      current.some((entry) => entry.id === violation.id) ? current : [...current, violation],
    );
  });

  useEvent('shotObservationEvidenceObserved', (evidence) => {
    if (evidence.competition?.competitionId !== selectedCompetitionId) return;
    liveObservationVersionRef.current += 1;
    setShotObservationEvidence((current) =>
      current.some((entry) => entry.evidenceId === evidence.evidenceId) ? current : [...current, evidence],
    );
  });

  useEffect(() => {
    const requestId = ++violationRequestIdRef.current;
    const liveVersion = liveViolationVersionRef.current;
    if (!selectedCompetitionId) {
      setFiringWindowViolations([]);
      return;
    }
    setFiringWindowViolations((current) => (current.length === 0 ? current : []));

    void mqttService.getFiringWindowViolations({ competitionId: selectedCompetitionId }).then(
      (response) => {
        if (
          response.success &&
          requestId === violationRequestIdRef.current &&
          liveVersion === liveViolationVersionRef.current
        ) {
          if (response.data.length === 0) return;
          setFiringWindowViolations((current) => {
            const unchanged =
              current.length === response.data.length &&
              current.every((entry, index) => entry.id === response.data[index]?.id);
            return unchanged ? current : response.data;
          });
        }
      },
      () => undefined,
    );
  }, [selectedCompetitionId]);

  useEffect(() => {
    const requestId = ++observationRequestIdRef.current;
    const liveVersion = liveObservationVersionRef.current;
    if (!selectedCompetitionId) {
      setShotObservationEvidence([]);
      return;
    }
    setShotObservationEvidence([]);
    void mqttService.getShotObservationEvidence({ competitionId: selectedCompetitionId }).then(
      (response) => {
        if (
          response.success &&
          requestId === observationRequestIdRef.current &&
          liveVersion === liveObservationVersionRef.current
        ) {
          setShotObservationEvidence(response.data);
        }
      },
      () => undefined,
    );
  }, [selectedCompetitionId]);

  useEffect(
    () => () => {
      violationRequestIdRef.current += 1;
      observationRequestIdRef.current += 1;
    },
    [],
  );
  return { firingWindowViolations, shotObservationEvidence };
}
