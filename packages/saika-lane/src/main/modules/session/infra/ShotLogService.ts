// SPDX-License-Identifier: MIT
import fs from 'fs';
import path from 'path';

import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { SessionStartedEvent, ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export class ShotLogService {
  private readonly shotLogDir: string;
  private readonly sessionMap = new Map<string, { filePath: string; discipline: Discipline }>();

  constructor(userDataPath: string) {
    this.shotLogDir = path.join(userDataPath, 'ShotLog');
  }

  handleSessionStarted(event: SessionStartedEvent): void {
    const stamp = formatTimestamp(new Date());
    const disciplineValue = event.discipline.value;
    const fileName = `${stamp}_${disciplineValue}.jsonl`;
    const filePath = path.join(this.shotLogDir, fileName);

    try {
      ensureDir(this.shotLogDir);
      this.sessionMap.set(event.aggregateId, { filePath, discipline: event.discipline });
      getLogger().debug(`ShotLogService: session ${event.aggregateId} → ${filePath}`, 'domain');
    } catch (err) {
      getLogger().error(
        'ShotLogService: failed to prepare log file directory',
        'domain',
        err instanceof Error ? { error: err.stack } : { error: String(err) },
      );
    }
  }

  handleShotRecorded(event: ShotRecordedEvent): void {
    const entry = this.sessionMap.get(event.aggregateId);
    if (!entry) {
      getLogger().debug(`ShotLogService: no log file for session ${event.aggregateId}, skipping`, 'domain');
      return;
    }

    try {
      const line = formatJsonLine(event.shot, entry.discipline, {
        sessionId: event.aggregateId,
        scoringMode: event.scoringMode,
        rawScore: event.rawScore,
      });
      fs.appendFileSync(entry.filePath, line + '\n', 'utf8');
    } catch (err) {
      getLogger().error(
        'ShotLogService: failed to write shot log line',
        'domain',
        err instanceof Error ? { error: err.stack } : { error: String(err) },
      );
    }
  }
}

export function formatJsonLine(
  shot: Shot,
  discipline: Discipline,
  context: {
    sessionId: string;
    scoringMode: 'RING' | 'DECIMAL';
    rawScore?: number;
  },
): string {
  const entry: {
    id: string;
    sessionId: string;
    timestamp: string;
    discipline: string;
    scoringMode: 'RING' | 'DECIMAL';
    mode: string;
    seriesNumber: number;
    shotNumber: number;
    score: number;
    rawScore?: number;
    deviceScore: number | null;
    x: number | null;
    y: number | null;
    innerTen: boolean;
  } = {
    id: shot.id,
    sessionId: context.sessionId,
    timestamp: shot.timestamp.toISOString(),
    discipline: discipline.value,
    scoringMode: context.scoringMode,
    mode: shot.mode.value,
    seriesNumber: shot.seriesNumber,
    shotNumber: shot.shotNumber,
    score: shot.score.value,
    rawScore: context.rawScore,
    deviceScore: shot.deviceScore !== undefined ? shot.deviceScore.value : null,
    x: shot.impactPoint !== null ? shot.impactPoint.x : null,
    y: shot.impactPoint !== null ? shot.impactPoint.y : null,
    innerTen: shot.innerTen,
  };

  return JSON.stringify(entry);
}

export function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  );
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
