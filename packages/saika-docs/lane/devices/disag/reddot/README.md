<!-- SPDX-License-Identifier: MIT -->

# DISAG RedDot受信互換・実装仕様（Saika Lane）

この文書は、Saika LaneでDISAG RedDotライフル標的を実装するための、独立実装向け互換仕様である。
シリアルポートを開いてから `Shot` を生成するまでの必須動作、バイト配置、検証、エラー回復、
Saika内の変更箇所、テストベクターを定義する。

DISAGの公式通信仕様や保守資料ではなく、同社による提携、承認、動作保証を示すものでもない。
メーカー公開資料から確認できる事項、独立した相互運用確認で確定したSaika受理形式、Saika固有の
設計値を明確に区別する。実機のパケットキャプチャ、第三者の抽出コード、機器固有IDは収録せず、
§11のフレームはこの文書用に作成した合成データである。

本文中の「必須」は適合実装が満たす条件、「推奨」は相互運用性または障害回復のために採用すべき
条件を表す。

## 1. 適用範囲と実装状態

### 1.1 対象プロファイル

| 項目                 | 値                                       |
| -------------------- | ---------------------------------------- |
| 販売名               | DISAG RedDot Laserziel                   |
| 公式型式             | `KT RDT ZIE 1`                           |
| 製造者               | KNESTEL Technologie & Elektronik GmbH    |
| 販売元               | DISAG GmbH & Co KG                       |
| SaikaデバイスID      | `DISAG_KT_RDT_ZIE_1_RIFLE`               |
| SaikaベンダーID      | `DISAG`                                  |
| Saika種目            | `AIR_RIFLE_10M`                          |
| Saika標的コード      | `ISSF_AR_10M`                            |
| ワイヤー上の種別     | `LG`（10mエアライフル）                  |
| 通信方向             | ショットデータは標的からホストへの一方向 |
| ホストから送るデータ | `ENQ`、およびフレームへの `ACK` / `NAK`  |

`KT RDT ZIE 1` は、KNESTELのEU適合宣言で `Typ / Model` として記載される型式である。現行のDISAG
取扱説明書では大文字・小文字だけが異なる `KT RDT Zie 1`、Bluetoothの機器名では
`KT RDT ZIE 1 S/N ####` と表記される。本書とSaikaの `modelName` は適合宣言の大文字表記
`KT RDT ZIE 1` に統一する。

`RDT-ZIE1` というハイフン表記は確認した公式資料にはなく、正式なモデル名として使用しない。
`DISAG_KT_RDT_ZIE_1_RIFLE` はSaika内部IDであり、メーカー型式そのものではない。旧暫定ID
`RDT_ZIE1_RIFLE` を保存済み設定から読み込んだ場合は、新IDとベンダー `DISAG` へ自動移行する。
利用者向けのモデル名と内部IDを混同させない。末尾の `RIFLE` はSaikaの標的・採点profileを表し、
公式なハードウェアvariant名ではない。Saikaの `DISAG` もprotocol routing用のベンダーIDであり、
法的な製造者名を表すフィールドではない。

本書はライフル用RS-232接続だけを対象にする。Bluetooth接続、ピストル用設定、校正、保守、
ファームウェア更新、標的本体の設定操作は対象外である。

### 1.2 現在のSaika実装状況

現行のSaika Laneは、本書で定義したRedDot受信経路を実装している。

- `DisagFormatParser` とruntimeのprotocol sessionは同じ `RedDotStreamScanner` を使用する。
- `RedDotProtocolSession` が `ENQ` polling、`ACK` / `NAK`、timeout、write直列化を担当する。
- `DisagAdapter` が検証済み59 byte frameをAIR_RIFLE_10Mの `Shot` へ変換する。
- RedDot接続ではASCII `S` / `R` を送らず、妥当なframeの変換成功時だけ着弾音を発生させる。
- port close/errorとprotocol write失敗は、旧portのclose完了後に1回だけ再接続する。接続世代が変わった
  handshake callbackは無効化する。
- UIへ列挙するDISAG装置は `DISAG_KT_RDT_ZIE_1_RIFLE` だけで、接続前と各フレーム処理時に
  active sessionが `AIR_RIFLE_10M` であることを検証する。接続中にsessionが終了または別種目へ
  変わった場合は、ショットを黙って破棄せず接続エラーとして停止・通知する。

合成fixtureによる§12.1〜§12.4の自動テストは実装済みである。§12.5の実port検証が完了するまでは、
文書上の状態を「実装済み（実機検証待ち）」とし、実機対応を保証しない。

### 1.3 根拠の区分

| 区分                 | 本書で使用する内容                                                                    |
| -------------------- | ------------------------------------------------------------------------------------- |
| メーカー公開情報     | 製品識別、RS-232/Bluetooth対応、PC直結の1:1配線、標的寸法、繰返し精度、OpticScore対応 |
| 公開インターフェース | 制御文字の役割とXOR/BCC方式の同系統仕様。別製品のbaud rateやフィールドは転用しない    |
| 独立相互運用確認     | 9600 8N1、ポーリング応答、59 byte配置、RedDotに `S` / `R` がないこと、座標方向と単位  |
| Saika固有設計        | 300msのポーリング、タイムアウト、バッファ上限、エラー分類、クラス分割                 |

外部一次情報へのリンクは [参照元](../../../../SOURCES.md) にまとめている。

## 2. 物理接続とシリアル設定

### 2.1 配線

メーカーの旧版公開RedDot資料が「RedDot Laserziel―Auswertecomputer」の直結用として示すRS-232接続は、
次の1:1結線である。

| RedDot側 | ホスト側 | 信号       |
| -------: | -------: | ---------- |
|    pin 2 |    pin 2 | データ線   |
|    pin 3 |    pin 3 | データ線   |
|    pin 5 |    pin 5 | Signal GND |

Saikaの確認済み構成は、通常のUSB-RS-232変換器とRedDot同梱のストレートケーブルである。
この構成へさらにクロス（null-modem）ケーブルを挿入しない。USB変換器内で信号をクロスする製品も
あるため、製品名ではなく最終的なpin 2→2、3→3、5→5を確認する。

現行のメーカー取扱説明書には、RedDotをLAN対応OpticScore測定枠へ接続する別構成で「クロスした
RS-232データ線」を使う記載がある。これはRedDotとPC/USB変換器を直結する本書の構成とは接続相手が
異なる。ケーブル単体の呼称を流用せず、接続相手を含む最終配線で判断する。

### 2.2 ポート設定

| パラメーター       | Saika受信プロファイル |
| ------------------ | --------------------: |
| ボーレート         |                  9600 |
| データビット       |                     8 |
| パリティ           |                `none` |
| ストップビット     |                     1 |
| RTS/CTSフロー制御  |                   off |
| XON/XOFFフロー制御 |                   off |
| DTR                |                   off |
| RTS                |                   off |

Node SerialPortでは `rtscts: false`, `xon: false`, `xoff: false` を指定し、open後に可能なら
`port.set({ dtr: false, rts: false })` を完了してから最初の `ENQ` を送る。DTR/RTS設定APIを提供しない
環境では、少なくともハードウェアフロー制御へ利用しない。

受信データはバイナリー `Buffer` のまま扱う。フレーム全体をUTF-8文字列へ変換してから分割しては
ならない。BCCは任意の1 byteであり、文字列変換で値が失われる可能性がある。

## 3. リンク制御

### 3.1 制御byte

| 名前 | 16進 | 方向           | 意味                                    |
| ---- | ---: | -------------- | --------------------------------------- |
| STX  | `02` | RedDot → Saika | フレーム開始                            |
| ENQ  | `05` | Saika → RedDot | 送信待ちデータの問い合わせ              |
| ACK  | `06` | Saika → RedDot | 正常フレームを受理                      |
| CR   | `0D` | RedDot → Saika | フィールド終端                          |
| NAK  | `15` | 両方向         | RedDot発: データなし、Saika発: 受信拒否 |
| ETB  | `17` | RedDot → Saika | BCC計算対象の終端                       |
| `$`  | `24` | RedDot → Saika | フレーム末尾                            |

`NAK` は方向によって意味が異なる。`ENQ` に対してRedDotから返る単独の `0x15` は「現在データなし」で
あり、エラー、ミスショット、切断として扱わない。音を鳴らさず、`Shot` も生成しない。

### 3.2 禁止するモードコマンド

RedDotフレームに試射/本射モードはなく、RedDotへASCII `S` / `R` を送らない。Saikaの試射/本射は
現在の `AdapterContext.mode` を使用する。接続、再接続、`ModeSwitched`、`StageAdvanced`、
`PhaseChanged` のいずれでも、デバイスIDが `DISAG_KT_RDT_ZIE_1_RIFLE` なら `sendMode()` は正常終了する
no-opでなければならない。

本書のプロファイルでSaikaが送信してよいbyteは `ENQ`、`ACK`、`NAK` だけである。

## 4. ポーリング状態機械

### 4.1 Saika既定値

次はメーカー保証値ではなく、相互運用確認に基づくSaikaの実装定数である。テストでは注入可能な
設定値と時計を使用する。

```ts
const POLL_INTERVAL_MS = 300;
const RESPONSE_TIMEOUT_MS = 300;
const MAX_BUFFER_BYTES = 4096;
const MAX_INVALID_RESPONSES_PER_POLL = 3;
```

同時に存在できるポーリングtimerと応答timeoutは、それぞれ最大1個とする。前回の問い合わせが
完了またはtimeoutする前に次の `ENQ` を送らない。

### 4.2 状態

| 状態                | 意味                                          |
| ------------------- | --------------------------------------------- |
| `STOPPED`           | listener、timer、保留writeがない              |
| `POLL_SCHEDULED`    | 次の `ENQ` を待っている                       |
| `AWAITING_RESPONSE` | `ENQ` のwrite/drainが完了し、応答を待っている |
| `WRITING_REPLY`     | `ACK` または `NAK` のwrite/drainを直列実行中  |

### 4.3 遷移

| 現在状態            | 入力・事象                 | 必須動作                                                               | 次状態              |
| ------------------- | -------------------------- | ---------------------------------------------------------------------- | ------------------- |
| `STOPPED`           | port open                  | bufferを空にし、DTR/RTS設定後、直ちに `ENQ` をwrite/drainする          | `AWAITING_RESPONSE` |
| `AWAITING_RESPONSE` | RedDotから単独 `NAK`       | 1 byte消費。イベントを発生させず、300ms後のpollを予約                  | `POLL_SCHEDULED`    |
| `AWAITING_RESPONSE` | 妥当な59 byteフレーム      | 受信時刻を保存し、`ACK` をwrite/drain後に1回だけ後段へ渡し、pollを予約 | `POLL_SCHEDULED`    |
| `AWAITING_RESPONSE` | 完成した不正フレーム       | 不正回数を加算し、フレームを破棄して `NAK` をwrite/drain               | 下記規則による      |
| `AWAITING_RESPONSE` | response timeout           | 未完成データを破棄し、recoverable warningを記録して次pollを予約        | `POLL_SCHEDULED`    |
| `POLL_SCHEDULED`    | timer                      | `ENQ` をwrite/drainし、応答timeoutを開始                               | `AWAITING_RESPONSE` |
| `POLL_SCHEDULED`    | 遅延到着した妥当フレーム   | poll timerを取消し、`ACK` 後に後段へ渡して新しいpollを予約             | `POLL_SCHEDULED`    |
| 任意                | close / error / disconnect | timerとtimeoutを取消し、bufferを空にし、listenerを解除                 | `STOPPED`           |

不正応答が1回目または2回目なら、`NAK` のdrain後に応答timeoutを張り直して
`AWAITING_RESPONSE` へ戻る。3回目の `NAK` をdrainしたらbufferと不正回数を空にして次pollを予約し、
`POLL_SCHEDULED` へ移る。これは壊れた機器やノイズにより通信loopが占有されるのを防ぐSaika側の
上限である。

### 4.4 write順序と多重実行防止

- `port.write()` のcallback成功だけで完了とせず、`port.drain()` の完了まで待つ。
- `ENQ`、`ACK`、`NAK` のwriteは単一のPromise chainまたはqueueで直列化する。
- 正常フレームは `ACK` のdrain成功後にだけ後段へ渡す。ACK失敗時はショットを生成せず接続エラーへ
  移行する。ACK前にイベントを発生させると、再送時に同じ射撃を二重記録し得る。
- 同じ座標・得点の連続射撃は有効なので、フレーム内容による重複排除は行わない。
- data listener内の非同期処理は受信順に直列化し、`WRITING_REPLY` 中に届いたbyteも順序を保って処理する。
- reconnect後は新しいsessionを1個だけ開始する。旧timerや旧listenerからのcallbackはgeneration IDまたは
  `AbortController` で無効化する。

## 5. 59 byteショットフレーム

### 5.1 固定配置

offsetは0始まり、終端を含む。全長は必ず59 byteである。

| offset | 長さ | 名前         | 形式・必須値                  |
| -----: | ---: | ------------ | ----------------------------- |
|      0 |    1 | `stx`        | `0x02`                        |
|    1–8 |    8 | `reservedA`  | printable ASCII、意味は未規定 |
|      9 |    1 | `cr1`        | `0x0D`                        |
|  10–17 |    8 | `reservedB`  | printable ASCII、意味は未規定 |
|     18 |    1 | `cr2`        | `0x0D`                        |
|  19–20 |    2 | `discipline` | ASCII `LG`                    |
|     21 |    1 | `cr3`        | `0x0D`                        |
|  22–23 |    2 | `reservedC`  | printable ASCII、意味は未規定 |
|     24 |    1 | `cr4`        | `0x0D`                        |
|  25–27 |    3 | `reservedD`  | printable ASCII、意味は未規定 |
|     28 |    1 | `cr5`        | `0x0D`                        |
|  29–30 |    2 | `reservedE`  | printable ASCII、意味は未規定 |
|     31 |    1 | `cr6`        | `0x0D`                        |
|  32–35 |    4 | `score`      | ASCII `dd.d`、`00.0`〜`10.9`  |
|     36 |    1 | `cr7`        | `0x0D`                        |
|  37–42 |    6 | `distance`   | ASCII `dddd.d`                |
|     43 |    1 | `cr8`        | `0x0D`                        |
|  44–48 |    5 | `x`          | ASCII `[+-]dddd`              |
|     49 |    1 | `cr9`        | `0x0D`                        |
|  50–54 |    5 | `y`          | ASCII `[+-]dddd`              |
|     55 |    1 | `cr10`       | `0x0D`                        |
|     56 |    1 | `etb`        | `0x17`                        |
|     57 |    1 | `bcc`        | §6で算出する1 byte            |
|     58 |    1 | `terminator` | ASCII `$`、`0x24`             |

`reservedA`〜`reservedE` は固定長を保ってDTOへ保存してよいが、値を `00000000`、`01`、`1.0` などへ
固定してはならない。現在意味を確定できないため、printable ASCII（各byte `0x20`〜`0x7E`）であること
だけを検査する。

### 5.2 構文検査

フレームを意味変換する前に、次を順に検査する。

1. `frame.length === 59`
2. offset 0、56、58がそれぞれ `STX`、`ETB`、`$`
3. offset 9、18、21、24、28、31、36、43、49、55がすべて `CR`
4. reserved領域がprintable ASCII
5. BCCが一致
6. `discipline === "LG"`
7. `score` が `^(?:0[0-9]|10)\.[0-9]$`
8. `distance` が `^[0-9]{4}\.[0-9]$`
9. X/Yがそれぞれ `^[+-][0-9]{4}$`
10. scoreを0.1点単位の整数へ変換した値が0〜109

1〜10の失敗はフレーム単位のfatal errorであり、`Shot` を生成しない。protocol sessionは
recoverable errorとして記録し、§4に従い `NAK` を返す。

## 6. BCC

BCCはoffset 0の `STX` からoffset 56の `ETB` まで、57 byteすべてのXORで算出する。offset 57の
BCC自身とoffset 58の `$` は計算へ含めない。XOR結果が `0x20` 未満なら `0x20` を加算する。

```ts
export function calculateRedDotBcc(bytesThroughEtb: Uint8Array): number {
  let value = 0;

  for (const byte of bytesThroughEtb) {
    value ^= byte;
  }

  return value < 0x20 ? value + 0x20 : value;
}

export function hasValidRedDotBcc(frame: Buffer): boolean {
  return frame.length === 59 && calculateRedDotBcc(frame.subarray(0, 57)) === frame[57];
}
```

実装上はJavaScriptのbitwise演算結果を `& 0xff` してもよい。入力がbyte列である限り結果は
0〜255に収まる。小さいXOR値の補正分岐は、例えば `[0x02, 0x17]` のXOR `0x15` が `0x35` に
なることを単体テストする。

## 7. フィールド変換

### 7.1 推奨DTO

文字列を検証してから、少なくとも次の値へ変換する。

```ts
interface RedDotParsedFrame {
  discipline: 'LG';
  scoreTenths: number;
  distanceRaw: number;
  distanceMm: number;
  xRaw: number;
  yRaw: number;
  xMm: number;
  yMm: number;
  reserved: readonly [string, string, string, string, string];
}
```

数値変換は次のとおりである。

```text
scoreTenths = integerPart(score) × 10 + fractionalDigit(score)
xRaw = signed decimal integer from x
yRaw = signed decimal integer from y
xMm = xRaw / 100
yMm = yRaw / 100
distanceRaw = decimal number from distance
distanceMm = distanceRaw / 100
```

scoreには浮動小数点の乗算を使わず、整数部と小数1桁を分けて `Score` の0.1点単位整数を作る。

### 7.2 座標系

- 原点は標的中心。
- Xは右が正、左が負。
- Yは上が正、下が負。
- X/Yの1 raw unitは0.01mm。
- Canvasなど下向きが正の画面座標へ描画するときだけYを反転する。ドメインの `ImpactPoint` では
  反転しない。

```text
screenX = centerX + xMm × pixelsPerMm
screenY = centerY - yMm × pixelsPerMm
```

中心距離は概ね次を満たす。

```text
distanceRaw ≈ hypot(xRaw, yRaw)
distanceMm ≈ hypot(xMm, yMm)
```

`distance` はraw unitの小数第1位まで、すなわち表示上0.001mmまで表せるが、測定精度を意味しない。
メーカー公開値の繰返し精度は±0.1mmである。丸め・切捨てやファームウェア差を許容するため、
`abs(distanceRaw - hypot(xRaw, yRaw)) <= 0.100001` を整合性の目安とする。超過しても
警告だけに留め、BCCと構造が正しいフレームを拒否しない。座標は `distance` から再生成しない。

### 7.3 採点と仮想弾

| 項目           | 値                            |
| -------------- | ----------------------------- |
| 標的           | `ISSF_AR_10M`                 |
| 仮想弾径       | 4.5mm                         |
| 仮想弾半径     | 2.25mm                        |
| 採点方式       | outer-edge                    |
| 小数点採点step | 半径方向0.25mm                |
| 最大スコア     | 10.9（`scoreTenths === 109`） |

4.5mmはレーザースポット径ではなく、エアライフル弾を表す採点・描画上の仮想径である。詳細なリング
寸法とSaikaの採点式は [標的・採点データ](../../../../common/TARGET_SPEC.md) を参照する。

RedDotが通知したscoreを `Shot.score` に設定する。後段の `USBDataPipeline` はこれを
`ShotData.score` として渡し、`RecordShotHandler` が `deviceScore` として保存する。座標から計算した
Saika scoreとの差は既存のdiscrepancy検出へ渡すが、不一致だけを理由にフレームを拒否しない。

### 7.4 モード、時刻、ミス

- モードはフレームにない。変換時点の `AdapterContext.mode` をそのまま `Shot.mode` に使う。
- timestampは、59 byteが揃い構造検査を開始した時刻を保存する。ACK完了時刻へ置き換えない。
- `shotNumber` は `AdapterContext.shotNumber`、`seriesNumber` は他アダプターと同じく0で生成する。
- inner tenは `TargetDesign.forDiscipline(context.discipline).isInnerTen(impactPoint)` で判定する。
- このプロファイルでは座標なしを表す特殊値を確認していない。scoreが `00.0` でも有効なX/Yがある
  フレームは座標付き0点として扱い、推測で `impactPoint: null` にしない。

`context.discipline` が `AIR_RIFLE_10M` 以外、またはフレームの種別が `LG` 以外なら変換を拒否する。

## 8. ストリーム分割と再同期

serialportの1回の `data` eventと1フレームは対応しない。1 byteずつ分割される場合、複数応答が結合
される場合、単独 `NAK` とフレームが同じchunkに入る場合をすべて処理する。

推奨scannerの処理は次のとおりである。

1. chunkを内部buffer末尾へ追加する。
2. bufferが4096 byteを超えたら、最後に現れた `STX` 以降59 byte未満だけを残す。見つからなければ
   全消去し、recoverable overflowを記録する。
3. 先頭が単独 `NAK` なら1 byte消費して `idle` eventを返し、1へ戻る。
4. 先頭が `STX` でなければ、次の `NAK` または `STX` までをnoiseとして破棄する。
5. `STX` から59 byte未満なら、追加chunkを待つ。
6. 59 byte候補の固定制御位置が不正なら `invalid-structure` を返し、先頭の `STX` 1 byteだけを
   捨てて再走査する。これにより候補内の次の `STX` へ同期できる。
7. 固定制御位置が正しければ、同じ `RedDotFrameDecoder` でBCCと§5.2の全フィールドを検査する。
   拒否された候補59 byteを消費し、理由付き `invalid-frame` を返す。
8. すべて妥当なら59 byteを消費し、raw frame、解析済みDTO、受信時刻を持つ `frame` eventを返す。
9. bufferが空になるか未完成候補になるまで繰り返す。

noiseの破棄だけでは `NAK` を送らない。`STX` から始まる完成候補を拒否した場合にだけ
protocol sessionが `NAK` を送る。scannerはバイト列の認識、sessionはpollと返信、adapterは意味変換
という責務を混在させない。

## 9. エラーとログ

| 条件                          | 分類               | serial返信 | Shot | 利用者向け動作                        |
| ----------------------------- | ------------------ | ---------: | ---: | ------------------------------------- |
| RedDotから単独 `NAK`          | 正常idle           |       なし | なし | 表示・音・errorなし                   |
| 未完成フレーム                | 待機中             |       なし | なし | timeoutまでは何もしない               |
| 構造/BCC/wire discipline不正  | recoverable frame  |      `NAK` | なし | warning、次フレームを受信可能にする   |
| Saikaのcontext discipline不正 | configuration      |      `ACK` | なし | 設定error。deviceへの再送要求はしない |
| distance整合性超過            | diagnostic         |      `ACK` | 生成 | warningのみ                           |
| device scoreと再計算値の差    | diagnostic         |      `ACK` | 生成 | 既存discrepancy loggerへ渡す          |
| ACK/ENQ/NAK write失敗         | connection error   |          — | なし | 接続回復処理                          |
| port close/error              | connection error   |          — | なし | 既存の再接続処理                      |
| buffer上限超過                | recoverable stream | 状況による | なし | 再同期しwarning                       |

通常ログは状態、offset、error code、byte数だけを残す。実射フレーム、座標、得点をinfoログへ出さない。
raw hexは開発者が明示的に有効化したdebugログだけに限定し、issueや公開fixtureへ貼らない。

## 10. Saika Laneへの組み込み設計

### 10.1 責務と推奨ファイル

| コンポーネント              | 推奨配置                                               | 責務                                       |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `RedDotStreamScanner`       | `target/infra/parsers/disag/RedDotStreamScanner.ts`    | chunk結合、候補抽出、decoder呼出し、再同期 |
| `RedDotChecksum`            | `target/infra/parsers/disag/RedDotChecksum.ts`         | BCC算出と照合                              |
| `RedDotFrameDecoder`        | `target/adapters/disag/RedDotFrameDecoder.ts`          | 固定offset検証、ASCIIと数値のDTO化         |
| `RedDotCoordinateConverter` | `target/adapters/disag/RedDotCoordinateConverter.ts`   | raw座標からmmへの変換                      |
| `DisagAdapter`              | `target/adapters/DisagAdapter.ts`                      | context検証と `Shot` 生成                  |
| `RedDotProtocolSession`     | `connection/infra/usb/reddot/RedDotProtocolSession.ts` | ENQ、ACK/NAK、timer、write直列化           |
| `USBConnectionManager`      | 既存ファイル                                           | device IDで通常pipeline/sessionを選択      |

ファイル名は変更してよいが、scanner、意味decoder、protocol sessionの責務境界は保つ。

### 10.2 既存ファイルの必須変更

1. [`targetDeviceDefinitions.ts`](../../../../../saika-lane/src/main/modules/target/domain/targetDeviceDefinitions.ts)
   の `DISAG_KT_RDT_ZIE_1_RIFLE` は `manufacturer: 'DISAG'`、`modelName: 'KT RDT ZIE 1'`、
   表示名 `DISAG RedDot Rifle`、対応種目 `['AIR_RIFLE_10M']` を維持する。
   `RDT_ZIE1_PISTOL` と `DISAG_DEFAULT` は本書の対応対象へ含めない。
2. [`DisagFormatParser.ts`](../../../../../saika-lane/src/main/modules/target/infra/parsers/DisagFormatParser.ts)
   のXML風スタブを削除する。runtimeでprotocol sessionがscannerを直接使う場合も、同じscannerを
   利用する薄いwrapperにして、異なるDISAG形式を二重実装しない。
3. [`DisagAdapter.ts`](../../../../../saika-lane/src/main/modules/target/adapters/DisagAdapter.ts) を§7の
   変換へ置き換える。現行 `RawData` interfaceを維持するなら、protocol sessionで検証済みであっても
   同じpureな `RedDotFrameDecoder` を再実行する。検証ロジックを複製してはならない。
4. [`target.module.ts`](../../../../../saika-lane/src/main/modules/target/target.module.ts) でDISAG
   adapterをメーカーID `DISAG` へ登録し、device ID `DISAG_KT_RDT_ZIE_1_RIFLE` だけを割り当てる。
   `DISAG_DEFAULT` と `RDT_ZIE1_PISTOL` をこのadapterへ割り当てない。
5. [`USBConnectionManager.ts`](../../../../../saika-lane/src/main/modules/connection/infra/usb/USBConnectionManager.ts)
   は `DISAG_KT_RDT_ZIE_1_RIFLE` のときprotocol sessionを開始し、有効フレームだけをpipelineへ渡す。
   他デバイスは現在の直接受信経路を維持する。
6. [`USBConnectionLifecycle.ts`](../../../../../saika-lane/src/main/modules/connection/infra/usb/USBConnectionLifecycle.ts)
   の `sendMode()` をdevice-awareにし、RedDotではno-opにする。open後のDTR/RTS設定もここで行う。
7. [`USBDataPipeline.ts`](../../../../../saika-lane/src/main/modules/connection/infra/usb/USBDataPipeline.ts)
   は、既に検証・フレーミング済みの `Buffer` と受信時刻を処理できる入口を持つ。RedDotでは
   `SerialDataParser` のstream bufferへ再投入せず、その2値からimmutableな `RawData` を作って変換する。
   `NAK`、noise、部分frameをこの入口へ渡さず、変換成功1件につき `onShotDetected` をdata eventの
   直前に1回だけ呼ぶ。既存デバイスの直接受信経路と着弾音タイミングはこの対応では変更しない。
8. disconnect、unexpected close、reconnectのどの経路でもprotocol sessionの `stop()` を先に呼び、
   data listener、poll timer、timeout、保留bufferを残さない。接続世代を更新して旧callbackを無効化し、
   unexpected close/errorでは `disconnected` を通知して旧portのclose完了後に再接続する。

RedDot接続では `USBConnectionConfig.deviceId` を必須とし、メーカーIDが `DISAG` という理由だけで
protocol sessionを開始しない。device IDが欠落するか `DISAG_KT_RDT_ZIE_1_RIFLE` 以外なら
configuration errorにする。変換には必ず `convertByDeviceId()` を使い、汎用のDISAG adapter fallbackへ
依存しない。active sessionが `AIR_RIFLE_10M` でなければportをopenする前にconfiguration errorとし、
正しい競技を選択するまでpollingを開始しない。

接続完了後に [`ConnectToTargetHandler.ts`](../../../../../saika-lane/src/main/modules/connection/application/handlers/ConnectToTargetHandler.ts)
や [`connection.module.ts`](../../../../../saika-lane/src/main/modules/connection/connection.module.ts) が
`sendMode()` を呼ぶ構造は維持してよい。device-awareなno-opを通信境界に置くことで、すべての呼出し
経路からRedDotへの `S` / `R` を防ぐ。

### 10.3 end-to-end処理順

1. UIで `DISAG_KT_RDT_ZIE_1_RIFLE` と `AIR_RIFLE_10M` を選ぶ。
2. 9600 8N1、flow controlなしでportをopenする。
3. `RedDotProtocolSession` を開始し、最初の `ENQ` を送る。
4. 単独 `NAK` なら何も生成せず次pollへ進む。
5. scannerが59 byte候補を確定し、decoderが構造、BCC、discipline、score、distance、X/Yを検査する。
6. 正常なら `ACK` をdrainし、frameと受信時刻をpipelineへ1回渡す。
7. adapterが同じdecoderの結果からscore、distance、X/Yを取得する。
8. adapterが現在のsession modeと `ISSF_AR_10M` を使って `Shot` を作る。
9. pipelineが着弾音通知を1回発生させ、`ShotData` をemitする。
10. `RecordShotHandler` がdevice scoreを保存し、座標再計算との差を診断する。

## 11. 合成テストベクター

### 11.1 正常フレーム

これは実射データではなく、3-4-5の直角三角形になる座標を選んで作成した合成fixtureである。

```text
<STX>00000000<CR>00000000<CR>LG<CR>01<CR>1.0<CR>01<CR>09.0<CR>0500.0<CR>+0300<CR>+0400<CR><ETB>:$
```

59 byteの16進表現:

```text
0230303030303030300d30303030303030300d4c470d30310d312e300d30310d30392e300d303530302e300d2b303330300d2b303430300d173a24
```

期待結果:

| 項目                   | 値                                   |
| ---------------------- | ------------------------------------ |
| byte長                 | 59                                   |
| BCC計算対象            | offset 0〜56                         |
| 算出BCC                | `0x3A`（ASCII `:`）                  |
| discipline             | `LG`                                 |
| scoreTenths            | 90                                   |
| distanceRaw / mm       | `500.0` / `5.000mm`                  |
| xRaw / xMm             | `+300` / `+3.00mm`                   |
| yRaw / yMm             | `+400` / `+4.00mm`                   |
| `hypot(xMm, yMm)`      | `5.00mm`                             |
| `ISSF_AR_10M` innerTen | `false`                              |
| mode                   | fixture内になし。テストcontextを使用 |

reserved値はfixtureを構成するための任意値であり、実装が同じ値を要求してはならない。

### 11.2 符号付き座標fixture

2桁のscore整数部と負のYを同時に確認する合成fixtureである。

```text
<STX>00000000<CR>00000000<CR>LG<CR>01<CR>1.0<CR>01<CR>10.1<CR>0223.6<CR>+0100<CR>-0200<CR><ETB>1$
```

```text
0230303030303030300d30303030303030300d4c470d30310d312e300d30310d31302e310d303232332e360d2b303130300d2d303230300d173124
```

全長は59 byte、BCCは `0x31`（ASCII `1`）。期待結果はscore 101、X `+1.00mm`、Y `-2.00mm`、
distance `2.236mm` である。

### 11.3 フラグメントfixture

§11.1の59 byte列について、split位置を1〜58まで変え、次をすべて成立させる。

```ts
for (let split = 1; split < frame.length; split += 1) {
  scanner.push(frame.subarray(0, split));
  const events = scanner.push(frame.subarray(split));
  // events contains exactly one valid frame
}
```

各反復ではscanner/sessionを新規生成する。1 byteずつ59回に分割するケースと、
`Buffer.concat([Buffer.from([0x15]), frame])` も別途確認する。

## 12. 必須テストと受入条件

### 12.1 checksum・decoder単体テスト

- §11.1が59 byteで、固定offsetとBCC `0x3A` を満たす。
- XORが `0x20` 未満のとき `0x20` 加算分岐が動く。
- STX、各CR、ETB、`$` の1箇所破損をそれぞれ拒否する。
- BCCだけを1 bit変更したフレームを拒否する。
- score、distance、X、Yの桁数、符号、小数点位置の異常を拒否する。
- disciplineが `LG` 以外ならライフルadapterで拒否する。
- reserved値を別のprintable ASCIIへ変え、BCCを再計算したフレームは受理する。
- §11.1をscore 90、X 3mm、Y 4mm、distance 5mmへ変換する。
- distanceの不一致はwarningにするが、変換結果を返す。

### 12.2 scanner単体テスト

- すべての2分割位置1〜58と、1 byteずつの分割でフレームを1件だけ返す。
- 2フレームが1 chunkに結合されても順番どおり2件返す。
- `NAK`、noise、部分フレーム、正常フレームの組合せから再同期する。
- 不正構造では先頭STXだけ、不正BCCでは候補59 byteを消費する。
- 4096 byte超過で無制限にmemoryを保持しない。

### 12.3 protocol session単体テスト

fake serial writerとfake clockを使い、wall clockや実USBへ依存させない。

- start直後の最初のhost byteが `ENQ` であり、ASCII `S` / `R` が一度も出ない。
- RedDotの `NAK` が繰り返されてもshot、sound、errorを発生させない。
- 正常フレームでは `ACK` のdrain完了後にだけframe callbackを1回呼ぶ。
- 不正BCCでは `NAK` を送り、callbackを呼ばず、次の正常フレームで回復する。
- 応答待ち中に重複 `ENQ` を送らない。
- 300msより前に次pollを送らず、fake clockを300ms進めた時点で1回だけ送る。
- disconnectでtimerとlistenerを除去し、clockを進めてもwriteしない。
- reconnectを繰り返してもtimerとdata listenerが1組だけ存在する。
- ACK write/drain失敗時にframeをemitせず、connection errorへ渡す。

### 12.4 adapter・統合テスト

- `DISAG_KT_RDT_ZIE_1_RIFLE` はベンダー `DISAG`、対応種目 `AIR_RIFLE_10M` だけとして列挙される。
- `DISAG_KT_RDT_ZIE_1_RIFLE` の `modelName` は公式型式どおり `KT RDT ZIE 1` である。
- DISAGでもdevice IDが欠落または `DISAG_KT_RDT_ZIE_1_RIFLE` 以外ならRedDotのpollを開始しない。
- §11.1から `ImpactPoint(3, 4)`、`Score(90)`、`innerTen: false` を生成する。
- 同じframeをSIGHTING/MATCHのcontextで変換し、各contextのmodeを保持する。
- mode切替時にserialへ `S` / `R` を送らず、次ショットは新しいsession modeになる。
- `NAK` や部分chunkでは着弾音を鳴らさず、変換成功1件につき1回だけ鳴らす。
- device scoreと座標計算scoreが違っても記録し、discrepancyを診断する。
- `AIR_RIFLE_10M` 以外のcontextを拒否する。
- 既存MT201、Custom、その他のparserテストを変更せず通す。

### 12.5 完了条件

次をすべて満たすまで、UIや文書上の実装状態を「対応」に変更しない。

- 上記単体・統合テストが自動化されている。
- 通常idleでerrorと着弾音が発生しない。
- 実portで複数ショットを欠落・重複なく受信できる。
- disconnect/reconnect後もpollが多重化しない。
- 実射データをfixture、通常ログ、公開issueへ残していない。
- MT201を含む既存USB受信の回帰テストが通る。

## 13. 未確定事項と変更管理

次は推測で実装しない。

- reserved 5フィールドの正式名称と意味
- RedDot固有のmiss/座標なしsentinel
- firmware間のフレーム差、再送回数、メーカー保証timeout
- BluetoothとRS-232の切替手順
- ピストル用RedDotのdiscipline、座標、採点、フレーム差
- `LG` 以外のOpticScoreフレームを同じadapterで扱えるか

新しい挙動を追加する場合は、まず匿名化した最小の合成fixtureとテストでSaikaの受理契約を定義し、
同じ変更で本書を更新する。メーカー資料は複製せず一次情報へリンクし、独立確認事項をメーカー保証と
表現しない。公開判断は [公開コンテンツ方針](../../../../CONTENT_POLICY.md) に従う。

製品名・会社名は相互運用対象の識別にだけ使用する。商標その他の権利は各権利者に帰属する。
