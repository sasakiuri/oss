'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';
import { quizList } from '@/features/game-species/quiz-data';
import type { Language } from '@/store';

type Filter = 'all' | 'incorrect' | 'ungraded';
export function SessionResults({
  order,
  answers,
  language,
  onReview,
}: {
  order: string[];
  answers: Record<string, boolean>;
  language: Language;
  onReview: (selected: string[]) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState(() => order.filter((id) => answers[id] !== true));
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const visible = order.filter(
    (id) => filter === 'all' || (filter === 'incorrect' ? answers[id] === false : answers[id] === undefined),
  );
  return (
    <div className="space-y-4 border-t border-outline-variant pt-5">
      <h3 className="font-medium">{t('今回の回答', 'This session')}</h3>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('回答の絞り込み', 'Filter answers')}>
        {(
          [
            ['all', t('すべて', 'All')],
            ['incorrect', t('要復習', 'To review')],
            ['ungraded', t('未採点', 'Not graded')],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? 'secondary' : 'ghost'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={!visible.length}
          onClick={() => setSelected([...new Set([...selected, ...visible])])}
        >
          {t('表示中を選択', 'Select shown')}
        </Button>
        <Button variant="ghost" disabled={!selected.length} onClick={() => setSelected([])}>
          {t('選択を解除', 'Clear selection')}
        </Button>
      </div>
      <ul className="divide-y divide-outline-variant border-y border-outline-variant">
        {visible.map((id) => (
          <li key={id}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={(e) =>
                  setSelected(e.target.checked ? [...selected, id] : selected.filter((item) => item !== id))
                }
              />
              <span className="min-w-0 flex-1" lang="ja">
                {quizList.find((quiz) => quiz.image === id)?.answer}
              </span>
              <span className="shrink-0 text-sm text-on-surface-variant">
                {answers[id] === undefined
                  ? t('未採点', 'Not graded')
                  : answers[id]
                    ? t('わかった', 'Knew it')
                    : t('要復習', 'To review')}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!visible.length && (
        <p className="text-sm text-on-surface-variant">{t('該当する鳥獣はありません。', 'No species match.')}</p>
      )}
      <Button disabled={!selected.length} onClick={() => onReview(selected)}>
        {t(`選んだ ${selected.length} 問を復習`, `Review ${selected.length} selected`)}
      </Button>
    </div>
  );
}
