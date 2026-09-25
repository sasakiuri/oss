import { JsonLd } from '@/components/json-ld';
import { LabsOfflineSupport } from '@/components/labs/offline-support';
import { labsTools } from '@/lib/labs-tools';
import { labsIndexJsonLd, pageMetadata } from '@/lib/seo';

import { LabsIndex } from './labs-index';

export const metadata = pageMetadata({
  title: 'Labs：狩猟・射撃の無料ツール',
  description: '狩猟・射撃の計算、試験の練習、出猟や捕獲の記録。利用登録なしでブラウザーから使えます。',
  path: '/labs',
});

export default function LabsPage() {
  return (
    <>
      <JsonLd data={labsIndexJsonLd(labsTools)} />
      <LabsOfflineSupport />
      <LabsIndex />
    </>
  );
}
