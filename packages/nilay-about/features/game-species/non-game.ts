import type { Quiz } from './quiz-data';

/**
 * Wild birds and mammals that are not game species (they are not in 規則別表第二) and can be
 * mistaken for one. The identification test of the hunting licence exam shows non-game species as
 * well and asks first whether each may be hunted.
 *
 * `lookalike` names the game species it is set beside in the comparison list. The photos are from
 * Wikimedia Commons under CC0, public domain or CC BY; README.md credits each one.
 */
export interface NonGame {
  image: string;
  name: string;
  category: Quiz['category'];
  lookalike?: string;
}

export const nonGameList: NonGame[] = [
  { image: '/images/game-species/501_001.jpg', name: 'オシドリ', category: 'birds', lookalike: 'マガモ' },
  { image: '/images/game-species/502_001.jpg', name: 'トモエガモ', category: 'birds', lookalike: 'コガモ' },
  { image: '/images/game-species/503_001.jpg', name: 'アカハジロ', category: 'birds', lookalike: 'ホシハジロ' },
  { image: '/images/game-species/504_001.jpg', name: 'ホオジロガモ', category: 'birds', lookalike: 'キンクロハジロ' },
  { image: '/images/game-species/505_001.jpg', name: 'ミコアイサ', category: 'birds', lookalike: 'スズガモ' },
  { image: '/images/game-species/506_001.jpg', name: 'カワアイサ', category: 'birds', lookalike: 'マガモ' },
  { image: '/images/game-species/507_001.jpg', name: 'マガン', category: 'birds', lookalike: 'カルガモ' },
  { image: '/images/game-species/508_001.jpg', name: 'オオバン', category: 'birds', lookalike: 'クロガモ' },
  { image: '/images/game-species/509_001.jpg', name: 'バン', category: 'birds' },
  { image: '/images/game-species/510_001.jpg', name: 'ゴイサギ', category: 'birds' },
  { image: '/images/game-species/511_001.jpg', name: 'ウミウ', category: 'birds', lookalike: 'カワウ' },
  { image: '/images/game-species/512_001.jpg', name: 'ライチョウ', category: 'birds', lookalike: 'エゾライチョウ' },
  { image: '/images/game-species/513_001.jpg', name: 'ウズラ', category: 'birds', lookalike: 'コジュケイ' },
  { image: '/images/game-species/514_001.jpg', name: 'アオバト', category: 'birds', lookalike: 'キジバト' },
  { image: '/images/game-species/515_001.jpg', name: 'カワラバト（ドバト）', category: 'birds', lookalike: 'キジバト' },
  { image: '/images/game-species/517_001.jpg', name: 'ツグミ', category: 'birds', lookalike: 'ムクドリ' },
  { image: '/images/game-species/518_001.jpg', name: 'ホオジロ', category: 'birds', lookalike: 'スズメ' },
  { image: '/images/game-species/519_001.jpg', name: 'コクマルガラス', category: 'birds', lookalike: 'ミヤマガラス' },
  { image: '/images/game-species/520_001.jpg', name: 'オオジシギ', category: 'birds', lookalike: 'タシギ' },
  { image: '/images/game-species/521_001.jpg', name: 'イソヒヨドリ', category: 'birds', lookalike: 'ヒヨドリ' },
  { image: '/images/game-species/601_001.jpg', name: 'ニホンカモシカ', category: 'mammals', lookalike: 'ニホンジカ' },
  { image: '/images/game-species/602_001.jpg', name: 'ニホンリス', category: 'mammals', lookalike: 'タイワンリス' },
  { image: '/images/game-species/604_001.jpg', name: 'ニホンザル', category: 'mammals' },
];
