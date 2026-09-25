'use client';

import Image from 'next/image';

import { nonGameList } from '@/features/game-species/non-game';
import { quizList } from '@/features/game-species/quiz-data';
import type { Language } from '@/store';

/** Each non-game species beside the game species it is set against, photo by photo. */
export function CompareList({ language }: { language: Language }) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const pairs = nonGameList.flatMap((item) => {
    const game = quizList.find((quiz) => quiz.answer === item.lookalike);
    return game ? [{ item, game }] : [];
  });
  const figure = (image: string, name: string, game: boolean) => (
    <figure className="min-w-0 flex-1 space-y-1">
      <Image
        src={image}
        alt={name}
        width={200}
        height={200}
        className="aspect-square w-full rounded-sm bg-surface-container object-cover"
      />
      <figcaption className="text-sm">
        <span className="block font-medium" lang="ja">
          {name}
        </span>
        <span className={game ? 'text-primary' : 'text-destructive'}>
          {game ? t('狩猟鳥獣', 'Game species') : t('非狩猟鳥獣', 'Not a game species')}
        </span>
      </figcaption>
    </figure>
  );
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {pairs.map(({ item, game }) => (
        <li key={item.image} className="flex gap-3 rounded-md border border-outline-variant p-3">
          {figure(game.image, game.answer, true)}
          {figure(item.image, item.name, false)}
        </li>
      ))}
    </ul>
  );
}
