// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly name: string;
  up(db: Database.Database): void;
}
