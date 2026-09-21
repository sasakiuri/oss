# nilay-knowledge

Nilay Knowledge Website - 実銃・射撃・狩猟の情報を紹介するナレッジサイト

**URL:** https://knowledge.nilay.jp

## 技術スタック

| カテゴリ          | 技術                                    |
| ----------------- | --------------------------------------- |
| フレームワーク    | Next.js 16 (App Router, Turbopack)      |
| 言語              | TypeScript 5, React 19                  |
| スタイリング      | Tailwind CSS 4, @tailwindcss/typography |
| UI コンポーネント | Radix UI, lucide-react                  |
| Markdown 処理     | unified, remark-gfm, rehype             |
| 出力              | SSG (Static Site Generation)            |
| テスト            | Vitest, Testing Library                 |

## 構造

```
app/
├── page.tsx              # トップページ
├── articles/             # 記事一覧・詳細
│   ├── page.tsx
│   └── [slug]/page.tsx
├── news/                 # お知らせ一覧・詳細
│   ├── page.tsx
│   └── [slug]/page.tsx
├── content/[...path]/    # content/ のファイルを既存URLで直接配信
└── about/page.tsx        # サイト概要
components/
├── header.tsx            # ヘッダー
├── footer.tsx            # フッター（SNSリンク）
├── breadcrumb.tsx        # パンくずリスト
├── sns-share.tsx         # SNSシェアボタン
├── icons.tsx             # カスタムアイコン（Hatena, Line）
├── table-of-contents.tsx # 本文の見出しIDに対応する目次
└── google-analytics.tsx  # GA4
content/
├── articles/             # 記事Markdownコンテンツ
├── news/                 # お知らせMarkdownコンテンツ
└── assets/               # 共有アセット
lib/
├── config.ts             # サイト設定
├── content/              # repository・render・server・metadata・publication
└── utils.ts              # ユーティリティ
scripts/
├── create-content.ts     # 記事・ニュース作成の共通処理
├── generate-feed.ts      # RSSフィード生成
├── generate-sitemap.ts   # サイトマップ生成
├── new-article.ts        # 新規記事作成
└── new-news.ts           # 新規ニュース作成
```

## 開発

```bash
# リポジトリルートから起動
npm run dev --workspace=@sasakiuri/nilay-knowledge
# http://localhost:3000

# 新規コンテンツ作成
npm run new:article --workspace=@sasakiuri/nilay-knowledge # 新規記事作成
npm run new:article --workspace=@sasakiuri/nilay-knowledge -- "タイトル" # タイトル指定
npm run new:news --workspace=@sasakiuri/nilay-knowledge # 新規ニュース作成
npm run new:news --workspace=@sasakiuri/nilay-knowledge -- "タイトル" # タイトル指定

# ビルド（SSG）
npm run build --workspace=@sasakiuri/nilay-knowledge # prebuildでfeed.xml, sitemap.xml生成

# テスト
npm run test --workspace=@sasakiuri/nilay-knowledge # Vitest
npm run test:run --workspace=@sasakiuri/nilay-knowledge # Vitest (CI向け)
```

## 特徴

- **SSG (Static Site Generation):** Next.js の `.next/` を `next start` で配信。静的 export は未設定
- **Markdown 処理:** gray-matter + unified + remark-gfm + rehype
  - remark-breaks (改行処理)
  - remark-math + rehype-katex (数式)
  - remark-github-alerts (GitHub スタイルのアラート)
  - rehype-highlight (シンタックスハイライト)
  - rehype-slug (見出しアンカー)
- **相対パス変換:** Markdown 内の相対パスを自動で絶対パスに変換
- **SEO:** JSON-LD 構造化データ、Open Graph、Twitter Cards
- **RSS フィード:** ビルド時に自動生成
- **コンテンツ管理:** 記事・画像・PDF は `content/` のみ。公開コピーは作らない
- **情報確認記録:** `review` に確認日・対象地域・確認範囲・出典を記録。確認日を自動補完しない

コンテンツ処理の境界・メタデータ契約・検証方法は [README.md](README.md#content-architecture) を参照。

## 環境変数

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # Google Analytics 4
```
