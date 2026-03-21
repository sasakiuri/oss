// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('SqliteSessionRepository', () => {
  let db: Database.Database;
  let repository: SqliteSessionRepository;

  beforeEach(() => {
    db = createSqliteDb(':memory:');
    repository = new SqliteSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('save() -> findById() round trip', () => {
    it('should save and retrieve a session without shots', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline);

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(session.id);
      expect(found?.discipline.value).toBe('AIR_RIFLE_10M');
      expect(found?.finishedAt).toBeNull();
    });

    it('should save and retrieve a session with shots', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      const impactPoint = new ImpactPoint(0.5, 0.3);
      const score = new Score(105);
      session = session.recordShot(impactPoint, score, new Date('2026-01-01T10:00:00.000Z'));

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found).not.toBeNull();
      expect(found?.shotCount).toBe(1);
      expect(found?.allShots[0]?.score.value).toBe(105);
      expect(found?.allShots[0]?.impactPoint?.x).toBeCloseTo(0.5);
      expect(found?.allShots[0]?.impactPoint?.y).toBeCloseTo(0.3);
    });

    it('should correctly save and retrieve a shot with null impact point (miss shot)', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      session = session.recordShot(null, new Score(0), new Date('2026-01-01T10:00:00.000Z'));

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.allShots[0]?.impactPoint).toBeNull();
    });

    it('should correctly save and retrieve a shot with deviceScore', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      const impactPoint = new ImpactPoint(0.0, 0.0);
      const score = new Score(100);
      const deviceScore = new Score(102);
      session = session.recordShot(impactPoint, score, new Date('2026-01-01T10:00:00.000Z'), deviceScore);

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.allShots[0]?.deviceScore?.value).toBe(102);
    });

    it('should correctly save and retrieve the innerTen flag', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // innerTen = true
      session = session.recordShot(
        new ImpactPoint(0.0, 0.0),
        new Score(109),
        new Date('2026-01-01T10:00:00.000Z'),
        undefined,
        true,
      );

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.allShots[0]?.innerTen).toBe(true);
    });

    it('should correctly save and retrieve a finished session', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).finish();

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.finishedAt).not.toBeNull();
      expect(found?.isFinished).toBe(true);
    });

    it('should return null for a non-existent ID', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });

    it('should correctly save and retrieve RING scoringMode', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline, 'RING');

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.scoringMode).toBe('RING');
    });

    it('should correctly reconstruct a session with shots from multiple series', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // Series 1: 10 shots
      for (let i = 0; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(0, 0), new Score(100), new Date(`2026-01-01T10:00:0${i}.000Z`));
      }
      // Series 2: 3 shots
      for (let i = 0; i < 3; i++) {
        session = session.recordShot(new ImpactPoint(0, 0), new Score(95), new Date(`2026-01-01T10:01:0${i}.000Z`));
      }

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.shotCount).toBe(13);
      // Series 1 total (first series is at index 1: after sighting series 1)
      const seriesNumbers = found?.series.map((s) => s.seriesNumber) ?? [];
      expect(seriesNumbers).toContain(2); // seriesNumber starts at 2 after switchMode
    });
  });

  describe('findActive()', () => {
    it('should return a session with null finishedAt as active', async () => {
      const discipline = Discipline.airRifle10m();
      const activeSession = Session.create(discipline);

      await repository.save(activeSession);

      const found = await repository.findActive();
      expect(found).not.toBeNull();
      expect(found?.id).toBe(activeSession.id);
    });

    it('should return null when only finished sessions exist', async () => {
      const discipline = Discipline.airRifle10m();
      const finishedSession = Session.create(discipline).finish();

      await repository.save(finishedSession);

      const found = await repository.findActive();
      expect(found).toBeNull();
    });

    it('should return null when no sessions exist', async () => {
      const found = await repository.findActive();
      expect(found).toBeNull();
    });
  });

  describe('findAll()', () => {
    it('should retrieve all sessions', async () => {
      const discipline = Discipline.airRifle10m();
      const session1 = Session.create(discipline);
      const session2 = Session.create(discipline).finish();

      await repository.save(session1);
      await repository.save(session2);

      const all = await repository.findAll();
      expect(all).toHaveLength(2);
      const ids = all.map((s) => s.id);
      expect(ids).toContain(session1.id);
      expect(ids).toContain(session2.id);
    });

    it('should return an empty array when no sessions exist', async () => {
      const all = await repository.findAll();
      expect(all).toEqual([]);
    });
  });

  describe('delete()', () => {
    it('should delete a session and its shots', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      session = session.recordShot(new ImpactPoint(0, 0), new Score(100), new Date());

      await repository.save(session);

      // Verify existence before deletion
      expect(await repository.findById(session.id)).not.toBeNull();

      await repository.delete(session.id);

      // After deletion
      expect(await repository.findById(session.id)).toBeNull();

      // Verify shots are also deleted (directly check shots table)
      const shotsCount = db.prepare('SELECT COUNT(*) as cnt FROM shots WHERE sessionId = ?').get(session.id) as {
        cnt: number;
      };
      expect(shotsCount.cnt).toBe(0);
    });

    it('should not throw an error when deleting a non-existent ID', async () => {
      await expect(repository.delete('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('UPSERT (calling save multiple times)', () => {
    it('should overwrite an existing session on save', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);

      await repository.save(session);

      // Add a shot and save again
      session = session.switchMode(Mode.match());
      session = session.recordShot(new ImpactPoint(1, 1), new Score(95), new Date());
      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.shotCount).toBe(1);

      // Verify sessions table has exactly 1 row
      const sessionCount = db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE id = ?').get(session.id) as {
        cnt: number;
      };
      expect(sessionCount.cnt).toBe(1);
    });
  });

  describe('saveShot() (incremental save)', () => {
    it('should save only session metadata and a single shot', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      const impactPoint = new ImpactPoint(0.5, 0.3);
      const score = new Score(105);
      const updatedSession = session.recordShot(impactPoint, score, new Date('2026-01-01T10:00:00.000Z'));
      const newShot = updatedSession.allShots[updatedSession.allShots.length - 1]!;

      // Save initial session with save, then incrementally save with saveShot
      await repository.save(session);
      await repository.saveShot(updatedSession, newShot);

      const found = await repository.findById(updatedSession.id);
      expect(found).not.toBeNull();
      expect(found?.shotCount).toBe(1);
      expect(found?.allShots[0]?.score.value).toBe(105);
      expect(found?.allShots[0]?.impactPoint?.x).toBeCloseTo(0.5);
      expect(found?.allShots[0]?.impactPoint?.y).toBeCloseTo(0.3);
    });

    it('should create both session row and shot simultaneously with saveShot even if session is unsaved', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      const updatedSession = session.recordShot(
        new ImpactPoint(1, 2),
        new Score(95),
        new Date('2026-01-01T10:00:00.000Z'),
      );
      const newShot = updatedSession.allShots[updatedSession.allShots.length - 1]!;

      // Only saveShot without calling save
      await repository.saveShot(updatedSession, newShot);

      const found = await repository.findById(updatedSession.id);
      expect(found).not.toBeNull();
      expect(found?.shotCount).toBe(1);
      expect(found?.allShots[0]?.score.value).toBe(95);
    });

    it('should save each shot individually with multiple saveShot calls', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      await repository.save(session);

      // Incrementally save shot 1
      const session1 = session.recordShot(new ImpactPoint(0, 0), new Score(100), new Date('2026-01-01T10:00:00.000Z'));
      const shot1 = session1.allShots[session1.allShots.length - 1]!;
      await repository.saveShot(session1, shot1);

      // Incrementally save shot 2
      const session2 = session1.recordShot(new ImpactPoint(1, 1), new Score(95), new Date('2026-01-01T10:00:01.000Z'));
      const shot2 = session2.allShots[session2.allShots.length - 1]!;
      await repository.saveShot(session2, shot2);

      // Incrementally save shot 3
      const session3 = session2.recordShot(new ImpactPoint(2, 2), new Score(90), new Date('2026-01-01T10:00:02.000Z'));
      const shot3 = session3.allShots[session3.allShots.length - 1]!;
      await repository.saveShot(session3, shot3);

      const found = await repository.findById(session.id);
      expect(found?.shotCount).toBe(3);
      expect(found?.allShots[0]?.score.value).toBe(100);
      expect(found?.allShots[1]?.score.value).toBe(95);
      expect(found?.allShots[2]?.score.value).toBe(90);

      // Exactly 3 rows exist in the shots table
      const shotsCount = db.prepare('SELECT COUNT(*) as cnt FROM shots WHERE sessionId = ?').get(session.id) as {
        cnt: number;
      };
      expect(shotsCount.cnt).toBe(3);
    });

    it('should save a miss shot (impactPoint: null) with saveShot', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      const updatedSession = session.recordShot(null, new Score(0), new Date('2026-01-01T10:00:00.000Z'));
      const newShot = updatedSession.allShots[updatedSession.allShots.length - 1]!;

      await repository.save(session);
      await repository.saveShot(updatedSession, newShot);

      const found = await repository.findById(updatedSession.id);
      expect(found?.allShots[0]?.impactPoint).toBeNull();
      expect(found?.allShots[0]?.score.value).toBe(0);
    });

    it('should save a shot with deviceScore using saveShot', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      const deviceScore = new Score(102);
      const updatedSession = session.recordShot(
        new ImpactPoint(0, 0),
        new Score(100),
        new Date('2026-01-01T10:00:00.000Z'),
        deviceScore,
      );
      const newShot = updatedSession.allShots[updatedSession.allShots.length - 1]!;

      await repository.save(session);
      await repository.saveShot(updatedSession, newShot);

      const found = await repository.findById(updatedSession.id);
      expect(found?.allShots[0]?.deviceScore?.value).toBe(102);
    });

    it('should correctly save the innerTen flag with saveShot', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());
      const updatedSession = session.recordShot(
        new ImpactPoint(0, 0),
        new Score(109),
        new Date('2026-01-01T10:00:00.000Z'),
        undefined,
        true,
      );
      const newShot = updatedSession.allShots[updatedSession.allShots.length - 1]!;

      await repository.save(session);
      await repository.saveShot(updatedSession, newShot);

      const found = await repository.findById(updatedSession.id);
      expect(found?.allShots[0]?.innerTen).toBe(true);
    });
  });

  describe('Handling of sighting shots (seriesNumber = 0)', () => {
    it('should include sighting shots in allShots but not in series', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);

      // Shot in sighting mode (default)
      session = session.recordShot(new ImpactPoint(0, 0), new Score(90), new Date());

      await repository.save(session);

      const found = await repository.findById(session.id);
      expect(found?.shotCount).toBe(1);
      // Sighting shot seriesNumber = 0
      expect(found?.allShots[0]?.seriesNumber).toBe(0);
    });
  });
});
