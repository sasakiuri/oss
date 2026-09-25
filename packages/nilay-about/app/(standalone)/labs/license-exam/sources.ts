import type { StudySourceKey } from '@/lib/license-exam';

/** The day the documents below were read. Shown on screen, because rules and guidance change. */
export const STUDY_SOURCES_CHECKED_ON = '2026-09-24';

export interface StudySourceReference {
  /** The title as the publisher gives it. */
  name: string;
  /** How an explanation refers to it. */
  short: string;
  publisher: string;
  url: string;
  /** The edition or revision that was read. */
  version: string;
}

/**
 * Every document a question, a mock exam figure or a scene rests on. Each is published by the
 * body that sets or applies the rule: the statute and its regulation on e-Gov, the police circular
 * that sets the course test, the Ministry of the Environment's guidance, and the prefectures that
 * run the licence exam. Nothing is taken from a textbook, a question book or another study site.
 */
export const STUDY_SOURCES = {
  act: {
    name: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律',
    short: '法',
    publisher: 'e-Gov 法令検索',
    url: 'https://laws.e-gov.go.jp/law/414AC0000000088',
    version: '令和八年法律第二十二号による改正（令和八年七月一日施行）',
  },
  regulation: {
    name: '鳥獣の保護及び管理並びに狩猟の適正化に関する法律施行規則',
    short: '規則',
    publisher: 'e-Gov 法令検索',
    url: 'https://laws.e-gov.go.jp/law/414M60001000028',
    version: '令和八年環境省令第十九号による改正（令和八年七月一日施行）',
  },
  npaCourse: {
    name: '猟銃等又はクロスボウ講習会における考査の運用要領について（通達）',
    short: '考査の運用要領',
    publisher: '警察庁生活安全局保安課',
    url: 'https://www.npa.go.jp/laws/notification/seian/hoan/hoantsutatu2/R071128_jyu_kousanojishi.pdf',
    version: '令和7年11月28日 警察庁丁保発第224号',
  },
  moeEmergency: {
    name: '緊急銃猟ガイドライン',
    short: '緊急銃猟ガイドライン',
    publisher: '環境省 自然環境局 野生生物課 鳥獣保護管理室',
    url: 'https://www.env.go.jp/nature/choju/effort/effort15/doc/guideline.pdf',
    version: '令和8年4月改訂',
  },
  moeCapture: {
    name: '認定鳥獣捕獲等事業者 講習テキスト（安全管理講習・技能知識講習）',
    short: '認定事業者講習テキスト',
    publisher: '環境省 自然環境局 野生生物課 鳥獣保護管理室',
    url: 'https://www.env.go.jp/nature/choju/capture/pdf/pdf2-1.pdf',
    version: '第14版（2026年1月）',
  },
  hokkaidoDeer: {
    name: 'エゾシカ利活用のための捕獲・運搬テキスト',
    short: '北海道 捕獲・運搬テキスト',
    publisher: '北海道',
    url: 'https://www.pref.hokkaido.lg.jp/fs/4/7/7/8/5/3/1/_/hokaku_unpan.pdf',
    version: '2020年3月',
  },
  kochiExam: {
    name: '狩猟免許試験の試験内容について',
    short: '高知県の案内',
    publisher: '高知県',
    url: 'https://www.pref.kochi.lg.jp/doc/sikennaiyo/',
    version: '2024年6月28日更新',
  },
  tokyoExam: {
    name: '狩猟免許試験について',
    short: '東京都の案内',
    publisher: '東京都環境局',
    url: 'https://www.kankyo.metro.tokyo.lg.jp/nature/animals_plants/birds/hunting_license/test',
    version: '2026年9月14日更新',
  },
} as const satisfies Record<StudySourceKey, StudySourceReference>;
