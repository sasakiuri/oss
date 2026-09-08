// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import {
  EquipmentRegistryService,
  equipmentAdvisories,
} from '@/main/modules/equipment-registry/EquipmentRegistryService';
import { SqliteEquipmentRegistryRepository } from '@/main/modules/equipment-registry/SqliteEquipmentRegistryRepository';
import { SqliteCompetitionEvidenceSource } from '@/main/modules/operational-archives/infra/SqliteCompetitionEvidenceSource';
import type { EquipmentDetails } from '@/shared/ipc/contracts/equipmentRegistry.contract';

const championshipId = '11111111-1111-4111-8111-111111111111';
const athleteIdentityId = '22222222-2222-4222-8222-222222222222';
const scope = {
  championshipId,
  asOfDate: '2026-09-08',
  officialName: 'EC Official',
  statement: 'Checked at equipment control',
};
const details: EquipmentDetails = {
  athleteIdentityId,
  category: 'JACKET',
  description: 'Shooting jacket',
  manufacturer: 'Example',
  serialNumber: null,
  calibre: null,
  sealNumber: 'SEAL-001',
  cardReference: 'Card A',
  externalRegistrationReference: null,
  manufacturedOn: null,
  validUntil: null,
  retired: false,
};

describe('Equipment registry', () => {
  let database: Database.Database;
  let service: EquipmentRegistryService;
  const workspace = () => service.getWorkspace(scope);
  const input = () => ({ ...scope, expectedRevision: workspace().revision });
  const register = () => service.saveEquipment({ ...input(), equipmentId: null, details }).equipment[0]!;
  const calibration = () =>
    service
      .recordCalibration({
        ...input(),
        testingDate: scope.asOfDate,
        instrument: 'Stiffness gauge',
        reference: 'Daily calibration sheet A',
      })
      .entries.at(-1)!;
  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    new MigrationRunner(database).run(allMigrations);
    database
      .prepare('INSERT INTO championships (id, name, date, venue) VALUES (?, ?, ?, ?)')
      .run(championshipId, 'Example competition', scope.asOfDate, 'Range');
    service = new EquipmentRegistryService(new SqliteEquipmentRegistryRepository(database), (id) =>
      id === championshipId ? [{ id: athleteIdentityId, name: 'Athlete A', issfId: null }] : [],
    );
  });
  afterEach(() => database.close());
  it('keeps inspections tied to the equipment version, reloads them and exports the complete history', () => {
    const item = register();
    const cal = calibration();
    const result = service.recordInspection({
      ...input(),
      equipmentId: item.equipmentId,
      testingDate: scope.asOfDate,
      outcome: 'PASSED',
      testedItems: 'Stiffness and thickness',
      calibrationIds: [cal.id],
    });
    expect(result.equipment[0]!.currentInspectionId).not.toBeNull();
    expect(result.equipment[0]!.advisories).toEqual([]);
    service.saveEquipment({
      ...input(),
      equipmentId: item.equipmentId,
      details: { ...details, sealNumber: 'SEAL-002' },
    });
    expect(workspace().equipment[0]).toMatchObject({ inspectionCount: 1, currentInspectionId: null });
    const reloaded = new SqliteEquipmentRegistryRepository(database).list(championshipId);
    expect(reloaded).toEqual(workspace().entries);
    expect(reloaded.find((entry) => entry.kind === 'INSPECTION')).toMatchObject({ equipmentRecordId: item.recordId });
    expect(
      new SqliteCompetitionEvidenceSource(database)
        .collect(championshipId)
        .find((section) => section.id === 'equipment-registry-entries')!.records,
    ).toHaveLength(4);
    expect(() => database.exec('DELETE FROM equipment_registry_entries')).toThrow('append-only');
    expect(() => database.exec("UPDATE equipment_registry_entries SET kind = 'CALIBRATION'")).toThrow('append-only');
  });
  it('rejects stale changes, duplicate active seals and another championship athlete', () => {
    register();
    expect(() =>
      service.recordCalibration({
        ...input(),
        expectedRevision: 0,
        testingDate: scope.asOfDate,
        instrument: 'Gauge',
        reference: 'Sheet',
      }),
    ).toThrow('changed');
    expect(() => service.saveEquipment({ ...input(), equipmentId: null, details })).toThrow('seal');
    expect(() =>
      service.saveEquipment({
        ...input(),
        equipmentId: null,
        details: { ...details, athleteIdentityId: championshipId, sealNumber: 'Other' },
      }),
    ).toThrow('athlete identity');
    expect(workspace().revision).toBe(1);
  });
  it('requires calibration from the same day and warns when calibration is withdrawn', () => {
    const item = register();
    const cal = calibration();
    const inspection = {
      ...input(),
      equipmentId: item.equipmentId,
      testingDate: '2026-09-09',
      outcome: 'PASSED' as const,
      testedItems: 'Stiffness',
      calibrationIds: [cal.id],
    };
    expect(() => service.recordInspection(inspection)).toThrow('same testing date');
    expect(() => service.recordInspection({ ...inspection, calibrationIds: [athleteIdentityId] })).toThrow(
      'same testing date',
    );
    service.recordInspection({ ...inspection, testingDate: scope.asOfDate });
    service.withdraw({ ...input(), withdrawsId: cal.id, statement: 'Calibration reference entered incorrectly' });
    expect(workspace().equipment[0]!.advisories.join(' ')).toContain('withdrawn calibration');
    expect(() => service.withdraw({ ...input(), withdrawsId: cal.id })).toThrow('already');
  });
  it('retains failed retests and excludes withdrawn mistakes from the inspection count', () => {
    const item = register();
    for (let attempt = 0; attempt < 3; attempt++)
      service.recordInspection({
        ...input(),
        equipmentId: item.equipmentId,
        testingDate: scope.asOfDate,
        outcome: 'FAILED',
        testedItems: 'Stiffness',
        calibrationIds: [],
      });
    const result = workspace();
    expect(result.equipment[0]!.inspectionCount).toBe(3);
    expect(result.equipment[0]!.advisories.join(' ')).toContain('Three clothing inspections');
    service.withdraw({
      ...input(),
      withdrawsId: result.entries.at(-1)!.id,
      statement: 'Duplicate entry, not an additional inspection',
    });
    expect(workspace().equipment[0]!.inspectionCount).toBe(2);
    expect(workspace().entries.filter((entry) => entry.kind === 'INSPECTION')).toHaveLength(3);
  });
  it('evaluates cylinder validity independently of inspections, including leap-day manufacture', () => {
    const cylinder = {
      ...details,
      category: 'CYLINDER' as const,
      manufacturedOn: '2016-02-29',
      validUntil: '2027-03-01',
    };
    const messages = equipmentAdvisories(cylinder, '2026-03-01').join(' ');
    expect(messages).toContain('beyond ten years');
    expect(messages).toContain('exceeds the ten-year maximum');
    expect(equipmentAdvisories({ ...cylinder, validUntil: '2025-01-01' }, scope.asOfDate).join(' ')).toContain(
      'expired',
    );
  });
});
