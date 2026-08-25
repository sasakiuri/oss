# Saika Lane 最小アプライアンス OS 構成メモ

> **Status:** Design note. This is not yet a supported installation guide or installer.
>
> **Last reviewed:** 2026-08-01

## 目的

Saika Lane を専用端末で常時起動するための、保守可能な最小 Linux 構成を記録する。
次の機能を含む。

- 電子標的との USB シリアル通信
- 着弾音の再生
- スコアシートの印刷
- 中央 MQTT ブローカーとの通信
- 電源投入後の自動起動と、異常終了時の自動復旧

容量だけを最小化することは目的にしない。現場での復旧、セキュリティ更新、周辺機器の互換性を優先する。

## 前提

- ベアメタルの x86-64 端末を使用する。VM は使用しない。
- ベース OS は Debian 13 (trixie) amd64 の最新ポイントリリースとする。
- Debian Installer ではデスクトップ環境を選択せず、標準システムと必要に応じて SSH のみを導入する。
- Saika Lane はビルド済みの Linux `.deb` を導入し、端末上では Node.js や C++ ビルドツールを使用しない。
- Linux 版は現在 Experimental で、ビルド対象も x64 のみである。本番導入前に実機検証を完了する。

## 構成

| 領域            | 採用するもの                 | 備考                                                      |
| --------------- | ---------------------------- | --------------------------------------------------------- |
| Init / service  | systemd + logind             | 専用ユーザーのセッションと自動復旧を管理する              |
| Display         | Cage                         | 1アプリだけを最大化する Wayland kiosk compositor          |
| Graphics        | Mesa                         | 対象端末の GPU ドライバーも必要                           |
| Audio           | PipeWire + WirePlumber       | Chromium Web Audio の出力先を固定し、試聴できるようにする |
| Printing        | CUPS                         | IPP Everywhere 対応プリンターを標準とする                 |
| USB printing    | ipp-usb                      | IPP-over-USB 対応機をドライバーレスで利用する             |
| MQTT            | Saika Lane -> central broker | レーン端末には原則としてブローカーを導入しない            |
| Network         | NetworkManager               | `nmtui` で GUI なしでも設定できる                         |
| Persistent data | kiosk user home              | `~/.config/Saika Lane/` をバックアップ対象にする          |

通常のデスクトップ環境、ディスプレイマネージャー、Web ブラウザー、開発ツールは導入しない。

## パッケージ例

ドライバーレス印刷を前提にした最小例。実際の `.deb` が要求するライブラリは `apt` に解決させる。

```bash
sudo apt update
sudo apt install --no-install-recommends \
  cage dbus-user-session libgl1-mesa-dri fonts-noto-cjk \
  pipewire-pulse wireplumber alsa-utils \
  cups cups-client cups-filters cups-browsed ipp-usb avahi-daemon \
  mosquitto-clients ca-certificates \
  network-manager

sudo apt install "/path/to/Saika Lane-VERSION-linux-ARCH.deb"
```

レガシーなプリンターを使用する場合だけ、対応する `printer-driver-*` パッケージを追加する。
AppImage を使用する場合、現在のビルドは FUSE 2 を要求する可能性があるため、最小構成では `.deb` を優先する。

## 実行ユーザーとキオスクサービス

- `saika` などの専用非 root ユーザーを作成する。
- 専用ユーザーには `sudo` 権限や対話用の管理用途を持たせない。
- 管理者アカウントと kiosk ユーザーを分離する。
- Cage と Saika Lane は tty1 上の systemd service として起動する。
- service は `PAMName=login` を使用し、PipeWire と `uaccess` が logind セッションを認識できるようにする。
- `Restart=always` と短い `RestartSec` を設定する。
- 利用者による VT 切り替えを許可する Cage の `-s` は付けない。
- Chromium の sandbox を無効化する `--no-sandbox` は付けない。

service の概略は次のとおり。実行ファイルのパスは生成された `.deb` で確認する。

```ini
[Unit]
Description=Saika Lane kiosk
After=systemd-user-sessions.service systemd-logind.service network-online.target cups.service
Wants=systemd-logind.service network-online.target
Conflicts=getty@tty1.service

[Service]
User=saika
PAMName=login
TTYPath=/dev/tty1
StandardInput=tty-fail
UtmpIdentifier=tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
ExecStart=/usr/bin/cage -- /path/to/saika-lane
Restart=always
RestartSec=3

[Install]
WantedBy=graphical.target
```

## USB シリアル

試作時は kiosk ユーザーを `dialout` グループへ追加できるが、本番では対象機器の VID/PID を限定した
udev rule と logind の `uaccess` を使う。

```udev
SUBSYSTEM=="tty", ATTRS{idVendor}=="<VID>", ATTRS{idProduct}=="<PID>", TAG+="uaccess"
```

VID/PID は実機に接続して確認し、例示値をそのまま使用しない。USB の抜去・再接続、再起動後の自動再接続も
受け入れ試験に含める。

## 音声

- PipeWire と WirePlumber は Saika Lane と同じ kiosk ユーザーのセッションで動かす。
- 初期設定で `wpctl status` 相当の一覧から出力先を選択する。
- ミュート解除、既定出力、OS 音量を保存し、Saika Lane の着弾音で試聴する。
- HDMI の接続状態で出力先が変わる端末では、固定のアナログ出力または USB オーディオを優先する。

## 印刷

- AirPrint / IPP Everywhere 対応プリンターを標準機として選定する。
- ネットワークプリンターは CUPS と Avahi で探索する。
- USB プリンターは IPP-over-USB 対応機を `ipp-usb` で利用する。
- kiosk ユーザーは印刷のみ許可し、`lpadmin` グループには追加しない。
- 初期設定で既定プリンターを選択し、テストページを印刷する。
- CUPS の管理画面は外部ネットワークへ公開しない。

確認に使う代表的なコマンド:

```bash
lpstat -e
lpstat -p -d
lpoptions -d <printer-name>
```

現在の Saika Lane はブラウザーの印刷ダイアログを開く。将来ワンタッチ印刷が必要になった場合は、
Electron main process から既定プリンターへ silent print する方式を別途検討する。

## MQTT

- レーン端末には接続確認用の `mosquitto-clients` のみを導入する。
- ブローカーは中央サーバーに置き、端末は Ethernet で接続する。
- 端末ごとに一意な lane ID と分かりやすい lane alias を持たせる。
- 設定項目は `enabled`, `brokerUrl`, `laneAlias`, `autoConnect`, `laneId` とする。
- 初期設定で publish / subscribe の往復試験を行う。
- 起動直後にネットワークやブローカーが利用できなくても、バックオフ付きで再接続する。

現状の実装には次の制約があるため、アプライアンス化前に対応する。

1. `autoConnect` は保存されるが、起動時に設定を読み出して接続する処理がない。
2. MQTT の username/password と TLS client certificate authentication に対応していない。

認証対応までの暫定運用では、専用 VLAN、ファイアウォール、ブローカー側のネットワーク制限を必須とし、
信頼できないネットワークへ匿名 listener を公開しない。

## 永続データ

次のディレクトリを OS イメージやアプリ本体から分離して扱う。

```text
/home/saika/.config/Saika Lane/
```

ここには SQLite database、設定、ログ、ShotLog が含まれる。バックアップ、空き容量監視、突然の電源断後の
整合性確認を用意する。読み取り専用 root filesystem を将来採用する場合も、この領域は書き込み可能にする。

## 簡易セットアップの目標 UX

第1段階では、Debian 13 minimal の導入後に次の操作だけで構成できるプロビジョナーを用意する。

```bash
sudo ./saika-appliance install --app ./Saika-Lane.deb
sudo saika-configure
sudo reboot
```

`saika-configure` は次の順に対話設定と動作確認を行う。

1. 電子標的の検出と権限確認
2. 音声出力の選択と試聴
3. プリンターの選択とテスト印刷
4. lane number / alias と MQTT broker URL の設定、接続試験

あわせて `saika-doctor` を用意し、USB、音声、CUPS、MQTT、時刻同期、ディスク空き容量、Saika Lane service を
まとめて診断できるようにする。プロビジョナーは再実行可能かつ冪等にする。

第2段階では同じプロビジョナーを Debian Installer の preseed から呼び出し、インストール USB にする。
生のディスクイメージを複製すると `machine-id`、SSH host key、lane ID まで複製しやすいため、無人インストーラーを
優先する。

## 受け入れ確認

- 電源投入後、操作なしで Saika Lane が全画面起動する。
- Saika Lane または Cage の異常終了後、自動で復帰する。
- Chromium sandbox が有効である。
- 着弾音が指定した出力から遅延なく鳴る。
- 既定プリンターでテストページとスコアシートを印刷できる。
- MQTT は起動時に自動接続し、ネットワーク断後にも再接続する。
- 電子標的の USB を抜き差ししても再検出・再接続できる。
- 再起動後も設定、セッション、ShotLog が保持される。
- MQTT ブローカーへ到達できない場合も、射撃表示とローカル保存を継続できる。

## 本番化前の前提作業

- Electron をサポート中のリリースへ更新する。
- Linux 実機上で USB、音声、Cage、印刷ダイアログ、GPU acceleration の E2E 試験を追加する。
- MQTT 起動時自動接続と認証を実装する。
- `.deb` の導入・更新・ロールバック手順を決める。
- プロビジョナーと `saika-doctor` を実装し、クリーンな Debian 13 から繰り返し検証する。

## 参考資料

- [Debian 13 release information](https://www.debian.org/releases/trixie/)
- [Debian Installer: automated installation using preseeding](https://www.debian.org/releases/trixie/amd64/apb.en.html)
- [Debian package: Cage](https://packages.debian.org/trixie/cage)
- [Debian: IPP Everywhere](https://wiki.debian.org/CUPSIPPEverywhere)
- [Debian: driverless printing](https://wiki.debian.org/CUPSDriverlessPrinting)
- [Electron release support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
