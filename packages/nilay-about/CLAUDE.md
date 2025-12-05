# CLAUDE.md

このファイルは Claude Code (claude.ai/claude-code) がこのリポジトリを扱う際のガイダンスを提供します。

## プロジェクト概要

Nilay About Website - 射撃・狩猟・有害鳥獣駆除に関するサービス紹介サイト

### デザインコンセプト

**「2025年の技術で実装された、1990年のWebサイト」**

- **メインサイト**: 1990年代CERN Webサイト風のレトロデザイン（グレー背景、青リンク、Times New Roman）
- **Labsアプリ**: 独立したモダンマテリアルデザインUI（白背景、Interフォント）

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
├── app/
│   ├── (standalone)/           # 独立したLabsアプリ (Route Group)
│   │   ├── layout.tsx         # Standalone専用レイアウト (Header/Footerなし)
│   │   ├── standalone.css     # モダンマテリアルデザインCSS
│   │   ├── _components/       # Standalone共通コンポーネント
│   │   │   ├── app-header.tsx
│   │   │   ├── app-footer.tsx
│   │   │   ├── app-layout.tsx
│   │   │   ├── language-menu.tsx
│   │   │   └── index.ts
│   │   └── labs/
│   │       ├── game-species-test/
│   │       │   ├── _store/    # 機能専用Zustandストア
│   │       │   └── ...
│   │       └── home-target/
│   │           ├── _store/    # 機能専用Zustandストア
│   │           └── ...
│   ├── layout.tsx              # メインレイアウト (RetroHeader/RetroFooter)
│   ├── globals.css             # レトロCERNスタイルCSS
│   ├── contact/
│   ├── labs/                   # Labs インデックスページ
│   └── news/
├── components/
│   ├── layout/
│   │   ├── retro-header.tsx   # レトロスタイルヘッダー
│   │   ├── retro-footer.tsx   # レトロスタイルフッター
│   │   ├── header.tsx         # モダンヘッダー (未使用)
│   │   ├── footer.tsx         # モダンフッター (未使用)
│   │   └── ...
│   ├── ui/                     # UIプリミティブ
│   └── providers.tsx           # TanStack Query Provider
├── hooks/                      # カスタムフック
├── store/                      # グローバルZustandストア
│   └── ui-store.ts            # アラート、ローディング状態
├── lib/
│   ├── api/                    # APIクライアント
│   ├── firebase/               # Firebase設定
│   ├── schemas/                # Zodスキーマ
│   └── utils/                  # ユーティリティ
└── public/
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

## 重要なアーキテクチャパターン

### Route Groups による分離

```
app/
├── (standalone)/    # モダンUI、独自レイアウト
│   ├── _components/ # Standalone共通コンポーネント
│   └── labs/       # home-target, game-species-test
└── [その他]/        # レトロUI、共通レイアウト
```

- `(standalone)` は独自の `standalone.css` を使用
- メインサイトは `globals.css` のレトロスタイルを使用

### Standalone共通コンポーネント

`app/(standalone)/_components/` に配置:

- `AppHeader` - アプリヘッダー
- `AppFooter` - アプリフッター（ツールバー）
- `AppLayout` - フルスクリーンレイアウト
- `LanguageMenu` - 言語選択メニュー

### 機能別ストア配置

Labs アプリは機能ごとに `_store` ディレクトリを持ち、状態管理を分離:

```
app/(standalone)/labs/home-target/
├── _store/
│   └── index.ts     # Zustand ストア + セレクター
├── home-target-client.tsx
└── page.tsx
```

### データフェッチング

1. **API関数**: `lib/api/` に配置
2. **TanStack Query フック**: `hooks/` に配置
3. **Server Components**: メタデータ設定、静的コンテンツ
4. **Client Components**: インタラクティブUI、フォーム

## Firebase 設定

- プロジェクト ID: `nilay-about`
- Firestore コレクション: `news`
- Cloud Functions: `sendContactMessage`
