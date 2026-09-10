// SPDX-License-Identifier: MIT
import type { DocumentRecord, NavigationGroup } from './model';

const featured = [
  ['/', 'マニュアルの入口'],
  ['/getting-started/', '導入と接続'],
  ['/documents/', '文書一覧'],
  ['/lane/', 'Lane 操作ガイド'],
  ['/director/', 'Director 操作ガイド'],
  ['/director/operations/', 'Director 運用ガイド'],
  ['/director/results/', 'Director 成績・データ保管ガイド'],
  ['/common/glossary/', '用語集'],
] as const;

export function createNavigation(documents: DocumentRecord[]): NavigationGroup[] {
  const guides = new Set<string>(featured.map(([href]) => href));
  const groups: NavigationGroup[] = [
    { title: '操作マニュアル', items: featured.map(([href, title]) => ({ href, title })) },
    { title: '管理・技術資料', items: [] },
    { title: '機器の受信互換仕様', items: [] },
    { title: 'この文書について', items: [] },
  ];
  for (const doc of documents) {
    if (guides.has(doc.href)) continue;
    const group = doc.sourcePath.includes('/devices/')
      ? groups[2]
      : doc.sourcePath.includes('/')
        ? groups[1]
        : groups[3];
    group?.items.push({ href: doc.href, title: doc.title });
  }
  return groups;
}
