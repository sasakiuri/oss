<!-- SPDX-License-Identifier: MIT -->

# Saika MQTT 連携設計ドキュメント

> **作成日**: 2026-02-24
> **ステータス**: 設計資料。実装との差異は [`saika-lane` のMQTTモジュール](../../saika-lane/src/main/modules/mqtt/) を優先する。

---

## 目次

1. [設計思想](#1-設計思想)
2. [トピック階層設計](#2-トピック階層設計)
3. [外部向け競技フェーズ定義](#3-外部向け競技フェーズ定義)
4. [ペイロードスキーマ](#4-ペイロードスキーマ)
5. [通信シーケンス](#5-通信シーケンス)
6. [設定スキーマ](#6-設定スキーマ)
7. [耐障害設計](#7-耐障害設計)
8. [Saika内部設計の比較](#8-saika内部設計の比較)
9. [実装ロードマップ](#9-実装ロードマップ)

- [付録: トピック一覧リファレンス](#付録-トピック一覧リファレンス)

---

## 1. 設計思想

### 1.1 旧設計（lane-centric）との根本的な違い

旧設計は `saika/lane/{laneId}/` を主要 namespace とした **lane-centric** 設計だった。この設計では competition は lane の属性（`saika/lane/{laneId}/competition`）として従属的に扱われ、競技管理の主体が lane になっていた。

新設計は `saika/competition/{competitionId}/` を主要 namespace とする **competition-centric** 設計に転換する。

| 観点             | 旧設計（lane-centric）       | 新設計（competition-centric）            |
| ---------------- | ---------------------------- | ---------------------------------------- |
| 主語             | lane が競技状態を所有        | competition が競技状態を所有             |
| タイマー         | 各 lane が個別タイマーを持つ | competition 単位の共通タイマー           |
| コマンド         | lane ごとに個別コマンド送信  | competition 単位のブロードキャスト       |
| マルチレーン同期 | なし（lane が独立）          | `absoluteDeadline` による全 lane 同期    |
| フェーズ名       | 内部実装名（IDLE/ACTIVE 等） | ISSF セマンティクス（SIGHTING/MATCH 等） |

### 1.2 なぜ competition を主語にするのか

Saikaのマルチレーン構成では、競技進行の権威を各射座（lane）ではなく競技運営体（director）に置く。

**Saikaのタイマー同期要件**:
ビームライフル予選では全選手が同一開始時刻から 45 分のカウントダウンを共有する。旧設計のように各 lane が独立したタイマーを持つと、lane ごとにミリ秒単位のずれが生じ得る。新設計では `startAt: ISO8601` による絶対時刻指定でタイマーを同期し、全 lane が同一時刻から競技を開始することを保証する。

**マルチレーン一括コマンドの要件**:
試射開始・本射開始・シリーズ進行は、全選手に同時適用される操作である。旧設計では director が各 lane に個別にコマンドを送る必要があり、送信順による競技不公平が生じ得た。新設計では `saika/competition/{competitionId}/command/{action}` への単一パブリッシュが全 lane に届くブロードキャスト構造を採用する。

### 1.3 Lane 権威モデル

```
                    ┌─────────────────────────────────┐
                    │        MQTT Broker               │
                    └────────────┬───────────┬─────────┘
                                 │           │
              ┌──────────────────▼─┐       ┌─▼──────────────────┐
              │   saika.director   │       │    saika.lane        │
              │  (aggregate        │       │  (state authority)   │
              │   consumer)        │       │                      │
              └────────────────────┘       └──────────────────────┘
```

**lane が唯一の状態権威（Single Source of Truth）**:

- lane は自分のハードウェア状態・ショットデータ・競技内状態を SQLite で永続管理する
- lane が発行するトピックのデータは SQLite に裏付けられた正確な状態である
- director は lane の状態を「集約して表示する消費者」であり、lane の状態を書き換えることはできない

**director はオーケストレーター**:

- director は competition-level のコマンド（試射開始、本射開始等）を lane に送る
- lane はコマンドを受け取り、自律的に状態遷移する
- director が落ちても lane は独立して動作し続ける（後述）

### 1.4 複数 competition の同時進行

Director は、異なる `competitionId` を持つ複数の competition を同時に保持し、それぞれを独立して進行できる。物理 Lane は同時に 1 つの competition だけに所属し、Director は重複所属を拒否する。

例えば、次の構成を同時に運用できる。

| competition   | 種目    | 所属 Lane |
| ------------- | ------- | --------- |
| competition A | `BP60`  | Lane 1〜4 |
| competition B | `BR60S` | Lane 5〜8 |

- competition-level のコマンドと ACK は `competitionId` ごとに分離する。
- Director はタイマ満了予約を `competitionId` ごとに保持する。一方の試射・本射開始や終了は、他方のタイマを上書きしない。
- Lane の assignment、score、shot は所属する `competitionId` のデータだけを Director 画面に投影する。
- 大会の射座割と成績保存先も `competitionId` ごとに保持する。

### 1.5 耐障害設計

#### Lane 障害時の動作

```
Lane クラッシュ
  → Will メッセージ: saika/lane/{laneId}/hardware/state (status=offline, Retain=ON)
  → Director: LanePhase=OFFLINE を検知。該当 lane の競技を一時停止考慮（人的判断）
  → Lane 再起動: SQLite から競技状態・ショットデータを完全復旧
  → Lane: 全 Retain トピックを再発行（最新状態でブローカーを更新）
  → Lane: 切断中に記録されたショット（ローカル SQLite 内）を competition/lane/{id}/shot で再送信
  → Director: lane が ONLINE 復帰を検知
```

- lane は MQTT に依存せず完全動作する。競技進行・ショット記録・スコア計算は MQTT なしで行われる
- MQTT は「データ配信チャネル」であり「動作前提条件」ではない

#### Director 障害時の動作

```
Director クラッシュ
  → 全 lane は独立してそのまま競技を継続する
  → ブローカーの Retain メッセージは全て保持される
  → Director 再起動: ブローカーに接続し Retain メッセージを受信
  → Director: competition/state, lane/{id}/state, score, assignment を即座に復旧
  → 競技進行への影響: なし（lane は独立継続）
```

#### Broker 障害時の動作

```
Broker 一時断
  → Lane: ローカル SQLite でショット記録・競技進行を継続
  → Lane: MQTT 再接続を試みる（reconnectPeriod 間隔でリトライ）
  → Broker 復旧・Lane 再接続:
      → Lane: 全 Retain トピックを最新状態で再発行（切断中の変化を反映）
      → Lane: 切断中のショットは competition/lane/{id}/shot で再送信
  → Director: Retain 受信で最新状態を取得
```

---

## 2. トピック階層設計

### 2.0 Namespace 分離の保証

Saikaの全トピックは `saika/` プレフィックスを持つ。汎用的なトップレベル名を避け、同一ブローカー上の他システムと意図せず衝突しにくい名前空間とする。

`lane`、`competition`、`shot` などの語はSaika名前空間の内側でのみ使う。外部連携では完全なトピックパスを契約として扱う。

### 2.1 2 層構造の概要

```
saika/
├── lane/{laneId}/                        # Tier 1: Lane Infrastructure（ハードウェア層）
│   ├── hardware/state                    # デバイス接続状態 [Retain=ON, QoS 1]
│   ├── hardware/shot                     # 生着弾データ [Retain=OFF, QoS 1]
│   └── command/                           # [QoS 1] Lane コマンド（Tier1: ブートストラップ用）
│       ├── join-competition              # [QoS 1]
│       │   └── acknowledgement           # [QoS 1]
│       └── leave-competition             # [QoS 1]
│           └── acknowledgement           # [QoS 1]
│
└── competition/{competitionId}/          # Tier 2: Competition（競技層）
    ├── state                             # 競技全体状態 [Retain=ON, QoS 1]
    │
    ├── command/
    │   ├── start-sighting               # 全 lane への試射開始 broadcast [QoS 1]
    │   │   └── acknowledgement/{laneId} # 各 lane からの ACK [QoS 1]
    │   ├── end-sighting                 # 全 lane への試射終了 broadcast [QoS 1]
    │   │   └── acknowledgement/{laneId}
    │   ├── start-match                  # 全 lane への本射開始 broadcast [QoS 1]
    │   │   └── acknowledgement/{laneId}
    │   ├── timer-started                # タイマー開始通知 broadcast [QoS 1]
    │   │   └── acknowledgement/{laneId}
    │   ├── timer-expired                # タイマー満了通知 broadcast [QoS 1]
    │   │   └── acknowledgement/{laneId}
    │   ├── advance-series               # 全 lane へのシリーズ進行 broadcast [QoS 1]
    │   │   └── acknowledgement/{laneId}
    │   └── finish-competition           # 全 lane への競技終了 broadcast [QoS 1]
    │       └── acknowledgement/{laneId}
    │
    └── lane/{laneId}/                   # このレーンの競技情報
        ├── state                        # レーン競技状態 [Retain=ON, QoS 1]
        ├── assignment                   # 選手配置 [Retain=ON, QoS 1]
        ├── score                        # スコア [Retain=ON, QoS 1]
        ├── shot                         # 競技コンテキスト付きショット [Retain=OFF, QoS 1]
        ├── qualification-recovery/
        │   ├── state                    # Rule 8.8.1 recovery run [Retain=ON, QoS 1]
        │   └── shot                     # isolated recovery shot [Retain=OFF, QoS 1]
        ├── command/
        │   ├── assign-athlete           # 選手配置コマンド [QoS 1]
        │   │   └── acknowledgement      # ACK [QoS 1]
        │   ├── reset-session            # セッションリセット [QoS 1]
        │   │   └── acknowledgement
        │   ├── start-qualification-recovery  # isolated recovery 開始 [QoS 1]
        │   │   └── acknowledgement
        │   ├── cancel-qualification-recovery # recovery 取消 [QoS 1]
        │   │   └── acknowledgement
        │   ├── apply-qualification-recovery  # recovery 採点裁定 [QoS 1]
        │   │   └── acknowledgement
        │   └── settle-qualification-recovery # full series の無射撃確定 [QoS 1]
        │       └── acknowledgement
        └── query/{requestId}/
            ├── request                  # RPC リクエスト [QoS 1]
            └── response                 # RPC レスポンス [QoS 1]
```

### 2.2 Tier 1: Lane Infrastructure トピック詳細

#### `saika/lane/{laneId}/hardware/state`

| 項目            | 値                                                   |
| --------------- | ---------------------------------------------------- |
| Publisher       | saika.lane                                           |
| Subscriber      | saika.director, 監視システム                         |
| QoS             | 1                                                    |
| Retain          | ON（director 接続時に即座に現在状態を取得）          |
| Will メッセージ | 接続断時に自動送信（status=offline）                 |
| 発行タイミング  | 起動時、USB 接続状態変化時、定期ハートビート（60秒） |

> **ハートビートと Will メッセージの役割の違い**: lane の異常終了検知は MQTT Will メッセージ（ブローカーの Keep Alive タイムアウトで自動送信）が担う。hardware/state のハートビート（60秒間隔）は director が lane の「生存確認」と「最新ハードウェア状態の定期同期」を行うための補助情報であり、異常終了検知とは別の目的で使用する。

#### `saika/lane/{laneId}/hardware/shot`

| 項目           | 値                                              |
| -------------- | ----------------------------------------------- |
| Publisher      | saika.lane                                      |
| Subscriber     | saika.director, 生データアーカイブ              |
| QoS            | 1                                               |
| Retain         | OFF（ショットはイベントであり最新状態ではない） |
| 発行タイミング | MT201 から着弾データ受信時                      |

#### `saika/lane/{laneId}/command/{action}`（Lane コマンド - Tier1）

| 項目       | 値                                                                                    |
| ---------- | ------------------------------------------------------------------------------------- |
| Publisher  | saika.director                                                                        |
| Subscriber | 指定 laneId の saika.lane                                                             |
| QoS        | 1                                                                                     |
| Retain     | OFF                                                                                   |
| 用途       | director が特定の lane を competition に参加/離脱させる（ブートストラップ問題を解決） |

> **Tier 1 の役割**: 競技コンテキストを持たない純粋なハードウェア層のデータ。競技管理システム以外（モニタリング・アーカイブ等）も購読できるよう、競技情報とは独立して設計する。

### 2.3 Tier 2: Competition トピック詳細

#### `saika/competition/{competitionId}/state`

| 項目           | 値                                                     |
| -------------- | ------------------------------------------------------ |
| Publisher      | saika.director（competition の作成・フェーズ管理権威） |
| Subscriber     | saika.lane 全台, スコアボード                          |
| QoS            | 1                                                      |
| Retain         | ON                                                     |
| 発行タイミング | 競技作成時、フェーズ変化時                             |

#### `saika/competition/{competitionId}/command/{action}`（Broadcast コマンド）

| 項目           | 値                                       |
| -------------- | ---------------------------------------- |
| Publisher      | saika.director                           |
| Subscriber     | 当該 competition に参加する全 saika.lane |
| QoS            | 1                                        |
| Retain         | OFF                                      |
| 発行タイミング | director が操作時                        |

#### `saika/competition/{competitionId}/command/{action}/acknowledgement/{laneId}`（Broadcast ACK）

| 項目           | 値                                                                 |
| -------------- | ------------------------------------------------------------------ |
| Publisher      | saika.lane                                                         |
| Subscriber     | saika.director                                                     |
| QoS            | 1                                                                  |
| Retain         | OFF                                                                |
| 発行タイミング | コマンド受信時（executing）、処理完了時（done）、エラー時（error） |

#### `saika/competition/{competitionId}/lane/{laneId}/state`

| 項目           | 値                                                    |
| -------------- | ----------------------------------------------------- |
| Publisher      | saika.lane                                            |
| Subscriber     | saika.director                                        |
| QoS            | 1                                                     |
| Retain         | ON（lane 再接続後もブローカーに最新状態が保持される） |
| 発行タイミング | フェーズ変化時、ステージ/シリーズ進行時               |

#### `saika/competition/{competitionId}/lane/{laneId}/assignment`

| 項目           | 値                                          |
| -------------- | ------------------------------------------- |
| Publisher      | saika.lane（assign-athlete コマンド受理後） |
| Subscriber     | saika.director, スコアボード                |
| QoS            | 1                                           |
| Retain         | ON                                          |
| 発行タイミング | 選手配置コマンド受理時                      |

#### `saika/competition/{competitionId}/lane/{laneId}/score`

| 項目           | 値                                           |
| -------------- | -------------------------------------------- |
| Publisher      | saika.lane                                   |
| Subscriber     | saika.director, スコアボード                 |
| QoS            | 1                                            |
| Retain         | ON                                           |
| 発行タイミング | 本射ショット記録時（スコア変化のたびに更新） |

#### `saika/competition/{competitionId}/lane/{laneId}/shot`

| 項目           | 値             |
| -------------- | -------------- |
| Publisher      | saika.lane     |
| Subscriber     | saika.director |
| QoS            | 1              |
| Retain         | OFF            |
| 発行タイミング | ショット記録時 |

#### `saika/competition/{competitionId}/lane/{laneId}/qualification-recovery/state`

| 項目           | 値                                                         |
| -------------- | ---------------------------------------------------------- |
| Publisher      | saika.lane                                                 |
| Subscriber     | saika.director                                             |
| QoS            | 1                                                          |
| Retain         | ON                                                         |
| 発行タイミング | recovery の開始、shot 記録、完了、取消、再起動からの復元時 |

`runId`、official decision／interruption、stage／series／program／shot count の不変 binding、許可した
`EXTRA_SIGHTING` または `SERIES_RECOVERY`、isolated shot ID、`RUNNING`／`COMPLETED`／`CANCELLED` を発行する。
Director は Retain state を現在状態として使い、run の受信 event history は別途 append-only に保存する。

#### `saika/competition/{competitionId}/lane/{laneId}/qualification-recovery/shot`

| 項目           | 値                                                         |
| -------------- | ---------------------------------------------------------- |
| Publisher      | saika.lane                                                 |
| Subscriber     | saika.director                                             |
| QoS            | 1                                                          |
| Retain         | OFF                                                        |
| 発行タイミング | isolated recovery window 内で shot evidence を記録したとき |

通常の competition shot と score へ混在させず、run／decision／interruption、stage／series、座標、装置点、独立計算点、
採用点、発射／受信時刻、observation ID、target／gauge profile を発行する。QoS 再送は `shotId` で冪等に保存する。

---

## 3. 外部向け競技フェーズ定義

MQTT 上で使用するフェーズ名は、saika.lane 内部実装（`Phase` 型）とは独立して定義する。内部の実装詳細（IDLE/ACTIVE 等）を外部 API に露出しない。

### 3.1 CompetitionPhase（`competition/state` で使用）

| フェーズ名          | 意味                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `NOT_STARTED`       | 競技未開始（director が competition を作成済みだがまだ開始していない） |
| `SIGHTING`          | 試射中（全 lane が試射フェーズ）                                       |
| `SIGHTING_COMPLETE` | 試射終了（本射開始待ち）                                               |
| `MATCH`             | 本射進行中（シリーズ進行を内包）                                       |
| `MATCH_COMPLETE`    | 競技終了（全シリーズ完了）                                             |

### 3.2 LanePhase（`competition/lane/{laneId}/state` で使用）

| フェーズ名          | 意味                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `OFFLINE`           | lane 未接続（Will メッセージまたは明示的な切断）                               |
| `READY`             | 接続済み・待機中（競技未参加または準備完了）                                   |
| `SIGHTING`          | 試射中                                                                         |
| `SIGHTING_COMPLETE` | 試射完了（本射開始待ち）                                                       |
| `MATCH`             | 本射中（ショット受付中）                                                       |
| `SERIES_COMPLETE`   | シリーズ完了（maxShots 到達時に lane が自律遷移、または timer-expired 受信時） |
| `STAGE_COMPLETE`    | ステージ完了（次ステージ待ち）                                                 |
| `FINISHED`          | 競技終了（この lane の全ショット記録済み）                                     |

> **内部実装との分離**: saika.lane 内部の `Phase` 型（IDLE / ACTIVE / SERIES_COMPLETE / STAGE_ENTERED 等）と MQTT フェーズは別物である。lane は内部状態遷移を MQTT フェーズにマッピングして発行する。これにより内部リファクタリングが外部 API を破壊しない。

### 3.3 例外フロー・特殊競技フェーズ

ISSF の Qualification / Final、shoot-off、停止・中断復旧の通信フローを説明します。

#### 3.3.1 Shoot-off（同点決定戦）

同点処理は種目とラウンドの Rule Pack に従います。ISSF 決勝の shoot-off には、1発の比較と、25mの5発シリーズによる比較があります。

- Director は Final の判断記録と対象Laneを確認し、`start-shoot-off` / `stop-shoot-off` を実行します。
- Lane は shoot-off の発を通常本射の得点から分離し、`saika/competition/{competitionId}/lane/{laneId}/shoot-off/shot` へ発行します。
- 専用payloadの `runId`、`iteration`、`shotId` によって反復と証跡を識別します。通常の `CompetitionShotPayload` に将来のフラグを追加する方式ではありません。
- 通常決勝への復帰と順位・脱落の確定は、DirectorのFinal運用と明示的な公式確認で行います。

故障・EST不具合・誤号令に対する決勝復旧ケースの記録と、その再射実行の自動化は別の機能です。

#### 3.3.2 決勝（Final）フロー

JRSF_BR_FIN / JRSF_BP_FIN は段階的脱落方式（1st Stage: 2×5発, 2nd Stage: 7×2発 / shot タイマー）。

**暫定設計方針**:

- `CompetitionPhase` に `ELIMINATION` を将来追加する可能性がある
- 現行の `MATCH` フェーズで対応し、`stageType` と `shotsPerSeries` で区別可能
- shot タイマーモード（`timerScope: 'SHOT'`）の `CompetitionTimerPayload` を将来定義

> **現在のステータス**: P2 タスク（未実装）。将来の CompetitionTypeDefinition 拡張で対応。

#### 3.3.3 中断・再開

競技と独立した安全STOP、およびLaneごとのタイマー中断・復旧が実装されています。

- `pause-timer` は中断ID、捕捉時刻、停止時の残時間をLaneで記録します。
- `resume-timer` は、公式に許可された残時間と共通の開始時刻を指定して再開します。`resume-match` は中断復旧の本射復帰を扱います。
- 安全STOPの解除は中断・タイマー再開とは別の確認です。安全状態が解除されていなければ再開コマンドは拒否されます。
- 25m Qualification の8.8.1中断復旧は、追加試射・別枠の復旧射・明示的な得点反映を持ちます。銃器故障の8.9による最低点比較を、この無効・再射で代用しません。

中断・安全状態は通常の `CompetitionPhase` と独立して扱います。`SUSPENDED` フェーズを追加する方式は、現行の再開操作の前提ではありません。

---

## 4. ペイロードスキーマ

全ペイロードは JSON 形式。以下は Zod pseudocode で記述する（実際の TypeScript コードではない）。

### 4.1 `HardwareStatePayload` — `saika/lane/{laneId}/hardware/state`

```typescript
// QoS: 1, Retain: ON
// Publisher: saika.lane
// Trigger: 起動時、USB接続状態変化時、ハートビート（60秒）
// Will: status=offline でブローカーが自動送信

const HardwareStatePayload = z.object({
  laneId: z.string().uuid(),

  // 設定された表示名（e.g. "1番射座"）
  laneAlias: z.string().default(''),

  // デバイス接続状態
  connection: z.object({
    // connected: USB 接続済み / disconnected: 切断 / offline: lane 自体が落ちている（Will）
    status: z.enum(['connected', 'disconnected', 'offline']),
    // USB 接続中デバイスのメーカー（接続中のみ）
    manufacturer: z.enum(['KOHTO', 'SIUS', 'MEYTON', 'DISAG', 'CUSTOM']).optional(),
    // USB ポートパス（e.g. "COM3", "/dev/ttyUSB0"）
    portPath: z.string().optional(),
    // 接続 ID（saika 内部識別子）
    connectionId: z.string().uuid().optional(),
  }),

  // saika.lane のアプリバージョン（互換性確認用）
  appVersion: z.string(),

  publishedAt: z.string().datetime(),
});
```

接続操作で指定した `laneAlias` は、設定ファイルへの保存有無にかかわらず、その MQTT 接続の状態発行と Will に使用する。
`connected` / `disconnected` は60秒ごとに heartbeat として再発行する。Director は最終 `publishedAt` から150秒を
超えた状態を `offline` とみなし、ブローカー障害で Will が配信されず古い Retain が復元された場合にも自動的に失効させる。
新しい heartbeat を受信すると、その接続状態へ復旧する。

### 4.2 `RawShotPayload` — `saika/lane/{laneId}/hardware/shot`

```typescript
// QoS: 1, Retain: OFF
// Publisher: saika.lane
// Trigger: MT201 から着弾データ受信時
// 競技コンテキストなし。純粋なハードウェアデータ。

const RawShotPayload = z.object({
  laneId: z.string().uuid(),
  // ショット固有 ID（SQLite の shot.id と同一）
  shotId: z.string().uuid(),

  // 着弾座標（標的中心を原点とするミリメートル座標系）
  // null = 標的外（scoreX10 は 0）
  x: z.number().nullable(),
  y: z.number().nullable(),

  // 後方互換 alias。実際に採用した effectiveScoreX10 と同値。
  rawScoreX10: z.number().int().min(0),

  // 標的装置の報告点、座標からの独立計算点、競技で採用した点。
  // 旧 Lane との通信では optional フィールドが欠けることがある。
  deviceScoreX10: z.number().int().min(0).nullable().optional(),
  calculatedScoreX10: z.number().int().min(0).optional(),
  effectiveScoreX10: z.number().int().min(0).optional(),

  // Lane の受信 observation と受信時刻。旧 Lane では optional。
  observationId: z.string().uuid().optional(),
  receivedAt: z.string().datetime().optional(),

  // 標的・ゲージ geometry による物理的な inner ten フラグ
  innerTen: z.boolean(),

  // 射撃モード（SIGHTING=試射, MATCH=本射）
  // Note: Tier 1 は「競技コンテキストフリー」を原則とするが、mode は
  // ハードウェア側で設定される射撃モードであり、競技進行の文脈ではなく
  // 標的制御装置の動作モードとして含めている。
  mode: z.enum(['SIGHTING', 'MATCH']),

  // 着弾検出時刻（ISO 8601）
  timestamp: z.string().datetime(),
});
```

### 4.3 `CompetitionStatePayload` — `saika/competition/{competitionId}/state`

```typescript
// QoS: 1, Retain: ON
// Publisher: saika.director
// Trigger: 競技作成時、フェーズ変化時

const CompetitionStatePayload = z.object({
  competitionId: z.string().uuid(),

  // 競技種別（saika.lane の CompetitionTypeDefinition に対応）
  competitionTypeId: z.string(), // e.g. "JRSF_BR_60S"
  competitionTypeName: z.string(), // e.g. "JRSF 10m ビームライフル 60 発立射"

  // 種目
  discipline: z.string(), // e.g. "BEAM_RIFLE_10M"

  // ラウンド名（ISSF 公式表記）
  roundName: z.string(), // e.g. "Qualification" | "Final"

  // 採点方式
  acc: z.enum(['RING', 'DECIMAL']),

  // 競技フェーズ（外部向けセマンティクス）
  phase: z.enum(['NOT_STARTED', 'SIGHTING', 'SIGHTING_COMPLETE', 'MATCH', 'MATCH_COMPLETE']),

  // シリーズあたり発数（競技種別に依存）
  shotsPerSeries: z.number().int().positive(),

  // このステージの総シリーズ数
  totalSeries: z.number().int().positive(),

  // 競技全体の合計発数（= shotsPerSeries × totalSeries）
  totalShots: z.number().int().positive(),

  // この competition に参加している lane の ID 一覧
  laneIds: z.array(z.string().uuid()),

  // 参加コマンドの最終 ACK を Director が確認できていない lane ID 一覧
  pendingJoinLaneIds: z.array(z.string().uuid()).optional(),

  // 試射開始が未完了の lane ID 一覧
  pendingSightingLaneIds: z.array(z.string().uuid()).optional(),

  // 競技開始時刻（NOT_STARTED は null）
  startedAt: z.string().datetime().nullable(),

  // 競技終了時刻（MATCH_COMPLETE のみ）
  finishedAt: z.string().datetime().nullable(),

  // Director が再起動後に復元する進行中タイマーの絶対期限情報。
  // 全 lane が満了を確認すると省略される。
  activeTimer: z
    .object({
      timerScope: z.enum(['STAGE', 'SERIES']),
      timerStartAt: z.string().datetime(),
      timerDurationSeconds: z.number().int().positive(),
      stageIndex: z.number().int().min(0),
      seriesIndex: z.number().int().min(0).nullable(),
    })
    .optional(),

  // タイマー付きコマンドの配信前に Retain する未確定操作。
  // ACK 後の状態発行に失敗しても、再試行では同じ開始時刻と時間を使う。
  pendingTimer: z
    .object({
      action: z.enum(['start-sighting', 'start-match', 'timer-started']),
      timerScope: z.enum(['STAGE', 'SERIES']),
      timerStartAt: z.string().datetime(),
      timerDurationSeconds: z.number().int().positive(),
      stageIndex: z.number().int().min(0),
      seriesIndex: z.number().int().min(0).nullable(),
    })
    .optional(),

  // Director の成績保存など、清掃前処理が完了した時刻。
  // 設定後は清掃再試行時に前処理を再実行しない。
  cleanupPreparedAt: z.string().datetime().optional(),

  publishedAt: z.string().datetime(),
});
```

### 4.4 タイマーイベント（廃止: competition/timer トピック）

タイマー通知は `competition/{id}/timer` トピックへの毎秒 tick 配信をやめ、
broadcast コマンド（`timer-started` / `timer-expired`）に統合した。詳細は Section 4.9 参照。

タイマー表示（残り時間カウントダウン）は各 lane がローカルクロックで計算する。

```
計算式: remainingSeconds = timerDurationSeconds - floor((now - timerStartAt) / 1000)
```

### 4.5 `LaneCompetitionStatePayload` — `saika/competition/{competitionId}/lane/{laneId}/state`

```typescript
// QoS: 1, Retain: ON
// Publisher: saika.lane
// Trigger: フェーズ変化時、ステージ/シリーズ進行時

const LaneCompetitionStatePayload = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),

  // セッション ID（SQLite セッションと対応）
  sessionId: z.string().uuid(),

  // レーン競技フェーズ（外部向けセマンティクス）
  phase: z.enum([
    'OFFLINE',
    'READY',
    'SIGHTING',
    'SIGHTING_COMPLETE',
    'MATCH',
    'SERIES_COMPLETE',
    'STAGE_COMPLETE',
    'FINISHED',
  ]),

  // 現在のステージ情報
  currentStage: z.object({
    index: z.number().int().min(0),
    name: z.string(), // e.g. "試射" | "1st Stage"
    type: z.enum(['preparation', 'match']), // preparation=試射, match=本射
    totalSeries: z.number().int().positive(), // このステージの総シリーズ数
  }),

  // 現在のシリーズ情報
  currentSeries: z.object({
    index: z.number().int().min(0),
    shotsRecorded: z.number().int().min(0), // このシリーズの記録済み発数
    maxShots: z.number().int().min(0), // 最大発数（0=無制限）
  }),

  // 遷移先を保存済みだが、シリーズ開始処理の完了を待っているか
  awaitingSeriesStart: z.boolean().optional(),

  // finish-competition への応答として再発行する場合のコマンド ID
  finalSnapshotCommandId: z.string().uuid().optional(),

  publishedAt: z.string().datetime(),
});
```

### 4.6 `LaneAssignmentPayload` — `saika/competition/{competitionId}/lane/{laneId}/assignment`

```typescript
// QoS: 1, Retain: ON
// Publisher: saika.lane（assign-athlete コマンド受理後）
// Trigger: 選手配置コマンド受理時

const LaneAssignmentPayload = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),

  // 選手情報（未配置の場合は null）
  athlete: z
    .object({
      // ISSF スタート番号（競技プログラムで割り振られた公式識別子）
      startNumber: z.number().int().positive(),
      // 内部選手 ID
      id: z.string(),
      // 表示名
      name: z.string(),
      // 団体名（射撃協会・クラブ）
      teamName: z.string().optional(),
      // ISSF 国際選手コード（国際大会の場合）
      issfCode: z.string().optional(),
    })
    .nullable(),

  assignedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime(),
});
```

### 4.7 `LaneScorePayload` — `saika/competition/{competitionId}/lane/{laneId}/score`

```typescript
// QoS: 1, Retain: ON
// Publisher: saika.lane
// Trigger: 本射ショット記録時

const LaneScorePayload = z.object({
  competitionId: z.string().uuid(),
  laneId: z.string().uuid(),
  sessionId: z.string().uuid(),

  // 本射合計スコア（×10 整数）
  totalScoreX10: z.number().int().min(0),

  // 本射ショット数
  totalShotCount: z.number().int().min(0),

  // 採点方式（CompetitionStatePayload.acc と同一値）
  // RING: 100=10点, 90=9点 / DECIMAL: 109=10.9点, 95=9.5点
  acc: z.enum(['RING', 'DECIMAL']),

  // ステージ別スコア
  stages: z.array(
    z.object({
      stageIndex: z.number().int().min(0),
      stageName: z.string(),

      // ステージ合計（×10 整数）
      stageTotalX10: z.number().int().min(0),

      // シリーズ別スコア
      series: z.array(
        z.object({
          seriesIndex: z.number().int().min(0),

          // 各ショットスコア（×10 整数の配列）
          shots: z.array(z.number().int().min(0)),

          // シリーズ合計（×10 整数）
          seriesTotalX10: z.number().int().min(0),

          // シリーズ完了フラグ（maxShots に達した場合 true）
          isComplete: z.boolean(),
        }),
      ),
    }),
  ),

  // finish-competition への応答として再発行する場合のコマンド ID
  finalSnapshotCommandId: z.string().uuid().optional(),

  publishedAt: z.string().datetime(),
});
```

各ショットは 0〜109 の ×10 整数とし、`RING` では 10 の倍数に限る。シリーズ、ステージ、全体の合計値は
それぞれ下位要素の合計と一致し、`totalShotCount` は全シリーズの `shots` 要素数と一致しなければならない。
`stageIndex` と各ステージ内の `seriesIndex` は重複不可とする。

### 4.8 `CompetitionShotPayload` — `saika/competition/{competitionId}/lane/{laneId}/shot`

```typescript
// QoS: 1, Retain: OFF
// Publisher: saika.lane
// Trigger: ショット記録時（試射・本射両方）
// hardware/shot との違い: 競技コンテキストが付加されている

const CompetitionShotPayload = z.object({
  // ハードウェアデータ（RawShotPayload と同等）
  laneId: z.string().uuid(),
  shotId: z.string().uuid(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  rawScoreX10: z.number().int().min(0),
  deviceScoreX10: z.number().int().min(0).nullable().optional(),
  calculatedScoreX10: z.number().int().min(0).optional(),
  effectiveScoreX10: z.number().int().min(0).optional(),
  observationId: z.string().uuid().optional(),
  receivedAt: z.string().datetime().optional(),
  innerTen: z.boolean(),
  mode: z.enum(['SIGHTING', 'MATCH']),
  timestamp: z.string().datetime(),

  // 競技コンテキスト
  competitionId: z.string().uuid(),
  sessionId: z.string().uuid(),

  // 射撃時点のステージ情報
  stageIndex: z.number().int().min(0),
  scored: z.boolean(),

  // 射撃時点のシリーズ情報
  seriesIndex: z.number().int().min(0),

  // このシリーズ内でのショット番号（1始まり）。Session 通算番号ではない。
  shotNumberInSeries: z.number().int().positive(),

  // 記録対象フラグ（MATCH モード かつ match ステージの場合 true）
  isRecorded: z.boolean(),

  // 再送フラグ（broker 切断中にローカル SQLite で記録し、再接続後に再送した場合 true）
  // director は isReplay=true のショットを shotId で重複排除する必要がある
  isReplay: z.boolean().default(false),

  publishedAt: z.string().datetime(),
});
```

### 4.9 コマンドペイロード

#### Lane コマンド（Tier 1 層: ブートストラップ用）

```typescript
// join-competition: director が lane を competition に参加させる
// lane はこのコマンド受信後、saika/competition/{competitionId}/# を購読し
// competition/state を受け取って自動設定を取得する（configure-lane 不要）
//
// 制約: lane は同時に 1 つの competition にのみ参加可能。
// 同じ competition への再送は冪等に done ACK を返す。
// 別の competition に参加中の場合:
//   → error ACK を返す（code: "ALREADY_IN_COMPETITION"）
//   → 先に leave-competition が必要
const JoinCompetitionCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  competitionId: z.string().uuid(),
});

// leave-competition: director が lane を competition から離脱させる
const LeaveCompetitionCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  competitionId: z.string().uuid(),
});
```

#### Broadcast Commands（`saika/competition/{competitionId}/command/{action}`）

##### `start-sighting`

```typescript
// 全 lane への試射開始コマンド
// targetLaneIds を指定した場合はそのレーンのみに適用される（省略時は全 lane）

const StartSightingCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(), // director の識別子
  issuedAt: z.string().datetime(),
  // 全 lane がこの絶対時刻にタイマーを開始する（ISSF タイマー同期）
  // ネットワーク遅延を考慮し、issuedAt より数秒後に設定すること（推奨: +3秒）
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(), // 試射制限時間（秒）
  // 対象 lane の絞り込み（省略時は competition.laneIds の全 lane）
  targetLaneIds: z.array(z.string().uuid()).optional(),
});
```

##### `end-sighting`

```typescript
const EndSightingCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
});
```

##### `start-match`

```typescript
// 本射開始コマンド
// timerStartAt: 全 lane がこの絶対時刻にタイマーを開始する（ISSF タイマー同期）
// ネットワーク遅延を考慮し、issuedAt より数秒後に設定すること（推奨: +3秒）

const StartMatchCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  // 全 lane が共通でタイマーを開始する絶対時刻（ISO 8601）
  timerStartAt: z.string().datetime(),
  timerDurationSeconds: z.number().int().positive(), // 本射制限時間（秒）
});
```

##### `timer-started`（タイマーリセット・延長・再開専用）

タイマーリセット・延長・再開時に director が broadcast する。
初回タイマー開始は `start-match` / `start-sighting` に含まれる `timerStartAt` が権威であり、
通常の競技フローでは `timer-started` は不要である。

このコマンドは以下の例外ケースでのみ使用される:

- 競技中のタイマー延長（審判判断）
- 中断後の再開時のタイマーリセット
- タイマーの手動修正

```typescript
// timer-started: タイマーリセット・延長・再開時に director が broadcast する。
// 初回タイマー開始は start-match / start-sighting に含まれる timerStartAt が権威。
// このコマンドは以下の例外ケースでのみ使用される:
//   - 競技中のタイマー延長（審判判断）
//   - 中断後の再開時のタイマーリセット
//   - タイマーの手動修正

const TimerStartedCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  // タイマーが適用されるスコープ
  timerScope: z.enum(['STAGE', 'SERIES']),
  // タイマー開始絶対時刻（全 lane がこの時刻を基準にカウントダウン）
  timerStartAt: z.string().datetime(),
  // タイマー総秒数
  timerDurationSeconds: z.number().int().positive(),
  // 現在のステージインデックス（0始まり）
  stageIndex: z.number().int().min(0),
  // 現在のシリーズインデックス（STAGE スコープの場合は null）
  seriesIndex: z.number().int().min(0).nullable(),
});
```

##### `timer-expired`（タイマー満了通知）

タイマー満了時に director が broadcast する（QoS 1 - 競技クリティカルイベント）。
lane はタイマー満了を検知したら（ローカルクロックまたはこのコマンド受信で）
射撃受付を停止し、`SERIES_COMPLETE` へ遷移する。

```typescript
const TimerExpiredCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  timerScope: z.enum(['STAGE', 'SERIES']),
  stageIndex: z.number().int().min(0),
  seriesIndex: z.number().int().min(0).nullable(),
  // 満了した時刻（= timerStartAt + timerDurationSeconds）
  expiredAt: z.string().datetime(),
});
```

##### `advance-series`

```typescript
// advance-series: シリーズ強制割り込みコマンド（オプション）
// lane は maxShots 到達時に自律的に次シリーズへ進行する。
// このコマンドは以下のケースでのみ director が送信する:
//   - 早期シリーズ終了（タイマー残りにかかわらず次へ進める）
//   - lane の応答がない場合の強制進行
//   - 不正ショットの取り消し後のシリーズ再調整
// 通常フローでは advance-series は不要。

const AdvanceSeriesCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  stageIndex: z.number().int().min(0),
  fromSeriesIndex: z.number().int().min(0), // 進行元シリーズインデックス
  // 遷移先の保存後に失敗した StartNextSeries だけを再開する
  resumeOnly: z.boolean().optional(),
  // 次シリーズのタイマー開始時刻（決勝等で使用、省略可能）
  timerStartAt: z.string().datetime().optional(),
});
```

##### `finish-competition`

```typescript
const FinishCompetitionCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
});
```

lane は競技終了を永続化した後、終了状態と最終スコアを `competitionId` で読み直して Retain 発行し、両方の
QoS 1 発行が完了してから `done` ACK を返す。スコア発行は直前の着弾による発行を含めて直列化し、古い
スナップショットが後から Retain 値を上書きしないようにする。いずれかの発行に失敗した場合は `error` ACK を返し、
同じ競技が既に終了済みの再試行でも最終状態・スコアを再発行してから `done` とする。

#### Per-Lane Commands（`saika/competition/{competitionId}/lane/{laneId}/command/{action}`）

##### `assign-athlete`

```typescript
// 選手をレーンに配置する
// athlete: null の場合は選手配置を解除する

const AssignAthleteCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  athlete: z
    .object({
      startNumber: z.number().int().positive(), // ISSF スタート番号
      id: z.string(),
      name: z.string(),
      teamName: z.string().optional(),
      issfCode: z.string().optional(),
    })
    .nullable(), // null = 選手配置解除
});
```

##### `reset-session`

```typescript
// 競技開始前のセッションをリセットする（全着弾・得点データが消去される）

const ResetSessionCmd = z.object({
  commandId: z.string().uuid(),
  issuedBy: z.string(),
  issuedAt: z.string().datetime(),
  reason: z.string().optional(), // リセット理由（ログ記録用）
});
```

`reset-session` は Lane の競技状態が `IDLE` の間だけ受理する。開始後は競技進行位置とシリーズ番号を
壊さないため `INVALID_PHASE_TRANSITION` を返す。成功時はセッション ID・種目・モード・接続情報を維持し、
着弾履歴と得点だけを消去して、0 点の Retain スコアを再発行する。Retain の発行完了後に `done` ACK を返し、
発行に失敗した場合は `error` ACK を返す。

##### Rule 8.8.1 Qualification recovery commands

四つの command は同じ per-Lane namespace を使うが、射撃制御（start／cancel）、採点裁定、無射撃確定を三つの application port へ渡す。

- `start-qualification-recovery` は `runId`、`decisionId`、`interruptionId`、stage／series、期待する MATCH program、
  series 上限と記録済み発数、許可内容、絶対 `loadAt`、decision の official／rule／時刻を持つ。許可内容は5発の
  `EXTRA_SIGHTING`、同一 program の `ANNUL_AND_REPEAT`、48秒／shot または次 series 最初の exposure を使う
  `COMPLETE_REMAINING_SHOTS` のいずれかである。`KEEP_RECORDED_SERIES` は射撃許可に含めない。
- `cancel-qualification-recovery` は `runId` と必須の取消理由を持ち、進行中の isolated timing sequence を red で終了する。
- `apply-qualification-recovery` は completed series-recovery `runId` と adjudicating official、statement、`appliedAt` を持つ。
  Lane は full shot evidence を検証し、未使用の許可発数を miss にしてから series を確定する。追加 sighting には適用できない。
- `settle-qualification-recovery` は `KEEP_RECORDED_SERIES` 専用で、decision／interruption と同じ stage／series／program／shot count、
  decision evidence、applying official、statement、`appliedAt` を持つ。記録済み発数が series 上限と一致するときだけ、元の
  session shot を immutable evidence として snapshot し、score row を変更せず series を完了する。

Lane は同じ `runId` または `decisionId` の同一 request を冪等に扱い、保存済み request と異なる retry を拒否する。
採点または settlement 保存後に competition state の更新だけが失敗した場合は、同じ command で state transition と中断解除を再調整する。

### 4.10 ACK ペイロード

Broadcast コマンドの ACK: `saika/competition/{competitionId}/command/{action}/acknowledgement/{laneId}`
Per-lane コマンドの ACK: `saika/competition/{competitionId}/lane/{laneId}/command/{action}/acknowledgement`

```typescript
// QoS: 1, Retain: OFF
// Publisher: saika.lane
// 2段階 ACK:
//   executing: コマンド受け付け開始（非同期処理が始まる場合に先行送信）
//   done: コマンド完了
//   error: コマンド失敗

const CommandAckPayload = z.object({
  commandId: z.string().uuid(),
  laneId: z.string().uuid(),
  status: z.enum(['executing', 'done', 'error']),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  acknowledgedAt: z.string().datetime(),
});
```

> **2段階 ACK の使い方**:
>
> - 同期処理（即時完了）の場合: `done` のみ送信
> - 非同期処理（例: セッションリセット + データ再計算）の場合: まず `executing` を送信し、処理完了後に `done` を送信
> - エラー時: `error` + `error.code` / `error.message` で詳細を通知

> **ACK トピック構造の差異について**:
>
> - Tier 1 ACK: `saika/lane/{laneId}/command/{action}/acknowledgement` — トピックパス自体に laneId が含まれるため、末尾に laneId を追加しない
> - Tier 2 Broadcast ACK: `saika/competition/{id}/command/{action}/acknowledgement/{laneId}` — broadcast コマンドに対する各 lane の ACK を区別するため、末尾に laneId を追加
> - Tier 2 Per-lane ACK: `saika/competition/{id}/lane/{laneId}/command/{action}/acknowledgement` — トピックパス内に laneId が含まれるため、末尾に laneId を追加しない
>   この構造により、director は以下のワイルドカードで全 ACK を購読できる:
> - Tier 1: `saika/lane/+/command/+/acknowledgement`
> - Tier 2 Broadcast: `saika/competition/+/command/+/acknowledgement/+`
> - Tier 2 Per-lane: `saika/competition/+/lane/+/command/+/acknowledgement`
>
> director は ACK を `commandId` だけで関連付けず、コマンド発行時に期待した完全な ACK トピックと照合する。
> トピック内の competition ID・action・lane ID のいずれかが一致しない ACK は無視する。また、各 lane の
> `done` / `error` は終端状態として扱い、遅延または重複した `executing` を受信しても上書きしない。

### 4.11 RPC ペイロード（QueryPayload）

リクエスト: `saika/competition/{competitionId}/lane/{laneId}/query/{requestId}/request`
レスポンス: `saika/competition/{competitionId}/lane/{laneId}/query/{requestId}/response`

```typescript
// QoS: 1, Retain: OFF
// requestId は director 側で UUID v4 を生成する
// タイムアウトは director 側で管理（推奨: 10秒）

// --- ショット一覧取得 ---
const GetShotListRequest = z.object({
  requestId: z.string().uuid(),
  method: z.literal('get-shot-list'),
  params: z.object({
    sessionId: z.string().uuid(),
    stageIndex: z.number().int().min(0).optional(),
    seriesIndex: z.number().int().min(0).optional(),
    matchOnly: z.boolean().default(false), // true: MATCH モードのショットのみ
  }),
});

// --- スコア取得 ---
const GetScoreRequest = z.object({
  requestId: z.string().uuid(),
  method: z.literal('get-score'),
  params: z.object({
    sessionId: z.string().uuid(),
  }),
});

// --- 競技状態取得 ---
const GetCompetitionStateRequest = z.object({
  requestId: z.string().uuid(),
  method: z.literal('get-competition-state'),
  params: z.object({}), // パラメータなし
});

// --- 共通レスポンス形式 ---
const QueryResponse = z.union([
  z.object({
    requestId: z.string().uuid(),
    method: z.string(),
    ok: z.literal(true),
    result: z.unknown(), // メソッドごとの返却型
    respondedAt: z.string().datetime(),
  }),
  z.object({
    requestId: z.string().uuid(),
    method: z.string(),
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
    respondedAt: z.string().datetime(),
  }),
]);

// --- メソッド別レスポンス型 ---

// get-shot-list のレスポンス
// result: CompetitionShotPayload[] 相当の配列
// （CompetitionShotPayload から publishedAt を除いた配列）

// get-score のレスポンス
// result: LaneScorePayload 相当（publishedAt を除く）

// get-competition-state のレスポンス
// result: LaneCompetitionStatePayload 相当（publishedAt を除く）
```

---

## 5. 通信シーケンス

### 5.0 Lane 参加フロー（join-competition）

```
[director が lane を competition に追加する]
Director -- PUBLISH saika/lane/{L1}/command/join-competition
            { commandId, competitionId } --> Broker
Broker -- join-competition --> Lane L1

[Lane L1: subscribe 開始]
Lane L1 -- SUBSCRIBE saika/competition/{id}/# --> Broker
Lane L1 -- PUBLISH saika/lane/{L1}/command/join-competition/acknowledgement
            { status: "executing" } --> Broker    ← subscribe 開始時に即時送信

[Lane L1: competition/state の Retain メッセージを待機（タイムアウト: 5秒）]

--- Retain 受信成功の場合 ---
Broker -- competition/state (Retain) --> Lane L1
Lane L1 -- competition/state から competitionTypeId/shotsPerSeries/laneIds 等を設定
Lane L1 -- PUBLISH saika/lane/{L1}/command/join-competition/acknowledgement
            { status: "done" } --> Broker

--- タイムアウト（5秒以内に Retain を受信できなかった場合）---
Lane L1 -- PUBLISH saika/lane/{L1}/command/join-competition/acknowledgement
            { status: "error", error: { code: "COMPETITION_STATE_NOT_FOUND",
              message: "competition/state の Retain を 5秒以内に受信できませんでした" }}
            --> Broker
Lane L1 -- UNSUBSCRIBE saika/competition/{id}/#  ← エラー時はサブスクリプション解除
```

> **Note**: `executing` ACK は subscribe 開始時に即時送信する。これにより director は lane がコマンドを受け付けたことを即座に確認できる。最終的な `done` / `error` は Retain メッセージの受信結果に基づいて送信される。

> Director が `done` / `error` を確認できずタイムアウトした場合、Lane では参加 ID の永続化が完了している可能性がある。Director は対象 Lane を `pendingJoinLaneIds` に残して競技開始を止め、新しい commandId で参加を再試行する。Lane は同じ競技に参加済みなら `done` を返す。

### 5.1 競技開始〜試射フロー

```
saika.director              MQTT Broker              saika.lane(×N台)
     |                           |                        |
     | [competition 作成]         |                        |
     |-- PUBLISH competition/    |                        |
     |   state (NOT_STARTED,     |                        |
     |   Retain=ON) ------------>|                        |
     |                           |                        |
     | [選手配置: 各 lane へ個別コマンド]                   |
     |-- PUBLISH lane/L1/         |                        |
     |   command/assign-athlete ->|                       |
     |                           |-- assign-athlete ----->| (L1)
     |                           |                        |
     |                           |<-- command/assign-     | (L1)
     |                           | athlete/acknowledgement|
     |                           |    /L1 (done) ---------|
     |<-- command/assign-athlete/|                        |
     | acknowledgement/L1 (done) |                        |
     |                           |                        |
     |                           |<-- lane/L1/assignment -| (Retain=ON 更新)
     |<-- lane/L1/assignment ----|                        |
     |    {athlete: {name,...}}  |                        |
     |                           |                        |
     | [試射開始: broadcast]       |                        |
     | (timerStartAt = T+3s)      |                        |
     |-- PUBLISH command/         |                        |
     |   start-sighting          |                        |
     |   {commandId,              |                        |
     |    timerStartAt:"T+3s",   |                        |
     |    timerDur: 600} -------->|                        |
     |                           |-- command/             |
     |                           |   start-sighting ----->| (全 lane)
     |                           |                        |
     |                           |<-- command/start-      | (L1)
     |                           | sighting/acknowledgement
     |                           |    /L1 (done) ---------|
     |<-- command/start-sighting/|                        |
     | acknowledgement/L1 (done) |                        |
     |                           |                        |
     |                           |<-- lane/L1/state ------|
     |<-- lane/L1/state ---------|   phase:SIGHTING        |
     |    phase: SIGHTING        |                        |
     |                           |                        |
     | [competition/state を更新]  |                        |
     |-- PUBLISH competition/    |                        |
     |   state (SIGHTING) ------>|                        |
     |                           |                        |
     | [試射中: ショットが流れる]   |                        |
     |                           |<-- lane/L1/shot -------|
     |<-- lane/L1/shot -----------|                        |
     |                           |                        |
     | [試射終了: broadcast]       |                        |
     |-- PUBLISH command/         |                        |
     |   end-sighting ---------->|                        |
     |                           |-- command/             |
     |                           |   end-sighting ------->| (全 lane)
     |                           |<-- acknowledgement/    |
     |                           |    L1 (done) ----------|
     |                           |<-- lane/L1/state ------|
     |<-- lane/L1/state ---------|   phase: SIGHTING_      |
     |    phase: SIGHTING_COMPLETE|   COMPLETE             |
     |                           |                        |
     |-- PUBLISH competition/    |                        |
     |   state (SIGHTING_COMPLETE)|                       |
```

### 5.2 本射フロー（タイマー同期）

```
saika.director              MQTT Broker              saika.lane(×N台)
     |                           |                        |
     | [本射開始: broadcast]       |                        |
     | (timerStartAt = T+3s)      |                        |
     |-- PUBLISH command/          |                        |
     |   start-match              |                        |
     |   {commandId,              |                        |
     |    timerStartAt:"T+3s",    |                        |
     |    timerDurationSeconds:2700} --->|                        |
     |                           |-- command/             |
     |                           |   start-match -------->| (全 lane)
     |                           |                        |
     |                           |<-- command/start-match/|
     |                           | acknowledgement/L1     |
     |                           |    (executing) --------| ← 非同期処理開始
     |<-- acknowledgement/       |                        |
     |    L1 (executing) --------|                        |
     |                           |                        |
     |                           | [T+3s になるまで各 lane は待機]
     |                           |                        |
     |                           |   T+3s ────────────────|
     |                           |   全 lane が同時にタイマー開始
     |                           |                        |
     |                           |<-- command/start-match/|
     |                           | acknowledgement/L1     |
     |                           |    (done) -------------|
     |<-- acknowledgement/       |                        |
     |    L1 (done) -------------|                        |
     |                           |                        |
     |                           |<-- lane/L1/state ------|
     |<-- lane/L1/state ---------|   phase: MATCH          |
     |    phase: MATCH           |                        |
     |                           |                        |
     | [competition/state 更新]   |                        |
     |-- PUBLISH competition/    |                        |
     |   state (MATCH) --------->|                        |
     |                           |                        |
     | [Note: lane は start-match の timerStartAt でタイマーを開始する]
     | [timer-started は通常フローでは不要（例外ケース専用）]
     |全 Lane: start-match の timerStartAt を基準にローカルクロックでカウントダウン開始
     |                           |                        |
     | [ショット 1〜10 発]         |                        |
     |                           |<-- lane/L1/shot(×10) --|
     |<-- lane/L1/shot(×10) -----|                        |
     |<-- lane/L1/score(×10) ----|<-- lane/L1/score(×10) -|
     |                           |                        |
     |                           |<-- lane/L1/state ------|
     |<-- lane/L1/state ---------|   phase: SERIES_COMPLETE|
     |    phase: SERIES_COMPLETE |   seriesIndex: 0        |
     |                           |                        |
     | [タイマー満了: timer-expiredをbroadcast]            |
     |-- PUBLISH competition/    |                        |
     |   command/timer-expired    |                        |
     |   { stageIndex, expiredAt}|                        |
     |   (QoS 1) --------------->|                        |
     |                           |-- command/             |
     |                           |   timer-expired ------>| (全 lane)
     |                           |<-- acknowledgement/    |
     |                           |    L1 (done) ----------|
     |全 Lane: 射撃受付停止、SERIES_COMPLETE へ自律遷移    |
     |                           |                        |
     | [次シリーズ: broadcast]     |                        |
     | (timerStartAt = T2+5s)     |                        |
     |-- PUBLISH command/         |                        |
     |   advance-series          |                        |
     |   {stageIndex:1,          |                        |
     |    fromSeriesIndex:0,      |                        |
     |    timerStartAt:"T2+5s"} ->|                       |
     |                           |-- command/             |
     |                           |   advance-series ----->| (全 lane)
     |                           |<-- acknowledgement/    |
     |                           |    L1 (done) ----------|
     |                           |<-- lane/L1/state ------|
     |<-- lane/L1/state ---------|   phase: MATCH          |
     |    phase: MATCH           |   seriesIndex: 1        |
     |    seriesIndex: 1         |                        |
```

> **Note**: 通常フローでは advance-series コマンドは不要。lane は maxShots 到達を自律検知して SERIES_COMPLETE へ遷移する。advance-series は早期終了・強制進行等の例外ケース専用コマンド。

### 5.3 Director 再接続（Retain による状態復旧）

```
saika.director              MQTT Broker              saika.lane(×N台)
     |                           |                        |
     | [director がクラッシュ・再起動]                      |
     |                           |  [ブローカーは Retain を保持]
     |                           |  competition/state     |
     |                           |  lane/L1/state         |
     |                           |  lane/L1/score         |
     |                           |  lane/L1/assignment    |
     |                           |  hardware/state        |
     |                           |                        |
     |-- MQTT CONNECT ---------->|                        |
     |-- SUBSCRIBE               |                        |
     |   saika/competition/+/# ->|                        |
     |-- SUBSCRIBE               |                        |
     |   saika/lane/+/hardware/# |                        |
     |                           |                        |
     |<-- competition/state -----|  (Retain 配信)          |
     |    {phase: MATCH, ...}    |                        |
     |<-- lane/L1/state ---------|  (Retain 配信)          |
     |    {phase: SERIES_COMPLETE}|                       |
     |<-- lane/L1/score ---------|  (Retain 配信)          |
     |     {totalScoreX10: 987}   |                       |
     |<-- lane/L1/assignment -----|  (Retain 配信)         |
     |    {athlete: {name,...}}  |                        |
     |<-- hardware/state ---------|  (Retain 配信)         |
     |    {connection: connected}|                        |
     |                           |                        |
     | [director は完全な状態を復旧完了]
     | RPC による状態取得は不要
     |                           |                        |
```

### 5.4 Lane 障害・復旧

```
saika.director              MQTT Broker              saika.lane (L1)
     |                           |                        |
     |                           | [L1 が突然クラッシュ]   |
     |                           |                        |× (クラッシュ)
     |                           |                        |
     |                           | [ブローカーが Will を送信]
     |                           |-- Will: hardware/state |
     |                           |   {status: "offline",  |
     |                           |    Retain=ON} -------->|
     |<-- hardware/state ---------|                        |
     |    status: "offline"      |                        |
     |                           |                        |
     | [director: L1 がオフライン  |                        |
     |  競技一時停止を人的判断]    |                        |
     |                           |                        |
     |                           |                (L1 再起動)
     |                           |           [SQLite から競技状態復旧]
     |                           |           [ショットデータ確認]
     |                           |                        |
     |                           |<-- MQTT CONNECT -------|
     |                           |                        |
     |                           | [L1: 全 Retain トピック再発行]
     |                           |<-- hardware/state -----|
     |                           |   {status: "connected"}|
     |<-- hardware/state ---------|                        |
     |    status: "connected"    |                        |
     |                           |<-- lane/L1/state ------|
     |<-- lane/L1/state ---------|   (SQLite から復旧した  |
     |    (最新競技状態)          |    現在状態)            |
     |                           |<-- lane/L1/score ------|
     |<-- lane/L1/score ---------|   (SQLite から復旧した  |
     |    (最新スコア)            |    スコア)              |
     |                           |                        |
     | [director: L1 がオンライン  |                        |
     |  復旧確認。競技再開を判断]  |                        |
```

### 5.5 競技終了後の Retain クリーンアップシーケンス

`finish-competition` の全 lane ACK（`done`）受信後、director は必要な成績保存を終えてから、各 Retain トピックに空ペイロード（payload length = 0）を `Retain=ON` で publish する。`done` の時点で各 lane の終了状態と最終スコアの Retain 発行は完了している。これにより director は最終データを保存してからブローカー上の Retain メッセージをクリアでき、次回の competition 開始時に古い状態が配信されることも防ぐ。

#### Director 側クリーンアップ

```
[finish-competition の全 lane ACK (done) を受信後]

Director -- PUBLISH saika/competition/{id}/state
            { payload: empty, Retain=ON } --> Broker (Retain クリア)

Director -- PUBLISH saika/competition/{id}/lane/{L1}/state
            { payload: empty, Retain=ON } --> Broker (Retain クリア)

Director -- PUBLISH saika/competition/{id}/lane/{L1}/score
            { payload: empty, Retain=ON } --> Broker (Retain クリア)

Director -- PUBLISH saika/competition/{id}/lane/{L1}/assignment
            { payload: empty, Retain=ON } --> Broker (Retain クリア)

(上記を全参加 lane について繰り返す)
```

#### クリーンアップ対象トピック

| トピック                                          | クリーンアップ主体 |
| ------------------------------------------------- | ------------------ |
| `saika/competition/{id}/state`                    | director           |
| `saika/competition/{id}/lane/{laneId}/state`      | director           |
| `saika/competition/{id}/lane/{laneId}/score`      | director           |
| `saika/competition/{id}/lane/{laneId}/assignment` | director           |

#### Lane 側クリーンアップ

lane は `leave-competition` 受信時に、自分の Retain トピックをクリアする:

```
Lane -- leave-competition 受信
Lane -- PUBLISH saika/competition/{id}/lane/{laneId}/state
        { payload: empty, Retain=ON } --> Broker (Retain クリア)
Lane -- PUBLISH saika/competition/{id}/lane/{laneId}/score
        { payload: empty, Retain=ON } --> Broker (Retain クリア)
Lane -- PUBLISH saika/competition/{id}/lane/{laneId}/assignment
        { payload: empty, Retain=ON } --> Broker (Retain クリア)
Lane -- UNSUBSCRIBE saika/competition/{id}/#
Lane -- PUBLISH leave-competition ACK (done)
```

> **Note**: Retain クリーンアップは MQTT 仕様に準拠した方法である。空ペイロード（payload length = 0）を `Retain=ON` で publish すると、ブローカーは該当トピックの Retain メッセージを削除する。

---

## 6. 設定スキーマ

`saika.lane` の設定（`settings.contract.ts`）に追加する MQTT 設定。

```typescript
// QoS: N/A（MQTT 設定はアプリ設定であり MQTT ペイロードではない）
// 既存 SettingsDto に mqtt フィールドを追加する

const MqttSettingsSchema = z.object({
  // MQTT 機能の有効/無効（false の場合、全 MQTT 処理をスキップ）
  // MQTT がなくても saika.lane は完全動作する
  enabled: z.boolean().default(false),

  // MQTT ブローカー URL（e.g. "mqtt://broker.example.com:1883", "mqtts://broker.example.com:8883"）
  brokerUrl: z.string().url(),

  // このレーンの識別子（UUID v4）
  // 初回起動時に SettingsRepository.initialize() 内で自動生成・永続化する
  // IPC: getSettings() で取得、saveSettings() で保存（UI からは変更不可）
  laneId: z.string().uuid(),

  // 表示用エイリアス（e.g. "1番射座"、スコアボード表示用）
  laneAlias: z.string().default(''),

  // 認証設定（ブローカーが認証を必要とする場合）
  auth: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),

  // TLS 設定
  tls: z
    .object({
      enabled: z.boolean().default(false),
      // CA 証明書ファイルパス（自己署名証明書の場合）
      caCertPath: z.string().optional(),
      // クライアント証明書（相互 TLS の場合）
      clientCertPath: z.string().optional(),
      clientKeyPath: z.string().optional(),
      // 証明書検証をスキップ（開発環境のみ、本番禁止）
      rejectUnauthorized: z.boolean().default(true),
    })
    .optional(),

  // 起動時に MQTT ブローカーへ自動接続するか
  autoConnect: z.boolean().default(false),

  // Keep Alive 間隔（秒）
  keepAlive: z.number().int().positive().default(60),

  // 再接続間隔（ミリ秒）
  reconnectPeriod: z.number().int().positive().default(5000),

  // Clean Session フラグ
  // true（推奨）: 毎回クリーンスタート。再接続時にブローカー側のセッション状態を破棄する。
  // false: ブローカーが切断中のメッセージをキューイングするが、
  //        isReplay との二重配信リスクがあるため非推奨。
  cleanSession: z.boolean().default(true),
});
```

> **`laneId` の初期化責務**: `SettingsRepository.initialize()` 内で `laneId` フィールドが未設定（または無効な UUID）の場合に `crypto.randomUUID()` で自動生成し、設定ファイルに永続化する。IPC コマンドの `getSettings` で取得でき、UI 上では表示のみ（変更不可）とする。変更が必要な場合は設定ファイルを直接編集するか、「リセット」操作で再生成する。

---

## 7. 耐障害設計

### 7.1 障害シナリオ一覧

| 障害シナリオ                | Lane 動作                                                                                                     | Director 動作                                                                                | 競技継続性      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| Broker 一時断（数秒〜数分） | ローカル SQLite で競技継続。再接続後に全 Retain トピックを再発行し、切断中のショットを shot トピックで再送信  | 再接続後、Retain メッセージで全 lane の最新状態を自動復旧。RPC 不要                          | ✅ 継続         |
| Lane クラッシュ             | Will メッセージで hardware/state (offline) を自動送信。再起動後に SQLite から完全復旧し Retain トピックを更新 | hardware/state (offline) を受信し LanePhase=OFFLINE を検知。競技一時停止を人的判断           | △ 要人的判断    |
| Director クラッシュ         | Lane は独立して競技を継続。MQTT 発行も通常通り継続。コマンド受信なしでも状態遷移は手動操作で継続可能          | 再起動後、Retain メッセージで competition/state・全 lane の状態・スコア・選手配置を完全復旧  | ✅ Lane 側継続  |
| Broker クラッシュ           | 再接続までローカル SQLite で競技継続。接続復旧後に最新状態を再発行                                            | Will が配信されず古い hardware/state が復元されても、150秒を超えた heartbeat は offline 扱い | △ 復旧待ち      |
| ネットワーク遅延            | タイマーは `absoluteDeadline` を基準に補正。ローカルクロックと `absoluteDeadline` の差分で開始/終了時刻を調整 | ACK タイムアウト（推奨 10 秒）で lane の応答を監視。タイムアウト後に状態確認 RPC を発行      | ✅ 補正あり     |
| 特定 Lane の USB 接続断     | hardware/state (disconnected) を発行。競技層は継続（他 lane に影響なし）                                      | hardware/state を受信しハードウェア接続断を検知。競技タイマーは継続                          | ✅ 他 lane 継続 |
| Broker 永続障害             | 完全スタンドアロンで動作。全機能が利用可能（スコア記録・表示・印刷）                                          | N/A                                                                                          | ✅ Lane 単独    |

初回接続または必須購読の初期化に失敗した場合、Lane は MQTT クライアントの自動再接続を停止し、接続後の失敗では
`offline` を Retain 発行してからソケットを閉じる。UI に失敗を返した後でバックグラウンド接続だけが残ることはない。

### 7.2 Lane スタンドアロン動作の保証

**MQTT は saika.lane の「オプション機能」である**。この原則を設計のコアに据える。

```
saika.lane の必須動作（MQTT 有無に関わらず保証）:
  ✅ MT201 USB 接続・着弾データ受信
  ✅ ショット記録・SQLite 永続化
  ✅ スコア計算・表示
  ✅ 競技フェーズ管理（試射/本射/シリーズ/ステージ）
  ✅ タイマー動作
  ✅ 成績印刷・PDF エクスポート
  ✅ 全設定管理

saika.lane の MQTT 依存機能（MQTT 無効時はスキップ）:
  📡 スコア・状態のリアルタイム配信
  📡 director からのコマンド受信
  📡 スコアボードへのデータ配信
  📡 マルチレーン同期タイマー
```

**実装ガイドライン**:

- `MqttClientService` は常に「接続していない場合は何もしない」動作をする
- MQTT 関連のコードは全て `if (mqttSettings.enabled && mqttClient.isConnected())` で保護する
- MQTT の初期化失敗は `console.warn` に留め、アプリの起動・動作を妨げない

### 7.3 Will メッセージ設定

lane 起動時、MQTT ブローカーへの接続 CONNECT パケットに Will を設定する:

```
Will topic:   saika/lane/{laneId}/hardware/state
Will payload: { laneId, laneAlias, connection: { status: "offline" }, appVersion, publishedAt }
Will QoS:     1
Will Retain:  true（ブローカーに残り、次の接続で上書きされるまで配信される）
```

正常切断では Will が発行されないため、Lane は MQTT `DISCONNECT` の前に同じトピックへ最新時刻の
`offline` 状態を QoS 1 / Retain 付きで明示的に発行する。

> **`publishedAt` の注意**: Will メッセージの `publishedAt` は MQTT CONNECT 時に登録された値であり、実際の切断時刻ではない。数時間稼働後にクラッシュした場合、`publishedAt` は起動時の時刻となる。正確な切断時刻が必要な場合は、director 側の受信時刻（`receivedAt`）を使用すること。

### 7.4 再送ショットの冪等性保証

MQTT QoS 1 は「少なくとも1回の配信」を保証するが「重複配信あり」である。特に broker 切断中に lane がローカル SQLite に蓄積し、再接続後に再送するショットは director 側で正しく処理する必要がある。

#### lane 側の再送仕様

| 項目           | 仕様                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| 再送フラグ     | `CompetitionShotPayload.isReplay = true`                                                            |
| 再送順序       | SQLite の `timestamp`（着弾時刻）昇順で再送する                                                     |
| 位置の復元     | 保存済み shot history の series number から元の stage / series / series内番号を復元する             |
| 再送タイミング | broker 再接続後、通常ショット発行前にバックログを一括送信                                           |
| 再送完了通知   | 全バックログ送信後、`LaneCompetitionStatePayload` を再発行（director が「再送完了」を検知する手段） |

#### director 側の重複排除仕様

| 項目           | 仕様                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| 識別キー       | `shotId`（UUID）で重複を判定する                                                               |
| 重複の扱い     | operational state では2回目以降を無視し、監査 journal には全 delivery を追記する               |
| 順序の復元     | 表示・スコア計算には `timestamp`（着弾時刻）順を使用する（`publishedAt` は再送時刻のため不適） |
| 再送完了の検知 | `LaneCompetitionStatePayload` の再発行を「再送完了シグナル」として扱う                         |

#### 設計上の注意

- `shotId` は lane 側で着弾時に生成し SQLite に永続化する。再送時も元の `shotId` を使用する。
- `publishedAt` は発行時刻（再送では再送時刻）、`timestamp` は着弾時刻である。スコア計算・順序判定には必ず `timestamp` を使用すること。
- director は operational state 用に `shotId` を一時キャッシュし、競技終了後にキャッシュをクリアする。別途、
  append-only journal は duplicate と `isReplay=true` の delivery も削除せず保存する。

### 7.5 再接続時のサブスクリプション再構築

`cleanSession=true`（推奨）を使用する場合、再接続のたびにブローカー側のセッション状態が破棄される。そのため lane は再接続時に以下のサブスクリプション再構築フローを実行する必要がある。

#### 再構築フロー

```
Lane 再接続
  → MQTT CONNECT (cleanSession=true)
  → ブローカーが既存セッションを破棄
  → Lane: 現在参加中の competition があるか確認（ローカル SQLite）
  → 参加中の competition がある場合:
      → SUBSCRIBE saika/competition/{competitionId}/#
      → competition/state の Retain メッセージを受信
      → competitionTypeId 等の整合性を確認
      → 全 Retain トピック（lane/{laneId}/state, score, assignment）を最新状態で再発行
      → 切断中のショットバックログを再送信
  → 参加中の competition がない場合:
      → サブスクリプション再構築不要（Tier 1 トピックのみ）
```

#### `cleanSession=false` のリスク

`cleanSession=false` を使用すると、ブローカーは切断中のメッセージをキューイングし、再接続時に配信する。しかし以下のリスクがあるため非推奨とする:

- **isReplay との二重配信**: lane が切断中にローカル SQLite に蓄積したショットを `isReplay=true` で再送信するが、ブローカーのキューにも同時刻のコマンドやイベントが滞留しており、処理順序が不定になる
- **古いコマンドの遅延実行**: 切断中に director が送信したコマンド（例: `advance-series`）がキューに残り、再接続時に現在の競技状態と矛盾するコマンドが実行される可能性がある
- **Retain メッセージとの競合**: キューイングされたメッセージと Retain メッセージの両方が配信され、director 側で状態の整合性判断が困難になる

### 7.6 時刻同期要件

`timerStartAt` / `absoluteDeadline` による全 lane 同時開始は、各 lane のシステムクロックが揃っていることを前提とする。クロックがずれた状態では「同時開始保証」が成立しない。

#### 必要な時刻同期精度

| 用途                            | 要求精度    | 根拠                                               |
| ------------------------------- | ----------- | -------------------------------------------------- |
| タイマー同時開始                | ±500ms 以内 | 競技ルール上許容できるスタートタイムの誤差         |
| ショット `timestamp` の順序保証 | ±100ms 以内 | 同一シリーズ内のショット順序が逆転しないための要件 |

#### 推奨時刻同期方式

| 方式                          | 精度            | 推奨ケース                                     |
| ----------------------------- | --------------- | ---------------------------------------------- |
| NTP（OS 標準）                | ±数十ms〜数百ms | 通常の LAN 環境（推奨）                        |
| Windows Time Service（w32tm） | ±数百ms         | Windows 環境（saika.lane は Electron/Windows） |
| PTP（IEEE 1588）              | ±数マイクロ秒   | 高精度要件（saika では不要）                   |

**saika の推奨設定（Windows 環境）**:

```
w32tm /config /syncfromflags:manual /manualpeerlist:"ntp.nict.jp" /update
```

または社内 NTP サーバーを使用する。

#### ドリフト許容と補正

lane は `start-match` コマンド受信時に、`timerStartAt`（絶対時刻）と現在のローカルクロックを比較して補正する:

```
timerStartAt が過去の場合（コマンド遅延による）:
  補正後残り時間 = timerDurationSeconds - (現在時刻 - timerStartAt)
  補正後残り時間 ≤ 0 の場合: タイマー満了として扱う

timerStartAt が未来の場合（余裕を持ったコマンド）:
  (timerStartAt - 現在時刻) 後にタイマー開始
  通常: director は 3〜5秒の余裕を設けて発行する
```

#### フェイルセーフ

| 条件                         | 動作                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| クロックドリフトが 5秒 超    | lane は `start-match` ACK に `warning: "clock_drift_detected"` を付加して director に通知                   |
| クロックドリフトが 30秒 超   | lane はコマンドを拒否し `status: error, code: "CLOCK_OUT_OF_SYNC"` の ACK を返す                            |
| NTP 同期なしが検出された場合 | `HardwareStatePayload` に `clockSyncStatus: 'synced' \| 'unsynced' \| 'unknown'` を追加して通知（将来実装） |

> **運用要件**: 競技開始前に全 lane の NTP 同期を確認すること。`HardwareStatePayload.clockSyncStatus` の導入（将来 P2）まで、運用チェックリストで手動確認を行う。

### 7.7 セキュリティ設計方針

#### 認証

Lane と Director は環境変数で `username/password` を設定できる。内蔵 broker は
`SAIKA_MQTT_BROKER_AUTH_MODE=REQUIRED` の場合に Director／Lane role を認証し、未認証 connection を拒否する。
外部 broker の account と password policy は broker 側で管理する。

#### ACL（Access Control List）設計方針

以下の ACL を MQTT ブローカーに設定する（Mosquitto の `aclfile` 等で実装）。

| クライアント                 | Publish 許可                                                                                        | Subscribe 許可                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| saika.lane (laneId=X)        | `saika/lane/X/#`、`saika/competition/+/lane/X/#`、`saika/competition/+/command/+/acknowledgement/X` | 自 Lane command、competition state／cue／broadcast command、自 Lane の private command／query request |
| saika.director               | `saika/competition/#`、`saika/lane/+/command/#`                                                     | `saika/#`                                                                                             |
| スコアボード（読み取り専用） | なし                                                                                                | 外部 broker で必要な score／assignment／state topic だけを許可する                                    |

内蔵 broker の ACL は認証を `REQUIRED` にした場合にこの境界を強制する。Lane role の credential は共通であり、
Lane ID と topic の結び付けは client ID に基づく。device ごとの認証主体が必要な構成では、外部 broker で個別 account と ACL を使用する。

#### TLS 運用方針

- **LAN 内環境**: TLS 使用を推奨。現在は OS trust store に登録済みの server certificate を使用する
- **インターネット経由**: 外部 broker の TLS と強い client 別認証／ACL を必須とする
- **開発環境**: 隔離した開発 network では平文 `mqtt://` を使用可能

> **現在のスコープ**: username/password と内蔵 broker の role/topic ACL は実装済み。custom CA、TLS client certificate、
> 内蔵 broker の device 別 account は未対応。

---

## 8. Saika内部設計の比較

| 観点             | 旧設計（lane-centric） | 現設計（competition-centric）                |
| ---------------- | ---------------------- | -------------------------------------------- |
| 主要namespace    | `saika/lane/{laneId}`  | `saika/competition/{id}` + `saika/lane/{id}` |
| タイマー権威     | 各lane                 | competition単位（directorが管理）            |
| マルチレーン同期 | なし                   | broadcast command + `timerStartAt` 絶対時刻  |
| コマンドACK      | 未定義                 | 2段階ACK（`executing` / `done` / `error`）   |
| state権威        | 不明確                 | laneが状態権威、directorは集約消費者         |
| コマンド対象     | 1 laneずつ             | broadcastとper-lane                          |

---

## 9. 実装ロードマップ

### フェーズ 1: Lane Infrastructure（ハードウェア層）

**目標**: saika.lane が MQTT ブローカーに接続し、ハードウェア状態とショットをリアルタイム配信できる状態にする。

**実装内容**:

- `mqtt` npm パッケージ導入
- `MqttClientService`: 接続・切断・再接続・Will メッセージ登録
- `SettingsRepository.initialize()` 内での `laneId` UUID 自動生成・永続化
- Will メッセージ登録（接続断時に hardware/state (offline) 自動送信）
- `saika/lane/{laneId}/hardware/state` 発行（連動: `connectionStatusChanged` IPC イベント）
- `saika/lane/{laneId}/hardware/shot` 発行（連動: `shotRecorded` IPC イベント）
- 設定 UI: MQTT 有効/無効 / brokerUrl / laneAlias / autoConnect

**完了条件**:

- `mosquitto_sub` で hardware/state・hardware/shot が受信できる
- lane 異常終了時に Will で offline が自動送信される
- MQTT 無効でも saika.lane が通常動作する

---

### フェーズ 2: Competition State Publishing（lane → director 通知）

**目標**: competition 層の全状態トピックがリアルタイム配信される状態にする。

**実装内容**:

- `saika/competition/{competitionId}/lane/{laneId}/state` 発行（連動: フェーズ変化 IPC イベント）
- `saika/competition/{competitionId}/lane/{laneId}/score` 発行（連動: `shotRecorded` IPC イベント）
- `saika/competition/{competitionId}/lane/{laneId}/shot` 発行（連動: `shotRecorded` IPC イベント）
- 内部 Phase → MQTT LanePhase のマッピング実装
- 競技開始時の Retain トピック初期化（現在状態を即時発行）
- 切断後再接続時の全 Retain トピック再発行

**完了条件**:

- director（または `mosquitto_sub`）が接続するだけで全 lane の現在状態を取得できる
- ショット・スコア・フェーズ変化がリアルタイムに届く

---

### フェーズ 3: Command Handling（director → lane コマンド）

**目標**: director からの MQTT コマンドで saika.lane を操作できる状態にする。

**実装内容**:

- `saika/competition/{competitionId}/command/+` のサブスクライブ（broadcast コマンド）
- `saika/competition/{competitionId}/lane/{laneId}/command/+` のサブスクライブ（per-lane コマンド）
- 各コマンドの Zod バリデーション
- 2段階 ACK 実装（executing / done / error）
- コマンド→IPC のルーティング:
  - `start-sighting` → `competitionContract.startPreparation`
  - `end-sighting` → `competitionContract.endPreparation`
  - `start-match` → `competitionContract.startMatch`（`timerStartAt` 絶対時刻で同期）
  - `advance-series` → `competitionContract.advanceSeries`
  - `finish-competition` → `competitionContract.finishCompetition`
  - `assign-athlete` → `athleteContract.assignAthlete`（新規実装）
  - `reset-session` → `sessionContract.resetSession`
- `commandId` によるべき等制御（重複実行防止）

**完了条件**:

- `mosquitto_pub` でコマンドを送信すると saika.lane が正しく動作する
- ACK が director に届く
- 同一 `commandId` の重複送信が無視される

---

### フェーズ 4: RPC（要求応答）

**目標**: director からのデータ取得リクエストに lane が応答できる状態にする。

**実装内容**:

- `saika/competition/{competitionId}/lane/{laneId}/query/+/request` をサブスクライブ
- RPC メソッド実装:
  - `get-shot-list`: SQLite からショット一覧を取得・返却
  - `get-score`: 現在のスコアを返却（LaneScorePayload 相当）
  - `get-competition-state`: 現在の競技状態を返却（LaneCompetitionStatePayload 相当）
- エラーレスポンス（`ok: false` 形式）
- タイムアウト処理（10 秒）

**完了条件**:

- director が RPC でショット一覧・スコア・競技状態を取得できる
- 不正なリクエストにはエラーレスポンスが返る

---

### フェーズ 5: Multi-Lane Orchestration（director 側 + 統合テスト）

**目標**: saika.director が複数の saika.lane を統括管理し、マルチレーン競技を運営できる状態にする。

**実装内容**（主に saika.director 側）:

- `saika/competition/{competitionId}/#` のワイルドカードサブスクライブ
- `saika/lane/+/hardware/#` のワイルドカードサブスクライブ
- `CompetitionStatePayload` 発行（director が管理する competition 全体状態）
- `TimerStartedCmd` / `TimerExpiredCmd` broadcast 発行（毎秒 tick は廃止、各 lane がローカルクロックで計算）
- broadcast コマンド発行・全 lane ACK 収集・タイムアウト検知
- `timerStartAt` 算出ロジック（`issuedAt + 送信待機時間` で全 lane 同期）
- 全 lane スコア集計・ランキング表示

**saika.lane 側の追加対応**:

- `saika/competition/{competitionId}/state` を購読し `CompetitionPhase` の変化を受信
- `timer-started` コマンド受信後、`timerStartAt` と `timerDurationSeconds` からローカルクロックでカウントダウン計算

**完了条件**:

- 2 台以上の saika.lane を同時に管理できる
- `start-match` コマンドで全 lane が `timerStartAt` 時刻にタイマー同期開始する
- 1 台の lane が切断しても他の lane に影響しない
- director 再起動後に Retain のみで全状態が復旧する

---

## 付録: トピック一覧リファレンス

### Tier 1: Lane Infrastructure

| トピック                                                        | Publisher | QoS | Retain | 説明                                 |
| --------------------------------------------------------------- | --------- | --- | ------ | ------------------------------------ |
| `saika/lane/{laneId}/hardware/state`                            | lane      | 1   | ON     | デバイス接続状態・Will メッセージ    |
| `saika/lane/{laneId}/hardware/shot`                             | lane      | 1   | OFF    | 生着弾データ（競技コンテキストなし） |
| `saika/lane/{laneId}/command/join-competition`                  | director  | 1   | OFF    | competition 参加コマンド             |
| `saika/lane/{laneId}/command/join-competition/acknowledgement`  | lane      | 1   | OFF    | 参加 ACK                             |
| `saika/lane/{laneId}/command/leave-competition`                 | director  | 1   | OFF    | competition 離脱コマンド             |
| `saika/lane/{laneId}/command/leave-competition/acknowledgement` | lane      | 1   | OFF    | 離脱 ACK                             |

### Tier 2: Competition

| トピック                                                                         | Publisher | QoS | Retain | 説明                                             |
| -------------------------------------------------------------------------------- | --------- | --- | ------ | ------------------------------------------------ |
| `saika/competition/{id}/state`                                                   | director  | 1   | ON     | 競技全体状態・フェーズ                           |
| `saika/competition/{id}/command/start-sighting`                                  | director  | 1   | OFF    | 全 lane 試射開始 broadcast                       |
| `saika/competition/{id}/command/start-sighting/acknowledgement/{laneId}`         | lane      | 1   | OFF    | 試射開始 ACK                                     |
| `saika/competition/{id}/command/end-sighting`                                    | director  | 1   | OFF    | 全 lane 試射終了 broadcast                       |
| `saika/competition/{id}/command/end-sighting/acknowledgement/{laneId}`           | lane      | 1   | OFF    | 試射終了 ACK                                     |
| `saika/competition/{id}/command/start-match`                                     | director  | 1   | OFF    | 全 lane 本射開始 broadcast                       |
| `saika/competition/{id}/command/start-match/acknowledgement/{laneId}`            | lane      | 1   | OFF    | 本射開始 ACK                                     |
| `saika/competition/{id}/command/timer-started`                                   | director  | 1   | OFF    | タイマー開始通知 broadcast                       |
| `saika/competition/{id}/command/timer-started/acknowledgement/{laneId}`          | lane      | 1   | OFF    | タイマー開始 ACK                                 |
| `saika/competition/{id}/command/timer-expired`                                   | director  | 1   | OFF    | タイマー満了通知 broadcast                       |
| `saika/competition/{id}/command/timer-expired/acknowledgement/{laneId}`          | lane      | 1   | OFF    | タイマー満了 ACK                                 |
| `saika/competition/{id}/command/advance-series`                                  | director  | 1   | OFF    | 全 lane シリーズ進行 broadcast（例外ケース専用） |
| `saika/competition/{id}/command/advance-series/acknowledgement/{laneId}`         | lane      | 1   | OFF    | シリーズ進行 ACK                                 |
| `saika/competition/{id}/command/finish-competition`                              | director  | 1   | OFF    | 全 lane 競技終了 broadcast                       |
| `saika/competition/{id}/command/finish-competition/acknowledgement/{laneId}`     | lane      | 1   | OFF    | 競技終了 ACK                                     |
| `saika/competition/{id}/lane/{laneId}/state`                                     | lane      | 1   | ON     | レーン競技フェーズ・ステージ状態                 |
| `saika/competition/{id}/lane/{laneId}/assignment`                                | lane      | 1   | ON     | 選手配置情報                                     |
| `saika/competition/{id}/lane/{laneId}/score`                                     | lane      | 1   | ON     | 競技スコア                                       |
| `saika/competition/{id}/lane/{laneId}/shot`                                      | lane      | 1   | OFF    | 競技コンテキスト付きショット                     |
| `saika/competition/{id}/lane/{laneId}/qualification-recovery/state`              | lane      | 1   | ON     | Rule 8.8.1 recovery run の現在状態               |
| `saika/competition/{id}/lane/{laneId}/qualification-recovery/shot`               | lane      | 1   | OFF    | score から隔離した recovery shot evidence        |
| `saika/competition/{id}/lane/{laneId}/command/start-qualification-recovery`      | director  | 1   | OFF    | 許可済み recovery firing の開始                  |
| `saika/competition/{id}/lane/{laneId}/command/cancel-qualification-recovery`     | director  | 1   | OFF    | recovery firing の取消                           |
| `saika/competition/{id}/lane/{laneId}/command/apply-qualification-recovery`      | director  | 1   | OFF    | completed recovery の採点裁定                    |
| `saika/competition/{id}/lane/{laneId}/command/settle-qualification-recovery`     | director  | 1   | OFF    | full recorded series の無射撃確定                |
| `saika/competition/{id}/lane/{laneId}/command/{recovery-action}/acknowledgement` | lane      | 1   | OFF    | 各 Qualification recovery command の ACK         |
| `saika/competition/{id}/lane/{laneId}/command/assign-athlete`                    | director  | 1   | OFF    | 選手配置コマンド                                 |
| `saika/competition/{id}/lane/{laneId}/command/assign-athlete/acknowledgement`    | lane      | 1   | OFF    | 選手配置 ACK                                     |
| `saika/competition/{id}/lane/{laneId}/command/reset-session`                     | director  | 1   | OFF    | セッションリセットコマンド                       |
| `saika/competition/{id}/lane/{laneId}/command/reset-session/acknowledgement`     | lane      | 1   | OFF    | リセット ACK                                     |
| `saika/competition/{id}/lane/{laneId}/query/{requestId}/request`                 | director  | 1   | OFF    | RPC リクエスト                                   |
| `saika/competition/{id}/lane/{laneId}/query/{requestId}/response`                | lane      | 1   | OFF    | RPC レスポンス                                   |
