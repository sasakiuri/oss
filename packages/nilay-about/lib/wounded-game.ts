import {
  localDateTimeMs,
  type CueId,
  type Impression,
  type Position,
  type TrailEntry,
} from '@/lib/schemas/wounded-game';

export type { CueId, EntryKind, Impression, Position, TrailEntry } from '@/lib/schemas/wounded-game';

/** The day every source below was read. */
export const SOURCES_CHECKED_ON = '2026-09-23';

interface Text {
  ja: string;
  en: string;
}

export type SourceId =
  | 'law'
  | 'rule'
  | 'mhlw'
  | 'maff-safety'
  | 'maff-capture'
  | 'fukui'
  | 'env-emergency'
  | 'akita'
  | 'mo-bow-when'
  | 'mo-bow-blood'
  | 'mo-bow-approach'
  | 'mo-bow-lost'
  | 'mo-hunter-trailing'
  | 'mo-hunter-approach'
  | 'mdc-basics'
  | 'agfc'
  | 'va-dwr';

export interface Source {
  id: SourceId;
  /** `jp` sources speak for Japan. `na` ones are North American teaching on white-tailed deer. */
  region: 'jp' | 'na';
  title: Text;
  publisher: Text;
  url: string;
}

export const sources: Record<SourceId, Source> = {
  law: {
    id: 'law',
    region: 'jp',
    title: {
      ja: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律（平成14年法律第88号）',
      en: 'Wildlife Protection, Control and Hunting Management Act (Act No. 88 of 2002)',
    },
    publisher: { ja: 'e-Gov 法令検索（デジタル庁）', en: 'e-Gov Laws (Digital Agency, Japan)' },
    url: 'https://laws.e-gov.go.jp/law/414AC0000000088',
  },
  rule: {
    id: 'rule',
    region: 'jp',
    title: {
      ja: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律施行規則（平成14年環境省令第28号）',
      en: 'Enforcement Regulations of the Act (Ministry of the Environment Ordinance No. 28 of 2002)',
    },
    publisher: { ja: 'e-Gov 法令検索（デジタル庁）', en: 'e-Gov Laws (Digital Agency, Japan)' },
    url: 'https://laws.e-gov.go.jp/law/414M60001000028',
  },
  mhlw: {
    id: 'mhlw',
    region: 'jp',
    title: {
      ja: '野生鳥獣肉の衛生管理に関する指針（ガイドライン）（令和5年6月26日一部改正）',
      en: 'Guidelines on hygiene control of wild game meat (amended 26 June 2023)',
    },
    publisher: { ja: '厚生労働省', en: 'Ministry of Health, Labour and Welfare' },
    url: 'https://www.mhlw.go.jp/content/001455712.pdf',
  },
  'maff-safety': {
    id: 'maff-safety',
    region: 'jp',
    title: {
      ja: '野生鳥獣被害防止マニュアル【総合対策編】第6章 安全対策',
      en: 'Wildlife damage prevention manual (general), chapter 6: safety',
    },
    publisher: { ja: '農林水産省', en: 'Ministry of Agriculture, Forestry and Fisheries' },
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/attach/pdf/manual-49.pdf',
  },
  'maff-capture': {
    id: 'maff-capture',
    region: 'jp',
    title: {
      ja: '野生鳥獣被害防止マニュアル【総合対策編】第3章 鳥獣被害対策の3つの柱',
      en: 'Wildlife damage prevention manual (general), chapter 3: the three pillars',
    },
    publisher: { ja: '農林水産省', en: 'Ministry of Agriculture, Forestry and Fisheries' },
    url: 'https://www.maff.go.jp/j/seisan/tyozyu/higai/manyuaru/attach/pdf/manual-46.pdf',
  },
  fukui: {
    id: 'fukui',
    region: 'jp',
    title: {
      ja: '有害鳥獣捕獲のためのシカ捕獲マニュアル（くくりわな）',
      en: 'Deer capture manual for pest control (foot snares)',
    },
    publisher: { ja: '福井県', en: 'Fukui Prefecture' },
    url: 'https://www.pref.fukui.lg.jp/doc/021500/choujyugai/cyoujyuugai_d/fil/R1sika_hokaku_manual.pdf',
  },
  'env-emergency': {
    id: 'env-emergency',
    region: 'jp',
    title: { ja: '緊急銃猟ガイドライン（令和8年4月改訂）', en: 'Emergency shooting guidelines (revised April 2026)' },
    publisher: { ja: '環境省', en: 'Ministry of the Environment' },
    url: 'https://www.env.go.jp/nature/choju/effort/effort15/doc/guideline.pdf',
  },
  akita: {
    id: 'akita',
    region: 'jp',
    title: { ja: '令和7年度に秋田県内で狩猟をされる皆さまへ', en: 'To hunters in Akita Prefecture, 2025 season' },
    publisher: { ja: '秋田県', en: 'Akita Prefecture' },
    url: 'https://www.pref.akita.lg.jp/pages/archive/84844',
  },
  'mo-bow-when': {
    id: 'mo-bow-when',
    region: 'na',
    title: { ja: 'When to Begin Recovery', en: 'When to Begin Recovery' },
    publisher: {
      ja: 'Missouri Bowhunter Safety Course（米国ミズーリ州保全局と NBEF の弓猟講習教材）',
      en: 'Missouri Bowhunter Safety Course (Missouri Department of Conservation with NBEF)',
    },
    url: 'https://www.bowhunter-ed.com/missouri/studyGuide/When-to-Begin-Recovery/301025_12036/',
  },
  'mo-bow-blood': {
    id: 'mo-bow-blood',
    region: 'na',
    title: { ja: 'Trailing Game and Blood Sign', en: 'Trailing Game and Blood Sign' },
    publisher: {
      ja: 'Missouri Bowhunter Safety Course（米国ミズーリ州保全局と NBEF の弓猟講習教材）',
      en: 'Missouri Bowhunter Safety Course (Missouri Department of Conservation with NBEF)',
    },
    url: 'https://www.bowhunter-ed.com/missouri/studyGuide/Trailing-Game-and-Blood-Sign/301025_12037/',
  },
  'mo-bow-approach': {
    id: 'mo-bow-approach',
    region: 'na',
    title: { ja: 'Approaching Downed Game', en: 'Approaching Downed Game' },
    publisher: {
      ja: 'Missouri Bowhunter Safety Course（米国ミズーリ州保全局と NBEF の弓猟講習教材）',
      en: 'Missouri Bowhunter Safety Course (Missouri Department of Conservation with NBEF)',
    },
    url: 'https://www.bowhunter-ed.com/missouri/studyGuide/Approaching-Downed-Game/301025_12042/',
  },
  'mo-bow-lost': {
    id: 'mo-bow-lost',
    region: 'na',
    title: { ja: 'Lost Sign', en: 'Lost Sign' },
    publisher: {
      ja: 'Missouri Bowhunter Safety Course（米国ミズーリ州保全局と NBEF の弓猟講習教材）',
      en: 'Missouri Bowhunter Safety Course (Missouri Department of Conservation with NBEF)',
    },
    url: 'https://www.bowhunter-ed.com/missouri/studyGuide/Lost-Sign/301025_12039/',
  },
  'mo-hunter-trailing': {
    id: 'mo-hunter-trailing',
    region: 'na',
    title: { ja: 'Trailing Wounded Game', en: 'Trailing Wounded Game' },
    publisher: {
      ja: 'Missouri Hunter Safety Course（米国ミズーリ州保全局の狩猟講習教材）',
      en: 'Missouri Hunter Safety Course (Missouri Department of Conservation)',
    },
    url: 'https://www.hunter-ed.com/missouri/studyGuide/Trailing-Wounded-Game/20202501_86189/',
  },
  'mo-hunter-approach': {
    id: 'mo-hunter-approach',
    region: 'na',
    title: { ja: 'Approaching Downed Game', en: 'Approaching Downed Game' },
    publisher: {
      ja: 'Missouri Hunter Safety Course（米国ミズーリ州保全局の狩猟講習教材）',
      en: 'Missouri Hunter Safety Course (Missouri Department of Conservation)',
    },
    url: 'https://www.hunter-ed.com/missouri/studyGuide/Approaching-Downed-Game/20202501_86190/',
  },
  'mdc-basics': {
    id: 'mdc-basics',
    region: 'na',
    title: { ja: 'Deer Hunting Basics（2001年10月号、保存記事）', en: 'Deer Hunting Basics (October 2001, archived)' },
    publisher: {
      ja: 'Missouri Conservationist（米国ミズーリ州保全局）',
      en: 'Missouri Conservationist (Missouri Department of Conservation)',
    },
    url: 'https://mdc.mo.gov/magazines/conservationist/2001-10/deer-hunting-basics',
  },
  agfc: {
    id: 'agfc',
    region: 'na',
    title: {
      ja: 'Arkansas tracking group recovers deer, memories',
      en: 'Arkansas tracking group recovers deer, memories',
    },
    publisher: {
      ja: 'Arkansas Game and Fish Commission（米国アーカンソー州）',
      en: 'Arkansas Game and Fish Commission',
    },
    url: 'https://www.agfc.com/news/arkansas-tracking-group-recovers-deer-memories/',
  },
  'va-dwr': {
    id: 'va-dwr',
    region: 'na',
    title: {
      ja: 'Wisdom from Richard P. Smith’s Book “Tracking Wounded Deer”',
      en: 'Wisdom from Richard P. Smith’s Book “Tracking Wounded Deer”',
    },
    publisher: {
      ja: 'Virginia Department of Wildlife Resources（米国バージニア州、協会誌からの転載）',
      en: 'Virginia Department of Wildlife Resources (reprinted from an association magazine)',
    },
    url: 'https://dwr.virginia.gov/blog/wisdom-from-richard-p-smiths-book-tracking-wounded-deer/',
  },
};

export type FindingId =
  | 'arterial'
  | 'venous'
  | 'lung'
  | 'intestine'
  | 'not-for-food'
  | 'pass-through'
  | 'hit-sign'
  | 'hair-exit'
  | 'not-a-miss'
  | 'approach';

export interface Finding {
  id: FindingId;
  text: Text;
  sourceIds: readonly SourceId[];
}

const findingTexts: Record<FindingId, Omit<Finding, 'id'>> = {
  arterial: {
    text: {
      ja: '鮮やかな赤い血は、動脈からの出血を示すとされています。',
      en: 'Bright red blood is taught as arterial bleeding.',
    },
    sourceIds: ['mo-bow-blood'],
  },
  venous: {
    text: {
      ja: '暗い色の血は、静脈からの出血を示すとされています。',
      en: 'Darker blood is taught as venous bleeding.',
    },
    sourceIds: ['mo-bow-blood'],
  },
  lung: {
    text: {
      ja: '泡が混じる血は、肺に当たった可能性を示すとされています。',
      en: 'Frothy blood can indicate a lung hit.',
    },
    sourceIds: ['mo-bow-blood'],
  },
  intestine: {
    text: {
      ja: '緑がかった液、脂、透明な液は、腸に当たった可能性を示すとされています。',
      en: 'Greenish or clear fluid, or tallow, can indicate an intestinal hit.',
    },
    sourceIds: ['mo-bow-blood'],
  },
  'not-for-food': {
    text: {
      ja: '厚生労働省の指針は、腹部に着弾した個体を食用に供さないこととしています。',
      en: 'The Japanese hygiene guidelines say an animal hit in the abdomen is not to be used for food.',
    },
    sourceIds: ['mhlw'],
  },
  'pass-through': {
    text: {
      ja: '足跡の両側に血があれば、貫通していることを示すとされています（弓猟の教材）。',
      en: 'Blood on both sides of the trail indicates complete penetration (bowhunting course).',
    },
    sourceIds: ['mo-bow-blood'],
  },
  'hit-sign': {
    text: {
      ja: '毛・肉片・骨片は、被弾を示す痕跡として挙げられています。',
      en: 'Hair, meat and bone fragments are listed among the signs of a hit.',
    },
    sourceIds: ['mo-hunter-trailing'],
  },
  'hair-exit': {
    text: {
      ja: '毛は射入口より射出口から多く出ることがあり、毛の部位だけで当たった位置を決めると誤ることがあります。',
      en: 'An exit wound often yields more hair than the entry, so hair alone can point to the wrong place.',
    },
    sourceIds: ['va-dwr'],
  },
  'not-a-miss': {
    text: {
      ja: '血が見えなくても外れたとは限りません。致命傷でも体外に出血しないことがあり、外れたと決める前に地面と足跡を調べるよう教えられています。',
      en: 'No blood does not mean a miss. A fatally hit deer does not always bleed externally, and hunters are taught to search the ground and trail before assuming a miss.',
    },
    sourceIds: ['mo-hunter-trailing', 'va-dwr'],
  },
  approach: {
    text: {
      ja: '倒れた個体には上側かつ頭の後方から慎重に近づき、死んでいるように見えても少し離れた場所で数分待って胸の上下の動きを確かめるよう教えられています。',
      en: 'Approach a downed animal carefully from above and behind the head; if it appears dead, wait a short distance away for a few minutes and watch for the chest rising and falling.',
    },
    sourceIds: ['mo-hunter-approach', 'mo-bow-approach'],
  },
};

const cueFindings: Record<CueId, readonly FindingId[]> = {
  'bright-red': ['arterial'],
  'dark-red': ['venous'],
  frothy: ['lung'],
  'gut-fluid': ['intestine'],
  'both-sides': ['pass-through'],
  'hair-bone': ['hit-sign', 'hair-exit'],
  'no-blood': ['not-a-miss'],
  // Shown by the client as its lead answer instead, beside the exception to the wait.
  'down-in-sight': ['approach'],
};

/** Which part the sources' guidance is keyed to. The sign read on the ground outranks the belief at the shot. */
export type HitClass = 'gut' | 'chest' | 'outside-cavity' | 'unsure';

export function classifyHit(impression: Impression, cues: readonly CueId[]): HitClass {
  // A sign of the gut sets the longest wait, so it wins over any sign of the chest seen with it.
  if (impression === 'gut' || cues.includes('gut-fluid')) return 'gut';
  if (impression === 'chest' || cues.includes('frothy')) return 'chest';
  if (impression === 'outside-cavity') return 'outside-cavity';
  return 'unsure';
}

export function findingsFor(impression: Impression, cues: readonly CueId[]): Finding[] {
  const ids: FindingId[] = [];
  for (const cue of cues) for (const id of cueFindings[cue]) if (!ids.includes(id)) ids.push(id);
  if (classifyHit(impression, cues) === 'gut' && !ids.includes('not-for-food')) ids.push('not-for-food');
  return ids.map((id) => ({ id, ...findingTexts[id] }));
}

export interface WaitGuide {
  sourceId: SourceId;
  /** What the source teaches for: a bow, a firearm, or deer hunting in general. */
  context: 'bow' | 'firearm' | 'general';
  minMinutes: number;
  /** `null` for "or more". */
  maxMinutes: number | null;
  text: Text;
}

const firearmDefault: WaitGuide = {
  sourceId: 'mo-hunter-trailing',
  context: 'firearm',
  minMinutes: 30,
  maxMinutes: 60,
  text: {
    ja: '倒れた個体が見えている場合を除き、追跡まで少なくとも30分〜1時間待つ。',
    en: 'Wait at least half an hour to an hour before trailing, unless the downed deer is in sight.',
  },
};

const mdcMissedVitals: WaitGuide = {
  sourceId: 'mdc-basics',
  context: 'general',
  minMinutes: 60,
  maxMinutes: null,
  text: {
    ja: '急所を外したかもしれないと思うときは1時間以上待つ。手負いの個体は伏せることが多いが、追い立てると動き続ける。',
    en: 'If you think you may have missed the vital area, wait an hour or more. A wounded deer tends to lie down, but keeps moving if pressured.',
  },
};

const waitGuides: Record<HitClass, readonly WaitGuide[]> = {
  chest: [
    {
      sourceId: 'mo-bow-when',
      context: 'bow',
      minMinutes: 20,
      maxMinutes: 30,
      text: {
        ja: '矢が胸に深く入ったと見えるときは20〜30分待ち、それから慎重に追う。',
        en: 'If the arrow appears to have penetrated deep into the chest, wait 20 to 30 minutes, then follow carefully.',
      },
    },
    {
      sourceId: 'mdc-basics',
      context: 'general',
      minMinutes: 15,
      maxMinutes: null,
      text: {
        ja: '良い位置に当たった確信があるほど待ち時間は短くてよいが、少なくとも15分は待つ。',
        en: 'The surer you are of a good shot, the less you need to wait, but wait at least 15 minutes.',
      },
    },
    firearmDefault,
  ],
  gut: [
    {
      sourceId: 'mo-bow-when',
      context: 'bow',
      minMinutes: 360,
      maxMinutes: null,
      text: {
        ja: '腸に当たった兆候があれば、矢を拾いに行くほども追わずに引き返し、雨・雪・暗さで跡が消えそうでも6時間以上待つ。',
        en: 'With signs of a gut hit, back off without following even to the arrow, and wait six hours or more even if rain, snow or darkness threatens the trail.',
      },
    },
    mdcMissedVitals,
    firearmDefault,
  ],
  'outside-cavity': [
    {
      sourceId: 'mo-bow-when',
      context: 'bow',
      minMinutes: 0,
      maxMinutes: 0,
      text: {
        ja: '首・脚・尻・背など体腔の外に当たったと確信でき、開けた地形・追跡できる雪・十分な血痕がそろうときは、すぐに追って止まらせないほうがよい。',
        en: 'For a hit outside the body cavity (neck, leg, rump or back), when you are certain of it and the conditions are right — open terrain, tracking snow or a good initial blood trail — take up the trail at once and push the animal.',
      },
    },
    mdcMissedVitals,
    firearmDefault,
  ],
  unsure: [
    {
      sourceId: 'mo-bow-when',
      context: 'bow',
      minMinutes: 30,
      maxMinutes: 60,
      text: {
        ja: 'どこに当たったか分からないときは、30〜60分待ってから慎重に追う。',
        en: 'When in doubt about where you hit, wait 30 to 60 minutes and then start trailing carefully.',
      },
    },
    mdcMissedVitals,
    firearmDefault,
  ],
};

export interface WaitAdvice {
  hitClass: HitClass;
  guides: readonly WaitGuide[];
  /** The longest of the sources' minimum waits: the start that none of them would call early. */
  longestMinimum: number;
  /** The shortest minimum any of them gives, so the spread between the sources is visible. */
  shortestMinimum: number;
  /**
   * The firearm course sets its wait aside when the downed animal is in sight, so the waits are then
   * shown only for the case where it drops out of view, and the approach comes first.
   */
  downInSight: boolean;
}

export function waitAdvice(impression: Impression, cues: readonly CueId[]): WaitAdvice {
  const hitClass = classifyHit(impression, cues);
  const guides = waitGuides[hitClass];
  const minimums = guides.map((guide) => guide.minMinutes);
  return {
    hitClass,
    guides,
    longestMinimum: Math.max(...minimums),
    shortestMinimum: Math.min(...minimums),
    downInSight: cues.includes('down-in-sight'),
  };
}

/** Minutes since 1970 for a local wall-clock time, read as if it were UTC so no zone shifts it. */
function wallMinutes(local: string): number | null {
  const ms = localDateTimeMs(local);
  return ms === null ? null : ms / 60000;
}

function formatWall(minutes: number): string {
  const date = new Date(minutes * 60000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** A local time plus some minutes, as a local time again. `null` for a time that cannot be read. */
export function addMinutes(local: string, minutes: number): string | null {
  const start = wallMinutes(local);
  if (start === null || !Number.isFinite(minutes)) return null;
  return formatWall(start + minutes);
}

/** Whole minutes from one local time to another; negative when `to` is earlier. */
export function minutesBetween(from: string, to: string): number | null {
  const a = wallMinutes(from);
  const b = wallMinutes(to);
  return a === null || b === null ? null : b - a;
}

/** The device's clock, written the way a `datetime-local` field writes it. */
export function toLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** IUGG mean Earth radius. Over a trail of a few hundred metres the sphere is far inside GPS error. */
export const EARTH_RADIUS_METERS = 6371008.8;

export function distanceMeters(a: Position, b: Position): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Entries in time order; entries at the same minute keep the order they were written in. */
export function sortEntries(entries: readonly TrailEntry[]): TrailEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.at === b.entry.at ? a.index - b.index : a.entry.at < b.entry.at ? -1 : 1))
    .map(({ entry }) => entry);
}

/**
 * Straight-line distance from the shot site to each entry that carries a position. The shot site is
 * the earliest `shot-site` entry with a position; without one there is nothing to measure from.
 */
export function distancesFromShotSite(entries: readonly TrailEntry[]): Map<string, number> {
  const ordered = sortEntries(entries);
  const origin = ordered.find((entry) => entry.kind === 'shot-site' && entry.position !== null);
  const result = new Map<string, number>();
  if (!origin?.position) return result;
  for (const entry of ordered)
    if (entry.position && entry.id !== origin.id) result.set(entry.id, distanceMeters(origin.position, entry.position));
  return result;
}
