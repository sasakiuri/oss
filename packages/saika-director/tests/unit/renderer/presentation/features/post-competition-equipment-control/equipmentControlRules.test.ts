import { describe, expect, it } from 'vitest';

import { entryLabel } from '@/renderer/presentation/features/post-competition-equipment-control/equipmentControlRules';
import type { PostCompetitionEquipmentCheckDto } from '@/shared/ipc/contracts';

type Entry = PostCompetitionEquipmentCheckDto['entries'][number];

const CHECK_ID = '44444444-4444-4444-8444-444444444444';
const TEST_ENTRY_ID = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-07T01:02:03.000Z';
const base = { checkId: CHECK_ID, statement: 'Recorded', occurredAt: NOW, recordedAt: NOW };

describe('entryLabel', () => {
  it.each<{ entry: Entry; label: string }>([
    {
      entry: {
        ...base,
        id: '66666666-6666-4666-8666-666666666661',
        type: 'NOTICE_ISSUED',
        deliveryMethod: 'Written notice handed to athlete',
        noticeReference: 'EC-7',
        officialName: 'Officer A',
      },
      label: 'Written notice EC-7 issued by Officer A',
    },
    {
      entry: {
        ...base,
        id: TEST_ENTRY_ID,
        type: 'TEST_RECORDED',
        outcome: 'DID_NOT_REPORT',
        testedItems: [],
        clothingOrTapingCheck: false,
        sameGenderJudgeAvailable: null,
        attempts: null,
        performedBy: 'Officer B',
        equipmentControlJurySupervisor: 'Jury B',
      },
      label: 'DID NOT REPORT recorded by Officer B',
    },
    {
      entry: {
        ...base,
        id: '66666666-6666-4666-8666-666666666662',
        type: 'FAILURE_CONFIRMED',
        confirmsEntryId: TEST_ENTRY_ID,
        calibrationReference: 'CAL-1',
        confirmedBy: 'Jury C',
        confirmerRole: 'EQUIPMENT_CONTROL_JURY_CHAIR',
        testPerformedCorrectly: true,
      },
      label: 'Failure confirmed by Jury C (EQUIPMENT CONTROL JURY CHAIR)',
    },
    {
      entry: { ...base, id: '66666666-6666-4666-8666-666666666663', type: 'CHECK_VOIDED', officialName: 'Jury D' },
      label: 'Voided by Jury D',
    },
  ])('labels the entry as "$label"', ({ entry, label }) => {
    expect(entryLabel(entry)).toBe(label);
  });
});
