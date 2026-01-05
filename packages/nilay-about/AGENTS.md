# about.website

Nilay About Website - 射撃・狩猟・有害鳥獣駆除サービス紹介サイト

**デザイン**: メインサイトは1990年代CERNレトロ風、Labsアプリはモダンマテリアルデザイン

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router, Turbopack) |
| 言語 | TypeScript 5, React 19 |
| スタイリング | Tailwind CSS 4 |
| UIコンポーネント | Radix UI |
| 状態管理 | Zustand v5, TanStack Query v5 |
| フォーム | React Hook Form + Zod |
| データベース | Supabase (PostgreSQL) + Prisma 7 |
| テスト | Vitest, Testing Library, Playwright |

## 構造

```
app/
├── api/news/           # API Route (Prisma → Supabase)
├── (standalone)/labs/  # モダンUI (standalone.css)
│   ├── game-species-test/
│   └── home-target/
├── news/, contact/     # レトロUI (globals.css)
lib/
├── api/                # fetch クライアント
├── prisma.ts           # Prisma クライアント
├── schemas/            # Zod スキーマ
prisma/
├── schema.prisma       # DB スキーマ
└── seed.sql            # 初期データ
```

## 開発

```bash
# Docker
cd docker && docker compose up node-about
# http://127.100.0.11:80

# Prisma
npx prisma generate          # クライアント生成
npx prisma migrate dev       # マイグレーション

# テスト
npm run test                 # Vitest
npm run test:e2e             # Playwright
```

## 規約

- 関数コンポーネント、クライアントには `"use client"`
- Tailwind CSS、Zod スキーマから型推論
- API呼び出しは TanStack Query フック経由
- Labs機能は `_store/` にZustandストア配置

## 環境変数

```
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```
