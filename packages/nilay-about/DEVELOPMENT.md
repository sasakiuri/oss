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
| `VAPID_PUBLIC_KEY`         | Labs の Web Push 用の公開鍵（P-256、base64url）。3 変数をそろえて設定します。                         |
| `VAPID_PRIVATE_KEY`        | 上記の秘密鍵（base64url）。サーバー専用です。                                                         |
| `VAPID_SUBJECT`            | プッシュサービスの運営者向けの連絡先。`mailto:` か `https:` の URL です。                             |
| `CRON_SECRET`              | Vercel Cron が `Authorization: Bearer` で送る 16 文字以上の秘密値。未設定では定期実行を拒否します。   |

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

## Labs のサーバー機能（通知・共有）

クマ出没の通知、講習会ページの更新通知、帰着予定の見守り、わな・電気柵の通知 URL、
位置の共有、大会リザルトの公開は、`app/api/labs/` と `app/api/cron/` の API と Upstash Redis を使います。
Upstash と VAPID が未設定の場合、これらの API は 503 を返します（メモリーでの代替はしません）。

VAPID の鍵は依存を追加せずに Node.js で生成できます。

```bash
node -e "const {generateKeyPairSync}=require('node:crypto');const j=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});console.log('VAPID_PUBLIC_KEY='+Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'));console.log('VAPID_PRIVATE_KEY='+j.d)"
```

鍵を作り直すと既存の購読はすべて無効になり、利用者は通知を登録し直す必要があります。

定期実行は `vercel.json` の Vercel Cron で、時刻は UTC です。現在は一時停止中で、`vercel.json` に cron を載せず、`lib/scheduled-checks.ts` の `SCHEDULED_CHECKS_PAUSED` によってクマ出没の通知・講習会の監視・帰着の連絡の新規登録（入山計画の確定・見守り・予定変更を含む）を画面とサーバーの両方で止めています。再開するときは、下表の 3 件を `vercel.json` の `crons` に戻し、`SCHEDULED_CHECKS_PAUSED` を `false` にします。

| パス                      | 間隔                             | 内容                                                      |
| ------------------------- | -------------------------------- | --------------------------------------------------------- |
| `/api/cron/bear-alerts`   | 3 時間ごと（日本時間 0:30 から） | 秋田県のクマ出没オープンデータを条件付き GET で取得・照合 |
| `/api/cron/course-watch`  | 毎日 07:00・19:00（日本時間）    | 講習会の日程ページを 1 回ずつ取得し、本文のハッシュを比較 |
| `/api/cron/return-alerts` | 5 分ごと                         | 帰着予定を過ぎた入山計画の通知                            |

1 日 1 回を超える実行は Vercel の Pro 以上が必要です。Hobby では 1 日 1 回を超える式はデプロイに失敗します。Vercel は失敗した cron を再実行しないため、クマは 3 時間ごと（条件付き GET なので変化がなければ軽い）、講習会は 1 日 2 回（取得先への負荷を抑える）にして、1 回の失敗は次の実行で取り戻します。途中で止まった通知は、保存した進捗から次の実行で続きを送ります。
ローカルでは `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/return-alerts` で実行できます。

Redis のキーはすべて `labs:` で始まり、有効期限つきです。購読 90 日、クマ・講習会の登録 90 日、
入山計画は最後の通知から 24 時間、位置共有のルームは作成時に選んだ 2〜24 時間、通知 URL は最後の利用から 90 日、
リザルトは 7・30・90 日です。通知 URL・ルーム・入山計画の秘密値は SHA-256、合言葉は scrypt で保存します。
記録と全体の件数（索引）の書き込み・削除、ルームの人数上限、hook と端末の更新、定期実行のロック解放は Lua スクリプトで 1 回の操作にしています。入山計画は計画ごとのロック（180 秒。利用者の操作のルートの `maxDuration` は 60 秒、定期確認のルートは 280 秒で、Vercel Pro が必要）の中で変更と送信を行い、送る通知（警報・帰着・取り消し）を計画に保存してから送ります。Upstash への各要求は 5 秒で打ち切ります。応答が失われた（時間切れ・接続断）ときの扱いは操作ごとに決めて `STORE_RETRY_POLICY` にまとめ、テストで固定しています。読み取りと何度実行しても同じ状態になる書き込みは 2 回まで再試行し、条件付きの書き込み（ロック、CAS、値を確かめてから書く Lua）はキーを 1 回読み直して、自分の値が書かれていれば成功、書き込む前の状態のままなら 1 回だけ再実行します。同じ値を書き直す書き込み（期限や索引の更新）と条件のない書き込みは、読み直しでは実行の有無が分からないため、再実行しても同じ状態になることを利用して再試行します。カウンター（INCR）は二重に数えないよう再試行せず、要求を失敗として返します。1 回の操作の要求は 3 回までで、最悪時間の計算（15.3 秒）もこれに合わせています。入山計画と定期確認の予定（due 索引）、全体の件数（計画の記録が消える時刻を score とする索引）は 1 つの Lua スクリプトで同時に書き込みます。見守りの一覧は Lua スクリプトで (score, member) の順位からページングし、同じ score が多くても読み直しません。クマ・講習会の通知はバッチごとの進捗（索引の位置と再送する端末）を Redis に保存し、次の実行で続きから送ります。読めない形式の入山計画は、定期実行の結果に `invalid` として件数を出します（旧形式の変換はしません）。入山計画は 2 段階で作ります。作成直後の計画は未確定（10 分で消え、通知しない）で、ページが鍵の保存をストレージから読み戻して確認してから確定（arm）すると定期確認の対象になります。ページは保存を変更する操作（作成から確定まで、帰着・取消・変更、見守りの追加・更新）をすべて同じ Web Lock の下で、ストレージを読み直した値に対して行い、他タブの保存は storage イベントで取り込みます（読み込みだけでは書き戻しません）。保存済みの計画があれば作成せず、Web Locks のないブラウザーでは保存しません。計画の作成は接続元（IP のハッシュ）ごとに 1 日 10 件まで、確定済みの計画は作成した端末（Push 購読）ごとに同時に 3 件までで、上限の計数は計画の書き込みと同じ Lua スクリプトで行います。未確定の計画は見守り・状態確認・予定変更を受け付けず、取り消しても通知せず、帰着予定を過ぎたものの確定は 410 で拒否します。送信時に gone と判定された端末は、同じ書き込みで計画から外します。Push の送信要求はサーバーのインスタンスごとに同時に 25 件まで、1 回の notify では 5 件までで、枠は待っている呼び出しに 1 件ずつ順番に渡します。枠は送信要求の間だけ持ち、購読の読み込み（同時に 50 件まで）は枠の外で行います。上限がインスタンスごとなのは、送信するのが cron（各ルートは cron lock で同時に 1 実行）とわな通知の hook（IP ごとに 1 分 20 回、hook ごとに 1 分 6 回）だけで、同時に送るインスタンスは少ないためです。応答待ちは 10 秒、帰着予定の定期確認では 5 秒です。定期確認は期限の古い順に 100 件ずつ同時に始め、開始から 60 秒までは次の 100 件を取り続けます（その後は新しい計画を始めません）。各計画は、ロックを取ってから 90 秒を過ぎると新しい読み込みや送信を始めず、試行回数は端末ごとに outbox に記録し（最大 3 回）、時間切れで送れなかった端末は試行回数を使わずに outbox に残します。すべての Upstash 呼び出しと Push が時間切れまでかかる最悪の場合も、1 回の実行はルートの上限に収まり、この計算はテストで固定しています。わな通知の hook は、届いた端末（`delivered`）・今回届かなかった端末（`failed`）・登録端末（`devices`）の数を返し、`failed` が 0 でなければ呼び出し側が再度呼べます。Push 購読の保存は、読んだ記録（初回は記録がないこと）を条件に書き込み、同じ endpoint への同時の初回登録では一方だけが成功します。バッチは内容と元データの世代（revision）で識別し、端末ごとの送信済みの印は送信の後に付けます。
単体テストは実際の `@upstash/redis` クライアントを使い、`fetch` だけをメモリー上の Upstash REST の代替（`__tests__/unit/features/labs-notify/fake-upstash.ts`）に差し替えます。送信する REST の本文と、`automaticDeserialization: false` で SDK が返す値の形（HGETALL の平坦な配列、base64 の応答など）は SDK のものをそのまま検証し、実際の Upstash には接続しません。Lua スクリプトは代替が文面で識別して同じ操作を行うため、Lua の文法と Redis 上の動作は実環境で確認が必要です。自動パイプラインは無効にしています。
`VAPID_PUBLIC_KEY` と `VAPID_PRIVATE_KEY` が対応しない場合、起動時に環境変数の検証で停止します。
ブラウザーからの書き込みは `Origin` がサイトと一致する場合だけ受け付け、送信先はブラウザーのプッシュサービス
（FCM、Mozilla、Apple、Windows）に限ります。

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
