# 開発ガイド

## 環境構築

Node.js 24.x（24.16.0）、npm 11.13.0 を使用します。
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
| `MICROCMS_SERVICE_DOMAIN`  | microCMS のサービスドメインです。URL のホストから `.microcms.io` を除いた値を設定します。             |
| `MICROCMS_API_KEY`         | ニュース API が使うサーバー専用の API キーです。                                                      |
| `SLACK_WEBHOOK_URL`        | お問い合わせを送信する Slack Incoming Webhook の URL です。                                           |
| `UPSTASH_REDIS_REST_URL`   | 分散レート制限用の Upstash Redis REST URL です。                                                      |
| `UPSTASH_REDIS_REST_TOKEN` | 上記 URL と組み合わせて設定するトークンです。                                                         |

`LOG_MASKING_SECRET` は `openssl rand -hex 32` で生成した値を設定します。
サンプルやテスト用の値を本番で使わず、生成した強い秘密鍵を安全に保管して各サーバーに設定してください。
開発・テスト・ビルドでは省略できますが、設定する場合は 16 文字以上が必要です。
`NEXT_PUBLIC_` で始まる変数は公開情報として扱い、秘密情報を入れないでください。

ニュースには microCMS の2変数、お問い合わせには `SLACK_WEBHOOK_URL` が必要です。
未設定でもビルドできますが、ニュース取得やお問い合わせ送信は失敗します。
microCMS の接続設定はニュース API のリクエスト時に検証します。
API 定義とニュースの編集手順は [microCMS ガイド](microcms/README.md) を参照してください。

Upstash の 2 変数を設定すると、分散レート制限を使います。
現在の実装では、本番で Upstash が未設定の場合は警告を出して制限を省略し、
Upstash への接続エラーでもリクエストを許可します。
開発・テストでは、未設定時や接続エラー時にプロセス内のメモリで制限します。

## コマンド

| コマンド                                                   | 内容                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `npm run dev --workspace=@sasakiuri/nilay-about`           | Turbopack の開発サーバーを起動します。               |
| `npm run build --workspace=@sasakiuri/nilay-about`         | Next.js をビルドします。                             |
| `npm run start --workspace=@sasakiuri/nilay-about`         | ビルド済みの本番サーバーをポート 3001 で起動します。 |
| `npm run typecheck --workspace=@sasakiuri/nilay-about`     | アプリとテストの TypeScript を検査します。           |
| `npm run lint --workspace=@sasakiuri/nilay-about`          | ESLint と Prettier を検査します。                    |
| `npm run fix --workspace=@sasakiuri/nilay-about`           | ESLint と Prettier の自動修正を実行します。          |
| `npm run test --workspace=@sasakiuri/nilay-about`          | Vitest を 1 回実行します。                           |
| `npm run test:watch --workspace=@sasakiuri/nilay-about`    | Vitest を監視モードで実行します。                    |
| `npm run test:coverage --workspace=@sasakiuri/nilay-about` | 単体テストとカバレッジ計測を実行します。             |
| `npm run analyze --workspace=@sasakiuri/nilay-about`       | バンドル分析を有効にしてビルドします。               |

本番起動の前にビルドを実行し、環境変数を設定してください。
`.next/` は生成物のためコミットしません。

## E2E テスト

```bash
npm run build --workspace=@sasakiuri/nilay-about
npm run test:install --workspace=@sasakiuri/nilay-about
npm run test:e2e --workspace=@sasakiuri/nilay-about
```

`test:install` は Chromium・Firefox・WebKit と必要なシステム依存関係を導入します。
Playwright はビルド済みの本番サーバーを `http://127.0.0.1:3001` で起動します。
`reuseExistingServer: false` のため、先に開発サーバーなどを停止してポートを空けてください。

`playwright.config.ts` はサイト URL、マスキング用の秘密鍵、microCMS、Slack、Upstash の
設定をテスト専用の値で上書きします。
microCMS の接続情報は空にし、Slack・Upstash には接続不能なループバックアドレスを使います。実サービスの認証情報は使いません。
対話形式で確認する場合は、同じ準備の後に
`npm run test:e2e:ui --workspace=@sasakiuri/nilay-about` を実行します。

## アーキテクチャ

`app/` は URL、メタデータ、レイアウトと依存の組み立てだけを担当します。
サイトの機能の実装は `features/` に集約し、Labs の各ツールは `app/(standalone)/labs/` に置きます。未使用の汎用 DI コンテナや互換 API は置きません。

| 場所                                 | 責務                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx`                     | 全ページ共通のレトロなヘッダー・フッター、表示言語、Query provider。Labs のツールもこの枠の中に表示します。 |
| `app/(site)/`                        | メインサイトのページ。                                                                                      |
| `app/(standalone)/labs/<ツール>/`    | Labs の各ツールの画面と、ツールごとの `_store/`。URL にルートグループ名は含まれません。                     |
| `app/api/`                           | 依存を明示して HTTP ハンドラーを組み立てます。                                                              |
| `features/news/`                     | ニュースのスキーマ、HTTP クライアント、Query 定義、画面、サーバーの repository と handler。                 |
| `features/contact/`                  | 共通のフォームスキーマ、画面、mutation、サーバーの handler と Slack adapter。                               |
| `features/game-species/`             | 狩猟鳥獣の問題データ。                                                                                      |
| `lib/<ツール>.ts`・`lib/schemas/`    | Labs の計算と保存データの検証。React と store に依存しない純粋な関数です。                                  |
| `components/ui/`・`components/labs/` | 実際に利用する共通 UI と Labs のレイアウト・部品。                                                          |
| `components/layout/`・`store/`       | サイトのヘッダー・フッター・言語切替と、表示言語の store。                                                  |
| `lib/http/`                          | ブラウザーの JSON 通信・レスポンス検証・再試行方針。                                                        |
| `lib/server/`                        | HTTP エラー境界、レート制限、クライアント IP の判定。                                                       |
| `features/news/server/repository.ts` | microCMS の取得・レスポンス検証。API キーをサーバー内に保持します。                                         |
| `lib/security/`・`lib/logging/`      | HTML のサニタイズ、構造化ログ、PII のマスキング。                                                           |

### 依存と状態のルール

- ページは機能を参照し、機能から `app/` を参照しません。
- サーバー処理は `features/*/server/` と `lib/server/` に置き、`server-only` でブラウザーバンドルへの混入を防ぎます。ESLint でも UI からの import を禁止します。
- HTTP 境界で入力を検証し、ブラウザーでは取得した JSON をスキーマで検証します。フォームと API は同じ問い合わせスキーマを使います。
- ニュース repository、Slack adapter、レート制限には関数またはオブジェクトで依存を渡します。テストは実サービスを呼びません。
- ニュースの query はキャンセル信号を fetch に渡します。404・429・不正なレスポンスは自動再試行せず、一時的な障害だけを再試行します。
- 問い合わせは通信が失敗しても既に届いている可能性があるため、自動再送しません。結果表示はフォーム内に保持します。
- Labs の状態は機能ごとの `_store/` の Zustand store が持ち、永続化は `persist` と `lib/browser-storage.ts` を使います。初期描画後に保存値を検証・復元し、自動再生や通信中の状態は保存しません。計算や PDF 生成は React と store に依存しない純粋な関数です。
- 長さは計算前に cm に正規化します。標的の高さと黒丸の直径も cm で返します。
- Tailwind は `app/globals.css` だけで生成します。サイトのレトロな要素スタイルは CSS の `base` レイヤーに置き、コンポーネントのユーティリティークラスで上書きできるようにしています。Labs の色とスタイルは `.standalone-app` に閉じ、About へ戻った際にテーマが残らない構成です。

### HTTP とログ

URL と成功レスポンスの形は維持しています。ニュースは `{ newsList }` / `{ news }`、
問い合わせは `{ hasError, errorMessage, uuid }`、標的生成は PDF を返します。
不正入力は 400、存在しないニュースは 404、送信制限は 429 と `Retry-After` です。
Slack の応答・通信障害は 502、タイムアウトは 504 に整理しました。
例外に含まれる microCMS の API キーや問い合わせ本文をレスポンスへ出しません。

ログは IP・メール・User-Agent などを HMAC 化し、秘密情報を除去します。
配列と循環参照にも対応し、Error は名前と fingerprint を記録します。
スタックと例外の自由文は保存せず、リクエストの query は値ではなくキー名だけを記録します。
IP ヘッダーは信頼できる ingress proxy が上書きする前提です。

Slack メッセージは入力をエスケープし、タイトルを section、長文を複数の section に分割します。
[header の150文字上限](https://docs.slack.dev/reference/block-kit/blocks/header-block/) と
[section の3000文字上限](https://docs.slack.dev/reference/block-kit/blocks/section-block/) を守り、入力を切り捨てません。

### 検証

Vitest では HTTP の正常系・異常系、外部 adapter、レート制限、サニタイズ、
長さの単位換算、PDF のバイト位置、スライドショーの状態とタイマーを検証します。
Playwright では実サービスへの接続を使わず、ニュース、問い合わせ、Labs の画面操作とレイアウトを確認します。
未使用コード・依存の確認にはルートから `npx knip --workspace packages/nilay-about` を使います。
