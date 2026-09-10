<!-- SPDX-License-Identifier: MIT -->

# 参照元

## 一次情報

外部資料は複製せず、参照先のみを示します。規則や製品情報は更新されるため、利用時に最新版を
確認してください。

外部一次情報の確認日: 2026-08-22。RedDot の PC 直結配線と OpticScore 接続の区別は、下記の取扱説明書・旧版の技術説明書で 2026-09-10 に再確認しました。

- [公益社団法人日本ライフル射撃協会 — 競技規則](https://www.riflesports.jp/support/rule/)
- [公益社団法人日本ライフル射撃協会 — 協会規程](https://www.riflesports.jp/knowledge/regulations/)
- [International Shooting Sport Federation — Rules](https://www.issf-sports.org/rules)
- [DISAG — RedDot Laserziel 取扱説明書](https://www.disag.de/wp-content/uploads/reddot_laserziel.pdf)
- [DISAG — RedDot Pistole 製品情報](https://www.disag.de/produkte/reddot-lichtschiessen/reddot-pistole/)
- [DISAG — RedDot Laserziel 技術説明書（旧版）](https://www.disag.de/download/manuals/reddot_laserziel.pdf)
- [DISAG — RedDot 用 RS-232クロスケーブル結線図](https://www.disag.de/wp-content/uploads/RS232_Male-Male_Crossover.pdf)
- [KNESTEL — KT RDT ZIE 1 EU 適合宣言](https://knestel.de/wp-content/uploads/2023/08/CE-Konformitaetserklaerung_RD_Ziel_2015.03.11.pdf)
- [DISAG — RM-III / RM-III Universal インターフェース説明書](https://www.disag.de/download/manuals/schnittstellenbeschreibung.pdf)
- [DISAG — JSON Live インターフェース仕様](https://dokumentation.disag.de/wp-content/uploads/2020/11/DISAG-JSON-Liveschnittstelle_Extended.pdf)
- [DISAG — RM IV 取扱説明書](https://www.disag.de/download/manuals/rmiv_de.pdf)
- [興東電子株式会社 — ビームライフル装置](https://kohto.co.jp/beam03.html)
- [興東電子株式会社 — ビームピストル装置](https://kohto.co.jp/beam04.html)
- [`@sasakiuri/saika-lane` の実装とテスト](../saika-lane/)
- [`@sasakiuri/saika-director` の実装とテスト](../saika-director/)

## リポジトリ内の実装根拠

- [Director MQTT 制御サービス](../saika-director/src/main/modules/mqtt/application/DirectorMqttService.ts)
- [Director MQTT IPC モジュール](../saika-director/src/main/modules/mqtt/mqtt.module.ts)
- [共通 MQTT ペイロード契約](../saika-protocol/src/index.ts)

- [ScoreSheet のデータ生成](../saika-lane/src/main/modules/report/application/handlers/GetScoreSheetHandler.ts)
- [ScoreSheet の表示](../saika-lane/src/renderer/presentation/screens/print/components/ScoreSheet.tsx)
- [MT201アダプター](../saika-lane/src/main/modules/target/adapters/MT201Adapter.ts)
- [MT201レコードパーサー](../saika-lane/src/main/modules/target/adapters/mt201/MT201DataParser.ts)
- [MT201座標変換](../saika-lane/src/main/modules/target/adapters/mt201/MT201CoordinateConverter.ts)
- [Kohto 受信フレーミング](../saika-lane/src/main/modules/target/infra/parsers/KohtoFormatParser.ts)
- [BPT-216アダプター](../saika-lane/src/main/modules/target/adapters/BPT216Adapter.ts)
- [BPT-216レコードパーサー](../saika-lane/src/main/modules/target/adapters/bpt216/BPT216DataParser.ts)
- [BPT-216受信セッション](../saika-lane/src/main/modules/connection/infra/usb/bpt216/BPT216ProtocolSession.ts)

## データの扱い

`common/TARGET_SPEC.md` にある数値は、Saika Lane が採点・描画に使用する実装データの説明です。
規則本文や図版の転載ではありません。公式性や現行規則との一致を保証しないため、競技で使用する
場合は上記一次情報と照合してください。

`lane/devices/kohto/mt201/README.md` はメーカーの公式通信仕様ではなく、公開 Saika 実装の入力契約を
独自に説明したものです。`common/PRINT_SPEC.md` は両アプリの出力内容と制約を説明します。Director の決勝帳票には固定の発数列があり、すべての決勝種別に共通する様式ではありません。

`lane/devices/kohto/bpt216/README.md` は、Saika の実装・テストにおける `BP-217 I/F` 形式と
RS-232C 形式の受理条件を説明したものです。掲載する入力例には合成データを使用しています。

`lane/devices/disag/reddot/README.md` はメーカーの公式通信仕様ではありません。
Saika が実装する受理形式、初期化・復旧、座標変換、検証状態を説明したものです。実射パケットや機器固有情報は収録せず、掲載フレームは文書用の合成 fixture です。
