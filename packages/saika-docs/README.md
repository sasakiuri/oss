<!-- SPDX-License-Identifier: MIT -->

# Saika Docs

Saika Director と Saika Lane の仕様、設計判断、MQTT 運用、帳票、対応機器、テストシナリオを
まとめたドキュメントパッケージです。

## ドキュメント

全体の一覧は [INDEX.md](./INDEX.md) を参照してください。

| 分類                       | 内容                                                        |
| -------------------------- | ----------------------------------------------------------- |
| [`director/`](./director/) | Saika Director の基本操作と MQTT 制御・復旧                 |
| [`lane/`](./lane/)         | Saika Lane の製品仕様、MQTT設計、対応機器、テスト、変更履歴 |
| [`common/`](./common/)     | 用語、競技種別、標的・採点データ、帳票仕様                  |

実装と文書が一致しない場合は、同じリポジトリにある
[`@sasakiuri/saika-director`](../saika-director/) と
[`@sasakiuri/saika-lane`](../saika-lane/) のソースコードとテストを優先してください。
競技会での公式判定には使用せず、必ず主催団体の現行規則を確認してください。

## バージョンとリリース

Saika Docs、Saika Director、Saika Lane は同じスイートバージョンと `v<version>` タグを
共有します。Changesets では3パッケージを固定グループとして扱い、いずれかの変更で
全パッケージのバージョンが同時に進みます。文書は個別のバイナリにはせず、共有 GitHub
Release のタグ付きソースに含めます。

## 文書の位置づけと権利関係

参照元は [SOURCES.md](./SOURCES.md)、公開方針は
[CONTENT_POLICY.md](./CONTENT_POLICY.md) を参照してください。

MT201文書はメーカー通信仕様の転載ではなく、公開済みSaika Lane実装が受理する形式の説明です。
RedDot文書も公式通信仕様ではなく、Saika が受理する入力と動作を定めた
実装契約です。実射パケットは収録せず、テスト入力には合成fixtureだけを使用します。帳票文書も
第三者のテンプレートや画面意匠を収録せず、Saika独自の機能要件として記述しています。

Saika は独立した非公式プロジェクトです。本文中に現れる団体名、製品名、商標は識別と互換性の
説明だけを目的としており、各権利者による提携、承認、保証を示すものではありません。

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。第三者が権利を持つ名称、規格、
リンク先資料には本ライセンスを適用しません。
