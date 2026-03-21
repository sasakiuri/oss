// SPDX-License-Identifier: MIT
import fs from 'fs';
import path from 'path';

import { app } from 'electron';

import type { IScoreDiscrepancyLogger, ScoreDiscrepancyRecord } from '../domain/IScoreDiscrepancyLogger';

const HEADER = 'timestamp,sessionId,discipline,mode,deviceScore,appScore,diff,distance,x,y';

export class CsvScoreDiscrepancyLogger implements IScoreDiscrepancyLogger {
  private readonly filePath: string;

  constructor(logsDir?: string) {
    const dir = logsDir ?? process.env.LOGS_DIR ?? path.join(app.getPath('userData'), 'logs');
    this.filePath = path.join(dir, 'score-discrepancy.csv');
  }

  log(record: ScoreDiscrepancyRecord): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.appendFileSync(this.filePath, HEADER + '\n');
    }

    const line = [
      record.timestamp.toISOString(),
      record.sessionId,
      record.discipline,
      record.mode,
      (record.deviceScore / 10).toFixed(1),
      (record.appScore / 10).toFixed(1),
      (record.diff / 10).toFixed(1),
      record.distance.toFixed(3),
      record.x.toFixed(3),
      record.y.toFixed(3),
    ].join(',');

    fs.appendFileSync(this.filePath, line + '\n');
  }
}
