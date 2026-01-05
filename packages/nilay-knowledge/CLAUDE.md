# knowledge.website

Nilay Knowledge Website - 実銃・射撃・狩猟の情報を紹介するナレッジサイト

**URL:** https://knowledge.nilay.jp

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router, Turbopack) |
| 言語 | TypeScript 5, React 19 |
| スタイリング | Tailwind CSS 4, @tailwindcss/typography |
| UIコンポーネント | Radix UI, lucide-react |
| Markdown処理 | unified, remark-gfm, rehype |
| 出力 | SSG (Static Site Generation) |
| テスト | Vitest, Testing Library |

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
└── about/page.tsx        # サイト概要
components/
├── header.tsx            # ヘッダー
├── footer.tsx            # フッター（SNSリンク）
├── breadcrumb.tsx        # パンくずリスト
├── sns-share.tsx         # SNSシェアボタン
├── icons.tsx             # カスタムアイコン（Hatena, Line）
└── google-analytics.tsx  # GA4
content/
├── articles/             # 記事Markdownコンテンツ
├── news/                 # お知らせMarkdownコンテンツ
└── assets/               # 共有アセット
lib/
├── config.ts             # サイト設定
├── markdown.ts           # Markdown処理（gray-matter + remark/rehype）
└── utils.ts              # ユーティリティ
scripts/
├── generate-feed.ts      # RSSフィード生成
├── generate-sitemap.ts   # サイトマップ生成
├── new-article.ts        # 新規記事作成
└── new-news.ts           # 新規ニュース作成
```

## 開発

```bash
# Docker（推奨）
cd docker && docker compose up node-knowledge
# http://127.100.0.12:80

# 新規コンテンツ作成
npm run new:article           # 新規記事作成
npm run new:article "タイトル" # タイトル指定
npm run new:news              # 新規ニュース作成
npm run new:news "タイトル"   # タイトル指定

# ビルド（SSG）
npm run build  # prebuildでfeed.xml, sitemap.xml生成

# テスト
npm run test                  # Vitest
npm run test:run              # Vitest (CI向け)
```

## 特徴

- **SSG (Static Site Generation):** `output: 'export'` で完全静的サイト生成
- **Markdown処理:** gray-matter + unified + remark-gfm + rehype
  - remark-breaks (改行処理)
  - remark-math + rehype-katex (数式)
  - remark-github-alerts (GitHubスタイルのアラート)
  - rehype-highlight (シンタックスハイライト)
  - rehype-slug (見出しアンカー)
- **相対パス変換:** Markdown内の相対パスを自動で絶対パスに変換
- **SEO:** JSON-LD構造化データ、Open Graph、Twitter Cards
- **RSSフィード:** ビルド時に自動生成

## 環境変数

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # Google Analytics 4
```
