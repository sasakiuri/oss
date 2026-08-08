<!-- SPDX-License-Identifier: MIT -->

# 競技種別定義

Saika Lane の競技種別（CompetitionType）に関する設計資料。

> 現行実装の登録済み種別は `BR60S` と `BP60` です。将来案を含む記述には未実装であることを明記しています。公式な競技規則は [参照元](../SOURCES.md) を確認してください。

---

## CompetitionTypeDefinition 概念構造

```
CompetitionTypeDefinition
├── id: string                    # 種別ID（例: 'BR60S'）
├── name: string                  # 表示名（例: '10m ビームライフル60発立射'）
└── config: RoundConfig           # この CompetitionType の唯一のラウンド定義
    ├── name: string              # ラウンド種別名（例: 'Qualification', 'Final'）
    ├── shotsPerSeries: number    # 標準発数（デフォルト10）
    └── stages: StageDefinition[]
        ├── name: string          # ステージ名（例: '試射', '本射'）
        ├── scored: boolean              # 採点対象ステージか否か
        ├── series: SeriesDefinition[]
        │   ├── maxShots: number         # 最大発数（0 = 無制限）
        │   ├── timer?: TimerDefinition  # シリーズ全体タイマー（timer と shotTimer は排他）
        │   └── shotTimer?: TimerDefinition  # ショットタイマー：1発ごとにリセット
        └── timer?: TimerDefinition      # ステージ全体タイマー
            └── durationSeconds: number
```

> 1つの CompetitionTypeDefinition には 1つの RoundConfig が紐づく。
> 例: 「BR60S Qualification」と「BR Final」は別々の CompetitionTypeDefinition として定義される。

### ISSF ラウンド種別

| RoundType     | 和名   | 説明                                                                                                                                                |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elimination   | 予選   | Qualification（本選）の出場者を絞り込むラウンド。出場者が少ない場合は省略される。Final 内の脱落進行方式を「Elimination（Stage）」と呼ぶ場合もある。 |
| Qualification | 本選   | 決勝進出者を決定するラウンド                                                                                                                        |
| Final         | 決勝   | 上位選手による最終順位決定ラウンド                                                                                                                  |
| Individual    | 個人戦 | 単独で完結するラウンド（予選・決勝の区分なし）                                                                                                      |

> ISSF ルール改定により新しい RoundType が追加される可能性がある。コード上の実装は各アプリのコードベースに委ねる。本ドキュメントは概念レベルの定義を記載する。

---

## タイマー配置と動作モード

| 配置場所                     | 動作                                           | 使用例                        |
| ---------------------------- | ---------------------------------------------- | ----------------------------- |
| `StageDefinition.timer`      | ステージ全体で1つのタイマー。シリーズ間も継続  | Qualification Match           |
| `SeriesDefinition.timer`     | シリーズ単位のタイマー。シリーズ開始でリセット | Preparation / Final 1st Stage |
| `SeriesDefinition.shotTimer` | 1発ごとにタイマーリセット                      | Final 2nd Stage               |

---

## JRSF_BR 系

### BR60S (Qualification)

| ステージ    | 種別          | シリーズ       | タイマー                    |
| ----------- | ------------- | -------------- | --------------------------- |
| Preparation | scored: false | 1 × 無制限発数 | 600秒（10分）, series timer |
| Match       | scored: true  | 6 × 10発       | 2700秒（45分）, stage timer |

- 採点方式: 小数点（0.1点刻み）
- 最大人数: 無制限
- 使用標的: JRSF_BR_10M

### JRSF_BR_FIN (Final)

> **Note**: 現時点（saika.lane）では未実装。将来実装予定。

| ステージ    | 種別          | シリーズ       | タイマー                   |
| ----------- | ------------- | -------------- | -------------------------- |
| Preparation | scored: false | 1 × 無制限発数 | 300秒（5分）, series timer |
| 1st Stage   | scored: true  | 2 × 5発        | 250秒, series timer        |
| 2nd Stage   | scored: true  | 7 × 2発        | 50秒/発, shot timer        |

- 採点方式: 小数点（0.1点刻み）
- 最大人数: 8人
- 使用標的: JRSF_BR_10M

#### 脱落ルール (2nd Stage)

| 項目     | 値                                      |
| -------- | --------------------------------------- |
| 脱落人数 | 1人 / 判定                              |
| 判定単位 | シリーズ                                |
| 境界同点 | シュートオフ                            |
| 判定条件 | max(1, 9 − 参加人数) ≤ シリーズ番号 ≤ 7 |

---

## JRSF_BP 系

### BP60 (Qualification)

| ステージ    | 種別          | シリーズ       | タイマー                    |
| ----------- | ------------- | -------------- | --------------------------- |
| Preparation | scored: false | 1 × 無制限発数 | 600秒（10分）, series timer |
| Match       | scored: true  | 6 × 10発       | 2700秒（45分）, stage timer |

- 採点方式: 整数点（小数切り捨て）
- 最大人数: 無制限
- 使用標的: JRSF_BP_10M

### JRSF_BP_FIN (Final)

> **Note**: 現時点（saika.lane）では未実装。将来実装予定。

| ステージ    | 種別          | シリーズ       | タイマー                   |
| ----------- | ------------- | -------------- | -------------------------- |
| Preparation | scored: false | 1 × 無制限発数 | 300秒（5分）, series timer |
| 1st Stage   | scored: true  | 2 × 5発        | 250秒, series timer        |
| 2nd Stage   | scored: true  | 7 × 2発        | 50秒/発, shot timer        |

- 採点方式: 小数点（0.1点刻み）
  > **Note**: BP60（予選）は整数点採点だが、JRSF_BP_FIN（決勝）は ISSF Final ルールに準拠し小数点採点を採用。意図的な設計。
- 最大人数: 8人
- 使用標的: JRSF_BP_10M

#### 脱落ルール (2nd Stage)

| 項目     | 値                                      |
| -------- | --------------------------------------- |
| 脱落人数 | 1人 / 判定                              |
| 判定単位 | シリーズ                                |
| 境界同点 | シュートオフ                            |
| 判定条件 | max(1, 9 − 参加人数) ≤ シリーズ番号 ≤ 7 |
