<!-- SPDX-License-Identifier: MIT -->

# 参照元

## 一次情報

外部資料は複製せず、参照先のみを示します。規則や製品情報は更新されるため、利用時に最新版を
確認してください。

外部一次情報の最終確認日: 2026-08-08

- [公益社団法人日本ライフル射撃協会 — 競技規則](https://www.riflesports.jp/support/rule/)
- [公益社団法人日本ライフル射撃協会 — 協会規程](https://www.riflesports.jp/knowledge/regulations/)
- [International Shooting Sport Federation — Rules](https://www.issf-sports.org/rules)
- [興東電子株式会社 — ビームライフル装置](https://kohto.co.jp/beam03.html)
- [`@sasakiuri/saika-lane` の実装とテスト](../saika-lane/)

## リポジトリ内の実装根拠

- [ScoreSheetのデータ生成](../saika-lane/src/main/modules/report/application/handlers/GetScoreSheetHandler.ts)
- [ScoreSheetの表示](../saika-lane/src/renderer/presentation/screens/print/components/ScoreSheet.tsx)
- [MT201アダプター](../saika-lane/src/main/modules/target/adapters/MT201Adapter.ts)
- [MT201レコードパーサー](../saika-lane/src/main/modules/target/adapters/mt201/MT201DataParser.ts)
- [MT201座標変換](../saika-lane/src/main/modules/target/adapters/mt201/MT201CoordinateConverter.ts)
- [Kohto受信フレーミング](../saika-lane/src/main/modules/target/infra/parsers/KohtoFormatParser.ts)

## データの扱い

`common/TARGET_SPEC.md` にある数値は、Saika Lane が採点・描画に使用する実装データの説明です。
規則本文や図版の転載ではありません。公式性や現行規則との一致を保証しないため、競技で使用する
場合は上記一次情報と照合してください。

`lane/devices/kohto/mt201/README.md` はメーカーの公式通信仕様ではなく、公開Saika実装の入力契約を
独自に説明したものです。`common/PRINT_SPEC.md` のDirector向け部分は設計資料であり、現行OSSに
対応実装があることを示しません。
