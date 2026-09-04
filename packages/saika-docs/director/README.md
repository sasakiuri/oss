<!-- SPDX-License-Identifier: MIT -->

# Saika Director

Saika Director は、複数の Saika Lane を MQTT 経由で発見し、同じ競技へ参加させて進行を同期する
Electron アプリケーションです。各 Lane が射撃、採点、セッション状態の権威を持ち、Director は競技全体の
状態とコマンドを管理します。

## 現在の対応範囲

- 内蔵 MQTT ブローカー（既定: TCP 1883）または外部 `mqtt://` / `mqtts://` ブローカー
- Lane の自動検出と接続状態表示
- Rule Pack 由来の ISSF 2026 10m Individual／Mixed Team、50m Rifle Qualification／Elimination／Final、
  25m Pistol Qualification と、local `BR60S`／`BP60` の作成
- Director／Lane の Rule Pack ID・schema version・SHA-256 fingerprint の一致確認
- Lane の競技参加、離脱、選手割当、セッションリセット
- 大会管理で作成した射座割の射群単位での一括反映
- 試射、本射、タイマー、シリーズ進行、競技終了の一括操作
- Lane ごとの ACK、タイムアウト、状態、割当、スコア、直近着弾の表示
- Retain メッセージによる Director / Lane 再接続時の状態復旧
- 受信 shot の追記型監査 journal と、装置点・独立計算点・採用点の分離
- Qualification 成績への減点、失格、remark、malfunction 等の追記型 decision
- ISSF 6.15.1 に対応する competition type 別の同点順位処理
- Rule Pack の残り時間ポリシーによる CRO 向け視覚告知リマインダー（設定で無効化可能）
- Rule Pack に応じた SIGHTING 前の呼出・標的表示・setup 完了確認と MATCH 前の標的 reset 完了確認
- Rule Pack に応じた START／STOP 外 shot の要確認検知、重複抑止、追記型時刻証跡
- ISSF 6.10.5〜6.10.9 の EST target examination、調査物の追記型 custody 記録、CLEAR LOG 前の evidence hold
- ISSF 6.10.9／6.11.3 の中断台帳、規則 recommendation と official grant の分離、Lane 個別 STOP／再開
- ISSF 8.8.1 の25m Qualification stage 別中断 recommendation と、Rule Pack snapshot から独立した official recovery decision
- Preliminary 掲示、10分の score protest、RTS 承認後の Official 公表を分離した追記型ワークフロー
- seed付き射座・relay draw、ISSF constraint検査、Technical Delegate承認、明示適用
- 3名 Team／Mixed Team予選集計と、Mixed Team Finalのチーム単位成績
- current Official 個人成績と3名 Team構成を不変 revision にした Team record claim候補
- Individual／Mixed Team Finalのcheckpoint順位台帳とLane別脱落ACK
- 外部音響向けmusic／Final production台帳と、Mixed Teamの30秒Time out台帳
- 25m の Lane 主体 absolute schedule、red／green 状態、EST after-time、対象 Lane 共通 LOAD command
- Rule 8.8.1 の追加試射／series recovery を isolated firing、明示的 score adjudication、無射撃 retain-series settlement に分離した実行 workflow
- Lane からの Range Officer request、relay athlete lifecycle、屋外 Elimination plan を独立 module として管理

## 基本操作

1. Director の設定画面で MQTT ブローカーを選びます。通常は内蔵ブローカーを使用します。
2. 各 Lane で同じブローカーへ接続します。Director の「進行管理」に Lane が表示されることを確認します。
3. 対象 Lane と競技種別を選択し、競技を作成して参加させます。
4. 「大会の射座割」で大会・種目・射群を選択し、「射座割を反映」を実行します。大会管理の射座番号と
   進行管理に表示された射座番号が一致する Lane に選手が割り当てられます。
   ISSF computer draw を使う場合は seed と range geometry を指定し、Technical Delegate 承認後に配置を適用します。
5. 必要に応じて Lane ごとの選手割当を手動で補正します。
6. 試射開始、試射終了、本射開始、シリーズ進行、競技終了を順に実行します。
   Rule Pack に告知時点がある競技では、CRO が発声すべき時点を Director の通知で確認します。
   事前確認が必要な競技では、所定時刻までの選手呼出と sighting target 表示、setup period、事前検査の完了を確認してから試射開始を承認します。
   標的 reset 確認が必要な競技では、全標的の準備完了を確認してから本射開始を承認します。
   START／STOP 外 shot の警告が出た場合は、時刻証跡を確認し、必要な処置を Jury decision として別途記録します。
   EST complaint／failure がある場合は `Target Examination` を開き、調査物を保全してから判断を追記します。
   選手に責任のない中断では `Range Interruptions` に開始時刻と残り時間を記録し、必要な Lane STOP、終了、official grant、再開を別々に実行します。
   25m Qualification では Lane の stage／series／shot count snapshot を確認し、Rule 8.8.1 の recommendation を参考に official recovery decision を記録します。
   追加試射または series recovery を決定した場合は、対象 Lane の isolated firing を実行し、series recovery の window 完了後に shot evidence を確認して
   別操作で採点裁定します。完了済み series を維持する場合は、射撃や再採点を行わない retain-series settlement を適用します。
7. 各操作後に全 Lane の ACK が `done` であることを確認します。`error` または `timeout` の Lane は、
   状態とネットワークを確認してから再操作します。

コマンド、Retain、再接続の詳細は [MQTT 制御・運用](./MQTT_CONTROL.md)、トピックとペイロードの
完全な設計は [Lane MQTT 連携設計](../lane/MQTT_DESIGN.md) を参照してください。

## 運用上の注意

- Director と Lane の時計を同期してください。開始時刻は絶対時刻で配信されます。
- MQTT のユーザー名・パスワードは環境変数で設定できる。内蔵 broker で認証と role/topic ACL を必須にする場合は
  `SAIKA_MQTT_BROKER_AUTH_MODE=REQUIRED` とし、`SAIKA_MQTT_DIRECTOR_USERNAME/PASSWORD`、
  `SAIKA_MQTT_LANE_USERNAME/PASSWORD` をすべて設定する。既定は旧運用との互換性のため `DISABLED`。
- Director ごとに `SAIKA_MQTT_DIRECTOR_ID` を固定し、Lane 側で `SAIKA_COMMAND_AUTHORIZATION_MODE=REQUIRED` と
  `SAIKA_TRUSTED_DIRECTOR_IDS=<同じID>` を設定すると、未登録 issuer の command を拒否する。issuer ID の検査は
  broker 認証とは独立しており、電子署名ではない。
- 内蔵 broker の Lane credential は role 共通で、topic 範囲は client ID から制限する。Lane ごとの認証主体が必要なら、
  client ごとの account／ACL を設定した外部 broker を使用する。`mqtts://` は OS が信頼する server certificate を使用するが、
  custom CA と TLS client certificate の選択は未対応。平文 MQTT は信頼できる隔離 network でのみ使用する。
- Director は進行中タイマーの絶対開始時刻と時間を Retain 状態へ保存します。競技中の再起動や再接続後も
  元の満了時刻を復元し、既に満了していれば接続済み Lane へ直ちに満了を通知します。
- 大会管理で既存参加者を一覧から外して保存すると、その参加者の射座割と確定成績も削除されます。画面に表示される
  削除確認で対象人数と影響を確認してから実行してください。
- 成績を保存済みの種目は種別を変更できません。競技終了時も、進行中の競技と保存先の種別が一致しない場合は
  Lane の終了処理を始めず、種別を修正して再実行できる状態を維持します。
- 競技終了処理を再実行しても、Lane データと一致する確定済み成績は確定状態を維持します。確定後に異なるデータで
  射群を置き換えたり、確定済み参加者を欠落させたりする再保存は拒否されます。
- Target Examination の evidence hold 中は、対象 Lane の離脱・session reset と競技終了後の retained data 消去を拒否します。
  RTS Jury の許可と保全完了を確認して hold を解除した後、同じ操作を再実行してください。
- close／void されていない Range Interruption record も同じ data guard に加わります。recommendation は自動付与されないため、
  Range Incident Report と権限者を確認してから official grant を記録してください。
- 25m Qualification の recovery decision は recommendation と別の監査記録です。記録だけでは series の採点や Lane の schedule を変更しません。
  追加試射、series recovery firing、score adjudication、`KEEP_RECORDED_SERIES` settlement は独立操作です。未発射の許可発数は adjudication 時に miss となるため、
  Lane の completed state と shot evidence を確認してください。必要な adjudication または settlement が成功するまで interruption record は close できません。
- 本ソフトウェアは非公式です。公式競技の唯一の採点・計時手段として使用しないでください。
