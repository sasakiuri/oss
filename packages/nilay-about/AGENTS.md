# nilay-about

上位の `AGENTS.md` に従い、このファイルはパッケージ固有の補足として扱う。
`@sasakiuri/nilay-about` は Nilay のサービス紹介サイトで、npm には公開しない。

## 構成

- Next.js 16（App Router）、React 19、TypeScript、Tailwind CSS 4。
- メインサイトはレトロなデザイン、`app/(standalone)/labs/` は独立したマテリアルデザイン。
- ニュースは `app/api/news/` → `lib/prisma.ts` → PostgreSQL の構成。
- お問い合わせは `app/api/contact/` から Slack Incoming Webhook に送信する。
- API 呼び出しは `lib/api/` と TanStack Query の `hooks/`、検証は `lib/schemas/` の Zod を使う。
- 共通状態は `store/`、Labs の機能別状態と計算は各 `_store/` に置く。
- 操作を伴うコンポーネントには `"use client"` を指定する。

## 開発・検証

Node.js 22.22.2 以上、npm 10.9.4 以上を使用し、リポジトリのルートで実行する。

```bash
npm ci
npm run dev --workspace=@sasakiuri/nilay-about
npm run lint --workspace=@sasakiuri/nilay-about
npm run typecheck --workspace=@sasakiuri/nilay-about
npm run test --workspace=@sasakiuri/nilay-about
npm run test:coverage --workspace=@sasakiuri/nilay-about
npm run build --workspace=@sasakiuri/nilay-about
```

開発・本番サーバーのポートは 3001。
`build` と `typecheck` は Prisma クライアントを生成する。
`lib/generated/prisma/` と `.next/` は Git 管理対象外。
DB 接続はニュース API のリクエスト時に初期化するため、ビルドに実サービスの認証情報は不要。

E2E はビルド後に `npm run test:install --workspace=@sasakiuri/nilay-about`、
`npm run test:e2e --workspace=@sasakiuri/nilay-about` の順に実行する。
Playwright はテスト専用の環境変数で本番サーバーを起動し、既存サーバーを再利用しない。
実際の DB・Slack・Upstash に接続する設定へ変更しない。

## 環境変数と履歴

- 設定項目は `.env.example`、詳しい手順は `DEVELOPMENT.md` にまとめる。
- ローカルの値は `.env.local` に保存し、認証情報をコミットしない。
- 本番実行には公開 URL の `NEXT_PUBLIC_SITE_URL` と 16 文字以上の `LOG_MASKING_SECRET` を設定する。
- ニュースには `DATABASE_URL`、お問い合わせ送信には `SLACK_WEBHOOK_URL` が必要。
- Upstash の URL とトークンの組で分散レート制限を有効にする。現在は本番の未設定・接続エラー時に制限を省略する。
- 元の Nilay の MIT ライセンスと 2022 年の著作権表記、素材の個別表記を保持する。
- コミットは英語の Conventional Commits、スコープは `nilay-about` を使う。
- 取り込み履歴の出典と変更内容は `README.md` を参照する。
