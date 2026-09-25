'use client';

import type { LicenceType, StudyArea, StudyExam, StudyQuestion } from '@/lib/license-exam';
import type { Language } from '@/store';

import { STUDY_SOURCES } from './sources';

type Text = { ja: string; en: string };

export const examLabels: Record<StudyExam, Text> = {
  hunting: { ja: '狩猟免許試験（知識試験）', en: 'Hunting licence exam (knowledge test)' },
  course: { ja: '猟銃等講習会の考査', en: 'Firearms course test' },
};

export const licenceLabels: Record<LicenceType, Text> = {
  net: { ja: '網猟', en: 'Nets' },
  trap: { ja: 'わな猟', en: 'Traps' },
  gun1: { ja: '第一種銃猟', en: 'Class 1 guns' },
  gun2: { ja: '第二種銃猟', en: 'Class 2 (air guns)' },
};

export const areaLabels: Record<StudyArea, Text> = {
  law: { ja: '法令', en: 'Law' },
  gear: { ja: '猟具', en: 'Gear' },
  wildlife: { ja: '鳥獣', en: 'Wildlife' },
  management: { ja: '鳥獣の保護及び管理', en: 'Wildlife management' },
  responsibility: { ja: '所持者の社会的責任', en: 'Owner responsibility' },
  prohibition: { ja: '所持の禁止と除外事由', en: 'Ban on possession' },
  permit: { ja: '所持許可制度', en: 'Permits' },
  renewal: { ja: '許可の更新', en: 'Renewal' },
  expiry: { ja: '許可の失効', en: 'Lapse of a permit' },
  revocation: { ja: '指示と許可の取消し', en: 'Orders and revocation' },
  duties: { ja: '所持者の遵守事項', en: 'Owner duties' },
  powderAndHunting: { ja: '火薬類・狩猟の法令', en: 'Powder and hunting law' },
  mindset: { ja: '社会的責任を果たすために', en: 'Responsible use' },
  gunTypes: { ja: '銃の種類', en: 'Types of gun' },
  mechanism: { ja: '撃発機構と安全装置', en: 'Firing mechanism and safety' },
  power: { ja: '銃の威力と危険範囲', en: 'Power and danger range' },
  handling: { ja: '基本的な取扱い', en: 'Basic handling' },
  beforeUse: { ja: '使用前の注意', en: 'Before use' },
  storage: { ja: '銃の保管', en: 'Storing guns' },
  cartridges: { ja: '実包の運搬と保管', en: 'Carrying and storing cartridges' },
};

export const label = (text: Text, language: Language) => (language === 'ja' ? text.ja : text.en);

/** Where a question's answer comes from, in Japanese, each document linked. */
export function SourceLine({ question, language }: { question: StudyQuestion; language: Language }) {
  return (
    <p className="text-xs text-on-surface-variant">
      {language === 'ja' ? '根拠' : 'Source'}:{' '}
      {question.sources.map((source, index) => {
        const reference = STUDY_SOURCES[source.doc];
        return (
          <span key={`${source.doc}-${source.locator}`} lang="ja">
            {index > 0 && '、'}
            {reference.short} {source.locator}（
            <a href={reference.url} target="_blank" rel="noreferrer" className="underline">
              {reference.name}
            </a>
            ）
          </span>
        );
      })}
    </p>
  );
}
