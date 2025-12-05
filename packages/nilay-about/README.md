# Nilay About Website

Nilay のサービス紹介ウェブサイト。射撃・狩猟・有害鳥獣駆除に関する情報を提供します。

## デザインコンセプト

**「2025年の技術で実装された、1990年のWebサイト」**

メインサイトは初期のCERN Webサイトを彷彿とさせるレトロなデザインを採用しています。見た目はクラシックですが、内部はモダンなNext.js 16で実装されています。

Labs アプリ（home-target、game-species-test）は独立したモダンなマテリアルデザインUIを使用しています。

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript 5 |
| スタイリング | Tailwind CSS 4 |
| UIコンポーネント | Radix UI |
| 状態管理 | Zustand v5 + TanStack Query v5 |
| フォーム | React Hook Form + Zod |
| アイコン | React Icons (Lucide) |
| バックエンド | Firebase (Firestore, Cloud Functions) |
| 日付処理 | date-fns |

## 機能

- **ホーム**: サービス紹介（Knowledge, E-commerce, Gunman, Labs）
- **ニュース**: お知らせ一覧・詳細
- **お問い合わせ**: コンタクトフォーム
- **Labs** (独立したモダンUI):
  - home-target: 射撃標的計算ツール
  - game-species-test: 狩猟鳥獣スライドショー

## 開発

詳細な開発手順は [DEVELOPMENT.md](./DEVELOPMENT.md) を参照してください。

### クイックスタート

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

### Docker 環境

```bash
cd docker
docker compose up node-about
```

開発サーバーは `http://127.100.0.11:80` でアクセス可能です。

## ディレクトリ構造

```
├── app/
│   ├── (standalone)/          # 独立したLabsアプリ (モダンUI)
│   │   ├── layout.tsx        # Standalone専用レイアウト
│   │   ├── standalone.css    # モダンマテリアルデザインCSS
│   │   └── labs/
│   │       ├── game-species-test/
│   │       └── home-target/
│   ├── layout.tsx             # メインレイアウト (レトロUI)
│   ├── globals.css            # レトロCERNスタイルCSS
│   ├── contact/               # お問い合わせ
│   ├── labs/                  # Labs インデックス
│   └── news/                  # ニュース
├── components/
│   ├── layout/                # レイアウトコンポーネント
│   │   ├── retro-header.tsx  # レトロスタイルヘッダー
│   │   ├── retro-footer.tsx  # レトロスタイルフッター
│   │   └── ...
│   └── ui/                    # UIプリミティブ
├── hooks/                     # カスタムフック
├── store/                     # Zustand ストア
├── lib/                       # ユーティリティ
│   ├── api/                   # API クライアント
│   ├── firebase/              # Firebase 設定
│   └── schemas/               # Zod スキーマ
└── public/                    # 静的ファイル
```

## ライセンス

Private
