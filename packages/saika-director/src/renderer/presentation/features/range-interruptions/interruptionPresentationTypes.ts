// SPDX-License-Identifier: MIT
import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

export interface RangeInterruptionLaneOption {
  laneId: string;
  label: string;
  firingPointNumber: number | null;
  athleteName?: string;
  interruption?: {
    interruptionId: string;
    status: 'PAUSED' | 'RESUME_PENDING' | 'SIGHTING' | 'RUNNING_MATCH';
  };
  seriesSnapshot?: {
    stageIndex: number;
    seriesIndex: number;
    recordedShots: number;
    maxShots: number;
    seriesComplete: boolean;
    capturedAt: string;
  };
}

export type DetailAction =
  'pause' | 'end' | 'recovery' | 'grant' | 'qualification-decision' | 'resume' | 'match' | 'entry' | null;

export interface FormProps {
  interruption: RangeInterruptionCaseDto;
  saving: boolean;
  onCancel: () => void;
  onMutate: (operation: () => Promise<RangeInterruptionCaseDto>) => Promise<boolean>;
}
