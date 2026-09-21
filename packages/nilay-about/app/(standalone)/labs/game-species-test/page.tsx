import type { Metadata } from 'next';

import { GameSpeciesTestClient } from '@/features/game-species/game-species-test-client';

export const metadata: Metadata = {
  title: '狩猟鳥獣スライドショー',
  description: '狩猟鳥獣の画像と名前をスライドショーでご覧いただけます。',
};

export default function GameSpeciesTestPage() {
  return <GameSpeciesTestClient />;
}
