import { pageMetadata } from '@/lib/seo';

import { LabsDataClient } from './data-client';

export const metadata = pageMetadata({
  title: 'Labs のデータの書き出し・読み込み',
  description:
    'Labs のツールがブラウザーに保存した入力・記録・写真を JSON ファイルに書き出し、別の端末やブラウザーで読み込んで元に戻せます。',
  path: '/labs/data',
});

export default function LabsDataPage() {
  return <LabsDataClient />;
}
