<!-- SPDX-License-Identifier: MIT -->

# DISAG RedDot受信互換・実装仕様（Saika Lane）

この文書は、Saika LaneでDISAG RedDotのライフル／ピストル標的プロファイルを実装するための、
独立実装向け互換仕様である。
シリアルポートを開いてから `Shot` を生成するまでの必須動作、バイト配置、検証、エラー回復、
Saika内の変更箇所、テストベクターを定義する。

DISAGの公式通信仕様や保守資料ではなく、同社による提携、承認、動作保証を示すものでもない。
メーカー公開資料から確認できる事項、独立した相互運用確認で確定したSaika受理形式、Saika固有の
設計値を明確に区別する。実機のパケットキャプチャ、第三者の抽出コード、機器固有IDは収録せず、
§11のフレームはこの文書用に作成した合成データである。

本文中の「必須」は適合実装が満たす条件、「推奨」は相互運用性または障害回復のために採用すべき
条件を表す。

## 1. 適用範囲と実装状態

### 1.1 対象プロファイル

| 項目                 | 値                                                       |
| -------------------- | -------------------------------------------------------- |
| 販売名               | DISAG RedDot Laserziel                                   |
| 公式型式             | `KT RDT ZIE 1`                                           |
| 製造者               | KNESTEL Technologie & Elektronik GmbH                    |
| 販売元               | DISAG GmbH & Co KG                                       |
| SaikaデバイスID      | `DISAG_KT_RDT_ZIE_1_RIFLE` / `DISAG_KT_RDT_ZIE_1_PISTOL` |
| SaikaベンダーID      | `DISAG`                                                  |
| ワイヤー上の種別     | `LG`（両プロファイル共通）                               |
| 通信方向             | ショットはRedDot → Saika、初期化・リンク制御は双方向     |
| ホストから送るデータ | 標的種別設定、`ENQ`、フレームへの `ACK` / `NAK`          |

| Saikaプロファイル           | Saika種目        | Saika標的コード | RedDot標的種別byte |
| --------------------------- | ---------------- | --------------- | -----------------: |
| `DISAG_KT_RDT_ZIE_1_RIFLE`  | `AIR_RIFLE_10M`  | `ISSF_AR_10M`   |             `0x01` |
| `DISAG_KT_RDT_ZIE_1_PISTOL` | `AIR_PISTOL_10M` | `ISSF_AP_10M`   |             `0x00` |

`KT RDT ZIE 1` は、KNESTELのEU適合宣言で `Typ / Model` として記載される型式である。現行のDISAG
取扱説明書では大文字・小文字だけが異なる `KT RDT Zie 1`、Bluetoothの機器名では
`KT RDT ZIE 1 S/N ####` と表記される。本書とSaikaの `modelName` は適合宣言の大文字表記
`KT RDT ZIE 1` に統一する。

`RDT-ZIE1` というハイフン表記は確認した公式資料にはなく、正式なモデル名として使用しない。
2つのデバイスIDはSaika内部の標的・採点プロファイルであり、メーカー型式そのものではない。
旧暫定ID `RDT_ZIE1_RIFLE` / `RDT_ZIE1_PISTOL` を保存済み設定から読み込んだ場合は、それぞれ
新IDとベンダー `DISAG` へ自動移行する。利用者向けのモデル名と内部IDを混同させない。末尾の
`RIFLE` / `PISTOL` は公式なハードウェアvariant名ではない。Saikaの `DISAG` もprotocol routing用の
ベンダーIDであり、法的な製造者名を表すフィールドではない。

本書はRS-232接続とSaika内のRifle/Pistolプロファイルを対象にする。Bluetooth接続、校正、保守、
ファームウェア更新は対象外である。PistolはRifleと同じ59 byte受信形式とwire discipline `LG` を使うが、
Saikaの標的・採点コンテキストを `ISSF_AP_10M` へ切り替えるだけでは足りない。接続ごとにRedDot本体へ
標的種別 `0x00` を設定する。Rifleでは `0x01` を設定する。

### 1.2 現在のSaika実装状況

現行のSaika Laneは、本書で定義したRedDot受信経路を実装している。

- `DisagFormatParser` とruntimeのprotocol sessionは同じ `RedDotStreamScanner` を使用する。
- `RedDotProtocolSession` が初回 `ENQ` probe、Rifle/Pistol標的種別の初期化、`ENQ` polling、
  `ACK` / `NAK`、timeout、write直列化を担当する。
- 標的種別の確定後は、poll予約中、poll応答待ちのどちらでも妥当な59 byteフレームを受理する。
  したがって、`ENQ` への応答として届く通常動作と、標的から先に届く自発送信の両方を同じ受信経路で
  扱える。初期化完了前のframeは機器のqueueを解放するため `ACK` するが、誤ったdevice scoreを記録しない
  よう `Shot` へ変換せず、warningを記録する。
- Rifleは正式な標的種別設定を1回試し、command ACKを確認できない場合だけ実機確認済みの従来型
  `ENQ` pollingへfallbackする。Pistolは誤採点防止のためfallbackせず接続を失敗させる。
- `DisagAdapter` が検証済み59 byte frameを選択中のAIR_RIFLE_10MまたはAIR_PISTOL_10Mの `Shot` へ変換する。
- RedDot接続ではASCII `S` / `R` を送らず、妥当なframeの変換成功時だけ着弾音を発生させる。
- port close/errorとprotocol write失敗は、旧portのclose完了後に1回だけ再接続する。接続世代が変わった
  handshake callbackは無効化する。
- UIへRifle/Pistolの2プロファイルを列挙し、接続前と各フレーム処理時に選択プロファイルとactive
  sessionの種目が一致することを検証する。接続中にsessionが終了または別種目へ変わった場合は、
  ショットを黙って破棄せず接続エラーとして停止・通知する。

合成fixtureによる§12.1〜§12.4の自動テストは実装済みである。§12.5の実port検証が完了するまでは、
文書上の状態を「実装済み（実機検証待ち）」とし、実機対応を保証しない。

### 1.3 根拠の区分

| 区分                   | 本書で使用する内容                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------- |
| メーカー公開情報       | 製品識別、RS-232/Bluetooth対応、PC直結の1:1配線、標的寸法、繰返し精度、OpticScore対応 |
| メーカー配布実装の観察 | RedDotViewのENQ周期、標的種別設定、ACK/NAK/STXの受信処理                              |
| 比較実装の観察         | 比較実装の初期化順、polling、59 byte受信、自発フレームを拒否しない状態遷移            |
| 独立相互運用確認       | 9600 8N1、59 byte配置、RedDotに `S` / `R` がないこと、座標方向と単位                  |
| Saika固有設計          | 100msのpolling、厳格なBCC検証、timeout、buffer上限、エラー分類、クラス分割            |

外部一次情報へのリンクは [参照元](../../../../SOURCES.md) にまとめている。

## 2. 物理接続とシリアル設定

### 2.1 配線

メーカーの旧版公開RedDot資料が「RedDot Laserziel―Auswertecomputer」の直結用として示すRS-232接続は、
次の1:1結線である。

| RedDot側 | ホスト側 | 信号       |
| -------: | -------: | ---------- |
|    pin 2 |    pin 2 | データ線   |
|    pin 3 |    pin 3 | データ線   |
|    pin 5 |    pin 5 | Signal GND |

Saikaの確認済み構成は、通常のUSB-RS-232変換器とRedDot同梱のストレートケーブルである。
この構成へさらにクロス（null-modem）ケーブルを挿入しない。USB変換器内で信号をクロスする製品も
あるため、製品名ではなく最終的なpin 2→2、3→3、5→5を確認する。

現行のメーカー取扱説明書には、RedDotをLAN対応OpticScore測定枠へ接続する別構成で「クロスした
RS-232データ線」を使う記載がある。これはRedDotとPC/USB変換器を直結する本書の構成とは接続相手が
異なる。ケーブル単体の呼称を流用せず、接続相手を含む最終配線で判断する。

### 2.2 ポート設定

| パラメーター       | Saika受信プロファイル |
| ------------------ | --------------------: |
| ボーレート         |                  9600 |
| データビット       |                     8 |
| パリティ           |                `none` |
| ストップビット     |                     1 |
| RTS/CTSフロー制御  |                   off |
| XON/XOFFフロー制御 |                   off |
| DTR                |                   off |
| RTS                |                   off |

Node SerialPortでは `rtscts: false`, `xon: false`, `xoff: false` を指定し、open後に可能なら
`port.set({ dtr: false, rts: false })` を完了してから最初の `ENQ` probeを送る。DTR/RTS設定APIを
提供しない環境では、少なくともハードウェアフロー制御へ利用しない。

受信データはバイナリー `Buffer` のまま扱う。フレーム全体をUTF-8文字列へ変換してから分割しては
ならない。BCCは任意の1 byteであり、文字列変換で値が失われる可能性がある。

## 3. リンク制御

### 3.1 制御byte

| 名前 | 16進 | 方向           | 意味                                           |
| ---- | ---: | -------------- | ---------------------------------------------- |
| STX  | `02` | RedDot → Saika | フレーム開始                                   |
| ENQ  | `05` | Saika → RedDot | 送信待ちデータの問い合わせ                     |
| ACK  | `06` | 両方向         | RedDot発: command受理、Saika発: 正常frame受理  |
| CR   | `0D` | RedDot → Saika | フィールド終端                                 |
| DC1  | `11` | Saika → RedDot | 設定commandのprefix                            |
| NAK  | `15` | 両方向         | RedDot発: データなし／拒否、Saika発: frame拒否 |
| ETB  | `17` | RedDot → Saika | BCC計算対象の終端                              |
| `$`  | `24` | RedDot → Saika | フレーム末尾                                   |

`NAK` は方向によって意味が異なる。`ENQ` に対してRedDotから返る単独の `0x15` は「現在データなし」で
あり、エラー、ミスショット、切断として扱わない。音を鳴らさず、`Shot` も生成しない。

### 3.2 禁止するモードコマンド

RedDotフレームに試射/本射モードはなく、RedDotへASCII `S` / `R` を送らない。Saikaの試射/本射は
現在の `AdapterContext.mode` を使用する。接続、再接続、`ModeSwitched`、`StageAdvanced`、
`PhaseChanged` のいずれでも、デバイスIDがいずれかのRedDotプロファイルなら `sendMode()` は正常終了する
no-opでなければならない。

本書のプロファイルでSaikaが送信してよいのは、§3.3の標的種別設定、`ENQ`、frameへの `ACK` / `NAK`
だけである。標的種別byteの `0x00` / `0x01` をMT201のASCII `S` / `R` と混同しない。

### 3.3 Rifle/Pistol標的種別の初期化

port open後、通常pollingを開始する前に次を実行する。

1. 実機確認済みの既存経路と同じく、最初のhost byteとして `ENQ` をwrite/drainする。
2. RedDotから単独 `NAK` またはframeを受けた時点でprobe完了とする。300ms無応答でもprobeを打ち切り、
   次へ進む。probeで受けたframeは `ACK` するが、標的種別が未確定なので記録しない。
3. Saikaから3 byte `11 00 01` をwrite/drainする。
4. RedDotから単独 `ACK` (`06`) を待つ。
5. Rifleなら `01`、Pistolなら `00` を1 byteでwrite/drainする。
6. 標的種別byteの後に追加ACKは要求せず、正式設定の成功をinfoログへ記録して100ms後の `ENQ` を予約する。

`11 00 01` へのACK待ちは500msで打ち切る。同じ3 byte commandは再送しない。最初のcommandが受理されて
ACKだけが失われた場合、RedDotが次の1 byteを標的種別として待っている可能性があり、commandを再送すると
先頭の `0x11` を種別値として消費させる危険があるためである。

Rifleではtimeout時に期待値 `01` を1回だけwrite/drainし、種別待ち状態だった場合にparserを安全に閉じる。
その後500msの静穏時間を置き、遅延ACKを制御応答として消費してから、従来と同じ `ENQ` pollingを開始する。
このfallbackはwarningとして記録し、connectionはfallback完了後に初めてreadyとする。Pistolではdevice
scoreがRifle規則のままになる危険があるためfallbackせず、`RED_DOT_INITIALIZATION_FAILED` で接続を失敗
させる。接続または再接続のたびに同じ判定を行い、標的本体が前回値を保持することへ依存しない。

このcommandはRifle/Pistolで共通だが、ACK後の1 byteが異なる。59 byte frame内のwire discipline `LG` は
両方で同じなので、frameだけから現在の標的種別を復元してはならない。device scoreを採用するSaikaでは、
Pistolを `ISSF_AP_10M` として正しく採点させるためにもこのwire-level設定が必要である。

### 3.4 比較実装の観察と自発送信への対応

比較対象は、現在のSaika Lane worktree、ローカルで解析した比較実装 1.5.5、DISAG配布の
RedDotView 1.5.8.6である。後二者はバイナリー動作の観察結果であり、「解析で確認できず」は機能が存在
しないという断定ではない。

| 比較項目                 | Saika Lane                                                                                      | 比較実装 1.5.5                                                  | DISAG RedDotView 1.5.8.6                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| 最初の通信               | 実機確認済み経路を維持して `ENQ`                                                                | version取得                                                     | open時に300ms `ENQ` timerを開始                                   |
| 接続・初期化の順序       | `ENQ` probe → `11 00 01` → `ACK` → target byte                                                  | version → revision → `11 00 01` → `ACK` → target byte → polling | 最初の `NAK` でconnected扱い → version/revision。競技読込時に設定 |
| Rifle/Pistol設定値       | Rifle=`01`、Pistol=`00`                                                                         | Rifle=`01`、Pistol=`00`                                         | Rifle=`01`、Pistol=`00`                                           |
| 設定commandの再送        | しない。ACK喪失時に `0x11` がtarget byteとして消費される競合を避ける                            | 約500ms進展がなければ初期化状態をresetして再試行                | 専用の再送・復旧経路は解析で確認できず                            |
| command ACK欠落時        | Rifleは `01` を1回送り500ms静穏後にlegacy polling。Pistolは接続error                            | 初期化を再試行。legacy pollingへのfallbackなし                  | command activityが残り、`ENQ` pollingが実質停止。fallbackなし     |
| 接続readyの判定          | 正式設定またはRifle fallback完了まで `connect()` を完了しない                                   | 初期化シーケンス完了後                                          | 最初の `ENQ` に対する `NAK` でconnected扱い                       |
| `ENQ` 間隔               | 100ms                                                                                           | 100ms ticker                                                    | 300ms timer                                                       |
| 未応答中の重複 `ENQ`     | 送らない                                                                                        | tickerと内部activityで制御                                      | command activity中はtimer処理を抑制                               |
| 未処理 `ENQ` のないframe | 初期化完了後なら受理                                                                            | 受理                                                            | 受理                                                              |
| 初期化完了前のframe      | device queue解放のため `ACK` するが、誤採点防止のため破棄してwarning                            | 明示的な「初期化済み」受理gateは解析で確認できず                | 明示的な「未処理ENQあり」受理gateは解析で確認できず               |
| 自発frame受信後          | `ACK` 後にpoll timerを100msへ張り直す                                                           | frame処理と100ms tickerは独立                                   | frame受信はtimer上の未処理ENQ有無に依存しない                     |
| 連続shotの時間guard      | なし。同一座標・得点の正当な連射を保持                                                          | 前回shotから1秒未満なら内容にかかわらず二重カウントとして破棄   | 同等のguardは解析で確認できず                                     |
| frame検証                | 59 byte固定構造、制御位置、printable ASCII、BCC、`LG`、数値fieldを検証                          | `STX` 始まりの59 byteを専用scannerで処理                        | `STX` と59 byte長でshot frameを認識                               |
| 初期化結果の診断         | 正式成功=info、Rifle fallback=warning、Pistol失敗=error。Debug Paneとfile logへ保存             | RedDot初期化方式を明示する同等ログは解析で確認できず            | 同等の永続診断ログは解析で確認できず                              |
| Saikaが追加した安全性    | commandを1回に限定、遅延ACK静穏時間、profile別fail-open/closed、timer generation、初期frame遮断 | 比較対象外                                                      | 比較対象外                                                        |

したがって、確認できた2実装はいずれも通常運用でpollingしており、「機器がENQなしで常に自発送信する」
根拠にはならない。一方、両実装とも受信をpoll応答だけへ制限していない。Saikaもこの組合せを採用する。

- `ENQ` pollingは既定で維持し、passive-onlyや自動判定modeは追加しない。
- 初期化完了後は、poll予約中、poll応答待ちのどちらでも正常frameを `ACK` して1回だけ後段へ渡す。
- polling開始後に自発frameを受信したらpoll timerを張り直すため、直後に余分な `ENQ` を重ねない。
- 初期化中の自発frameは `ACK` して破棄し、その事実をwarningへ記録する。標的種別ACKまたはfallback静穏
  時間の期限は延長しない。
- 比較実装で観察した「前回shotから1秒未満なら内容に関係なく破棄」という時間guardは採用しない。
  正当に連続した2射を失うためであり、Saikaはframe内容による重複排除も行わない。

これはhost受信側が自発送信に耐えることを意味する。RedDot実機がRS-232またはBluetooth SPPでENQなしに
送るか、ACKを保留した場合に同一frameを再送するかは、§12.5の実port試験で別途確認する。

## 4. ポーリング状態機械

### 4.1 Saika既定値

次はメーカー保証値ではなく、相互運用確認に基づくSaikaの実装定数である。テストでは注入可能な
設定値と時計を使用する。

```ts
const INITIALIZATION_TIMEOUT_MS = 500;
const FALLBACK_SETTLE_MS = 500;
const POLL_INTERVAL_MS = 100;
const RESPONSE_TIMEOUT_MS = 300;
const MAX_BUFFER_BYTES = 4096;
const MAX_INVALID_RESPONSES_PER_POLL = 3;
```

同時に存在できるpoll timerは最大1個、初期化／poll応答を待つtimeoutも共用で最大1個とする。前回の
問い合わせが完了またはtimeoutする前に次の `ENQ` を送らない。

### 4.2 状態

| 状態                       | 意味                                                    |
| -------------------------- | ------------------------------------------------------- |
| `STOPPED`                  | listener、timer、保留writeがない                        |
| `PROBING`                  | 最初の `ENQ` をwrite/drain中                            |
| `AWAITING_PROBE_RESPONSE`  | 最初の `ENQ` に対する `NAK` / frameまたはtimeout待ち    |
| `INITIALIZING_TARGET_TYPE` | commandまたは標的種別byteをwrite/drain中                |
| `AWAITING_TARGET_TYPE_ACK` | `11 00 01` のwrite/drain後、RedDotの `ACK` を待っている |
| `FALLBACK_SETTLING`        | Rifleの `01` 同期送信後、遅延ACKを吸収している          |
| `POLL_SCHEDULED`           | 次の `ENQ` を待っている                                 |
| `AWAITING_RESPONSE`        | `ENQ` のwrite/drainが完了し、応答を待っている           |
| `WRITING_REPLY`            | frameへの `ACK` または `NAK` をwrite/drain中            |

### 4.3 遷移

| 現在状態                   | 入力・事象                 | 必須動作                                                            | 次状態                     |
| -------------------------- | -------------------------- | ------------------------------------------------------------------- | -------------------------- |
| `STOPPED`                  | port open                  | bufferを空にし、最初の `ENQ` をwrite/drain                          | `AWAITING_PROBE_RESPONSE`  |
| `AWAITING_PROBE_RESPONSE`  | 単独 `NAK`                 | probe timeoutを取消し、`11 00 01` をwrite/drain                     | `AWAITING_TARGET_TYPE_ACK` |
| `AWAITING_PROBE_RESPONSE`  | 妥当なframe                | `ACK` drain後にframeを破棄・warning記録し、`11 00 01` をwrite/drain | `AWAITING_TARGET_TYPE_ACK` |
| `AWAITING_PROBE_RESPONSE`  | 300ms timeout              | 未完成bufferを破棄・warning記録し、`11 00 01` をwrite/drain         | `AWAITING_TARGET_TYPE_ACK` |
| `AWAITING_TARGET_TYPE_ACK` | RedDotから単独 `ACK`       | profileに対応する `01` / `00` をwrite/drainし、100ms後のpollを予約  | `POLL_SCHEDULED`           |
| `AWAITING_TARGET_TYPE_ACK` | RedDotから単独 `NAK`       | 1 byte消費し、初期化timeoutを維持                                   | 状態維持                   |
| `AWAITING_TARGET_TYPE_ACK` | Rifleで500ms timeout       | `01` を1回だけwrite/drainし、fallback静穏timerを開始                | `FALLBACK_SETTLING`        |
| `AWAITING_TARGET_TYPE_ACK` | Pistolで500ms timeout      | errorを記録し、接続初期化を失敗させる                               | `STOPPED`                  |
| `FALLBACK_SETTLING`        | 500ms timeout              | fallback warningを記録し、100ms後のpollを予約                       | `POLL_SCHEDULED`           |
| `AWAITING_RESPONSE`        | RedDotから単独 `NAK`       | 1 byte消費。eventを発生させず、100ms後のpollを予約                  | `POLL_SCHEDULED`           |
| 初期化完了後               | 完成した不正frame          | 不正回数を加算し、frameを破棄して `NAK` をwrite/drain               | 下記規則による             |
| 初期化完了後               | 妥当な59 byte frame        | poll/応答timerを取消し、`ACK` drain後に受信時刻とframeを1回渡す     | `POLL_SCHEDULED`           |
| 初期化完了前               | 妥当な59 byte frame        | 初期化期限を維持し、`ACK` drain後にframeを破棄してwarningを記録     | 元の初期化状態             |
| `AWAITING_RESPONSE`        | response timeout           | 未完成bufferを破棄し、recoverable warningを記録して次pollを予約     | `POLL_SCHEDULED`           |
| `POLL_SCHEDULED`           | timer                      | `ENQ` をwrite/drainし、応答timeoutを開始                            | `AWAITING_RESPONSE`        |
| 任意                       | close / error / disconnect | timerとtimeoutを取消し、bufferを空にし、listenerを解除              | `STOPPED`                  |

初期化完了後、不正応答が1回目または2回目なら、`NAK` のdrain後に応答timeoutを張り直して
`AWAITING_RESPONSE` へ戻る。3回目の `NAK` をdrainしたらbufferと不正回数を空にして次pollを予約し、
`POLL_SCHEDULED` へ移る。初期化中は同じ上限でbufferを再同期した後、元の初期化状態へ戻り、標的種別ACK
またはfallback静穏timerの期限を延長しない。これは壊れた機器やノイズにより通信loopが占有されるのを
防ぐSaika側の上限である。

### 4.4 write順序と多重実行防止

- `port.write()` のcallback成功だけで完了とせず、`port.drain()` の完了まで待つ。
- 初期化command、標的種別byte、`ENQ`、`ACK`、`NAK` のwriteは単一のPromise chainまたはqueueで
  直列化する。
- 正常フレームは `ACK` のdrain成功後にだけ後段へ渡す。ACK失敗時はショットを生成せず接続エラーへ
  移行する。ACK前にイベントを発生させると、再送時に同じ射撃を二重記録し得る。
- 同じ座標・得点の連続射撃は有効なので、フレーム内容による重複排除は行わない。
- data listener内の非同期処理は受信順に直列化し、`WRITING_REPLY` 中に届いたbyteも順序を保って処理する。
- reconnect後は新しいsessionを1個だけ開始する。旧timerや旧listenerからのcallbackはgeneration IDまたは
  `AbortController` で無効化する。

## 5. 59 byteショットフレーム

### 5.1 固定配置

offsetは0始まり、終端を含む。全長は必ず59 byteである。

| offset | 長さ | 名前         | 形式・必須値                  |
| -----: | ---: | ------------ | ----------------------------- |
|      0 |    1 | `stx`        | `0x02`                        |
|    1–8 |    8 | `reservedA`  | printable ASCII、意味は未規定 |
|      9 |    1 | `cr1`        | `0x0D`                        |
|  10–17 |    8 | `reservedB`  | printable ASCII、意味は未規定 |
|     18 |    1 | `cr2`        | `0x0D`                        |
|  19–20 |    2 | `discipline` | ASCII `LG`                    |
|     21 |    1 | `cr3`        | `0x0D`                        |
|  22–23 |    2 | `reservedC`  | printable ASCII、意味は未規定 |
|     24 |    1 | `cr4`        | `0x0D`                        |
|  25–27 |    3 | `reservedD`  | printable ASCII、意味は未規定 |
|     28 |    1 | `cr5`        | `0x0D`                        |
|  29–30 |    2 | `reservedE`  | printable ASCII、意味は未規定 |
|     31 |    1 | `cr6`        | `0x0D`                        |
|  32–35 |    4 | `score`      | ASCII `dd.d`、`00.0`〜`10.9`  |
|     36 |    1 | `cr7`        | `0x0D`                        |
|  37–42 |    6 | `distance`   | ASCII `dddd.d`                |
|     43 |    1 | `cr8`        | `0x0D`                        |
|  44–48 |    5 | `x`          | ASCII `[+-]dddd`              |
|     49 |    1 | `cr9`        | `0x0D`                        |
|  50–54 |    5 | `y`          | ASCII `[+-]dddd`              |
|     55 |    1 | `cr10`       | `0x0D`                        |
|     56 |    1 | `etb`        | `0x17`                        |
|     57 |    1 | `bcc`        | §6で算出する1 byte            |
|     58 |    1 | `terminator` | ASCII `$`、`0x24`             |

`reservedA`〜`reservedE` は固定長を保ってDTOへ保存してよいが、値を `00000000`、`01`、`1.0` などへ
固定してはならない。現在意味を確定できないため、printable ASCII（各byte `0x20`〜`0x7E`）であること
だけを検査する。

### 5.2 構文検査

フレームを意味変換する前に、次を順に検査する。

1. `frame.length === 59`
2. offset 0、56、58がそれぞれ `STX`、`ETB`、`$`
3. offset 9、18、21、24、28、31、36、43、49、55がすべて `CR`
4. reserved領域がprintable ASCII
5. BCCが一致
6. `discipline === "LG"`
7. `score` が `^(?:0[0-9]|10)\.[0-9]$`
8. `distance` が `^[0-9]{4}\.[0-9]$`
9. X/Yがそれぞれ `^[+-][0-9]{4}$`
10. scoreを0.1点単位の整数へ変換した値が0〜109

1〜10の失敗はフレーム単位のfatal errorであり、`Shot` を生成しない。protocol sessionは
recoverable errorとして記録し、§4に従い `NAK` を返す。

## 6. BCC

BCCはoffset 0の `STX` からoffset 56の `ETB` まで、57 byteすべてのXORで算出する。offset 57の
BCC自身とoffset 58の `$` は計算へ含めない。XOR結果が `0x20` 未満なら `0x20` を加算する。

```ts
export function calculateRedDotBcc(bytesThroughEtb: Uint8Array): number {
  let value = 0;

  for (const byte of bytesThroughEtb) {
    value ^= byte;
  }

  return value < 0x20 ? value + 0x20 : value;
}

export function hasValidRedDotBcc(frame: Buffer): boolean {
  return frame.length === 59 && calculateRedDotBcc(frame.subarray(0, 57)) === frame[57];
}
```

実装上はJavaScriptのbitwise演算結果を `& 0xff` してもよい。入力がbyte列である限り結果は
0〜255に収まる。小さいXOR値の補正分岐は、例えば `[0x02, 0x17]` のXOR `0x15` が `0x35` に
なることを単体テストする。

## 7. フィールド変換

### 7.1 推奨DTO

文字列を検証してから、少なくとも次の値へ変換する。

```ts
interface RedDotParsedFrame {
  discipline: 'LG';
  scoreTenths: number;
  distanceRaw: number;
  distanceMm: number;
  xRaw: number;
  yRaw: number;
  xMm: number;
  yMm: number;
  reserved: readonly [string, string, string, string, string];
}
```

数値変換は次のとおりである。

```text
scoreTenths = integerPart(score) × 10 + fractionalDigit(score)
xRaw = signed decimal integer from x
yRaw = signed decimal integer from y
xMm = xRaw / 100
yMm = yRaw / 100
distanceRaw = decimal number from distance
distanceMm = distanceRaw / 100
```

scoreには浮動小数点の乗算を使わず、整数部と小数1桁を分けて `Score` の0.1点単位整数を作る。

### 7.2 座標系

- 原点は標的中心。
- Xは右が正、左が負。
- Yは上が正、下が負。
- X/Yの1 raw unitは0.01mm。
- Canvasなど下向きが正の画面座標へ描画するときだけYを反転する。ドメインの `ImpactPoint` では
  反転しない。

```text
screenX = centerX + xMm × pixelsPerMm
screenY = centerY - yMm × pixelsPerMm
```

中心距離は概ね次を満たす。

```text
distanceRaw ≈ hypot(xRaw, yRaw)
distanceMm ≈ hypot(xMm, yMm)
```

`distance` はraw unitの小数第1位まで、すなわち表示上0.001mmまで表せるが、測定精度を意味しない。
メーカー公開値の繰返し精度は±0.1mmである。丸め・切捨てやファームウェア差を許容するため、
`abs(distanceRaw - hypot(xRaw, yRaw)) <= 0.100001` を整合性の目安とする。超過しても
警告だけに留め、BCCと構造が正しいフレームを拒否しない。座標は `distance` から再生成しない。

### 7.3 採点と仮想弾

| 項目           | Rifleプロファイル | Pistolプロファイル |
| -------------- | ----------------- | ------------------ |
| 標的           | `ISSF_AR_10M`     | `ISSF_AP_10M`      |
| 仮想弾径       | 4.5mm             | 4.5mm              |
| 仮想弾半径     | 2.25mm            | 2.25mm             |
| 採点方式       | outer-edge        | outer-edge         |
| 小数点採点step | 半径方向0.25mm    | 半径方向0.8mm      |
| 最大スコア     | 10.9              | 10.9               |

4.5mmはレーザースポット径ではなく、採点・描画上の仮想弾径である。詳細なリング寸法とSaikaの採点式は
[標的・採点データ](../../../../common/TARGET_SPEC.md) を参照する。

RedDotが通知したscoreを `Shot.score` に設定する。後段の `USBDataPipeline` はこれを
`ShotData.score` として渡し、`RecordShotHandler` が `deviceScore` として保存する。座標から計算した
Saika scoreとの差は既存のdiscrepancy検出へ渡すが、不一致だけを理由にフレームを拒否しない。

### 7.4 モード、時刻、ミス

- モードはフレームにない。変換時点の `AdapterContext.mode` をそのまま `Shot.mode` に使う。
- timestampは、59 byteが揃い構造検査を開始した時刻を保存する。ACK完了時刻へ置き換えない。
- `shotNumber` は `AdapterContext.shotNumber`、`seriesNumber` は他アダプターと同じく0で生成する。
- inner tenは `TargetDesign.forDiscipline(context.discipline).isInnerTen(impactPoint)` で判定する。
- このプロファイルでは座標なしを表す特殊値を確認していない。scoreが `00.0` でも有効なX/Yがある
  フレームは座標付き0点として扱い、推測で `impactPoint: null` にしない。

`context.discipline` は `AIR_RIFLE_10M` または `AIR_PISTOL_10M` だけを受け付ける。接続マネージャーは
デバイスIDごとに前者または後者との一致を検証する。両プロファイルとも、共有受信形式の種別
`LG` 以外のフレームは拒否する。

## 8. ストリーム分割と再同期

serialportの1回の `data` eventと1フレームは対応しない。1 byteずつ分割される場合、複数応答が結合
される場合、単独 `ACK` / `NAK` とフレームが同じchunkに入る場合をすべて処理する。

推奨scannerの処理は次のとおりである。

1. chunkを内部buffer末尾へ追加する。
2. bufferが4096 byteを超えたら、最後に現れた `STX` 以降59 byte未満だけを残す。見つからなければ
   全消去し、recoverable overflowを記録する。
3. 先頭が単独 `ACK` なら1 byte消費して `ack` eventを返し、1へ戻る。
4. 先頭が単独 `NAK` なら1 byte消費して `idle` eventを返し、1へ戻る。
5. 先頭が `STX` でなければ、次の `ACK`、`NAK`、`STX` までをnoiseとして破棄する。
6. `STX` から59 byte未満なら、追加chunkを待つ。
7. 59 byte候補の固定制御位置が不正なら `invalid-structure` を返し、先頭の `STX` 1 byteだけを
   捨てて再走査する。これにより候補内の次の `STX` へ同期できる。
8. 固定制御位置が正しければ、同じ `RedDotFrameDecoder` でBCCと§5.2の全フィールドを検査する。
   拒否された候補59 byteを消費し、理由付き `invalid-frame` を返す。
9. すべて妥当なら59 byteを消費し、raw frame、解析済みDTO、受信時刻を持つ `frame` eventを返す。
10. bufferが空になるか未完成候補になるまで繰り返す。

noiseの破棄だけでは `NAK` を送らない。`STX` から始まる完成候補を拒否した場合にだけ
protocol sessionが `NAK` を送る。scannerはバイト列の認識、sessionはpollと返信、adapterは意味変換
という責務を混在させない。

## 9. エラーとログ

| 条件                          | 分類               | serial返信 | Shot | 利用者向け動作                             |
| ----------------------------- | ------------------ | ---------: | ---: | ------------------------------------------ |
| 初期probeの300ms無応答        | recoverable probe  |       なし | なし | warning後、正式initializationを試す        |
| 初期化commandへの単独 `ACK`   | 正常initialization |  `01`/`00` | なし | 対応profileを設定しinfoを記録              |
| 初期化中の単独 `NAK`          | 待機中             |       なし | なし | timeoutまで待機                            |
| Rifleでcommand ACK timeout    | compatibility      |       `01` | なし | 静穏時間後fallbackしwarningを記録          |
| Pistolでcommand ACK timeout   | configuration      |          — | なし | errorを記録して接続を失敗させる            |
| 初期化完了前の正常frame       | safety guard       |      `ACK` | なし | frameを破棄してwarningを記録               |
| polling中の単独 `NAK`         | 正常idle           |       なし | なし | 表示・音・errorなし                        |
| 未完成フレーム                | 待機中             |       なし | なし | timeoutまでは何もしない                    |
| 構造/BCC/wire discipline不正  | recoverable frame  |      `NAK` | なし | warning、次フレームを受信可能にする        |
| Saikaのcontext discipline不正 | configuration      |      `ACK` | なし | 設定error。deviceへの再送要求はしない      |
| distance整合性超過            | diagnostic         |      `ACK` | 生成 | warningのみ                                |
| device scoreと再計算値の差    | diagnostic         |      `ACK` | 生成 | 既存discrepancy loggerへ渡す               |
| 初期化/ACK/ENQ/NAK write失敗  | connection error   |          — | なし | 初期化中は接続失敗、接続後は既存の回復処理 |
| port close/error              | connection error   |          — | なし | 既存の再接続処理                           |
| buffer上限超過                | recoverable stream | 状況による | なし | 再同期しwarning                            |

正式設定成功はcode `RED_DOT_TARGET_TYPE_CONFIGURED` のinfo、Rifle fallbackはcode
`RIFLE_LEGACY_POLLING_FALLBACK` のwarningとして、profile、timeout、静穏時間、poll間隔とともに記録する。
Pistol初期化失敗はcode `RED_DOT_INITIALIZATION_FAILED` のerrorとする。これらは既存の `IpcLogger` を通るため、
開いているDebug Paneへリアルタイム表示され、同じmetadataをアプリの `logs/combined.log` に保存する。
errorは `logs/error.log` にも保存する。Debug Pane専用の別経路や一時的なconsole出力だけにしない。

通常ログは状態、offset、error code、byte数だけを残す。実射フレーム、座標、得点をinfoログへ出さない。
raw hexは開発者が明示的に有効化したdebugログだけに限定し、issueや公開fixtureへ貼らない。

## 10. Saika Laneへの組み込み設計

### 10.1 責務と推奨ファイル

| コンポーネント              | 推奨配置                                                  | 責務                                       |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| `RedDotStreamScanner`       | `target/infra/parsers/disag/RedDotStreamScanner.ts`       | chunk結合、候補抽出、decoder呼出し、再同期 |
| `RedDotChecksum`            | `target/infra/parsers/disag/RedDotChecksum.ts`            | BCC算出と照合                              |
| `RedDotFrameDecoder`        | `target/adapters/disag/RedDotFrameDecoder.ts`             | 固定offset検証、ASCIIと数値のDTO化         |
| `RedDotCoordinateConverter` | `target/adapters/disag/RedDotCoordinateConverter.ts`      | raw座標からmmへの変換                      |
| `DisagAdapter`              | `target/adapters/DisagAdapter.ts`                         | context検証と `Shot` 生成                  |
| `RedDotProtocolSession`     | `connection/infra/usb/reddot/RedDotProtocolSession.ts`    | 標的種別、ENQ、ACK/NAK、timer、write直列化 |
| `RedDotTargetProtocol`      | `connection/infra/usb/reddot/RedDotTargetProtocol.ts`     | 機種検証、port設定、session・mode操作      |
| `TargetProtocolRegistry`    | `connection/infra/usb/protocol/TargetProtocolRegistry.ts` | device IDからhardware protocolを選択       |
| `USBConnectionManager`      | 既存ファイル                                              | protocol lifecycleとpipelineを接続         |

ファイル名は変更してよいが、scanner、意味decoder、protocol sessionの責務境界は保つ。

### 10.2 既存ファイルの必須変更

1. [`targetDeviceDefinitions.ts`](../../../../../saika-lane/src/main/modules/target/domain/targetDeviceDefinitions.ts)
   に `DISAG_KT_RDT_ZIE_1_RIFLE` / `DISAG_KT_RDT_ZIE_1_PISTOL` を定義する。どちらも
   `manufacturer: 'DISAG'`、`modelName: 'KT RDT ZIE 1'` とし、対応種目はそれぞれ
   `['AIR_RIFLE_10M']` / `['AIR_PISTOL_10M']` に限定する。旧 `RDT_ZIE1_PISTOL` は保存設定の
   migration入力としてだけ扱い、装置定義には残さない。`DISAG_DEFAULT` は本書の対応対象へ含めない。
2. [`DisagFormatParser.ts`](../../../../../saika-lane/src/main/modules/target/infra/parsers/DisagFormatParser.ts)
   のXML風スタブを削除する。runtimeでprotocol sessionがscannerを直接使う場合も、同じscannerを
   利用する薄いwrapperにして、異なるDISAG形式を二重実装しない。
3. [`DisagAdapter.ts`](../../../../../saika-lane/src/main/modules/target/adapters/DisagAdapter.ts) を§7の
   変換へ置き換える。現行 `RawData` interfaceを維持するなら、protocol sessionで検証済みであっても
   同じpureな `RedDotFrameDecoder` を再実行する。検証ロジックを複製してはならない。
4. [`target.module.ts`](../../../../../saika-lane/src/main/modules/target/target.module.ts) でDISAG
   adapterをメーカーID `DISAG` へ登録し、Rifle/Pistol両方のdevice IDを割り当てる。
   `DISAG_DEFAULT` はこのadapterへ割り当てない。
5. [`TargetProtocolRegistry.ts`](../../../../../saika-lane/src/main/modules/connection/infra/usb/protocol/TargetProtocolRegistry.ts)
   がdevice IDからRedDot protocolを選び、`RedDotTargetProtocol` がRifle/Pistolをwire target typeへ
   対応付けてsessionを開始する。有効フレームだけをpipelineへ渡す。
6. [`RedDotTargetProtocol.ts`](../../../../../saika-lane/src/main/modules/connection/infra/usb/reddot/RedDotTargetProtocol.ts)
   がopen後のDTR/RTS設定、接続前・frameごとの種目検証、RedDotでの `sendMode()` no-opを所有する。
7. [`USBDataPipeline.ts`](../../../../../saika-lane/src/main/modules/connection/infra/usb/USBDataPipeline.ts)
   は、既に検証・フレーミング済みの `Buffer` と受信時刻を処理できる入口を持つ。RedDotでは
   `SerialDataParser` のstream bufferへ再投入せず、その2値からimmutableな `RawData` を作って変換する。
   `NAK`、noise、部分frameをこの入口へ渡さず、変換成功1件につき `onShotDetected` をdata eventの
   直前に1回だけ呼ぶ。既存デバイスの直接受信経路と着弾音タイミングはこの対応では変更しない。
8. disconnect、unexpected close、reconnectのどの経路でもprotocol sessionの `stop()` を先に呼び、
   data listener、poll timer、timeout、保留bufferを残さない。接続世代を更新して旧callbackを無効化し、
   unexpected close/errorでは `disconnected` を通知して旧portのclose完了後に再接続する。

RedDot接続では `USBConnectionConfig.deviceId` を必須とし、メーカーIDが `DISAG` という理由だけで
protocol sessionを開始しない。device IDが欠落するか対応する2プロファイル以外ならconfiguration
errorにする。変換には必ず `convertByDeviceId()` を使い、汎用のDISAG adapter fallbackへ依存しない。
active sessionはRifleなら `AIR_RIFLE_10M`、Pistolなら `AIR_PISTOL_10M` でなければportをopenする前に
configuration errorとし、正しい競技を選択するまでpollingを開始しない。

接続完了後に [`ConnectToTargetHandler.ts`](../../../../../saika-lane/src/main/modules/connection/application/handlers/ConnectToTargetHandler.ts)
や [`connection.module.ts`](../../../../../saika-lane/src/main/modules/connection/connection.module.ts) が
`sendMode()` を呼ぶ構造は維持してよい。device-awareなno-opを通信境界に置くことで、すべての呼出し
経路からRedDotへの `S` / `R` を防ぐ。

### 10.3 end-to-end処理順

1. UIでRedDotプロファイルと、それに対応する `AIR_RIFLE_10M` または `AIR_PISTOL_10M` を選ぶ。
2. 9600 8N1、flow controlなしでportをopenする。
3. 最初に `ENQ` を送り、`NAK` / frameまたは300ms timeoutで既存linkのprobeを終える。
4. `11 00 01` を1回送り、RedDotの `ACK` 後にRifle=`01`／Pistol=`00` を送る。
5. 正式設定に成功したらinfoを記録する。ACK timeout時はRifleだけ `01` と500ms静穏時間を経てfallbackし、
   warningを記録する。Pistolは接続errorにする。
6. 接続ready後、100ms間隔の `ENQ` pollingを開始する。
7. 単独 `NAK` なら何も生成せず次pollへ進む。
8. scannerが59 byte候補を確定し、decoderが構造、BCC、discipline、score、distance、X/Yを検査する。
9. 正常なら `ACK` をdrainし、frameと受信時刻をpipelineへ1回渡す。未処理ENQの有無は受理条件にしない。
10. adapterが同じdecoderの結果からscore、distance、X/Yを取得する。
11. adapterが現在のsession modeと、選択プロファイルに対応する `ISSF_AR_10M` / `ISSF_AP_10M` を使って
    `Shot` を作る。
12. pipelineが着弾音通知を1回発生させ、`ShotData` をemitする。
13. `RecordShotHandler` がdevice scoreを保存し、座標再計算との差を診断する。

## 11. 合成テストベクター

### 11.1 正常フレーム

これは実射データではなく、3-4-5の直角三角形になる座標を選んで作成した合成fixtureである。

```text
<STX>00000000<CR>00000000<CR>LG<CR>01<CR>1.0<CR>01<CR>09.0<CR>0500.0<CR>+0300<CR>+0400<CR><ETB>:$
```

59 byteの16進表現:

```text
0230303030303030300d30303030303030300d4c470d30310d312e300d30310d30392e300d303530302e300d2b303330300d2b303430300d173a24
```

期待結果:

| 項目                   | 値                                   |
| ---------------------- | ------------------------------------ |
| byte長                 | 59                                   |
| BCC計算対象            | offset 0〜56                         |
| 算出BCC                | `0x3A`（ASCII `:`）                  |
| discipline             | `LG`                                 |
| scoreTenths            | 90                                   |
| distanceRaw / mm       | `500.0` / `5.000mm`                  |
| xRaw / xMm             | `+300` / `+3.00mm`                   |
| yRaw / yMm             | `+400` / `+4.00mm`                   |
| `hypot(xMm, yMm)`      | `5.00mm`                             |
| `ISSF_AR_10M` innerTen | `false`                              |
| mode                   | fixture内になし。テストcontextを使用 |

reserved値はfixtureを構成するための任意値であり、実装が同じ値を要求してはならない。

Pistolプロファイルの統合fixtureは、同じ `LG` フレームのscoreだけを `10.3` に置き換えてBCCを
再計算する。座標 `(+3.00mm, +4.00mm)` は `ISSF_AP_10M` のinner ten境界上にあるため、期待値は
`Score(103)`、`innerTen: true` である。このfixtureは共有通信経路と標的マッピングのテスト用であり、
実射データではない。

### 11.2 符号付き座標fixture

2桁のscore整数部と負のYを同時に確認する合成fixtureである。

```text
<STX>00000000<CR>00000000<CR>LG<CR>01<CR>1.0<CR>01<CR>10.1<CR>0223.6<CR>+0100<CR>-0200<CR><ETB>1$
```

```text
0230303030303030300d30303030303030300d4c470d30310d312e300d30310d31302e310d303232332e360d2b303130300d2d303230300d173124
```

全長は59 byte、BCCは `0x31`（ASCII `1`）。期待結果はscore 101、X `+1.00mm`、Y `-2.00mm`、
distance `2.236mm` である。

### 11.3 フラグメントfixture

§11.1の59 byte列について、split位置を1〜58まで変え、次をすべて成立させる。

```ts
for (let split = 1; split < frame.length; split += 1) {
  scanner.push(frame.subarray(0, split));
  const events = scanner.push(frame.subarray(split));
  // events contains exactly one valid frame
}
```

各反復ではscanner/sessionを新規生成する。1 byteずつ59回に分割するケースと、
`Buffer.concat([Buffer.from([0x15]), frame])` も別途確認する。

## 12. 必須テストと受入条件

### 12.1 checksum・decoder単体テスト

- §11.1が59 byteで、固定offsetとBCC `0x3A` を満たす。
- XORが `0x20` 未満のとき `0x20` 加算分岐が動く。
- STX、各CR、ETB、`$` の1箇所破損をそれぞれ拒否する。
- BCCだけを1 bit変更したフレームを拒否する。
- score、distance、X、Yの桁数、符号、小数点位置の異常を拒否する。
- disciplineが `LG` 以外なら共有RedDot decoderで拒否する。
- reserved値を別のprintable ASCIIへ変え、BCCを再計算したフレームは受理する。
- §11.1をscore 90、X 3mm、Y 4mm、distance 5mmへ変換する。
- distanceの不一致はwarningにするが、変換結果を返す。

### 12.2 scanner単体テスト

- すべての2分割位置1〜58と、1 byteずつの分割でフレームを1件だけ返す。
- 2フレームが1 chunkに結合されても順番どおり2件返す。
- `ACK`、`NAK`、noise、部分フレーム、正常フレームの組合せから再同期する。
- 不正構造では先頭STXだけ、不正BCCでは候補59 byteを消費する。
- 4096 byte超過で無制限にmemoryを保持しない。

### 12.3 protocol session単体テスト

fake serial writerとfake clockを使い、wall clockや実USBへ依存させない。

- start直後の最初のhost byteが `ENQ` であり、probe完了後にだけ `11 00 01` を送る。
- command ACK後にRifle=`01`／Pistol=`00` を送り、正式設定成功をinfoログへ記録してからpollingする。
- Rifleで標的種別ACKが500ms来なければcommandを再送せず、`01` を1回送って500ms静穏時間後に
  legacy pollingへfallbackし、その理由をwarningログへ記録する。
- fallback静穏中の遅延ACKを無視し、静穏時間より前に `ENQ` を送らない。
- Pistolで標的種別ACKが500ms来なければfallbackせず、初期化errorで接続を失敗させる。
- 初期化中の `NAK` をpoll-idleと誤認しない。
- RedDotの `NAK` が繰り返されてもshot、sound、errorを発生させない。
- 正常フレームでは `ACK` のdrain完了後にだけframe callbackを1回呼ぶ。
- 初期化完了前のframeは `ACK` するがcallbackせずwarningを記録する。初期化完了後にpoll予約中のframeを
  受けた場合はcallbackし、timerを正しく張り直す。
- 不正BCCでは `NAK` を送り、callbackを呼ばず、次の正常フレームで回復する。
- 応答待ち中に重複 `ENQ` を送らない。
- 100msより前に次pollを送らず、fake clockを100ms進めた時点で1回だけ送る。
- disconnectでtimerとlistenerを除去し、clockを進めてもwriteしない。
- reconnectを繰り返してもtimerとdata listenerが1組だけ存在する。
- ACK write/drain失敗時にframeをemitせず、connection errorへ渡す。

### 12.4 adapter・統合テスト

- `DISAG_KT_RDT_ZIE_1_RIFLE` はベンダー `DISAG`、対応種目 `AIR_RIFLE_10M` だけとして列挙される。
- `DISAG_KT_RDT_ZIE_1_PISTOL` はベンダー `DISAG`、対応種目 `AIR_PISTOL_10M` だけとして列挙される。
- `DISAG_KT_RDT_ZIE_1_RIFLE` の `modelName` は公式型式どおり `KT RDT ZIE 1` である。
- Rifle/Pistolのdevice IDがそれぞれwire target type `01` / `00` へ対応する。
- 旧 `RDT_ZIE1_PISTOL` の保存設定を新Pistol IDとベンダー `DISAG` へ移行する。
- DISAGでもdevice IDが欠落または対応する2プロファイル以外ならRedDotのpollを開始しない。
- §11.1から `ImpactPoint(3, 4)`、`Score(90)`、`innerTen: false` を生成する。
- 同じframeをSIGHTING/MATCHのcontextで変換し、各contextのmodeを保持する。
- mode切替時にserialへ `S` / `R` を送らず、次ショットは新しいsession modeになる。
- `NAK` や部分chunkでは着弾音を鳴らさず、変換成功1件につき1回だけ鳴らす。
- device scoreと座標計算scoreが違っても記録し、discrepancyを診断する。
- Rifle/Pistolのdevice IDとsession disciplineが一致しないcontextを接続前とフレーム処理時に拒否する。
- 既存MT201、Custom、その他のparserテストを変更せず通す。

### 12.5 完了条件

次をすべて満たすまで、UIや文書上の実装状態を「対応」に変更しない。

- 上記単体・統合テストが自動化されている。
- 通常idleでerrorと着弾音が発生しない。
- 実portで複数ショットを欠落・重複なく受信できる。
- 実portで正式設定成功またはRifle fallbackの選択結果がDebug Paneと `combined.log` の両方に残る。
- disconnect/reconnect後もpollが多重化しない。
- 実射データをfixture、通常ログ、公開issueへ残していない。
- MT201を含む既存USB受信の回帰テストが通る。

## 13. 未確定事項と変更管理

次は推測で実装しない。

- reserved 5フィールドの正式名称と意味
- RedDot固有のmiss/座標なしsentinel
- firmware間のフレーム差、再送回数、メーカー保証timeout
- BluetoothとRS-232の切替手順
- Pistolプロファイルの実portパケットとdevice scoreを使った実機検証
- RS-232/Bluetooth SPPの各経路で、ENQを書かずに射撃した場合の自発送信有無
- frame受信後にACKを保留または送信しなかった場合の再送周期と回数
- 初期化command、shot frame、ENQが近接した場合の機器側queue順序
- `LG` 以外のOpticScoreフレームを同じdecoderで扱えるか

新しい挙動を追加する場合は、まず匿名化した最小の合成fixtureとテストでSaikaの受理契約を定義し、
同じ変更で本書を更新する。メーカー資料は複製せず一次情報へリンクし、独立確認事項をメーカー保証と
表現しない。公開判断は [公開コンテンツ方針](../../../../CONTENT_POLICY.md) に従う。

製品名・会社名は相互運用対象の識別にだけ使用する。商標その他の権利は各権利者に帰属する。
