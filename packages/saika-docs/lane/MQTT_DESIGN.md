---
description: Lane と Director が使用する MQTT トピック、データ形式、コマンド、タイマーと切断時の動作を説明します。
---

<!-- SPDX-License-Identifier: MIT -->

# MQTT 連携仕様

[文書一覧](../INDEX.md)

Lane と Director の間で扱うメッセージ、状態遷移、失敗・再接続時の動作を説明します。接続手順は [導入と接続](../GETTING_STARTED.md)、操作条件の詳細は [Director MQTT 制御・運用](../director/MQTT_CONTROL.md) を参照してください。

## 通信の前提

Director と各 Lane は同じブローカーへ接続します。内蔵ブローカーの既定ポートは TCP `1883` です。Lane ID と競技 ID は UUID で、射座番号や表示名とは別です。1つの Lane が同時に参加する競技は1つです。Director は、参加 Lane が重複しない複数の競技を並行して管理できます。

メッセージは JSON で、通常は QoS 1を使います。再配信に備え、受信側は識別子で重複を確認します。最新状態は Retain 付き、コマンド・ACK・着弾イベントは Retain なしで配信します。保持データの削除は空のペイロードで通知します。

| 管理する側 | データ                                                  |
| ---------- | ------------------------------------------------------- |
| Lane       | 機器状態、セッション、着弾、得点、Lane の進行・安全状態 |
| Director   | 競技全体の進行、参加 Lane、共通タイマー、大会成績、裁定 |
| ブローカー | 最後に発行された Retain メッセージ                      |

Retain は全履歴の保管ではありません。競技終了時に消去する値もあるため、成績や証拠資料は [保存手順](../director/RESULTS.md#成績冊子と証拠資料を保存する) に従って別に残します。

## トピック

表の `{laneId}` と `{competitionId}` は実際の UUID に置き換えます。`{action}` はコマンド名です。

### 競技に依存しないトピック

以下は `saika/lane/{laneId}/` に続く名前です。

| 末尾                               | 発行元 → 受信側 | Retain | 内容                                     |
| ---------------------------------- | --------------- | ------ | ---------------------------------------- |
| `hardware/state`                   | Lane → Director | あり   | 装置の接続状態、版、対応機能             |
| `hardware/shot`                    | Lane → 購読者   | なし   | 競技 ID を含まない着弾データ             |
| `safety/state`                     | Lane → Director | あり   | 安全停止・解除、停止時のタイマー         |
| `range-officer/request`            | Lane → Director | あり   | 射場役員の呼び出し                       |
| `qualification-malfunction/signal` | Lane → Director | あり   | 予選での銃器故障申告                     |
| `est-complaint/signal`             | Lane → Director | あり   | 電子標的への申告                         |
| `command/{action}`                 | Director → Lane | なし   | 競技参加・離脱、時計検査、安全停止・解除 |
| `command/{action}/acknowledgement` | Lane → Director | なし   | 上記コマンドへの応答                     |

`hardware/shot` では、Saika が受信フレームから変換した座標・得点を配信します。

### 競技全体のトピック

以下は `saika/competition/{competitionId}/` に続く名前です。

| 末尾                                        | 発行元 → 受信側         | Retain | 内容                                       |
| ------------------------------------------- | ----------------------- | ------ | ------------------------------------------ |
| `state`                                     | Director → Lane・購読者 | あり   | 種別、参加 Lane、フェーズ、タイマー        |
| `cue`                                       | Director → Lane         | あり   | 進行上の号令・表示通知                     |
| `command/{action}`                          | Director → 参加 Lane    | なし   | 試射・本射開始、シリーズ進行、競技終了など |
| `command/{action}/acknowledgement/{laneId}` | Lane → Director         | なし   | 各 Lane の実行結果                         |

### 競技内の Lane トピック

以下は `saika/competition/{competitionId}/lane/{laneId}/` に続く名前です。

| 末尾                               | 発行元 → 受信側 | Retain | 内容                                     |
| ---------------------------------- | --------------- | ------ | ---------------------------------------- |
| `state`                            | Lane → Director | あり   | セッション、ステージ、シリーズ、中断状態 |
| `assignment`                       | Lane → Director | あり   | 選手割当                                 |
| `score`                            | Lane → Director | あり   | 採点対象の射、シリーズ・ステージ合計     |
| `shot`                             | Lane → Director | なし   | 競技上の位置を含む着弾イベント           |
| `timed-target/state`               | Lane → Director | あり   | 25m の信号、計時、次回 LOAD の下限       |
| `qualification-recovery/state`     | Lane → Director | あり   | 許可された復旧射の進行・完了状態         |
| `qualification-recovery/shot`      | Lane → Director | なし   | 通常の本射から分離した復旧射             |
| `shoot-off/shot`                   | Lane → Director | なし   | 同点決定戦の着弾                         |
| `command/{action}`                 | Director → Lane | なし   | 選手割当、リセット、中断・復旧、脱落など |
| `command/{action}/acknowledgement` | Lane → Director | なし   | 個別操作の実行結果                       |
| `query/{requestId}/request`        | 照会元 → Lane   | なし   | 状態・記録の照会                         |
| `query/{requestId}/response`       | Lane → 照会元   | なし   | 照会結果またはエラー                     |

## データの読み方

| 項目                                                          | 形式・意味                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| `laneId`、`competitionId`、`sessionId`、`shotId`、`commandId` | 対象を識別する UUID                                             |
| `stageIndex`、`seriesIndex`                                   | 0始まり。画面上の番号とは1だけ異なる                            |
| `shotNumberInSeries`                                          | シリーズ内の1始まりの射順                                       |
| `x`、`y`                                                      | 標的中心を原点とする mm 単位の座標。座標のないミスなどは `null` |
| `timestamp`                                                   | 着弾時刻。機器が報告した時刻か受信時刻かは記録の由来を確認      |
| `receivedAt`、`publishedAt`                                   | 受信時刻と発行時刻。再送時も元の着弾時刻とは区別                |
| 時刻文字列                                                    | UTC の ISO 8601形式。例：`2026-09-10T00:00:00.000Z`             |
| `*ScoreX10`、`*TotalX10`                                      | 得点を10倍した整数。`104` は10.4点                              |
| `acc`                                                         | `RING` は整数点、`DECIMAL` は小数点採点                         |

### 接続・進行・選手割当

`hardware/state` の `connection.status` は、標的接続中の `connected`、標的未接続の `disconnected`、Lane 不在の `offline` です。対応機能の `capabilities` には、通信版、Rule Pack の識別情報、計時測定、標的信号の連携状態などを含めます。機能報告の省略を、実機での対応確認と解釈しないでください。

競技の `state` は種別 ID、採点方式、参加 Lane 一覧と競技全体のフェーズを持ちます。`definitionBinding` で必須確認を指定する場合、Rule Pack の ID、スキーマ版、SHA-256の一致が必要です。

Lane の `state` はセッション ID、現在のステージ・シリーズ、記録済み射数を持ちます。`assignment.athlete` が `null` なら未割当です。割当済みの場合は選手 ID、番号、氏名と、必要に応じて団体・国名などを持ちます。

### 着弾と得点

着弾には、装置点の `deviceScoreX10`、座標からの計算点の `calculatedScoreX10`、採用点の `effectiveScoreX10` を区別して持たせます。`rawScoreX10` は採用点を表す互換用の項目です。競技の `shot` にはステージ・シリーズ、採点対象の `scored`、再送の `isReplay` なども含めます。

ステージとシリーズは記録時の競技配置を保存して使います。画面上の10発区切りや、後から進んだ競技状態からは推定しません。旧履歴は記録時の配置を確認できるものだけ配信します。確認できない場合は配信失敗をログに残し、元の履歴を保持します。座標のない射撃は、再配信時も `x`、`y` を `null` とします。

`score` は採点対象の射をシリーズ・ステージ単位でまとめた最新値です。整数点採点でも10倍表現を使い、各射は10の倍数になります。25m 決勝のヒット数では、ヒットを `10`、ミスを `0` として集計し、元の得点を `sourceShotsX10` などに残します。射数・各階層の合計・採点方式が矛盾するデータは、得点スキーマの検査で拒否します。

射数と合計点は同じ本射履歴から集計し、姿勢変更中や中断復旧で許可された試射を含めません。

Director は競技終了時に最終スコアを検証し、大会の保存先へ反映します。

## コマンドと応答

Director が送るコマンドには、`commandId`、発行主体の `issuerId`、表示用の `issuedBy`、`issuedAt` を含めます。互換用スキーマでは `issuerId` を省略できますが、受理の可否は Lane の認可設定にも依存します。

Director は空の `issuedBy` を送信しません。Lane の互換用スキーマは空文字も受理しますが、表示名の検査と送信者の認可は別に行います。

| ACK の `status` | 意味                                                         |
| --------------- | ------------------------------------------------------------ |
| `executing`     | 処理を開始した。完了応答を待つ                               |
| `done`          | 操作が完了した                                               |
| `error`         | 操作が拒否・失敗した。`error.code` と `error.message` を確認 |

ACK は `commandId`、`laneId`、`acknowledgedAt` で操作と対象を特定します。警告は `warning`、追加結果は `data` に入ります。Director の待機時間は既定で10秒です。`timeout` は Director の表示状態です。Lane の ACK には含みません。応答の消失に備え、タイムアウト後は Lane の状態を確認します。

同じ `commandId` の再配信は重複として扱います。別 ID での再操作も現在状態を検査し、進行済みの Lane を重ねて進めないようにします。ブロードキャストは、対象 Lane がすべて `done` を返して初めて成功です。一部失敗時は、未完了の対象を確認して再試行します。

### 競技への参加から終了まで

1. Director が競技の `state` を Retain 付きで発行する。
2. 各 Lane へ `join-competition` を送り、種別・互換性を検査する。
3. `done` で参加を確定する。応答待ちの Lane は `pendingJoinLaneIds` に残す。
4. 選手割当後、`start-sighting`、`end-sighting`、`start-match` で進める。
5. 必要なシリーズを進め、`finish-competition` で終了する。
6. 最終スコアと大会の保存先を確認して成績を保存し、Lane を離脱させて保持データを消去する。

参加未確定の Lane がある間は、試射を開始できません。通常の参加・離脱・選手割当は競技開始前に行います。一部の Lane だけ試射開始に失敗した場合は、未開始の対象と元の開始時刻を保持して再試行します。保存先の不整合、資料保全、未完了の中断、離脱失敗がある場合は、記録を残して終了処理を止めます。条件を解消して「Retry cleanup」を実行します。詳細は [終了と成績保存](../director/MQTT_CONTROL.md#終了と成績保存) を参照してください。

### 外部に公開するフェーズ

| 競技全体の `phase`  | 意味                                             |
| ------------------- | ------------------------------------------------ |
| `NOT_STARTED`       | 作成済み、試射開始前                             |
| `SIGHTING`          | 試射進行中。未開始の Lane が残る場合は別途記録   |
| `SIGHTING_COMPLETE` | 試射終了、本射開始待ち                           |
| `MATCH`             | 本射進行中                                       |
| `MATCH_COMPLETE`    | 競技終了。成績保存や保持データ消去の完了とは区別 |

Lane の `phase` は次の値を使います。

| 値                  | 意味                   |
| ------------------- | ---------------------- |
| `OFFLINE`           | Lane 不在              |
| `READY`             | 開始前の待機           |
| `SIGHTING`          | 試射中                 |
| `SIGHTING_COMPLETE` | 試射終了、本射開始待ち |
| `MATCH`             | 本射中                 |
| `SERIES_COMPLETE`   | シリーズ完了           |
| `STAGE_COMPLETE`    | ステージ完了           |
| `FINISHED`          | Lane の競技終了        |

競技全体の状態と各 Lane の進行状態は一致しない場合があります。中断・安全停止・復旧射の状態は、通常のフェーズとは別に保持します。

### 25m・決勝・中断

| 操作群                                                           | 条件と結果                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `start-timed-target` / `cancel-timed-target`                     | 25m の共通開始時刻とプログラムを指定。物理信号装置の出力・動作確認は別途必要 |
| `start-shoot-off` / `stop-shoot-off`                             | 対象・反復を指定し、同点決定戦を本射得点と分離                               |
| `retire-finalist`                                                | 順位判断を記録した対象 Lane の最終状態を確定                                 |
| `pause-timer` / `resume-timer` / `resume-match`                  | 中断 ID、停止時の残り時間、許可された再開を対応付ける                        |
| `activate-safety-stop` / `clear-safety-stop`                     | 競技に依存せず停止。安全確認を記録して解除しても、タイマーは再開しない       |
| `start-qualification-recovery` / `cancel-qualification-recovery` | 許可された追加試射・再射・補射を別の記録単位で実行                           |
| `apply-qualification-recovery` / `settle-qualification-recovery` | 復旧射の得点を反映、または記録済みシリーズの維持を確定                       |

各コマンドの入力と、通常操作・例外操作の区別は [コマンド契約](../../saika-protocol/src/commands.ts) を参照してください。役員の判断記録だけで Lane を動かすことはできません。実行操作だけで結果の公式公表にもなりません。

## 時刻とタイマー

開始操作は `timerStartAt` と `timerDurationSeconds` を使い、各端末が同じ終了予定時刻から残り時間を計算します。Director の開始時刻は既定で送信の3秒後です。開始時刻を過ぎて受信した場合は、経過分を差し引きます。これは受信遅延への対応であり、PC の時計を同期する機能ではありません。

Director は `probe-clock` の往復から時計差と不確かさを検査します。既定の設定は次のとおりです。

| 項目               | 既定値     |
| ------------------ | ---------- |
| 運用モード         | `ADVISORY` |
| 時計差の絶対値上限 | 250ms      |
| 不確かさの上限     | 100ms      |
| 測定値の有効期間   | 300秒      |

`REQUIRED` では良好かつ有効な測定がない場合、時刻を使う操作を許可しません。これらは Saika の運用設定で、競技規則上の許容誤差を保証する値ではありません。Lane も対象となる開始コマンドの `issuedAt` を検査し、5秒を超える差には警告、30秒を超える差には `MQTT_CLOCK_OUT_OF_SYNC` を返します。

操作を配信する前に `pendingTimer` を保持し、成功後に `activeTimer` へ確定します。応答後の保存に失敗しても、再試行は元の時刻と持ち時間を使います。満了済みのタイマーは、Director の復帰時に同じ満了時刻で通知します。

## 切断・再接続とデータの保持

| 事象                   | 観測できる動作・制約                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| 標的の切断             | `disconnected` を発行。競技タイマーは継続                                      |
| Lane の異常切断        | ブローカーが Will の `offline` を配信                                          |
| ハートビートの停止     | Lane は60秒間隔で発行。Director は150秒を超えた状態を `offline` と扱う         |
| MQTT の一時切断        | Lane はローカル記録を継続し、再接続後に最新状態と切断中の着弾を再発行          |
| Director の再起動      | ブローカーの Retain から競技とタイマーを復元。内蔵ブローカーも同時に再起動する |
| 外部ブローカーの再起動 | Retain 復元にはブローカー側の永続化設定が必要                                  |

内蔵ブローカーの Retain は Director のデータベースに保存します。MQTT の復旧だけでは、故障中に装置が検出できなかった着弾や、保存されなかったデータを回復できません。また、Director が不在の間は新しい遠隔指示を受けられないため、競技を無条件に継続できるとは限りません。

再送する競技着弾は元の `shotId` と `timestamp` を維持し、`isReplay: true` を付けます。Director は同じ `shotId` を重複計上しません。通信中断からの再送は保存済みのセッションが対象で、全過去履歴を自動転送する機能ではありません。Lane の再起動と、一時的な MQTT 切断からの再送は同じ条件ではありません。必要な記録は照会と保存資料で確認します。

## 記録の照会

`query/{requestId}/request` に、UUID の `requestId`、`method`、`params` を送ります。同じ ID の `response` を照会元で購読します。

| `method`                | 主な `params`    | 結果                     |
| ----------------------- | ---------------- | ------------------------ |
| `get-shot-list`         | `sessionId`      | 指定セッションの着弾履歴 |
| `get-score`             | `sessionId`      | 指定セッションの得点     |
| `get-competition-state` | 空のオブジェクト | 競技状態                 |

`get-shot-list` の入力形式には絞り込み項目もありますが、現行処理はその項目を適用しません。必要な絞り込みは取得結果に対して行います。

成功応答は `ok: true` と `result`、失敗応答は `ok: false` と `error.code`・`error.message` を持ちます。どちらも `requestId`、`method`、`respondedAt` を含みます。取得結果の形式は [照会契約と処理](../../saika-lane/src/main/modules/mqtt/application/RpcRequestHandler.ts) を参照してください。

## 接続の認証とアクセス範囲

内蔵ブローカーの認証は既定で無効です。有効にすると Director・Lane の役割ごとにトピックへのアクセスを制限します。ブローカーへの接続認証と、Lane が発行主体を確認するコマンド認可は別の設定です。

内蔵ブローカーの Lane 用認証情報は共通です。端末ごとの認証情報・アクセス制御が必要な場合は外部ブローカーを使用します。TLS は外部ブローカーで構成し、OS が信頼するサーバー証明書を使用します。独自 CA ファイルとクライアント証明書の設定は未対応です。具体的な環境変数は [MQTT セキュリティ設定](../../saika-director/README.md#mqtt-security-configuration) を参照してください。

## 詳細な入力契約

任意項目や項目間の制約を含む入力形式は、利用する版の共通契約で確認してください。

| 内容                    | 定義                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| トピック名              | [topics.ts](../../saika-protocol/src/topics.ts)                                                                                                                                                                                       |
| 機器・Lane・安全状態    | [LaneState.ts](../../saika-protocol/src/LaneState.ts)                                                                                                                                                                                 |
| 競技・タイマー・互換性  | [CompetitionState.ts](../../saika-protocol/src/CompetitionState.ts)                                                                                                                                                                   |
| 選手割当                | [LaneAssignment.ts](../../saika-protocol/src/LaneAssignment.ts)                                                                                                                                                                       |
| 着弾と観測証拠          | [Shots.ts](../../saika-protocol/src/Shots.ts)                                                                                                                                                                                         |
| 得点とヒット数          | [LaneScore.ts](../../saika-protocol/src/LaneScore.ts)                                                                                                                                                                                 |
| コマンドと ACK          | [commands.ts](../../saika-protocol/src/commands.ts)、[Acknowledgement.ts](../../saika-protocol/src/Acknowledgement.ts)                                                                                                                |
| 25m・復旧射・同点決定戦 | [TimedTargetState.ts](../../saika-protocol/src/TimedTargetState.ts)、[QualificationRecovery.ts](../../saika-protocol/src/QualificationRecovery.ts)、[CompetitionShootOffShot.ts](../../saika-protocol/src/CompetitionShootOffShot.ts) |
