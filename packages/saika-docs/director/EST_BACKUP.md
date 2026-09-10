---
description: 成績照合用の JSON・CSV・TSV について、入力例、照合キー、得点単位、比較結果とエラー対応を説明します。
---

<!-- SPDX-License-Identifier: MIT -->

# 独立バックアップの取込形式

[Director 成績・データ保管ガイド](./RESULTS.md#独立バックアップを保存印刷照合する)

「EST backup」で成績と照合する射撃記録の入力形式を説明します。取込・原資料の印刷・照合の操作は [成績・データ保管ガイド](./RESULTS.md#独立バックアップを保存印刷照合する) を参照してください。

更新されるファイルの [自動取得](./RESULTS.md#更新される原資料を自動取得する) でも同じ入力形式を使用します。

## 取込前に確認すること

- ファイルは UTF-8で保存する。上限は2MiB、レコード数は1〜1,000件。
- `key` は選手または団体を照合する文字列。同じファイル内では重複させず、1〜200文字にする。
- 得点は点単位で入力する。10.1点は `10.1` であり、MQTT の10倍表現とは異なる。
- 順位や明細がない場合は省略する。未取得の値を `0` で補わない。

「Result kind」で個人・団体・混合団体を選び、「Comparison key」を次の対応に合わせます。

| Comparison key | `key` に使う値                                          | 対象           |
| -------------- | ------------------------------------------------------- | -------------- |
| Start number   | 「Participants」の「Start #」に登録した公式スタート番号 | 個人           |
| ISSF ID        | 参加者に登録した ISSF ID                                | 個人           |
| Participant ID | Director が参加者に付けた ID                            | 個人           |
| Team ID        | 参加者に登録した団体 ID                                 | 団体・混合団体 |

射座番号、選手名、Lane 制御用の番号は照合キーに使いません。`"001"` と `"1"` は別の値です。表計算ソフトで番号の先頭の `0` が消えていないか確認してください。

## 標準 JSON・CSV

「File layout」で「Canonical JSON / CSV」を選び、「Import JSON / CSV」で読み込みます。

| フィールド     | 必須 | 形式                                            |
| -------------- | ---- | ----------------------------------------------- |
| `key`          | 必須 | 文字列。選択した照合キーに一致する値            |
| `totalScore`   | 必須 | 合計得点の数値                                  |
| `rank`         | 任意 | 1以上の整数。未指定なら順位を比較しない         |
| `shotScores`   | 任意 | 射順に並べた得点の数値配列。最大1,000要素       |
| `seriesScores` | 任意 | シリーズ順に並べた合計の数値配列。最大1,000要素 |

次の例は形式確認用の合成データで、1人・2発分です。実際の照合では対象者の記録を揃えます。

```json
[
  {
    "key": "001",
    "rank": 1,
    "totalScore": 20.1,
    "shotScores": [10.1, 10.0],
    "seriesScores": [20.1]
  }
]
```

JSON ファイルは上記の配列、またはその配列を `records` に持つオブジェクトを受け付けます。画面の「Backup records JSON」に手入力する場合は配列を使ってください。得点に `"20.1"` のような文字列は使用できません。

CSV は見出し行を付け、カンマで区切ります。同じ内容は次のように記述します。配列の列は引用符で囲んだ JSON 配列です。順位が不明なら `rank` のセルを空欄にするか、列を省略します。

```csv
key,rank,totalScore,shotScores,seriesScores
001,1,20.1,"[10.1,10.0]","[20.1]"
```

## 列名を指定する CSV・TSV

独自の列名や区切り文字を使う `.csv`、`.tsv`、`.txt` は、「Column-mapped delimited text」を選びます。見出しの大文字・小文字を含めて列名を一致させ、同じ列を複数の項目に指定しないでください。

例えば、小数点にカンマを使う次のファイルを読み込めます。

```csv
Bib;Place;Total;Shot1;Shot2;Series1
001;1;20,1;10,1;10,0;20,1
```

| 画面の設定                           | この例の値                             |
| ------------------------------------ | -------------------------------------- |
| Key column / Total score column      | `Bib` / `Total`                        |
| Rank column (optional)               | `Place`                                |
| Column separator / Decimal separator | `Semicolon` / `Comma (630,1)`          |
| Shot score columns in firing order   | `Shot1`、`Shot2` をこの順に1行ずつ入力 |
| Series score columns in order        | `Series1`                              |

「Import delimited file」で読み込み、番号、合計、明細の順序を確認します。各行の列数は見出しと揃えます。指定した得点列には数値が必要です。明細がない資料では、その列の指定自体を省略してください。

## 明細と照合結果の読み方

「Required comparison detail」で比較する範囲を選びます。

| 選択肢                        | 比較条件                                                 |
| ----------------------------- | -------------------------------------------------------- |
| Compare all supplied details  | 資料に含まれる明細を比較する。省略した明細は必須にしない |
| Require every series          | シリーズ明細を必須にする                                 |
| Require every shot            | 射の明細を必須にする                                     |
| Require every series and shot | 両方の明細を必須にする                                   |

比較には裁定・修正を反映した成績を使います。減点がシリーズや総得点だけに適用される場合があるため、射の単純合計と一致するとは限りません。団体は結果側が提供するシリーズ合計を使い、各選手の射を一列に連結しません。

「Compare and retain」の後は「Comparison details」を開きます。`MATCH` は一致、`MISMATCH` は得点・順位・明細の不一致、`MISSING` は資料側の不足です。明細の `UNAVAILABLE` は Director 側に比較できる明細がなく、`NOT_REQUESTED` はその明細を比較対象にしていない状態です。

予選の個人は10位まで、団体・混合団体は適格な上位3組を照合します。決勝は結果確認で設定された件数が対象です。資料にだけ存在する `EXTRA` の行は保存されますが、その得点が確認できたことにはなりません。

`VERIFIED` は対象成績が一致し、必要な手動修正の確認文も記録された状態です。全参加者の全記録を保証する表示ではありません。`REVIEW REQUIRED` の場合は、照合キー、明細、修正の確認文を見直します。

取込後に「Backup records JSON」を編集すると、保存原資料との関連付けが外れます。原資料に基づいて照合し直す場合は「Retained source files」の「Use source records」で読み直してください。成績を修正した場合も、現在の成績で再照合します。

## 取込できないとき

| エラー・症状                     | 対応                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| 形式・文字コード・サイズのエラー | 拡張子と「File layout」を合わせ、UTF-8と2MiB 以下を確認する |
| 列がない、または複数見つかる     | 見出し名、列の重複、区切り文字を確認する                    |
| 得点や順位が不正                 | 単位記号や桁区切りを除き、小数点設定と数値を確認する        |
| キーの重複・未登録               | 対象種目の参加者登録と照合キーを確認する                    |
| 読込中にファイルが変化した       | 書出し完了後のファイルを選んで再実行する                    |

この形式は成績照合用です。Director 全体を戻す場合は [データベースの復元](./RESULTS.md#バックアップから復元する) を使用します。

形式の根拠は [標準形式パーサー](../../saika-director/src/main/modules/est-backup-verification/domain/EstBackupRecordParser.ts)、[列指定パーサー](../../saika-director/src/main/modules/est-backup-verification/domain/ColumnMappedEstBackupRecordParser.ts)、[照合処理](../../saika-director/src/main/modules/est-backup-verification/application/EstBackupVerificationService.ts) を参照してください。
