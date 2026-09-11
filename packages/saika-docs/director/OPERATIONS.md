---
description: Director の担当者登録、射座の抽選、スタートリスト配布、開始条件、25m・決勝の進行、銃器故障の記録、中断からの復旧、標的調査を説明します。
---

<!-- SPDX-License-Identifier: MIT -->

# Director 運用ガイド

[マニュアルの入口](../README.md) / Director 運用ガイド

基本操作は [Director 操作ガイド](./README.md)、接続や操作失敗への対応は [MQTT 制御・運用](./MQTT_CONTROL.md) を参照してください。
成績の確認・公表と資料の保存は [成績・データ保管ガイド](./RESULTS.md) にまとめています。

| 作業                   | 参照先                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| 射座を抽選する         | [コンピューター抽選](#コンピューター抽選で射座を割り当てる)          |
| 射座割を配布する       | [スタートリストの作成と配布](#スタートリストを作成して配布する)      |
| 担当者と権限を設定する | [担当者の登録とサインイン](#担当者の登録とサインイン)                |
| 開始条件を確認する     | [開始前の運用設定](#開始前の運用設定)                                |
| 25m や決勝を進める     | [25m の標的時間制御](#25m-の標的時間制御)、[決勝の進行](#決勝の進行) |
| 銃器故障の申告を扱う   | [予選の銃器故障を記録する](#予選の銃器故障を記録する)                |
| 中断から復旧する       | [中断と安全 STOP](#中断と安全-stop)                                  |
| 標的の申告を調査する   | [調査資料を残す](#調査資料を残す)                                    |

## コンピューター抽選で射座を割り当てる

参加者を保存してから、種目の「Firing-Point Assignment」→「ISSF computer draw」を開きます。抽選対象者の「NOC」は必須です。混合団体では、同じ「Team ID」と国コードを持つ `M`・`F` 各1人の組を登録します。手動で配置する場合は [射座割の登録](./README.md#射座割を保存する) を使います。

1. グリッドの「Relays」と「Firing points」で射群数と射座数を設定する。抽選欄の「First firing point」で先頭の射座番号を指定する。
2. 「Seed」で抽選用の値を確認する。「New」で新しい値を作成できる。「MQS/RPO/OOC section」で特別区分の配置方法を選び、「Official / operator」に担当者を入力する。
3. 「Draw … relay(s) × … points」を押し、配置人数と検査結果を確認する。抽選対象からは `DNS`、`DNF`、`DSQ`、`DQB` を除外する。
4. Technical Delegate が条件を確認したら、担当者と「Audit statement」を入力し、「TD approve」で承認を記録する。
5. 「Apply approved draw」を押す。現在の射座割をすべて置き換えることを確認して適用し、「applied by …」を確認する。
6. 別のタブへ移って「Firing-Point Assignment」を開き直し、保存された選手・射群・射座を確認する。未保存のグリッド編集が残っていた場合は、その表示の「Save」で抽選結果を上書きしない。

抽選できない場合は、表示された原因に従って国コード、団体構成、射群数・射座数を見直します。「STALE」は抽選後に参加者の構成情報が変わった状態です。現在の登録情報で抽選し直してください。未適用の抽選は、担当者と理由を入力して「Void」で無効にできます。

抽選の適用後は、[スタートリストの作成・配布](#スタートリストを作成して配布する) と [Lane への選手設定](./README.md#2-lane-を競技に参加させる) へ進みます。抽選の承認・適用だけでは、この2つの操作は完了しません。

## スタートリストを作成して配布する

参加者と射座割を保存してから、種目の「Firing-Point Assignment」→「Versioned Start Lists」を開きます。

1. 「List kind」、「Discipline」、「Distribution」で一覧の区分、種目群、配布方式を選ぶ。開始予定時刻、公開期限、作成担当者を入力する。
2. 「Create snapshot version」を押し、選手名・番号・射群・射座と検査結果を確認する。
3. 「Acting role」、「Official name」、「Audit statement」を入力し、「Approve content」で内容の承認を記録する。電子配布では、追加で「TD approve paperless」による承認が必要である。
4. 「Download CSV snapshot」で保存した一覧を確認し、選択した方法で実際に配布する。
5. 配布経路を選び、「Record publication & distribution」で記録する。決勝では「Final release basis」も確認する。

版の作成・承認・CSV 保存だけでは配布済みになりません。配布操作の記録も、メールの送信や掲示を自動で行う機能ではありません。

参加者や射座割の変更で「SOURCE CHANGED」と表示された場合は、新しい版を作成して承認・配布します。再配布の記録は「Record redistribution」、配布済みの版の撤回は「Withdraw distribution」を使います。

## 担当者の登録とサインイン

画面右上の「Operator: …」から「Operator access」を開きます。初期状態の「Manual operation」ではサインインを必須にしません。担当者ごとの権限で操作を管理する場合は、競技開始前に設定します。MQTT ブローカーの認証とは別の設定です。

1. 初回は「Create the first administrator」で「Account name」と10文字以上のパスワードを入力し、「Save operator account」を押す。作成した管理者として「Signed in」が表示される。
2. 「Manage operators」の「Account to edit」で「New operator」を選ぶ。担当者の名前・パスワード・操作権限を入力し、「Save operator account」で保存する。
3. 「Require operator sign-in」を押し、「Operator sign-in is required for changes.」を確認する。
4. 担当交替時は「Sign out」し、次の担当者が「Operator name」と「Operator password」で「Sign in」する。画面上の担当者名を確認してから操作する。

- 「Administration」：大会登録、通信設定、バックアップ・復元、アカウント管理。ほかの操作権限も兼ねる。
- 「Competition operation」：Lane の参加、競技進行、中断・再開。
- 「Results and adjudication」：成績の確定・修正・公表、裁定、成績冊子。
- 「Equipment records」：標的検査、機器台帳、競技後の用具検査。

操作権限と役員の役割は別です。RTS 承認を本人のサインインで記録する担当者には、操作権限に加えて「RTS Jury (result approval)」を設定します。ほかの役割も実際の任命に合わせます。成績冊子の署名者は、別途 [大会の役員登録](./RESULTS.md#成績冊子と証拠資料を保存する) と関連付けます。

閲覧だけではサインインの有効時間は延長されず、変更操作がないまま30分経過するとサインアウトします。「Signed out · changes restricted」や権限不足のエラーが出たら、必要な権限の担当者で入り直します。閲覧と緊急の安全 STOP はサインアウト中も利用できます。

既存アカウントの変更も「Account to edit」から行います。保存すると対象者のサインインは解除されます。パスワードを変えない場合は置換用の欄を空欄にし、最後の有効な管理者は残してください。

## 開始前の運用設定

「Competition Control」 で開始前の競技を選び、「Operational profile」 を開きます。

1. 設定候補を追加するか、項目ごとに「Required」（必須）、「Advisory」（警告）、「Disabled」（無効）を選ぶ。
2. 「Scope」を確認する。「This competition」は選択中の競技、「All competitions」は Director 全体に適用される。
3. 「Current」と「Proposed」を見比べ、「Apply reviewed settings」を押す。
4. 「Settings confirmed.」を確認する。一部が失敗した場合は、各項目の現在値とエラーを確認して再適用する。

認証など二値の設定には警告モードがありません。認証設定の変更には [管理者としてのサインイン](#担当者の登録とサインイン) が必要です。競技を切り替えると、未適用の編集は破棄されます。

成績公表の追加確認は、[種目・ラウンドごとの設定](./RESULTS.md#種目ごとの公表条件を設定する) で固定できます。固定した項目には全体設定の変更が反映されないため、対象種目でも確認してください。

設定の適用とは別に、Lane の設定と実機の準備を確認してください。独立した記憶元の印刷物で成績を照合する運用では、EST の自動取得を必須にする必要はありません。Director 自体のデータ保管は [バックアップと復元](./RESULTS.md#director-のバックアップと復元) で行います。

「Saved templates」 では選択した項目のモードを再利用できます。

| 目的     | 操作                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 保存する | 「Template name」 を入力し、「Save as new template」                                      |
| 読み込む | 保存済みテンプレートを選び、「Add template to proposed settings」。内容を確認して別途適用 |
| 更新する | 「Replace template with proposed settings」                                               |
| 削除する | 「Remove template」。適用済みの設定には影響しない                                         |

テンプレートは同じ Director の別競技や再起動後も使えます。射群番号、機器設定、検査結果、認証情報は含みません。
他の画面で更新された場合は 「Reload templates」 で読み直してから操作します。

測定証拠を必須にする場合は、Lane で [測定プロファイルの作成と適用](../lane/SPEC.md#測定プロファイルを作成して適用する) を行います。現在の機器構成と測定サンプルを記録し、有効期限のあるプロファイルを適用してください。最新の Lane 報告、測定根拠、期限、機器構成、適用中の時間幅が一致するまで、時刻付きの開始操作が止まります。数値だけの手入力は測定証拠になりません。時計同期、測定証拠、実機の標的信号はそれぞれ別の確認項目です。

### 開始条件の確認と再検査

「Run control」の「Pre-start checks」で、対象 Lane と試射・本射の区分を確認します。「Required」は開始を止める未完了条件、「Advisory」は警告です。

| 表示された問題           | 確認・修正する場所                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| 射群の準備・選手確認     | [射群の準備確認](#射群の準備確認を記録する) で対象の射群、段階、Lane ごとの記録を見直す           |
| EST の検査               | [標的の検査記録と Lane の対応付け](#標的の検査を記録する) を確認する                              |
| 時計差・測定値の期限     | 各 PC の時計を同期し直し、「Lanes」の「Clock」列で「Probe」または既存の測定結果を押して再検査する |
| 着弾時刻の測定証拠       | Lane の測定プロファイル、期限、現在の設備構成を確認する                                           |
| 標的の時間制御・物理信号 | 「ISSF 25m timed targets」で対象機器と信号の準備を確認する                                        |

修正後に「Refresh checks」を押します。「No outstanding configured checks.」は設定済みの検査に未完了項目がない状態です。射撃開始時にも現在の条件を再検査します。25m の標的時間制御は、プログラム開始時の検査も必要です。

独立バックアップの自動取得を開始条件にしている場合は、[自動取得の検査](#独立バックアップの自動取得を開始条件にする) も確認します。時計の検査は PC の時刻を修正する機能ではありません。許容値と有効期間は [時刻とタイマー](../lane/MQTT_DESIGN.md#時刻とタイマー) を参照してください。

### 射群の準備確認を記録する

「Competition Control」で競技を選び、「Relay readiness」を開きます。大会連携時は先に「Apply assignments」を済ませ、表示された射群番号と Lane を確認します。

1. 「Check target mode」で、これから始める「Sighting」または「Match」を選ぶ。
2. 「Relay start checks」のモードを選び、「Apply start checks to relay …」を押す。「START uses relay …」の射群とモードが意図した設定か確認する。初期値は射群1・「Advisory」である。
3. 「Official name」と「Audit statement」に担当者と実際の確認内容を入力する。各項目を現場で確認してから「Confirm」で記録する。
4. 「ready」を確認し、「Pre-start checks」の「Refresh checks」で開始条件を再検査する。

標的モードは試射・本射ごとに確認します。試射の確認だけでは本射の確認は完了しません。誤った確認や準備状態の変化は対象項目の「Revoke」で撤回し、準備を整えてから再確認します。「Confirm」が使えなければ担当者と確認内容の入力を確認してください。

標的モードの切替や試射・本射の開始には、それぞれの操作が必要です。「Required」では未完了の必須項目がある間、開始を止めます。

### 独立バックアップの自動取得を開始条件にする

先に大会の種目で [原資料の自動取得](./RESULTS.md#更新される原資料を自動取得する) を開始し、保存を確認します。「Competition Control」で競技を選び、「Backup capture start checks」を開きます。

1. 「Backup check mode」で「Required」または「Advisory」を選ぶ。初期状態は「Disabled」である。
2. 「Independent backup source」で自動取得を設定した種目を選ぶ。確認済み資料の読取時刻からの許容秒数を1〜3600秒で入力する。既定は15秒で、取得の確認間隔も考慮する。
3. 「Save backup checks」を押し、「Backup capture settings saved.」と「Saved policy」のモード、`Capture: HEALTHY` を確認する。

未保存・停止中なら自動取得を開始または再開し、読取エラーや期限切れならファイルと確認間隔を見直します。この検査は保存済み資料を最近読み取れたかの確認です。全射の記録や得点の一致は検査しません。「Required」では条件を満たすまで開始できず、「Advisory」では警告を表示します。

### 標的の検査を記録する

開始条件に EST の検査を使う場合は、大会側に検査記録を保存し、競技側で Lane と標的を対応付けます。

1. 大会の「Championship EST inspection」で標的の識別名を改行またはカンマ区切りで入力する。作成者と検査方法を入力し、「Create plan」を押す。
2. 実機を検査し、検査担当者、監督する Technical Delegate、確認内容を入力する。標的ごとに「Pass」または「Fail」で結果を記録する。
3. 「Competition Control」で対象競技を選び、「EST inspection start checks」の「Inspection championship」で大会を選ぶ。各 Lane の「Targets」に使用する標的を指定し、「Save inspection start policy」で保存する。
4. 検査計画と対応付けを確認し、「Pre-start checks」の「Refresh checks」で開始条件を再検査する。

検査計画を変更した場合は「Create revised plan」で新しい版を作り、検査状態を確認します。競技側に反映されなければ「Refresh inspection」を押してください。検査の記録操作は、標的の試験や調整を自動実行しません。

## 25m の標的時間制御

25m 予選では、通常の試射終了後に「Enter timed-target match」で本射へ進みます。「ISSF 25m timed targets」で次の順に確認します。

1. 対象 Lane のステージとシリーズを揃え、「Target device」と「Physical signals」を確認する。
2. 試射シリーズが設定されている場合は「Run configured sighting series」を実行し、完了を確認する。
3. 標的の準備を確認し、「LOAD / run match series」を押す。
4. 各 Lane の ACK、プログラム、信号、完了状態、射数を確認する。
5. UNLOAD の記録が必要なシリーズでは、担当者と実際の号令時刻を入力し、「Record UNLOAD」を押す。
6. 必要な待機時間の経過後、次のシリーズへ進む。開始できない場合は Lane ごとの進行状態と未記録の UNLOAD を確認する。

画面の赤・緑はソフトウェアの状態表示です。現行構成には物理ランプ・標的回転装置への出力と自動音声の UNLOAD は含まれません。外部の標的信号装置を操作し、実際の動作を確認してください。シリーズを取り消す「Cancel」と射場の安全 STOP は別操作です。中断後の再射・補射は [25m 予選の復旧](#25m-予選の復旧) で扱います。

## 決勝の進行

大会の「Add event」で決勝用の種目を追加し、「Type」に `AR60_FINAL` などの決勝種別を選びます。その種目に決勝進出者と射座割を登録します。登録操作は [大会と射座割の準備](./README.md#1-大会と射座割を登録する) を参照してください。

「Competition Control」でも同じ決勝種別で競技を作成し、「Apply assignments」で決勝用の種目・射群を反映します。予選の種目を選んだままでは種別不一致となり、反映できません。各 Lane の選手と射座を確認してから進めます。

1. 「Final command runner」に公表済みの開始時刻と担当者を入力し、「Create command run」を押す。
2. 現在の指示、対象 Lane、必要な確認を読み、「Confirm and execute」を押す。実行結果と Lane の状態を確認する。
3. 順位判定の段階では「Final placement checkpoints」を確認する。混合団体は「Mixed Team Final checkpoints」を使う。
4. 同点処理が必要なら対象を確認し、「Start shoot-off branch」で進める。結果を確認して順位判定へ戻る。
5. 脱落対象と順位を確認し、「Record and retire rank …」を実行する。対象 Lane の完了応答を確認して次へ進む。

実行が未完了なら表示された原因を解消し、「Retry execution」または順位判定側の再試行を使います。指示の確認、Lane への操作、順位の記録は別々に残ります。進行の中止操作だけでは STOP を送りません。射撃停止が必要な場合は [安全停止の手順](#緊急の安全停止) を使います。終了後の成績確認と最終宣言は [結果の確認と公表](./RESULTS.md#結果を確認して公表する) を参照してください。

## 予選の銃器故障を記録する

「Competition Control」で大会・種目・射群を関連付けた予選を選び、「Qualification malfunction cases」を開きます。銃器故障の扱いを定義した競技で表示されます。先に「Apply assignments」で登録選手を Lane に割り当ててください。

現行画面には、終了処理が完了した競技の案件を開き直す一覧がありません。必要な記録と計算書の保存は「Finish competition」の前に行います。

1. Lane から申告を受けた場合は「Lane declarations」の「Use Lane declaration」を押す。直接受けた申告は「Athlete / firing point」で対象を選ぶ。
2. 射座、ステージ、シリーズ、記録済み射数を確認する。手入力の「Stage index」と「Series index」は0始まりである。「Record mode」で申告の「Claim」または記録のみの「Documentation only」を選び、観察した事実と担当者を入力して「Open malfunction case」を押す。
3. 対象案件の「Append an official entry」で「Entry type」を選び、役割、担当者、確認内容を入力して「Append entry」で追記する。検査は「Inspection recorded」、権限者の判定は「Classified」を使い、判定と原因を選ぶ。
4. 修理が必要なら「Repair started」と「Repair completed」で開始・終了を記録する。「Remedy authorized」で表示された措置と射数を確認して許可を記録する。実際の措置を終えた後、「Execution recorded」で実施資料の参照を残す。
5. RTS 担当者または Jury が採点を確認した後、「Score settled」で資料の参照を記録する。[計算書](#銃器故障の計算書を保存する) が必要なら、この記録の前に作成する。最後に「Completed」を追記し、履歴と状態を確認する。

台帳に記録しても Lane に射撃指示を送りません。射撃や停止は権限者の指示と対応する操作が必要です。[中断の復旧](#25m-予選の復旧) を、銃器故障の再射・補射や最低点比較の代わりに使わないでください。

記録を追記できない場合は、直前までの状態、担当者の役割、必須の資料参照を確認します。未完了の案件は予選成績の公式公表を止めます。「Completed」は台帳の処理完了であり、得点の変更や公式公表は行いません。

### 銃器故障の計算書を保存する

5発の本射を対象とする「Claim」では、実施記録後に「Malfunction score calculation」を使えます。

1. 「Original」と、表示される場合は「Recovery」に、確認した原射・復旧射の記録 ID、0〜10の整数点、結果区分、資料参照を入力する。標的別に比較する場合は、記録に基づく標的番号も指定する。
2. 担当者、役割、資料の確認内容を入力し、「Preview calculation」で採用する各射と合計を確認する。
3. 「Confirm and save calculation」で版を保存する。「Export printable calculation」で印刷用 HTML を保存し、資料と計算結果を確認する。

使わない入力枠は空欄にし、ミス、時間外、復旧時の未発射を区別します。計算書の保存・出力だけでは得点や台帳の採点確認状態は変わりません。採点への反映を確認してから、前節の「Score settled」へ進みます。

## 中断と安全 STOP

### 緊急の安全停止

「Competition Control」 の 「Range safety STOP」 は、発見済みの全 Lane が対象です。

1. 「Responsible official」と「STOP reason」を入力し、「EMERGENCY STOP」を押す。
2. Lane ごとの応答と `STOPPED` 表示を確認する。Lane はタイマーを停止し、射撃開始操作を禁止して「STOP / UNLOAD」を表示する。以後の射撃データは通常の採点から隔離される。
3. 解除時は「Explicit safety clearance」で射座ごとに銃の状態、選手の確認、前方の安全を実際に確認する。選手確認が対象外の場合は理由を記録する。
4. 解除する Lane を選び、「Clearance statement」を入力して「Clear … verified Lane(s)」を押す。解除できた Lane を確認する。

解除してもタイマーは再開せず、射撃許可にもなりません。権限者の確認後、必要な開始・再開操作を別途行います。

### 中断の記録と再開

試射・本射中の Lane を操作する場合は、「Competition Control」 内の 「Range Interruptions」 を使います。
大会の種目画面にある中断台帳では、記録の確認・追記を行えます。

1. 「Open record」で対象 Lane または射場全体、原因、開始時刻、残り時間、担当者を記録する。
2. 「Apply Lane STOP」または「Apply range STOP」を実行し、各 Lane の応答と停止時の残り時間を確認する。この記録から再開するには、中断の終了を記録する前にこの操作が必要である。
3. 中断が終わったら「End interruption」で実際の終了時刻を記録する。
4. 表示された推奨内容と [事故報告](./RESULTS.md#事故報告を記録する) を権限者が確認し、「Record official grant」で許可内容を記録する。
5. 「Apply Lane resume」または「Apply range resume」を実行する。追加試射後に本射へ戻す場合は「Resume MATCH fire」も実行する。
6. 応答と Lane の状態を確認し、復旧完了後に「Record action」から「Close record and release hold」を記録する。

台帳の作成だけでは Lane は停止しません。推奨内容は自動的に許可されず、許可の記録だけでも Lane は再開しません。
台帳への記録だけを行う場合は、再開操作を行いません。安全 STOP の記録だけでは、この中断記録から再開できません。
射場全体への操作で一部が失敗した場合、再試行は未完了の Lane が対象になります。

### 25m 予選の復旧

中断記録の 「25m series snapshot」 でステージ、シリーズ、記録済み射数を確認し、「Record official recovery decision」 で権限者の判断を記録します。
その後は許可された内容に応じて操作します。

| 許可内容               | 操作と確認                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 追加試射               | 「Start extra sighting」 で対象 Lane のみ実行                                                                                    |
| シリーズの再射・補射   | 「Start series recovery」 で実行。完了後、「Review and apply score」 で射撃データを確認し、「Apply recovery score」 で採点へ反映 |
| 記録済みシリーズの維持 | 「Review and retain recorded series」 から適用。射撃・再採点は行わない                                                           |

復旧判断の記録、射撃の実行、採点への反映は別操作です。許可された未発射分は採点適用時にミスになるため、Lane の完了状態と射撃データを必ず確認します。
必要な採点反映またはシリーズ維持の適用が成功するまで、中断記録は閉じられません。

### 調査資料を残す

標的の故障や得点への申告は「Target Examination」で扱います。競技中は「Competition Control」で対象競技を選んで操作します。過去の案件はサイドバーの「Examinations」から確認できます。

- Lane から届いた申告：「Lane EST complaint inbox」で射座、選手、発生時刻、内容を確認する。担当者を入力して「Open examination」を押すと、申告内容を保存した案件ができる。
- 直接受けた申告：「Target Examination」→「Open case」から登録する。対象 Lane、発生時刻、問題の種類、観察した事実、規則の参照、担当者を入力し、「Open case and hold data」を押す。

どちらかの方法で作成した案件を選び、「Hold active」を確認します。保全中は対象の Lane の離脱、セッションリセット、競技終了後の保持データ消去を Director が拒否します。案件の作成は、Lane の停止や資料ファイルの収集を自動では行いません。中断が必要な場合は [中断の記録と再開](#中断の記録と再開) を行います。

資料は次の順で保存し、判断を記録します。

1. 「Add evidence」で資料の種類、説明、採取時刻、採取者、参照番号または保管場所を入力し、「Append evidence」で保存する。
2. ファイルも保管する場合は、追加した資料の「Stored evidence files」を開く。担当者と入手・保管の説明を入力し、「Choose and import original file」で取り込む。保存されたファイル名を確認する。
3. 「Record action」の「Action」で「Jury / RTS decision」を選ぶ。担当者、判断内容、規則の参照を入力し、「Append action」で記録する。「Audit history」に判断が追加されたことを確認する。

ファイルは1件につき `32 MiB` まで取り込めます。「Save verified copy」で整合性を検査したコピーを保存できます。資料名や保管場所を入力するだけでは、ファイル本体は取り込まれません。

案件に「Link current event」が表示されたら、大会・種目との対応を確認し、担当者を入力して「Link scope」で関連付けます。判断を記録しても得点は変わりません。修正が必要な場合は [資料に基づく得点修正](./RESULTS.md#資料に基づいて得点を修正する) へ進みます。

資料の保管と権限者の許可を確認したら、「Record action」で「Release evidence hold」を選び、担当者と解除の根拠を記録します。「Hold released」を確認し、調査を終える場合は同じ画面から「Close case」を記録します。閉じた案件を再調査するには「Reopen case and reinstate hold」を使います。

競技の終了や Lane の離脱が引き続き拒否される場合は、エラーに示された別の保全案件と未完了の中断記録を確認してください。保全解除では Lane の再開は行いません。

## 結果を確認して公表する

競技終了後は [成績・データ保管ガイド](./RESULTS.md#結果を確認して公表する) で、成績の確定、RTS 承認、公表を進めます。[得点修正](./RESULTS.md#資料に基づいて得点を修正する) も同ガイドを参照してください。

## 独立バックアップを保存・印刷・照合する

別の記憶元から得た射撃記録との照合は [独立バックアップの操作](./RESULTS.md#独立バックアップを保存印刷照合する) を参照してください。

## 成績冊子と証拠資料を保存する

配布・保管用の出力は [成績冊子と証拠資料の保存](./RESULTS.md#成績冊子と証拠資料を保存する) を参照してください。

## Director のバックアップと復元

更新前や PC の移行には、成績資料とは別にデータベース全体のバックアップを用意します。

### バックアップを作る

[バックアップの作成手順](./RESULTS.md#バックアップを作る) を参照してください。

### バックアップから復元する

[復元手順と置き換えの注意点](./RESULTS.md#バックアップから復元する) を参照してください。

## 抗議・上訴の公式 PDF を準備する

[公式 PDF の準備手順](./RESULTS.md#抗議上訴の公式-pdf-を準備する) を参照してください。
