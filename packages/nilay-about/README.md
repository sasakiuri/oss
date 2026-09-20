# Nilay About

`@sasakiuri/nilay-about` は <https://about.nilay.jp> のサービス紹介サイトです。
射撃・狩猟・有害鳥獣駆除に関する情報、ニュース、お問い合わせ、Labs のツールを提供します。

Next.js 16（App Router）、React 19、TypeScript、Tailwind CSS 4 を使用します。
ニュースは Prisma 7 と PostgreSQL、お問い合わせ送信は Slack Webhook に接続します。
メインサイトはレトロなデザイン、Labs は独立したレイアウトのマテリアルデザインです。

## 開発

Node.js 22.22.2 以上、npm 10.9.4 以上を使用し、リポジトリのルートで実行します。

```bash
npm ci
cp packages/nilay-about/.env.example packages/nilay-about/.env.local
npm run dev --workspace=@sasakiuri/nilay-about
```

開発サーバーは `http://localhost:3001` で起動します。
ニュースの取得には `DATABASE_URL`、お問い合わせの送信には `SLACK_WEBHOOK_URL` が必要です。
接続先を使わない画面の開発では、これらを未設定にできます。
環境変数とアーキテクチャの詳細は [開発ガイド](DEVELOPMENT.md) を参照してください。

```bash
npm run lint --workspace=@sasakiuri/nilay-about
npm run typecheck --workspace=@sasakiuri/nilay-about
npm run test --workspace=@sasakiuri/nilay-about
npm run test:coverage --workspace=@sasakiuri/nilay-about
npm run build --workspace=@sasakiuri/nilay-about
```

`dev` の起動前、`build`、`typecheck` で Prisma クライアントを生成します。
生成先の `lib/generated/prisma/` は Git 管理対象外です。
データベース接続はニュース API のリクエスト時に初期化するため、ビルドには DB の認証情報が不要です。

本番サーバーは `npm run start --workspace=@sasakiuri/nilay-about` でポート 3001 に起動します。
本番実行には `NEXT_PUBLIC_SITE_URL` と 16 文字以上の `LOG_MASKING_SECRET` を設定してください。
秘密鍵は `openssl rand -hex 32` で生成し、本番環境では安全に保管した強い値を使用します。

E2E テストはビルド後に実行します。

```bash
npm run build --workspace=@sasakiuri/nilay-about
npm run test:install --workspace=@sasakiuri/nilay-about
npm run test:e2e --workspace=@sasakiuri/nilay-about
```

Playwright はテスト専用の環境変数で本番サーバーを起動します。
ポート 3001 の既存サーバーは再利用せず、実際の DB・Slack・Upstash には接続しません。

## 取り込み元と履歴

`sasakiuri/nilay` のコミット `cf622d7ce7b001dd0f4d9fd86138a2415fc03b82` にある
`packages/about.website/` のコミット済みファイルを取り込みました。
単独リポジトリ時代の 104 コミットと Nilay 内の 57 コミット、計 161 コミットを
OSS の既存履歴に続く直線的な履歴として保持しています。

作者と日時を維持し、メッセージを `nilay-about` スコープの英語の Conventional Commits に変換しました。
各コミットの `Nilay-Commit` トレーラーに元のコミット ID を記録しています。
履歴内の認証情報の値は 23 個の blob で伏せています。
統合前の先端スナップショットは取り込み元と一致し、その後に workspace 向けの変更を加えています。
取り込み元リポジトリは変更せず、未コミットの変更も取り込んでいません。

このパッケージは `private: true` で npm には公開しません。
Saika スイートとは独立してバージョンを管理します。

## ライセンス

元の Nilay の [MIT ライセンス](LICENSE) と `Copyright (c) 2022 Nilay` を保持しています。
個別の素材に付された表記も保持してください。

Prisma Studio が使用する未変更の `elkjs@0.11.1` は EPL-2.0 です。
[配布元](https://github.com/kieler/elkjs) のライセンス全文を [サードパーティー通知](THIRD-PARTY-LICENSES.txt) に含めています。
