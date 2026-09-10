---
description: 操作ガイド、機器の受信互換仕様、競技・帳票の資料、文書の保守に関する参照先を案内します。
---

<!-- SPDX-License-Identifier: MIT -->

# 文書一覧

[マニュアルの入口](./README.md) / 文書一覧

## 操作マニュアル

- [導入と接続](./GETTING_STARTED.md)：アプリの選択、接続、更新、問い合わせ
- [Lane 操作ガイド](./lane/README.md)：標的接続、試射・本射、表示、印刷、計時設定、データ保存と復元
- [Director 操作ガイド](./director/README.md)：大会登録、射座割、競技の開始から終了
- [Director 運用ガイド](./director/OPERATIONS.md)：担当者と権限、射座の抽選、スタートリスト、開始条件と標的検査、25m・決勝、銃器故障、中断対応、標的調査
- [Director 成績・データ保管ガイド](./director/RESULTS.md)：成績確認・印刷・修正・公表、事故報告、用具検査と失格判定、抗議台帳、原資料の自動取得、バックアップと復元
- [用語集](./common/GLOSSARY.md)

## 外部仕様・連携仕様

操作マニュアルと併せて、入力、状態、出力、対応範囲を確認する資料です。

| 分類               | 資料                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 通信と復旧         | [MQTT 連携仕様](./lane/MQTT_DESIGN.md)、[Director MQTT 制御・運用](./director/MQTT_CONTROL.md)                                                         |
| Lane の仕様・検証  | [製品仕様](./lane/SPEC.md)、[操作確認シナリオ](./lane/TESTS.md)                                                                                        |
| 機器の受信互換仕様 | [MT201](./lane/devices/kohto/mt201/README.md)、[BPT-216](./lane/devices/kohto/bpt216/README.md)、[DISAG RedDot](./lane/devices/disag/reddot/README.md) |
| 競技と帳票         | [競技種別定義](./common/COMPETITION_TYPES.md)、[標的・採点データ](./common/TARGET_SPEC.md)、[帳票仕様](./common/PRINT_SPEC.md)                         |
| 成績照合の入力     | [独立バックアップの取込形式](./director/EST_BACKUP.md)：JSON・CSV・TSV、照合キー、得点単位、エラー対応                                                 |

## 権利・出典

- [第三者表示と免責](./NOTICE.md)
- [参照元](./SOURCES.md)
- [公開コンテンツ方針](./CONTENT_POLICY.md)

## 開発・文書の保守

文書の編集、サイトの起動・検証・配布は [サイト開発ガイド](../../docs/reference-nextjs.md) を参照してください。追加する内容と記述の原則は [公開コンテンツ方針](./CONTENT_POLICY.md#マニュアルと外部仕様の書き方) にまとめています。

開発時の内部構造は [アーキテクチャ](../../ARCHITECTURE.md)、過去の変更経緯は [Lane 実装変更履歴](./lane/HISTORY.md) を参照してください。
