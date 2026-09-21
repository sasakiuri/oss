# 開発ガイド

## 環境構築

Node.js 22.22.2 以上、npm 10.9.4 以上を使用します。
以下のコマンドはすべて OSS リポジトリのルートで実行します。

```bash
npm ci
cp packages/nilay-about/.env.example packages/nilay-about/.env.local
npm run dev --workspace=@sasakiuri/nilay-about
```

開発サーバーは `http://localhost:3001` です。
依存関係とロックファイルはルートで管理します。

## 環境変数

ローカル設定は Git 管理対象外の `packages/nilay-about/.env.local` に保存します。
[.env.example](.env.example) の任意サービスは、利用するときにコメントを外して設定します。

| 変数                       | 用途と条件                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`     | サイトの絶対 URL。ローカルは `http://localhost:3001`、本番は公開 URL をビルド前と実行時に設定します。 |
| `LOG_MASKING_SECRET`       | ログの個人情報マスキング用。本番実行では 16 文字以上が必須です。                                      |
| `DATABASE_URL`             | ニュース API が接続する PostgreSQL の接続文字列です。                                                 |
| `SLACK_WEBHOOK_URL`        | お問い合わせを送信する Slack Incoming Webhook の URL です。                                           |
| `UPSTASH_REDIS_REST_URL`   | 分散レート制限用の Upstash Redis REST URL です。                                                      |
| `UPSTASH_REDIS_REST_TOKEN` | 上記 URL と組み合わせて設定するトークンです。                                                         |

`LOG_MASKING_SECRET` は `openssl rand -hex 32` で生成した値を設定します。
サンプルやテスト用の値を本番で使わず、生成した強い秘密鍵を安全に保管して各サーバーに設定してください。
開発・テスト・ビルドでは省略できますが、設定する場合は 16 文字以上が必要です。
`NEXT_PUBLIC_` で始まる変数は公開情報として扱い、秘密情報を入れないでください。

`DATABASE_URL` と `SLACK_WEBHOOK_URL` は、それぞれの API を使うときに必要です。
未設定でもビルドできますが、ニュース取得やお問い合わせ送信は失敗します。
Prisma クライアントの生成は DB 接続やスキーマ変更を行いません。
DB クライアントの初期化はニュース API のリクエスト時まで遅延します。

Upstash の 2 変数を設定すると、分散レート制限を使います。
現在の実装では、本番で Upstash が未設定の場合は警告を出して制限を省略し、
Upstash への接続エラーでもリクエストを許可します。
開発・テストでは、未設定時や接続エラー時にプロセス内のメモリで制限します。

## コマンド

| コマンド                                                   | 内容                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `npm run dev --workspace=@sasakiuri/nilay-about`           | Turbopack の開発サーバーを起動します。                 |
| `npm run build --workspace=@sasakiuri/nilay-about`         | Prisma クライアントを生成し、Next.js をビルドします。  |
| `npm run start --workspace=@sasakiuri/nilay-about`         | ビルド済みの本番サーバーをポート 3001 で起動します。   |
| `npm run typecheck --workspace=@sasakiuri/nilay-about`     | Prisma クライアントを生成し、TypeScript を検査します。 |
| `npm run lint --workspace=@sasakiuri/nilay-about`          | ESLint と Prettier を検査します。                      |
| `npm run fix --workspace=@sasakiuri/nilay-about`           | ESLint と Prettier の自動修正を実行します。            |
| `npm run test --workspace=@sasakiuri/nilay-about`          | Vitest を 1 回実行します。                             |
| `npm run test:watch --workspace=@sasakiuri/nilay-about`    | Vitest を監視モードで実行します。                      |
| `npm run test:coverage --workspace=@sasakiuri/nilay-about` | 単体テストとカバレッジ計測を実行します。               |
| `npm run analyze --workspace=@sasakiuri/nilay-about`       | バンドル分析を有効にしてビルドします。                 |

本番起動の前にビルドを実行し、環境変数を設定してください。
`.next/` と `lib/generated/prisma/` は生成物のためコミットしません。

## Vercel へのデプロイ

既存の Vercel プロジェクトを使い、次のように設定します。

| 設定                                            | 値                     |
| ----------------------------------------------- | ---------------------- |
| Git リポジトリ                                  | `sasakiuri/oss`        |
| Production Branch                               | `1.x`                  |
| Root Directory                                  | `packages/nilay-about` |
| Include source files outside the Root Directory | 有効                   |
| Node.js                                         | `24.x`                 |

[`vercel.json`](vercel.json) で Next.js、インストール・ビルドコマンド、出力先 `.next/` を指定しています。
インストールはルートで `npm ci --ignore-scripts` を実行し、Electron 用の再ビルドを省略します。
ビルドはこのパッケージで `npm run build` を実行し、Prisma クライアントも生成します。

既存プロジェクトの Git 設定で `sasakiuri/oss` を接続し、上記のビルド設定と本番ブランチを更新します。
ドメインと環境変数は既存プロジェクトの設定を引き継ぎます。
別のパッケージパスを参照する Ignored Build Step があれば解除してください。
本番環境には、上記「環境変数」の `NEXT_PUBLIC_SITE_URL`、`LOG_MASKING_SECRET` と、
利用するサービスの接続情報を設定します。公開 URL はビルド時にも必要です。

この設定を含む `1.x` のコミットから新しいデプロイを作成します。
過去のデプロイを再実行すると、その時点のソースが使われます。
Preview の確認後に本番へ反映し、トップページ、Labs、ニュース API の応答を確認してください。

詳細は Vercel の [Git 設定](https://vercel.com/docs/project-configuration/git-settings)と
[モノレポ設定](https://vercel.com/docs/monorepos)を参照してください。

## E2E テスト

```bash
npm run build --workspace=@sasakiuri/nilay-about
npm run test:install --workspace=@sasakiuri/nilay-about
npm run test:e2e --workspace=@sasakiuri/nilay-about
```

`test:install` は Chromium・Firefox・WebKit と必要なシステム依存関係を導入します。
Playwright はビルド済みの本番サーバーを `http://127.0.0.1:3001` で起動します。
`reuseExistingServer: false` のため、先に開発サーバーなどを停止してポートを空けてください。

`playwright.config.ts` はサイト URL、マスキング用の秘密鍵、DB、Slack、Upstash の
設定をテスト専用の値で上書きします。
外部サービスの接続先には接続不能なループバックアドレスを使い、実サービスの認証情報は使いません。
対話形式で確認する場合は、同じ準備の後に
`npm run test:e2e:ui --workspace=@sasakiuri/nilay-about` を実行します。

## アーキテクチャ

| 場所                                    | 役割                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `app/`                                  | App Router のページとレイアウト。メインサイトのスタイルは `globals.css` です。       |
| `app/(standalone)/labs/`                | 射撃標的計算と狩猟鳥獣スライドショー。専用レイアウトと `standalone.css` を使います。 |
| `app/api/news/`                         | Prisma 経由でニュースを取得する API です。                                           |
| `app/api/contact/`                      | 入力を検証し、Slack にお問い合わせを送信する API です。                              |
| `components/`                           | 共通の UI、レイアウト、プロバイダーです。                                            |
| `hooks/`・`lib/api/`                    | TanStack Query のフック、HTTP クライアント、レスポンス検証です。                     |
| `store/`・各機能の `_store/`            | 共通 UI と Labs の機能別 Zustand ストアです。                                        |
| `lib/schemas/`                          | Zod の入力・レスポンススキーマです。                                                 |
| `lib/prisma.ts`・`prisma/schema.prisma` | DB クライアントの遅延生成と PostgreSQL のモデル定義です。                            |
| `lib/security/`・`lib/logging/`         | 入力のサニタイズ、ログ、個人情報マスキングです。                                     |
| `__tests__/unit/`・`__tests__/e2e/`     | Vitest の単体テストと Playwright の画面テストです。                                  |

ページのメタデータや静的レイアウトは Server Components を使い、
操作を伴う UI とフックを使うコンポーネントには `"use client"` を指定します。
フォームは React Hook Form と Zod、API からのデータ取得は TanStack Query のフックを使います。
Labs の状態と計算は機能ごとの `_store/` にまとめています。
