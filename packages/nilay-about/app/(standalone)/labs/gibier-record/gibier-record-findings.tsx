'use client';

import { useState } from 'react';

import { ConditionSection, SegmentedControl } from '@/components/labs';
import {
  GIBIER_ATLAS_SOURCE,
  GIBIER_DISCARD_RULES,
  GIBIER_FINDING_ACTION_LABELS,
  GIBIER_FINDING_STAGES,
  GIBIER_FINDINGS_CHECKED_ON,
  gibierFindingsFor,
  type GibierFindingStage,
} from '@/lib/gibier-findings';
import type { GibierSpecies } from '@/lib/schemas/gibier-record';

type Filter = 'deer' | 'boar' | 'all';

const SPECIES_LABEL = { deer: 'シカ', boar: 'イノシシ', both: 'シカ・イノシシ' } as const;

/**
 * The colour atlas's findings, stage by stage, for the species on the record. The eleven checks on
 * the form are what the record answers; this is what to look for, and what the source says to do.
 */
export function GibierFindingsGuide({ species }: { species: GibierSpecies }) {
  const [chosen, setChosen] = useState<Filter | null>(null);
  // One stage at a time: the guide is read at the carcass, a step after another.
  const [stageId, setStageId] = useState<GibierFindingStage>('capture');
  const filter: Filter = chosen ?? (species === 'deer' || species === 'boar' ? species : 'all');
  const stage = GIBIER_FINDING_STAGES.find((item) => item.id === stageId)!;
  const findings = gibierFindingsFor(stageId, filter);
  return (
    <ConditionSection
      id="findings"
      title="異常の見分け方"
      summary={`厚生労働省のカラーアトラスとガイドライン（${GIBIER_FINDINGS_CHECKED_ON} 確認）`}
    >
      <div className="space-y-4 text-sm">
        <SegmentedControl
          legend="獣種"
          orientation="inline"
          value={filter}
          onChange={(value) => setChosen(value as Filter)}
          options={[
            { value: 'all', label: 'すべて' },
            { value: 'deer', label: 'シカ' },
            { value: 'boar', label: 'イノシシ' },
          ]}
        />
        <p className="text-on-surface-variant">
          ガイドラインは「食用として問題がないと判断できない疑わしいものは廃棄することを前提」としています（第 1 の
          1（2））。
        </p>
        <SegmentedControl
          legend="段階"
          value={stageId}
          onChange={(value) => setStageId(value as GibierFindingStage)}
          options={GIBIER_FINDING_STAGES.map((item) => ({ value: item.id, label: item.title }))}
        />
        <section aria-labelledby="findings-stage" className="space-y-2">
          <h3 id="findings-stage" className="text-base font-medium">
            {stage.title}（{findings.length} 件）
          </h3>
          <ul className="space-y-2">
            {findings.map((finding) => (
              <li
                key={`${finding.site}-${finding.sign}`}
                className="space-y-1 rounded-sm border border-outline-variant p-3"
              >
                <p>
                  <span className="font-medium">{finding.site}</span>
                  <span className="text-on-surface-variant">（{SPECIES_LABEL[finding.species]}）</span>
                </p>
                <p>{finding.sign}</p>
                {finding.cause && <p className="text-on-surface-variant">考えられる原因：{finding.cause}</p>}
                {finding.actions.length > 0 && (
                  <p className="font-medium text-destructive">
                    {finding.actions.map((action) => GIBIER_FINDING_ACTION_LABELS[action]).join('、')}
                  </p>
                )}
                {finding.zoonosis && <p className="text-destructive">人にも感染する病気です（カラーアトラス）。</p>}
                {finding.note && <p className="text-xs text-on-surface-variant">{finding.note}</p>}
                <p className="text-xs text-on-surface-variant">出典：{finding.where}</p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="findings-rules" className="space-y-2">
          <h3 id="findings-rules" className="text-base font-medium">
            廃棄の判断（カラーアトラス p.4）
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-on-surface-variant">
            {GIBIER_DISCARD_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="text-on-surface-variant">
            屋外で内臓を摘出した場合も、胃・腸以外の内臓は個体と一緒に必ず食肉処理施設へ搬入します（カラーアトラス
            p.10・p.26、ガイドライン 第 2 の 4（7））。廃棄した部位と原因は記録に残します（ガイドライン 第 4 の 4）。
          </p>
        </section>
        <p>
          <a href={GIBIER_ATLAS_SOURCE.url} target="_blank" rel="noreferrer" className="underline">
            {GIBIER_ATLAS_SOURCE.name}
          </a>
          <span className="text-on-surface-variant">
            　{GIBIER_ATLAS_SOURCE.note}。所見の写真は原本で確認してください。
          </span>
        </p>
      </div>
    </ConditionSection>
  );
}
