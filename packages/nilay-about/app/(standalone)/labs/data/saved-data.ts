import type { PhotoRecords } from '@/lib/labs-backup';
import type { LabsToolSlug } from '@/lib/labs-tools';
import { persistedKey, type PersistedStore } from '@/lib/persisted-store';
import { GIBIER_MAX_PHOTOS } from '@/lib/schemas/gibier-record';
import { PHOTOS_PER_RECORD_MAX } from '@/lib/schemas/photos';
import { useStudyLogStore } from '@/store/study-log';

import { useAmmoPlanStore } from '../ammo-purchase-plan/_store';
import { useBearBellStore } from '../bear-bell/_store';
import { useBearStatsStore } from '../bear-stats/_store';
import { useCaptureCheckStore } from '../capture-check/_store';
import { useClayScoreStore } from '../clay-score/_store';
import { useClickVerificationStore } from '../click-verification/_store';
import { useCoordinateConvertStore } from '../coordinate-convert/_store';
import { useCourseSchedulesStore } from '../course-schedules/_store';
import { useCureMixStore } from '../cure-mix/_store';
import { useDeerDensityStore } from '../deer-density/_store';
import { useDriveHuntStore } from '../drive-hunt/_store';
import { useElectricFenceStore } from '../electric-fence/_store';
import { usePowerStore } from '../electric-fence/_store/power';
import { useFreezerStore } from '../freezer-stock/_store';
import { useGameSpeciesStore } from '../game-species-test/_store';
import { useGibierRecordStore } from '../gibier-record/_store';
import { useGunFitStore } from '../gun-fit/_store';
import { useHomeTargetStore } from '../home-target/_store';
import { useHuntingCostsStore } from '../hunting-costs/_store';
import { useHuntingHoursStore } from '../hunting-hours/_store';
import { useHuntingLogStore } from '../hunting-log/_store';
import { useHuntingSeasonsStore } from '../hunting-seasons/_store';
import { useLawQuizStore } from '../law-quiz/_store';
import { useLicenseExamStore } from '../license-exam/_store';
import { useLoadDevelopmentStore } from '../load-development/_store';
import { useMatchTimerStore } from '../match-timer/_store';
import { useMaxRangeStore } from '../max-range/_store';
import { useMeatYieldStore } from '../meat-yield/_store';
import { usePcpFillStore } from '../pcp-fill/_store';
import { usePermitDeadlinesStore } from '../permit-deadlines/_store';
import { useRecoilStore } from '../recoil/_store';
import { useReticleRangingStore } from '../reticle-ranging/_store';
import { useShotDangerStore } from '../shot-danger/_store';
import { useShotGroupStore } from '../shot-group/_store';
import { useShotPatternStore } from '../shot-pattern/_store';
import { useShotPelletsStore } from '../shot-pellets/_store';
import { useShotTimerStore } from '../shot-timer/_store';
import { useGearStore } from '../shotgun-gear/_store';
import { useSightAdjustmentStore } from '../sight-adjustment/_store';
import { useSnareGaugeStore } from '../snare-gauge/_store';
import { useTargetLeadStore } from '../target-lead/_store';
import { useTargetScoreStore } from '../target-score/_store';
import { useTraceGaugeStore } from '../trace-gauge/_store';
import { useTrailCameraStore } from '../trail-camera/_store';
import { useTrajectoryStore } from '../trajectory/_store';
import { useTruingStore } from '../trajectory-truing/_store';
import { useTrapCheckLogStore } from '../trap-check-log/_store';
import { useTrapTagStore } from '../trap-tag/_store';
import { useTripPlanStore } from '../trip-plan/_store';
import { useTwistStabilityProfiles, useTwistStabilityStore } from '../twist-stability/_store';
import { useUnitConverterStore } from '../unit-converter/_store';
import { useVelocitySpreadStore } from '../velocity-spread/_store';
import { useVillageCheckStore } from '../village-check/_store';
import { useWindPracticeStore } from '../wind-practice/_store';
import { useWoundedGameStore } from '../wounded-game/_store';

/**
 * Every store in which Labs keeps data in localStorage, for the backup.
 *
 * `main` is a tool's own saved state, `named` a list of named settings kept beside it, and `extra`
 * another part a tool keeps under a key of its own, named by `title`. `shared` is data several tools
 * keep together, named by `title` rather than by one tool. A store that starts saving adds itself here;
 * a unit test reads every file that makes a persisted store and fails while one is missing. The hunter
 * maps and the photos are kept in IndexedDB and are handled by the backup directly.
 */
export type SavedDataEntry =
  | { slug: LabsToolSlug; part: 'main' | 'named'; store: PersistedStore }
  | { slug: LabsToolSlug; part: 'extra'; title: { ja: string; en: string }; store: PersistedStore }
  | { slug: null; part: 'shared'; title: { ja: string; en: string }; store: PersistedStore };

export const savedDataEntries: readonly SavedDataEntry[] = [
  { slug: 'ammo-purchase-plan', part: 'main', store: useAmmoPlanStore },
  { slug: 'bear-bell', part: 'main', store: useBearBellStore },
  { slug: 'bear-stats', part: 'main', store: useBearStatsStore },
  { slug: 'capture-check', part: 'main', store: useCaptureCheckStore },
  { slug: 'clay-score', part: 'main', store: useClayScoreStore },
  { slug: 'click-verification', part: 'main', store: useClickVerificationStore },
  { slug: 'coordinate-convert', part: 'main', store: useCoordinateConvertStore },
  { slug: 'course-schedules', part: 'main', store: useCourseSchedulesStore },
  { slug: 'cure-mix', part: 'main', store: useCureMixStore },
  { slug: 'deer-density', part: 'main', store: useDeerDensityStore },
  { slug: 'drive-hunt', part: 'main', store: useDriveHuntStore },
  { slug: 'electric-fence', part: 'main', store: useElectricFenceStore },
  {
    slug: 'electric-fence',
    part: 'extra',
    title: { ja: '電気柵の電源と費用', en: 'Electric fence power and cost' },
    store: usePowerStore,
  },
  { slug: 'freezer-stock', part: 'main', store: useFreezerStore },
  { slug: 'game-species-test', part: 'main', store: useGameSpeciesStore },
  { slug: 'gibier-record', part: 'main', store: useGibierRecordStore },
  { slug: 'gun-fit', part: 'main', store: useGunFitStore },
  { slug: 'home-target', part: 'main', store: useHomeTargetStore },
  { slug: 'hunting-costs', part: 'main', store: useHuntingCostsStore },
  { slug: 'hunting-hours', part: 'main', store: useHuntingHoursStore },
  { slug: 'hunting-log', part: 'main', store: useHuntingLogStore },
  { slug: 'hunting-seasons', part: 'main', store: useHuntingSeasonsStore },
  { slug: 'law-quiz', part: 'main', store: useLawQuizStore },
  { slug: 'license-exam', part: 'main', store: useLicenseExamStore },
  { slug: 'load-development', part: 'main', store: useLoadDevelopmentStore },
  { slug: 'match-timer', part: 'main', store: useMatchTimerStore },
  { slug: 'max-range', part: 'main', store: useMaxRangeStore },
  { slug: 'meat-yield', part: 'main', store: useMeatYieldStore },
  { slug: 'pcp-fill', part: 'main', store: usePcpFillStore },
  { slug: 'permit-deadlines', part: 'main', store: usePermitDeadlinesStore },
  { slug: 'recoil', part: 'main', store: useRecoilStore },
  { slug: 'reticle-ranging', part: 'main', store: useReticleRangingStore },
  { slug: 'shot-danger', part: 'main', store: useShotDangerStore },
  { slug: 'shot-group', part: 'main', store: useShotGroupStore },
  { slug: 'shot-pattern', part: 'main', store: useShotPatternStore },
  { slug: 'shot-pellets', part: 'main', store: useShotPelletsStore },
  { slug: 'shot-timer', part: 'main', store: useShotTimerStore },
  { slug: 'shotgun-gear', part: 'main', store: useGearStore },
  { slug: 'sight-adjustment', part: 'main', store: useSightAdjustmentStore },
  { slug: 'snare-gauge', part: 'main', store: useSnareGaugeStore },
  { slug: 'target-lead', part: 'main', store: useTargetLeadStore },
  { slug: 'target-score', part: 'main', store: useTargetScoreStore },
  { slug: 'trace-gauge', part: 'main', store: useTraceGaugeStore },
  { slug: 'trail-camera', part: 'main', store: useTrailCameraStore },
  { slug: 'trajectory', part: 'main', store: useTrajectoryStore },
  { slug: 'trajectory-truing', part: 'main', store: useTruingStore },
  { slug: 'trap-check-log', part: 'main', store: useTrapCheckLogStore },
  { slug: 'trap-tag', part: 'main', store: useTrapTagStore },
  { slug: 'trip-plan', part: 'main', store: useTripPlanStore },
  { slug: 'twist-stability', part: 'main', store: useTwistStabilityStore },
  { slug: 'twist-stability', part: 'named', store: useTwistStabilityProfiles },
  { slug: 'unit-converter', part: 'main', store: useUnitConverterStore },
  { slug: 'velocity-spread', part: 'main', store: useVelocitySpreadStore },
  { slug: 'village-check', part: 'main', store: useVillageCheckStore },
  { slug: 'wind-practice', part: 'main', store: useWindPracticeStore },
  { slug: 'wounded-game', part: 'main', store: useWoundedGameStore },
  {
    slug: null,
    part: 'shared',
    title: { ja: '学習の記録（学習した日・試験日）', en: 'Study record (days studied, exam date)' },
    store: useStudyLogStore,
  },
];

const byKey = new Map(savedDataEntries.map((entry) => [persistedKey(entry.store), entry]));

export function savedDataEntry(key: string): SavedDataEntry | undefined {
  return byKey.get(key);
}

/**
 * The tools that attach photos to their records (`PhotoAttachments`), with where the records are and
 * how to list their ids. A tool that starts using photos adds itself here; the backup carries and
 * restores a tool's photos only together with its records, and only photos of records that are there.
 */
const photoToolRecords: Partial<Record<LabsToolSlug, (state: unknown) => unknown[]>> = {
  'hunting-log': (state) => (state as { outings?: unknown[] }).outings ?? [],
};

export const photoTools = Object.keys(photoToolRecords) as LabsToolSlug[];

function idsOf(records: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const record of records)
    if (typeof record === 'object' && record !== null && 'id' in record && typeof record.id === 'string')
      ids.add(record.id);
  return ids;
}

/** Where a tool keeps the records its photos belong to, or undefined for a tool that has no photos. */
export function photoRecords(slug: string): PhotoRecords | undefined {
  const tool = photoToolRecords[slug as LabsToolSlug];
  const main = savedDataEntries.find((entry) => entry.slug === slug && entry.part === 'main');
  if (!tool || !main) return undefined;
  return {
    key: persistedKey(main.store),
    // The value has already passed the tool's own check, so it is the envelope `persist` writes.
    ids: (value) => idsOf(tool.records((value as { state: unknown }).state)),
    maxPerRecord: tool.maxPerRecord,
  };
}
