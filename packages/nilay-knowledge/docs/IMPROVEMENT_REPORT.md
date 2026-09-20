# Next.js 改善レポート

## packages/knowledge.website

**実施日**: 2025-12-07
**Next.js バージョン**: 16.0.7
**React バージョン**: 19.0.0

---

## エグゼクティブサマリー

Gatsby から Next.js 16 への移行後、3サイクルのレビューと改善を実施しました。アクセシビリティ、セキュリティ、テスト基盤、型安全性、パフォーマンスの5つの領域で改善を行いました。

### 主な成果

| カテゴリ       | 改善内容                          | 影響                         |
| -------------- | --------------------------------- | ---------------------------- |
| Accessibility  | スキップリンク追加                | キーボードナビゲーション向上 |
| Error Handling | Error Boundary 追加               | エラー時の UX 改善           |
| Security       | Firebase セキュリティヘッダー設定 | XSS/Clickjacking 対策        |
| Testing        | Vitest テスト基盤整備             | 品質保証体制確立             |
| Type Safety    | JSON-LD 型定義追加                | 構造化データの型安全性向上   |
| Performance    | 画像 priority 属性追加            | LCP 改善                     |

---

## Cycle 1: 現状分析と基盤整備

### 検出された問題

| #   | カテゴリ       | 優先度 | 問題                         | 状態    |
| --- | -------------- | ------ | ---------------------------- | ------- |
| 1   | Security       | HIGH   | セキュリティヘッダー未設定   | ✅ 完了 |
| 2   | Testing        | HIGH   | テストファイルなし           | ✅ 完了 |
| 3   | Accessibility  | HIGH   | スキップリンク未実装         | ✅ 完了 |
| 4   | Error Handling | MEDIUM | Error Boundary 未実装        | ✅ 完了 |
| 5   | Config         | LOW    | facebookAppId がハードコード | ✅ 完了 |

### 実施した改善

#### 1. スキップリンク追加

**ファイル**: `components/skip-link.tsx`

```tsx
export function SkipLink() {
  return (
    <Link href="#main-content" className="sr-only focus:not-sr-only ...">
      メインコンテンツへスキップ
    </Link>
  );
}
```

**影響**: キーボードユーザーがヘッダーをスキップしてメインコンテンツに直接移動可能に。

#### 2. Error Boundary 追加

**ファイル**: `app/error.tsx`

- クライアントサイドエラーをキャッチ
- 再試行ボタンとトップページへのリンクを提供
- エラーログ出力機能

#### 3. Firebase セキュリティヘッダー設定

**ファイル**: `firebase.json`

```json
{
  "headers": [
    {
      "key": "X-Content-Type-Options",
      "value": "nosniff"
    },
    {
      "key": "X-Frame-Options",
      "value": "DENY"
    },
    {
      "key": "Referrer-Policy",
      "value": "strict-origin-when-cross-origin"
    },
    {
      "key": "Permissions-Policy",
      "value": "camera=(), microphone=(), geolocation=()"
    }
  ]
}
```

#### 4. テスト基盤整備

**新規ファイル**:

- `vitest.config.ts`
- `vitest.setup.ts`
- `__tests__/lib/utils.test.ts`
- `__tests__/lib/markdown.test.ts`
- `__tests__/components/skip-link.test.tsx`
- `__tests__/components/breadcrumb.test.tsx`

**テストコマンド**:

```bash
npm run test        # ウォッチモード
npm run test:run    # 単発実行
npm run test:coverage  # カバレッジ付き
```

---

## Cycle 2: セキュリティ・パフォーマンス強化

### 実施した改善

#### 1. JSON-LD 型定義追加

**ファイル**: `lib/schema.ts`

型安全なスキーマ生成関数を提供:

- `createBreadcrumbSchema()`
- `createArticleSchema()`
- `createWebSiteSchema()`

#### 2. ホームページに WebSite スキーマ追加

**ファイル**: `app/page.tsx`

Google 検索でサイト内検索機能として認識される可能性が向上。

#### 3. 画像最適化

**ファイル**: `app/page.tsx`

ファーストビューの画像に `priority` 属性を追加し、LCP (Largest Contentful Paint) を改善。

---

## Cycle 3: 最終検証

### チェックリスト

| 項目                 | 状態   | 備考                             |
| -------------------- | ------ | -------------------------------- |
| ESLint エラー        | ✅ 0件 | 警告も0件                        |
| TypeScript エラー    | ✅ 0件 | strict モード                    |
| ビルド成功           | ✅     | 125ページ生成                    |
| SSG 出力             | ✅     | `output: 'export'`               |
| セキュリティヘッダー | ✅     | firebase.json 設定済み           |
| 構造化データ         | ✅     | BreadcrumbList, Article, WebSite |

---

## アーキテクチャ図

```
packages/knowledge.website/
├── app/                          # App Router (Server Components)
│   ├── layout.tsx                # ルートレイアウト
│   │   └── SkipLink, Header, Footer, GoogleAnalytics
│   ├── page.tsx                  # ホーム (WebSiteSchema)
│   ├── error.tsx                 # Error Boundary (Client)
│   ├── not-found.tsx             # 404ページ
│   ├── about/page.tsx
│   ├── articles/
│   │   ├── page.tsx              # 記事一覧
│   │   └── [slug]/page.tsx       # 記事詳細 (ArticleSchema)
│   └── news/
│       ├── page.tsx              # ニュース一覧
│       └── [slug]/page.tsx       # ニュース詳細
├── components/
│   ├── header.tsx                # Client Component (モバイルメニュー)
│   ├── footer.tsx                # Server Component
│   ├── skip-link.tsx             # Server Component [NEW]
│   ├── breadcrumb.tsx            # Server Component (BreadcrumbSchema)
│   ├── sns-share.tsx             # Client Component (Copy機能)
│   ├── google-analytics.tsx      # Client Component (Script)
│   └── icons.tsx                 # Server Component (カスタムSVG)
├── lib/
│   ├── markdown.ts               # Markdown処理
│   ├── schema.ts                 # JSON-LD型定義 [NEW]
│   ├── config.ts                 # サイト設定
│   └── utils.ts                  # ユーティリティ関数
├── __tests__/                    # [NEW]
│   ├── lib/
│   │   ├── utils.test.ts
│   │   └── markdown.test.ts
│   └── components/
│       ├── skip-link.test.tsx
│       └── breadcrumb.test.tsx
├── scripts/
│   ├── generate-feed.ts          # RSS生成 (prebuild)
│   └── generate-sitemap.ts       # Sitemap生成 (prebuild)
├── firebase.json                 # [NEW] セキュリティヘッダー設定
├── vitest.config.ts              # [NEW]
└── vitest.setup.ts               # [NEW]
```

---

## 今後の推奨事項

### 短期 (次回リリースまで)

1. **テストカバレッジ拡大**: 現在のテストは基盤のみ。主要コンポーネントのテストを追加
2. **CSP (Content Security Policy)**: firebase.json に CSP ヘッダーを追加検討
3. **Lighthouse CI**: GitHub Actions で Lighthouse スコアを自動測定

### 中期 (3ヶ月以内)

1. **E2E テスト**: Playwright による E2E テスト導入
2. **画像最適化**: WebP/AVIF フォーマット対応
3. **キャッシュ戦略**: ISR 導入検討 (動的コンテンツがある場合)

### 長期 (6ヶ月以内)

1. **国際化 (i18n)**: 多言語対応が必要な場合
2. **検索機能**: Algolia/Pagefind などの全文検索
3. **Analytics 強化**: Core Web Vitals モニタリング

---

## 変更ファイル一覧

### 新規作成

- `components/skip-link.tsx`
- `app/error.tsx`
- `lib/schema.ts`
- `firebase.json`
- `.firebaserc`
- `vitest.config.ts`
- `vitest.setup.ts`
- `__tests__/lib/utils.test.ts`
- `__tests__/lib/markdown.test.ts`
- `__tests__/components/skip-link.test.tsx`
- `__tests__/components/breadcrumb.test.tsx`
- `docs/IMPROVEMENT_REPORT.md`

### 修正

- `app/layout.tsx` - SkipLink 追加、main 要素に id 追加
- `app/page.tsx` - WebSiteSchema 追加、画像 priority 追加
- `app/articles/[slug]/page.tsx` - createArticleSchema 使用
- `components/breadcrumb.tsx` - createBreadcrumbSchema 使用
- `components/header.tsx` - 未使用インポート削除
- `lib/config.ts` - facebookAppId を環境変数化
- `.env.example` - FACEBOOK_APP_ID 追加
- `package.json` - テスト関連スクリプト・依存関係追加
- `tsconfig.json` - テストファイル除外設定

---

## 付録: デプロイ手順

```bash
# 1. 依存関係インストール (テストライブラリ追加済み)
npm install

# 2. テスト実行
npm run test:run

# 3. ビルド
npm run build

# 4. Firebase デプロイ
firebase deploy --only hosting
```

---

**レポート作成者**: Claude Code
**レビュー完了**: 3サイクル完了
