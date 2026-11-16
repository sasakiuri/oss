// SPDX-License-Identifier: MIT
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { parseDocument } from '@/entities/document/parse';
import { DocumentMarkdown } from '@/features/reading/markdown';

// Links to repository files and soft line breaks depend on the deployment environment.
vi.hoisted(() => {
  vi.stubEnv('DOCS_SOURCE_REF', '1.x');
  vi.stubEnv('DOCS_SOFT_BREAKS', '0');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// Each document combines the constructs one kind of manual uses. The golden files pin the complete sanitized HTML so
// that changes to the reading pipeline show every difference in rendered output.
const documents: ReadonlyArray<readonly [name: string, sourcePath: string, source: string]> = [
  [
    'links',
    'lane/README.md',
    [
      '---',
      'title: Lane 操作マニュアル',
      'description: 接続と得点表示の手順',
      '---',
      '',
      '# Saika Lane',
      '',
      '## 1. 接続',
      '',
      '[入口](../README.md)、[仕様](./SPEC.md#2-得点)、[運用](../director/OPERATIONS.md?view=print#準備)、',
      '[この節](#1-接続)、[用語集](../common/GLOSSARY.md)。',
      '',
      '[ソース](../../saika-lane/src/main/main.ts)、[フォルダー](../../saika-lane/src/)、[ライセンス](../LICENSE)、',
      '[外部](https://example.com/manual)、[メール](mailto:office@example.com)、[画像](./images/panel.png)。',
      '',
      '![配置図](./images/layout.png)',
      '',
      '<img src="/images/target.png" alt="標的" width="320" height="240">',
      '',
      '得点は自動で記録します[^1]。',
      '',
      '[^1]: 記録は Director にも送信します。',
    ].join('\n'),
  ],
  [
    'alerts',
    'GETTING_STARTED.md',
    [
      '# はじめに',
      '',
      '> [!NOTE]',
      '> 接続を確認します。',
      '',
      '> [!TIP]',
      '> 試射の前に表示を切り替えます。',
      '',
      '> [!IMPORTANT]',
      '> 本射の前に審判へ報告します。',
      '',
      '> [!WARNING]',
      '> 競技中にケーブルを抜かないでください。',
      '',
      '> [!CAUTION]',
      '> 記録を削除すると元に戻せません。',
      '',
      '> 通常の引用です。',
      '',
      '- [x] 電源を入れる',
      '- [ ] ~~旧手順~~ 新しい手順で接続する',
      '  1. 端末を選ぶ',
      '  2. **接続** を押す',
      '',
      '<details><summary>詳細</summary><kbd>Ctrl</kbd> + <kbd>R</kbd> で再読み込みします。</details>',
    ].join('\n'),
  ],
  [
    'tables-math-code',
    'common/TARGET_SPEC.md',
    [
      '# 標的仕様',
      '',
      '| 種目 | 10点圏 (mm) | 備考 |',
      '| :--- | ---: | :---: |',
      '| AR60 | 0.5 | `DECIMAL` |',
      '| AP60 | 11.5 | *整数* |',
      '',
      '得点は $s = 10.9 - r/k$ で求めます。',
      '',
      '$$',
      '\\sum_{i=1}^{60} s_i',
      '$$',
      '',
      '```ts:example.ts',
      'const score: number = 10.9;',
      '```',
      '',
      '```json',
      '{"score":10}',
      '```',
      '',
      '```',
      'plain text',
      '```',
      '',
      '```unknown-language',
      'kept as text',
      '```',
    ].join('\n'),
  ],
  [
    'diagrams-and-sanitizing',
    'lane/SPEC.md',
    [
      '# 状態遷移',
      '',
      '```mermaid',
      'stateDiagram-v2',
      '  [*] --> Ready',
      '```',
      '',
      '```dot',
      'digraph { Lane -> Director }',
      '```',
      '',
      '```graphviz',
      'digraph { Director -> Vista }',
      '```',
      '',
      '<script>alert(1)</script><img src="x" onerror="alert(2)">',
      '<iframe src="https://example.com"></iframe><style>body { display: none }</style>',
      '<a href="javascript:alert(3)">危険なリンク</a> <span style="color:red" class="custom">装飾</span>',
      '<div class="markdown-alert markdown-alert-danger">許可されない種類</div>',
    ].join('\n'),
  ],
];

function render(sourcePath: string, source: string): string {
  return renderToStaticMarkup(<DocumentMarkdown document={parseDocument(sourcePath, source)} />);
}

function rendered(sourcePath: string, source: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = render(sourcePath, source);
  return container;
}

/** The in-page links whose fragment names no element id of the same document. */
function unresolvedFragments(container: HTMLElement, selector = 'a[href^="#"]'): string[] {
  const ids = new Set([...container.querySelectorAll('[id]')].map((element) => element.id));
  return [...container.querySelectorAll(selector)]
    .map((anchor) => decodeURIComponent(anchor.getAttribute('href')!.slice(1)))
    .filter((fragment) => !ids.has(fragment));
}

describe('Document HTML golden files', () => {
  it.each(documents)('renders %s exactly as before', async (name, sourcePath, source) => {
    await expect(`${render(sourcePath, source)}\n`).toMatchFileSnapshot(`./__golden__/${name}.html`);
  });

  it.each(documents)('links %s only to fragments in the same document', (_name, sourcePath, source) => {
    expect(unresolvedFragments(rendered(sourcePath, source))).toEqual([]);
  });

  it('links footnote references and back-references to their targets', () => {
    const [, sourcePath, source] = documents.find(([name]) => name === 'links')!;
    const container = rendered(sourcePath, source);
    const footnoteLinks = 'a[data-footnote-ref], a[data-footnote-backref]';

    expect(container.querySelectorAll(footnoteLinks)).toHaveLength(2);
    expect(unresolvedFragments(container, footnoteLinks)).toEqual([]);
  });
});
