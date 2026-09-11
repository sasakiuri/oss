<!-- SPDX-License-Identifier: MIT -->

# 参照元

## 一次情報

規則や製品情報は更新されるため、利用時に最新版を確認してください。

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

## 実装の参照先

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

## 関連仕様

- [標的・採点データ](./common/TARGET_SPEC.md): Saika の採点・描画に使う数値。
- [帳票](./common/PRINT_SPEC.md): Lane・Director の出力内容と制約。
- [MT201](./lane/devices/kohto/mt201/README.md)、[BPT-216](./lane/devices/kohto/bpt216/README.md)、[RedDot](./lane/devices/disag/reddot/README.md): Saika の受信形式、変換処理、検証状態。

機器資料は Saika の実装仕様です。メーカーの公式通信仕様や動作保証については、各メーカーへ確認してください。
