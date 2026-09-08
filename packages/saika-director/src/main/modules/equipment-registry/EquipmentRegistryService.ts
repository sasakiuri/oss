import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import {
  recordCalibrationSchema,
  recordEquipmentInspectionSchema,
  saveEquipmentSchema,
  withdrawEquipmentRecordSchema,
  type EquipmentAthlete,
  type EquipmentDetails,
  type EquipmentRegistryEntry,
  type EquipmentRegistryWorkspace,
} from '@/shared/ipc/contracts/equipmentRegistry.contract';

export interface IEquipmentRegistryRepository {
  list(championshipId: string): EquipmentRegistryEntry[];
  append(entry: EquipmentRegistryEntry, expectedRevision: number): void;
}
/** Athlete identity, persistence and the clock can be supplied independently of competition control. */
export class EquipmentRegistryService {
  constructor(
    private readonly repository: IEquipmentRegistryRepository,
    private readonly athletes: (championshipId: string) => EquipmentAthlete[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  getWorkspace({ championshipId, asOfDate }: { championshipId: string; asOfDate: string }): EquipmentRegistryWorkspace {
    const entries = this.repository.list(championshipId);
    const withdrawn = new Set(entries.flatMap((entry) => (entry.kind === 'WITHDRAWAL' ? [entry.withdrawsId] : [])));
    const active = entries.filter((entry) => !withdrawn.has(entry.id));
    const equipment = new Map<string, Extract<EquipmentRegistryEntry, { kind: 'EQUIPMENT' }>>();
    for (const entry of entries) if (entry.kind === 'EQUIPMENT') equipment.set(entry.equipmentId, entry);
    return {
      revision: entries.length,
      athletes: this.athletes(championshipId),
      entries,
      activeCalibrationIds: active.filter((entry) => entry.kind === 'CALIBRATION').map((entry) => entry.id),
      equipment: [...equipment.values()].map((item) => {
        const inspections = active.filter(
          (entry): entry is Extract<EquipmentRegistryEntry, { kind: 'INSPECTION' }> =>
            entry.kind === 'INSPECTION' && entry.equipmentId === item.equipmentId,
        );
        const current = inspections.filter((entry) => entry.equipmentRecordId === item.id).at(-1);
        const advisories = equipmentAdvisories(item.details, asOfDate);
        if (!current) advisories.push('No inspection is recorded for the current equipment details.');
        else {
          if (current.outcome !== 'PASSED') advisories.push(`Latest inspection: ${current.outcome.toLowerCase()}.`);
          if (current.calibrationIds.length === 0 || current.calibrationIds.some((id) => withdrawn.has(id)))
            advisories.push('The latest inspection has missing or withdrawn calibration evidence.');
        }
        if (isClothing(item.details.category)) {
          if (inspections.length >= 3)
            advisories.push('Three clothing inspections reached: review Rule 6.7.6.2(j) before further use.');
          else if (inspections.length > 1) advisories.push('Clothing reinspection: check the applicable fee.');
        }
        return {
          equipmentId: item.equipmentId,
          recordId: item.id,
          athleteName: item.athleteName,
          details: item.details,
          currentInspectionId: current?.id ?? null,
          inspectionCount: inspections.length,
          advisories,
        };
      }),
    };
  }

  saveEquipment(input: z.input<typeof saveEquipmentSchema>) {
    const data = saveEquipmentSchema.parse(input);
    const workspace = this.getWorkspace(data);
    const previous = workspace.equipment.find((item) => item.equipmentId === data.equipmentId);
    if (data.equipmentId && !previous) throw new Error('Equipment not found in this championship');
    if (
      previous &&
      (previous.details.athleteIdentityId !== data.details.athleteIdentityId ||
        previous.details.category !== data.details.category)
    )
      throw new Error(
        'The registered athlete and equipment category cannot be changed; retire this item and register the correct item',
      );
    const athlete = workspace.athletes.find((item) => item.id === data.details.athleteIdentityId);
    if (!athlete) throw new Error('Choose a registered athlete identity from this championship');
    if (
      !data.details.retired &&
      data.details.sealNumber &&
      workspace.equipment.some(
        (item) =>
          item.equipmentId !== data.equipmentId &&
          !item.details.retired &&
          item.details.sealNumber === data.details.sealNumber,
      )
    )
      throw new Error('This seal is already assigned to active equipment');
    this.repository.append(
      {
        ...this.base(data),
        kind: 'EQUIPMENT',
        equipmentId: data.equipmentId ?? randomUUID(),
        athleteName: athlete.name,
        details: data.details,
      },
      data.expectedRevision,
    );
    return this.getWorkspace(data);
  }

  recordCalibration(input: z.input<typeof recordCalibrationSchema>) {
    const data = recordCalibrationSchema.parse(input);
    this.repository.append(
      {
        ...this.base(data),
        kind: 'CALIBRATION',
        testingDate: data.testingDate,
        instrument: data.instrument,
        reference: data.reference,
      },
      data.expectedRevision,
    );
    return this.getWorkspace(data);
  }

  recordInspection(input: z.input<typeof recordEquipmentInspectionSchema>) {
    const data = recordEquipmentInspectionSchema.parse(input);
    const workspace = this.getWorkspace(data);
    const item = workspace.equipment.find((entry) => entry.equipmentId === data.equipmentId);
    if (!item || item.details.retired) throw new Error('Choose active equipment from this championship');
    if (new Set(data.calibrationIds).size !== data.calibrationIds.length)
      throw new Error('Duplicate calibration reference');
    for (const id of data.calibrationIds) {
      const calibration = workspace.entries.find((entry) => entry.id === id);
      if (
        !calibration ||
        calibration.kind !== 'CALIBRATION' ||
        calibration.testingDate !== data.testingDate ||
        !workspace.activeCalibrationIds.includes(id)
      )
        throw new Error('Calibration must be active and recorded for the same testing date');
    }
    this.repository.append(
      {
        ...this.base(data),
        kind: 'INSPECTION',
        equipmentId: item.equipmentId,
        equipmentRecordId: item.recordId,
        testingDate: data.testingDate,
        outcome: data.outcome,
        testedItems: data.testedItems,
        calibrationIds: data.calibrationIds,
      },
      data.expectedRevision,
    );
    return this.getWorkspace(data);
  }

  withdraw(input: z.input<typeof withdrawEquipmentRecordSchema>) {
    const data = withdrawEquipmentRecordSchema.parse(input);
    const entries = this.repository.list(data.championshipId);
    const record = entries.find((entry) => entry.id === data.withdrawsId);
    if (!record || !['CALIBRATION', 'INSPECTION'].includes(record.kind))
      throw new Error('Only inspection or calibration records can be withdrawn');
    if (entries.some((entry) => entry.kind === 'WITHDRAWAL' && entry.withdrawsId === data.withdrawsId))
      throw new Error('This record has already been withdrawn');
    this.repository.append(
      { ...this.base(data), kind: 'WITHDRAWAL', withdrawsId: data.withdrawsId },
      data.expectedRevision,
    );
    return this.getWorkspace(data);
  }

  private base(data: { championshipId: string; officialName: string; statement: string }) {
    return {
      id: randomUUID(),
      championshipId: data.championshipId,
      officialName: data.officialName,
      statement: data.statement,
      recordedAt: this.now().toISOString(),
    };
  }
}

function isClothing(category: EquipmentDetails['category']) {
  return ['JACKET', 'TROUSERS', 'SHOES'].includes(category);
}

export function equipmentAdvisories(details: EquipmentDetails, asOfDate: string): string[] {
  const messages: string[] = [];
  if (details.retired) messages.push('This equipment is retired from the register.');
  if (
    ['RIFLE', 'PISTOL'].includes(details.category) &&
    (!details.manufacturer || !details.serialNumber || !details.calibre || !details.cardReference)
  )
    messages.push('Gun registration is missing manufacturer, serial number, calibre or equipment card reference.');
  if (details.category === 'PISTOL' && !details.externalRegistrationReference)
    messages.push('The external ISSF pistol registration reference has not been recorded.');
  if (isClothing(details.category) && !details.sealNumber)
    messages.push('The rifle clothing seal number has not been recorded.');
  if (details.category === 'CYLINDER') {
    if (!details.manufacturedOn || !details.validUntil)
      messages.push('Cylinder manufacture date or manufacturer validity date is missing.');
    if (details.validUntil && details.validUntil < asOfDate)
      messages.push('The manufacturer cylinder validity date has expired.');
    if (details.manufacturedOn) {
      const anniversary = new Date(`${details.manufacturedOn}T00:00:00Z`);
      const month = anniversary.getUTCMonth();
      anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 10);
      if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
      const limit = anniversary.toISOString().slice(0, 10);
      if (asOfDate > limit) messages.push('The cylinder is beyond ten years from manufacture.');
      if (details.validUntil && details.validUntil > limit)
        messages.push('The recorded cylinder validity exceeds the ten-year maximum.');
      if (details.manufacturedOn > asOfDate || (details.validUntil && details.validUntil < details.manufacturedOn))
        messages.push('Review inconsistent cylinder dates.');
    }
  }
  return messages;
}
