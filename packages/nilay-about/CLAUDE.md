# CLAUDE.md

このファイルは Claude Code (claude.ai/claude-code) がこのリポジトリを扱う際のガイダンスを提供します。

## プロジェクト概要

Nilay About Website - 射撃・狩猟・有害鳥獣駆除に関するサービス紹介サイト

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router)
- **言語**: TypeScript 5
- **スタイリング**: Tailwind CSS 4 + Radix UI
- **状態管理**: Zustand v5 (クライアント状態) + TanStack Query v5 (サーバー状態)
- **フォーム**: React Hook Form + Zod
- **アイコン**: React Icons (Lucide)
- **バックエンド**: Firebase (Firestore, Cloud Functions, Analytics)

## ディレクトリ構造

```
about.website/
├── app/                    # Next.js App Router ページ
│   ├── contact/           # お問い合わせページ
│   ├── labs/              # Labs ツール
│   │   ├── game-species-test/
│   │   └── home-target/
│   └── news/              # ニュースページ
├── components/            # React コンポーネント
│   ├── layout/            # レイアウトコンポーネント
│   └── ui/                # UIプリミティブ
├── hooks/                 # カスタムフック
├── store/                 # Zustand ストア
├── lib/                   # ユーティリティ
│   ├── api/               # APIクライアント
│   ├── firebase/          # Firebase設定
│   └── schemas/           # Zodスキーマ
└── public/                # 静的アセット
    └── images/
```

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# リント
npm run lint

# フォーマット
npm run format
```

## Docker開発環境

```bash
# Docker Compose でコンテナ起動
cd docker
docker compose up node-about

# アクセス URL
# http://127.100.0.11:80 または http://about.nilay.test
```

## コーディング規約

- コンポーネントは関数コンポーネントで記述
- クライアントコンポーネントには `"use client"` ディレクティブを付与
- スタイルは Tailwind CSS クラスを使用
- 型定義は Zod スキーマから推論
- API 呼び出しは TanStack Query のフックを経由

## Firebase 設定

- プロジェクト ID: `nilay-about`
- Firestore コレクション: `news`
- Cloud Functions: `sendContactMessage`

## 主要なパターン

1. **データフェッチング**: `lib/api/` に API 関数、`hooks/` に TanStack Query フック
2. **フォームバリデーション**: `lib/schemas/` に Zod スキーマ、React Hook Form で使用
3. **コンポーネント設計**: Server Components をデフォルトとし、必要な場合のみ Client Components を使用
4. **状態管理**: サーバー状態は TanStack Query、クライアント状態は Zustand で管理
   - `store/ui-store.ts`: グローバル UI 状態（アラート、ローディング）
   - `store/game-species-store.ts`: 狩猟鳥獣クイズ状態
   - `store/home-target-store.ts`: 射撃標的計算状態
