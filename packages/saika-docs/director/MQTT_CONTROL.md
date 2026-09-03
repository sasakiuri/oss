<!-- SPDX-License-Identifier: MIT -->

# Director MQTT 制御・運用

## 接続構成

Director は起動時に設定されたブローカーへ接続し、次の範囲を QoS 1 で購読します。

| 購読範囲                                 | 用途                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| `saika/lane/+/hardware/#`                | Lane の発見、接続状態、直近の生着弾                         |
| `saika/lane/+/command/+/acknowledgement` | 競技参加・離脱 ACK                                          |
| `saika/competition/+/#`                  | 競技状態、Lane 状態、割当、スコア、着弾、競技内コマンド ACK |

内蔵ブローカーは既定で `mqtt://localhost:1883` を使用します。LAN 上の Lane から接続する場合は、
Director の設定画面に表示されるホストの IPv4 アドレスとポートを Lane に設定します。外部ブローカーを
選択した場合は、Director とすべての Lane に同じ URL を設定します。

ブローカー設定変更、接続・切断、内蔵ブローカーの起動・停止は Director 内で受付順に直列化されます。設定値は新しい
ランタイムへの移行が成功した後だけ保存され、移行に失敗した場合は直前の設定と接続へ戻します。設定変更中に終了操作が
始まった場合も、移行の完了またはロールバックを待ってから MQTT クライアントと内蔵ブローカーを停止します。

内蔵 broker の認証を `SAIKA_MQTT_BROKER_AUTH_MODE=REQUIRED` にすると、Director／Lane account と role 別 topic ACL を有効にします。
各 command は接続用 account とは別に安定した `issuerId` を持ち、Lane は `SAIKA_COMMAND_AUTHORIZATION_MODE` と
`SAIKA_TRUSTED_DIRECTOR_IDS` で `DISABLED`／`ADVISORY`／`REQUIRED` を選択できます。設定値が不正、または required secret／trust ID が
不足する場合は、弱い mode へ暗黙に切り替えず起動時に拒否します。環境変数と device 別認証の制約は [Director README](../../saika-director/README.md#mqtt-security-configuration) を参照してください。

## 競技参加

Director は競技を作成すると、まず
`saika/competition/{competitionId}/state` を Retain 付きで発行します。参加操作では次の順序を守ります。

Rule Pack 由来の競技では、state に Rule Pack ID、schema version、canonical definition の SHA-256 fingerprint を含めます。
Lane の hardware capability に同一 fingerprint があることを Director が送信前に検査し、Lane も retained state から独立に再検査します。
`REQUIRED` の不一致では join を拒否し、local／legacy definition は policy に応じて advisory または disabled で運用できます。

1. 対象 Lane を含む暫定競技状態を発行する。
2. 各 Lane の `saika/lane/{laneId}/command/join-competition` へ個別コマンドを送る。
3. Lane が Retain 競技状態を検証し、ローカル競技を同じ `competitionId` で作成または照合する。
4. `done` ACK で参加を確定し、明示的な `error` ACK を返した Lane を競技状態から除外する。

Lane 側で参加処理に失敗した場合は購読をロールバックし、Director 側もその Lane を競技状態から除外します。
Lane は所属する競技 ID を永続化するため、MQTT の一時切断やアプリ再起動後に同じ競技へ再参加できます。
コマンド発行失敗または ACK タイムアウトでは、Lane が参加を永続化した後に応答だけ失われた可能性を判別できません。
この場合は Lane を競技状態と `pendingJoinLaneIds` に残し、参加が確定するまで試射開始を禁止します。Director で対象
Lane を選択して参加を再試行すると、参加済みの Lane も同じ競技を確認して `done` を返します。不要な Lane は離脱を
実行して保留状態を解消できます。

競技への参加と通常の離脱は `NOT_STARTED` の間だけ行えます。試射開始が一部の Lane だけ成功した場合は、
`pendingSightingLaneIds` に残る未開始 Lane に限って `SIGHTING` 中の離脱を許可します。試射を開始済みの Lane や
それ以降のフェーズにいる Lane の所属は変更せず、本射結果の欠落や進行状態の不整合を防ぎます。

## 大会管理の射座割

「進行管理」の「大会の射座割」では、大会管理で保存した大会・種目・射群を選択し、射座番号が一致する
参加済み Lane へ選手を一括割当できます。Director は Lane 名に含まれる最初の `1`〜`99` の数字を優先して
射座番号に使用し、数字がない場合または重複する場合は空いている番号を割り当てます。実際に使用される番号は
進行管理の Lane 一覧で確認してください。`offline` の Lane は射座番号を保持せず、同じ Lane 名の交換機が
接続した場合はその射座番号を使用できます。

選手 ID には大会管理の参加者 ID、スタート番号には参加者一覧の順番（1始まり）を使用します。Team ID、team name、gender、nation code、
ISSF ID は参加者の official entry から独立した field として送信し、所属文字列を team identity として推測しません。
選択種目と進行中の競技種別が異なる場合は反映できません。対応する Lane や参加者が見つからない射座割は送信せず、
画面に未対応として表示します。反映対象への `assign-athlete` は Lane ごとに送信され、結果をまとめて通知します。
射座割を反映した競技の選手割当を手動補正する場合も、入力したスタート番号と選手名を選択種目の参加者一覧と照合し、
大会管理の参加者 ID を維持します。一致する参加者が一意に見つからない場合は割当を変更しません。
終了時には各 Lane の参加者 ID が選択した射群の保存済み射座割に含まれることを再検証し、別射群の割当が残っている
場合は成績を保存せず、割当を補正して再実行できる状態を維持します。
選手割当を変更できるのは競技開始前だけです。ただし、競技終了時の成績保存に失敗した場合は、清掃を開始する前に限り
割当を補正して終了処理を再実行できます。試射・本射中や成績保存済みの清掃再試行中は変更できません。

大会管理の射座割には、手動 grid と独立した ISSF computer draw があります。draw は seed、参加者 snapshot hash、algorithm version、
range geometry、MQS/RPO/OOC section policy、配置 hash を追記保存します。同一 nation の隣接回避、relay 間の nation／team member 均等化、
Mixed Team Qualification のfemale-left隣接配置と同一 nation の別 team の非隣接を検査します。Technical Delegate の承認後にだけ、明示確認を経て保存済み
射座割を置き換えます。entry list が変わった draw は stale となり、再抽選が必要です。手動 grid はこの機能を使用しない大会向けに残ります。
Mixed Team Final はteam pairを抽選し、Coachがprotest time終了前にRTS Juryへ通知した左右交替だけを、適用後の手動gridで保存します。

## コマンドと ACK

| 操作                                         | 配信単位               | 主な効果                                               |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| `join-competition` / `leave-competition`     | Lane 個別              | 競技購読の開始・終了                                   |
| `activate-safety-stop`                       | 競技非依存の Lane 個別 | durable safety latch、timer freeze、STOP / UNLOAD 表示 |
| `clear-safety-stop`                          | 競技非依存の Lane 個別 | 明示安全確認後に latch を解除。timer は再開しない      |
| `assign-athlete`                             | 競技内 Lane 個別       | 選手割当を保存し Retain 発行                           |
| `reset-session`                              | 開始前の Lane 個別     | 確認後、全着弾・得点を消去                             |
| `pause-timer`                                | 競技内 Lane 個別       | 中断 ID と正確な残り時間を永続化                       |
| `resume-timer`                               | 競技内 Lane 個別       | official grant の時間・mode で再開                     |
| `resume-match`                               | 競技内 Lane 個別       | 追加試射後に MATCH mode へ復帰                         |
| `start-qualification-recovery`               | 競技内 Lane 個別       | Rule 8.8.1 の許可射撃を score から隔離して開始         |
| `cancel-qualification-recovery`              | 競技内 Lane 個別       | 進行中の許可射撃を理由付きで取消                       |
| `apply-qualification-recovery`               | 競技内 Lane 個別       | 完了した series recovery evidence を明示裁定           |
| `settle-qualification-recovery`              | 競技内 Lane 個別       | 完了済み series を無射撃・無再採点で確定               |
| `retire-finalist`                            | 競技内 Lane 個別       | Final snapshot を確定して競技終了                      |
| `start-sighting` / `end-sighting`            | 競技ブロードキャスト   | 試射開始・終了                                         |
| `start-match`                                | 競技ブロードキャスト   | 本射ステージと最初のシリーズを開始                     |
| `start-timed-target` / `cancel-timed-target` | 対象 Lane broadcast    | 25m absolute schedule の開始／取消と red 復帰          |
| `timer-started` / `timer-expired`            | 競技ブロードキャスト   | 絶対開始時刻でタイマーを同期・満了                     |
| `advance-series`                             | 競技ブロードキャスト   | 現シリーズを進め、次シリーズを開始                     |
| `finish-competition`                         | 競技ブロードキャスト   | 競技を終了                                             |

すべてのコマンドには UUID の `commandId`、安定した `issuerId`、表示用 `issuedBy`、ISO 8601 の `issuedAt` が含まれます。Lane は
処理開始時に `executing`、完了時に `done`、失敗時に `error` を返します。Director は既定で 10 秒待ち、
終端 ACK が届かなかった Lane を `timeout` として表示します。ブロードキャスト全体が成功するのは、対象 Lane
すべてが `done` を返した場合だけです。

進行コマンドは各 Lane の retained state を事前条件として検証します。一部の Lane だけ遷移した後に再操作しても、
進行済みの Lane は再度進めず、遷移途中の Lane は未完了の処理だけを再開します。
Director は同じ競技への操作を受付順に直列化し、各操作が直前の操作で更新された retained state を確認してから
実行します。競技参加・離脱・終了清掃は全競技で所属変更を直列化するため、重なった操作が Lane 一覧を上書きしたり、
同じ Lane を複数の競技へ同時に確保したりすることはありません。異なる `commandId` の入力が重なった場合も、後続操作は
先行操作の完了後に現在フェーズを再検証します。

Individual 10m Final は2回の5-shot series 後に14回のsingle shot、Mixed Team Final は3回の5-shot series 後に9回のsingle shotを進めます。
`advance-series` は次の series／shot の絶対開始時刻と時間を一括配信します。脱落 checkpoint では Director が最低得点候補または同点を表示し、
Jury が順位と解決根拠を独立台帳へ記録してから対象 Lane へ `retire-finalist` を送ります。Mixed Team は2 Lane の command batch が両方成功して初めて
team checkpoint が完了します。終了成績は individual と team で別 repository／read model を使用します。

`reset-session` の `done` は、Lane 側の着弾・得点消去と 0 点 Retain スコアの再発行が完了した後に返ります。
Director も成功 ACK を受けた時点で、その Lane について保持していた初期化前の着弾履歴を破棄します。
Lane が初期化を完了した後に `done` だけが失われた場合は Director 内に旧着弾イベントが残ることがありますが、
成績の着弾明細には最終 Retain スコアだけを使用します。したがって 0 発の最終スコアへ初期化前の着弾を混在させません。

Director の Target Examination に evidence hold がある場合、または Range Interruption record が close／void されていない場合、
対象 competition／Lane の `leave-competition` と `reset-session` は MQTT command を発行する前に拒否されます。range-wide case は同じ
competition の全 Lane に適用されます。この判定は MQTT service が各機能の型を直接参照せず、複数の `ICompetitionDataGuard` policy を
合成した port を介して行います。

## Range safety STOP

`activate-safety-stop` と `clear-safety-stop` は `saika/lane/{laneId}/command/+` で配信し、Lane が競技へ参加していなくても処理します。
進行管理画面の emergency action は検出済み全 Lane を既定対象とし、内部 API は明示 Lane subset も受け付けます。各 Lane command は独立した
command ID と ACK を持ち、Director は batch 全体の対象、理由、official、Lane 別結果を SQLite の append-only audit に保存します。

Lane は STOP latch を timer 操作より先に永続化します。STOP 中は次を強制します。

- 全画面の `STOP / UNLOAD` 表示
- start／advance／timer restart／interruption resume の拒否
- 遅延中の絶対 START と phase event による timer 再始動の中央 gate での拒否
- 受信 shot の immutable observation 保存と `QUARANTINED_SAFETY_STOP` outcome。score には加算しない
- competition membership に依存しない `saika/lane/{laneId}/safety/state` の Retain 発行

clear には一致する `safetyStopId`、安全確認文、official、`confirmedSafe: true` が必要です。clear は latch だけを解除し、timer や MATCH mode を
自動復帰しません。Range Officer が物理的な unload と安全旗を確認し、その後に通常の START／resume workflow を別操作で実施します。

## Lane 個別の中断・再開

Range Interruption record の作成と Lane timer の操作は別です。record を開いただけでは STOP command を発行しません。
対象 Lane と official を確認して `Apply Lane STOP` を実行すると、Director は record ID と同じ `interruptionId` を付けて
`pause-timer` を送ります。Lane は現在の in-memory countdown を秒単位で停止して local store へ保存し、次を `done` ACK の `data` に返します。

- `interruptionId` と `status`
- capture 時刻
- capture 時点の remaining seconds と total seconds

Director は `done` を確認した後だけ、command ID と snapshot を append-only interruption ledger へ記録します。Lane command が成功し、
ledger 応答だけが失敗した場合は Lane の Retain 状態を確認して同じ record から再操作できます。Lane は同じ `interruptionId` の STOP を
冪等に扱い、停止または追加試射中に別 ID の中断が進行中なら拒否します。

`resume-timer` は recommendation を受け付けず、Director の ledger に明示保存された official grant の
`authorizedRemainingSeconds` と `unlimitedSightingShots` だけを送ります。Lane は再開予定を `RESUME_PENDING` として先に永続化してから、
session mode と timer を適用します。追加試射がない場合は `MATCH`、許可された場合は `SIGHTING` mode で再開します。
後者の shot は表示・shot journal には残る一方、competition score と series shot count へ入りません。試射終了時は別の
`resume-match` command で MATCH mode へ戻します。
Lane が再起動した場合は、保存済み `resumeAt` と authorized time から経過時間を差し引いて timer と mode を復元します。
停止中なら timer を開始せず STOP 表示を復元し、再起動中に authorized timer が満了していれば終了状態へ進めて interruption override を消去します。

中断中の Lane が古い competition-wide `timer-expired` を受けた場合は、他 Lane の ACK を妨げず `done` を返して適用を保留します。
`advance-series`、`finish-competition` など timer 以外の競技進行 command は `MQTT_LANE_INTERRUPTED` で拒否し、誤った state transition を
行いません。中断後の Lane timer が満了するか series が完了すると local interruption state を消去します。各 command 自体は単一 Lane 用である。
all-target failure では Director が対象 Lane へ fan-out し、Lane ごとの ACK／error／timeout を range command batch に保存する。部分成功時は
未完了 Lane のみ再試行し、全 intended Lane の成功後に range workflow を進める。これは分散 transaction として原子的な同時 STOP を保証しない。

`finish-competition` の `done` は、Lane 側の終了状態と最終スコアを競技 ID で再取得し、両方の Retain 発行が
QoS 1 で完了した後に返ります。着弾時のスコア発行は順番に処理されるため、遅れて完了した古いスナップショットが
最終スコアを上書きすることはありません。MQTT ブローカーから購読者への配送は `done` より遅れる場合があるため、
成績を保存する Director は終了コマンド ID が一致する `FINISHED` 状態と同一セッションのスコアを全 Lane で受信して
から保存と清掃へ進みます。別トピックから遅れて届いた終了前スコアは最終データとして扱いません。最終スナップショットを
確認できない Lane はエラーとなり、再実行時は Lane の競技が既に終了済みでも新しい終了コマンド ID を付けて最終データを
再発行してから `done` を返します。Lane が終了を保存した直後に再起動し、Director の Retain 状態がまだ以前のフェーズでも、
Lane は保存済みの所属と競技購読を復元するため、同じ終了再送で清掃を再開できます。
終了処理の再試行時に保存先の射群に確定済み成績がある場合、Lane データと完全一致する成績は確定状態のまま
再利用します。得点・選手情報などが異なる場合や、確定済み参加者が再送データから欠ける場合は射群全体の置換を
拒否し、確定済み成績の巻き戻しや消失を防ぎます。
成績へ保存する選手氏名と所属は Lane が返す割当文字列ではなく、参加者 ID に対応する大会データベースの値を使用します。
これにより、古い割当表示や外部 MQTT メッセージが大会の正式な選手情報を書き換えることはありません。
最終スコアの `acc` も Director が保持する競技種別の採点方式と一致する必要があり、BR60S への整数圏指定や
BP60 への小数点指定など、競技と異なる採点方式の成績は保存しません。

## 25m timed-target sequence

25m Qualification の `start-match` は generic timer を持たず、series ごとに `start-timed-target` を使用します。Director は
現在の Rule Pack stage／series と program ID、全対象 Lane の safety／clock／position、前回 sequence の `nextLoadAllowedAt` を検査し、
共通の絶対 `loadAt` を送ります。Lane はローカル Rule Pack から LOAD、ATTENTION、green／red、EST after-time を構築して
append-only event として保存し、renderer と retained state を同じ projection から更新します。

window 外の shot は元 observation を保持したまま `REJECTED_TIMED_TARGET_WINDOW` として score から除外します。
`ADVISORY`／`DISABLED` の local policy、recovery sighting、Jury remedy は timing engine から独立しています。safety STOP または
competition interruption は active sequence を cancel して red に戻します。物理 lamp／turning-target adapter と音声 `UNLOAD` は
この MQTT sequence には含まれません。

### Rule 8.8.1 Qualification recovery

Director の interruption ledger に保存した最新 official decision は、それだけでは Lane を動作させません。追加 sighting または
annul-and-repeat／remaining-shot completion を実施するときだけ、Director は一意な `runId` と decision／interruption、snapshot 済みの
stage／series／program／shot count、許可内容、絶対 `loadAt` を `start-qualification-recovery` で対象 Lane へ送ります。
Lane は retained competition／interruption state とローカル Rule Pack を照合し、通常の MATCH acquisition から隔離した sequence として実行します。

Lane は run の現在状態を
`saika/competition/{competitionId}/lane/{laneId}/qualification-recovery/state` に Retain 付きで発行します。各 recovery shot の座標、
装置点、計算点、採用点、発射／受信時刻、observation ID は
`saika/competition/{competitionId}/lane/{laneId}/qualification-recovery/shot` に Retain なしで発行し、Director も run の immutable binding と
一致する delivery だけを追記保存します。安全停止等で中止するときは `cancel-qualification-recovery` を別途送ります。

series recovery は全 recording window が終了し、Retain state 内の shot ID と Director の受信 evidence が一致した後にだけ
`apply-qualification-recovery` を送れます。Lane はここで初めて `ANNUL_AND_REPEAT` または `COMPLETE_REMAINING_SHOTS` を MATCH score へ反映し、
発射されなかった許可発数を miss として補います。追加 sighting にはこの command を使用せず、得点へ反映しません。

`KEEP_RECORDED_SERIES` は firing command や adjudication command を使用せず、`settle-qualification-recovery` で処理します。Lane は full series と
同一 session の shot evidence を検証・snapshot し、得点 row を変更せず series を完了して一致する pause を解除します。射撃制御
（start／cancel）、採点裁定、無射撃確定は三つの application port に分かれます。retry は Director に保存済みの同じ immutable run／request を使い、
Lane が受理済みの run では元の `loadAt`、adjudication／settlement では最初に保存した `appliedAt` を再利用します。

開始系コマンドの `timerStartAt` は、既定で送信時刻の 3 秒後です。Lane は受信直後ではなくこの絶対時刻まで
待ってからタイマーを開始します。各 PC の時刻同期が前提です。
試射開始を未完了の Lane だけに再送する場合は、最初の試射開始と同じ `timerStartAt` を再利用し、競技内の残り時間を
揃えます。部分成功時は未開始の Lane ID を競技状態の `pendingSightingLaneIds` に Retain し、全 Lane の開始が
完了するまで試射終了を無効にします。Lane は再送時刻ではなく `issuedAt` で端末間の時刻差を検査するため、過去の
`timerStartAt` を使う再送も受け付けます。
Director は `start-sighting`、`start-match`、`timer-started` の開始時刻と時間を、コマンド配信前に
`pendingTimer` として競技状態へ Retain します。Lane の成功 ACK 後にフェーズまたは `activeTimer` の保存が失敗しても、
同じ対象への再試行は最初の `timerStartAt` と時間を使います。操作が確定すると `pendingTimer` は削除されます。
未確定の試射開始を適用した可能性がある Lane がすべて正常に離脱した場合も `pendingTimer` を削除します。その後に
交換 Lane を参加させた試射開始では、離脱済み Lane の古い期限を再利用せず、新しい開始時刻を設定します。
タイマー再開の未確定中は従来の `activeTimer` を表示用に維持しますが、Director はその古い期限の
`timer-expired` を配信しません。再開を適用済みの Lane を旧期限で終了させないためです。再試行が全 Lane で
成功すると `activeTimer` と満了予約を新しい期限へ切り替えます。

## Retain と復旧

次の値は Retain 付きで保持され、Director が後から接続しても復元されます。

- 競技全体の状態と参加 Lane ID
- 進行中タイマーの絶対開始時刻、時間、対象ステージ・シリーズ
- ACK 後の状態保存に備えた未確定タイマー操作の開始時刻と時間
- 各 Lane の競技状態
- 各 Lane の中断 ID、capture timer、再開予定、authorized timer、SIGHTING／MATCH 復帰状態
- 各 Lane の competition-independent safety latch、停止理由、timer snapshot、clearance evidence
- 各 Lane の active／cleared Range Officer request
- 各 Lane の 25m timed-target sequence、signal、window、次回 LOAD 下限
- 各 Lane の Qualification recovery run、許可内容、isolated shot ID、完了／取消状態
- 各 Lane の選手割当
- 各 Lane の集計スコア
- 各 Lane のハードウェア接続状態

内蔵ブローカーは Retain メッセージを Director の SQLite データベースへ保存し、再起動時はクライアントの接続を
受け付ける前に復元します。外部ブローカーを使う場合、プロセス再起動をまたぐ復元には外部ブローカー側の永続化が
必要です。

Lane はハードウェア接続状態を60秒ごとに再発行します。Director は `connected` または `disconnected` の状態を
最後の発行時刻から150秒だけ有効とし、それを超えた場合は `offline` として扱います。ブローカー自体が異常終了して
Lane の Will を配信できず、古い Retain だけが復元された場合も、不在の Lane を接続中として残しません。新しい
heartbeat を受信すると、その状態で自動復旧します。

Director は復元した絶対開始時刻と時間から元の満了時刻を再計算します。満了前なら残り時間だけ予約し、既に満了済み
なら直ちに `timer-expired` を再送します。全 Lane の `done` ACK を受けるまでは期限情報を保持するため、満了時に
オフラインだった Lane が再接続した場合も同じ満了時刻で通知を再試行します。ACK の不足または ACK 後の Retain 更新に
失敗した場合も、短い待機を挟んで同じ満了時刻の通知を再試行し、期限情報を消去できるまで復旧を継続します。

Lane が競技から離脱すると、その競技に属する Lane 状態、割当、スコアの Retain を空 payload で消去します。
Director は空 payload を削除通知として扱います。着弾はイベントなので Retain しません。同じ `shotId` の
再送は Director が重複排除します。

競技終了時は、成績保存などの清掃前処理が成功したことを `cleanupPreparedAt` として競技状態へ Retain 発行してから
Lane を離脱させます。離脱または Retain 消去に失敗しても参加 Lane 一覧とこの完了記録を保持するため、再接続後は
失われた Lane データから成績を作り直さず、未完了の清掃だけを安全に再試行できます。
evidence hold がある場合も `finish-competition` と最終 snapshot の取得までは完了させ、`MATCH_COMPLETE` を Retain する一方、
`cleanupPreparedAt`、Lane 離脱、Lane／競技 Retain の空 payload 発行は行いません。調査物を確保して hold を解除した後に
`Retry cleanup` を実行すると、終了 command や保存済み成績を不必要に作り直さず清掃を再開します。
紐付けた種目が競技中に削除されていた場合も、Lane を終了して割当・得点 Retain を残した回復可能状態で停止します。
同じ競技種別の保存先を作り直し、射座割を再反映してから終了処理を再実行してください。

進行管理画面は終了前に、成績の保存先と Lane の割当・得点 Retain が消去されることを確認します。大会の射座割を
反映していない手動競技では大会管理へ成績を保存しないため、画面内と確認ダイアログの両方に警告を表示します。

## 障害時の確認順序

1. Director のブローカー状態と接続 URL を確認する。
2. Lane のハードウェア状態が `connected` で、競技 ID が一致するか確認する。
3. 直前コマンドの Lane 別 ACK が `error` か `timeout` かを確認する。
4. `error` の場合は表示されたコードとメッセージを解消する。
5. `timeout` の場合はネットワークと Lane の MQTT 接続を復旧し、Lane 状態を確認してから再操作する。

コマンドは Lane 側で `commandId` により冪等化されますが、異なる ID の操作を機械的に連打せず、必ず現在状態を
確認してください。
