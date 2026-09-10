// SPDX-License-Identifier: MIT
import { MaterialExample } from '@/features/reference/material';
import { pageMetadata } from '@/shared/config/metadata';
import { BackLink, PageHeader } from '@/shared/ui/panels';

export const metadata = pageMetadata('Material UI', 'Emotion と App Router の統合例', '/reference/material/');
export default function Page() {
  return (
    <main id="main-content" className="min-w-0">
      <PageHeader title="Material UI" description="Material UI を利用する画面の例です。" />
      <MaterialExample />
      <BackLink href="/reference/">コンポーネントに戻る</BackLink>
    </main>
  );
}
