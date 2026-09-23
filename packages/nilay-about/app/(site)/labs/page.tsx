import { JsonLd } from '@/components/json-ld';
import { labsTools } from '@/lib/labs-tools';
import { labsIndexJsonLd, pageMetadata } from '@/lib/seo';

import { LabsIndex } from './labs-index';

export const metadata = pageMetadata({
  title: 'Labs：狩猟・射撃の無料ツール',
  description:
    '狩猟鳥獣の判別練習、法令テスト、弾道計算、スコープのクリック数計算、散弾パターンの測定、銃猟可能時間、くくりわなの規格ゲージ、ジビエの記録票など、狩猟と射撃のための無料ツール。登録不要でブラウザーで使えます。',
  path: '/labs',
});

export default function LabsPage() {
  return (
    <>
      <JsonLd data={labsIndexJsonLd(labsTools)} />
      <LabsIndex />
    </>
  );
}
