---
description: Saika Lane と Director の導入、MQTT 接続、更新、接続できない場合の確認手順を説明します。
---

<!-- SPDX-License-Identifier: MIT -->

# 導入と接続

[マニュアルの入口](./README.md) / 導入と接続

## 使用するアプリを選ぶ

| 使い方                       | 必要なもの                                                             |
| ---------------------------- | ---------------------------------------------------------------------- |
| 1つの射座で練習・記録する    | 標的装置と、それに接続する PC の Saika Lane                            |
| 複数の射座をまとめて進行する | 各射座の Lane に加え、運営用 PC の Saika Director と共通のネットワーク |

連携時は、MQTT ブローカーが Director と Lane の通信を中継します。Director の内蔵ブローカーを使う構成は次のとおりです。

```mermaid
flowchart TB
  subgraph control[運営用 PC]
    director[Saika Director] <--> broker[内蔵 MQTT ブローカー]
  end
  broker <-->|LAN| lane1[射座 1 の Saika Lane]
  broker <-->|LAN| lane2[射座 2 の Saika Lane]
  lane1 <-->|USB / シリアル| target1[標的装置 1]
  lane2 <-->|USB / シリアル| target2[標的装置 2]
```

図が表示されない場合：標的装置を各 Lane に接続し、各 Lane と Director を同じブローカーへ接続します。

## アプリを用意する

[GitHub Releases](https://github.com/sasakiuri/oss/releases) から、使用する版・アプリ・OS に合うファイルを選びます。ファイル名の先頭は `Saika-Lane-`、`Saika-Director-`、`Saika-Vista-` です。連携する Director と Lane は同じ版を使用してください。

| OS          | 配布形式                                                 |
| ----------- | -------------------------------------------------------- |
| Windows x64 | インストーラー（`.exe`）。Lane・Director は ZIP も配布   |
| macOS       | DMG または ZIP。Intel は `x64`、Apple Silicon は `arm64` |
| Linux x64   | AppImage または Debian パッケージ（`.deb`）              |

Windows 10 / 11の x64を主な動作対象とし、macOS・Linux は実験対象です。[対応機器と検証状態](./lane/SPEC.md#動作環境と対応機器) を確認してください。受信処理の実装と、使用する機器・OS での実機検証は別です。

macOS 版は署名用の証明書なしでも配布します。使用するリリースの署名状態を確認してください。署名のない版は DMG または ZIP から手動で更新します。

インストール後、[Lane 操作ガイド](./lane/README.md#起動と準備) に従って競技種別を選び、標的装置に接続します。練習用の記録で、着弾位置・射数・得点が表示され、印刷画面でも記録を確認できることを確かめてください。

Lane 単独なら、そのまま同ガイドの試射・本射の手順へ進みます。大会を一括進行する場合は、次の接続設定を行います。

## Director と Lane を接続する

### 1. Director で接続先を確認する

1. Director を起動し、「Settings」を開く。
2. 「Embedded」を選ぶ。既定のポートは TCP `1883` である。
3. 「Broker service」が `Running`、「Director client」が `Connected` であることを確認する。
4. 「Lane connection URLs」から、Lane と同じネットワークの URL を控える。

例えば Director の IP アドレスが `192.168.10.10` なら、Lane には `mqtt://192.168.10.10:1883` を入力します。
別の PC にある Lane で `localhost` を指定すると、その Lane 自身へ接続してしまいます。

内蔵ブローカーを別 PC の Lane から使う場合は、Director 側のファイアウォールで Lane からの TCP `1883` への受信を許可します。ポートを変更している場合は、そのポートを指定します。[Windows での設定と接続確認](#director-側のファイアウォールを確認するwindows) を参照してください。

既設のブローカーを使う場合は「External」を選び、「Broker URL」を入力して「Save and connect」を押します。
すべての Lane にもそのブローカーの URL を設定します。

### 2. 各 Lane を接続する

1. Lane の「Settings」→「MQTT」で「Enable MQTT」をオンにする。
2. 「Broker URL」に接続先を入力する。
3. 「Lane Alias」に `Lane 1`、`Lane 2` のように、射座番号を含む重複しない名前を入力する。
4. 次回起動時も接続するなら「Auto Connect」をオンにする。
5. 「Save Settings」を押し、「Connect」で接続する。`Status: connected` を確認する。
6. Director の「Competition Control」→「Lanes」に各 Lane が表示されることを確認する。

接続先を変更する場合は、先に「Disconnect」を押し、新しい URL を「Save Settings」で保存してから「Connect」で接続します。MQTT を無効にする場合も、切断してから「Enable MQTT」をオフにして保存します。設定の保存だけでは、接続先の切り替えや切断は行われません。

Lane の「General」で設定する射座番号と「Lane Alias」は別の設定です。
Director の射座割には「Lanes」一覧の射座番号を使います。実際の射座と違う場合は、開始前に「Lane Alias」の番号と他の Lane との重複を確認して保存し直します。「Refresh」で番号を再確認してから射座割を反映してください。番号の決まり方は [射座番号と選手の対応](./director/MQTT_CONTROL.md#射座番号と選手の対応) を参照してください。

### 3. 競技開始前に確認する

- Lane ごとに、標的装置への接続と MQTT への接続を確認する。MQTT の接続だけでは標的の準備完了を示さない。
- Director と Lane の PC の時計を同期する。
- Director の競技種別と Lane の対応機器を確認する。互換性のエラーが出た場合は、版と選択した機器・種別を見直す。

次は [Director 操作ガイド](./director/README.md) で大会と競技を準備します。

## 接続できないとき

| 症状                          | 確認すること                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------- |
| 内蔵ブローカーが `Stopped`    | 別のアプリが同じポートを使用していないか、Director のエラーを確認する             |
| Lane の MQTT が接続できない   | URL、同じネットワークへの接続、ブローカー側のファイアウォールと認証設定を確認する |
| MQTT は接続済みだが着弾しない | Lane の「Connection」で標的装置の電源・ケーブル・ポート・機種を確認する           |
| Director に Lane が現れない   | 両アプリの接続先を確認し、「Competition Control」の「Refresh」を押す              |

内蔵ブローカーの認証は既定で無効です。平文の `mqtt://` 接続は信頼できる隔離ネットワークで使用してください。
認証や暗号化を必要とする構成は、管理担当者向けの [MQTT 接続構成](./director/MQTT_CONTROL.md#接続構成) を参照してください。

### Director 側のファイアウォールを確認する（Windows）

Director 自身が内蔵ブローカーに接続できても、ファイアウォールが別 PC の Lane からの接続を遮断している場合があります。

内蔵ブローカーを使う場合は、Director を起動したまま、Lane 側の PowerShell で次を実行します。IP アドレスとポートは Director の「Lane connection URLs」に合わせて置き換えてください。

```powershell
Test-NetConnection -ComputerName 192.168.10.10 -Port 1883
```

- `TcpTestSucceeded: True`：TCP 接続は成功している。Lane の Broker URL、認証設定、MQTT のエラー表示を確認する。
- `TcpTestSucceeded: False`：TCP 接続ができていない。Director のブローカーの稼働状態、ファイアウォール、PC 間のネットワーク接続を確認する。

ファイアウォールで遮断されている場合は、管理者権限で Director 側の PC に受信規則を設定します。

1. スタートメニューで `wf.msc` を検索して開く。
2. 「受信の規則」→「新しい規則」で「ポート」を選ぶ。
3. 「TCP」を選び、「特定のローカルポート」に `1883` を入力して「接続を許可する」を選ぶ。ポートを変更している場合は、その値を使う。
4. Director が使用中のネットワークのプロファイルにチェックを入れ、`Saika Director MQTT` などの名前で保存する。例えば、接続先が「プライベート」なら規則も「プライベート」に適用する。
5. 作成した規則の「プロパティ」→「スコープ」で、リモート IP アドレスを接続する各 Lane の IP アドレスに限定する。
6. Lane 側で接続確認コマンドを再実行し、成功したら Lane の「Connect」で接続する。

Windows の操作の詳細は [Microsoft のファイアウォール設定手順](https://learn.microsoft.com/ja-jp/windows/security/operating-system-security/network-security/windows-firewall/configure) と [Test-NetConnection の説明](https://learn.microsoft.com/en-us/powershell/module/nettcpip/test-netconnection) を参照してください。

## 更新するとき

競技が終了してから、次の順で更新します。

1. [Lane のデータ保存](./lane/README.md#設定と記録を保存する) と [Director のバックアップ](./director/RESULTS.md#director-のバックアップと復元) を行う。
2. 使用する版の変更内容を確認し、Director と各 Lane の更新版を用意する。
3. アプリの更新画面、または配布ファイルから更新する。
4. 両アプリの版、射座番号、競技種別、標的装置、MQTT 接続を確認する。

Lane は「Settings」→「General」の「Application Update」を開きます。「Check for Updates」を押し、ダウンロード後に「Restart & Install」で適用します。

Director は「Settings」→「Updates」の「Application updates」を開きます。「Check for updates」を押し、ダウンロード後に「Restart and install」で適用します。操作権限を有効にしている場合は管理者としてサインインしてください。Director は通常の終了時には更新を適用しません。

macOS の自動更新には、更新前後のアプリが同じ署名者によって署名されている必要があります。署名のない版や自動更新を利用できない配布形式では、同じ版の配布ファイルを使って手動で更新します。詳しくは [Electron の macOS 更新要件](https://www.electronjs.org/docs/latest/api/auto-updater#macos) を参照してください。

## 問い合わせに必要な情報

問題が解消しない場合は、次の情報を控えて [サポート窓口](../../SUPPORT.md) へ報告してください。

- Lane・Director の版、OS、標的装置の機種、内蔵・外部ブローカーのどちらを使っているか。
- 発生時刻、操作手順、期待した動作、実際の表示、エラーメッセージ。
- 対象の射座番号、競技種別、標的装置の接続状態。Director 連携時は MQTT の状態と直前の応答（ACK）も添える。

公開する情報からは、選手の個人情報や接続用の認証情報を除きます。大会中の申告は [Lane の連絡操作](./lane/README.md#director-と連携して使う) を使い、射場役員にも伝えてください。
