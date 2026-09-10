# Saika Lane minimal appliance OS design notes

> **Status:** Design note. This is not yet a supported installation guide or installer.

## Purpose

Document a maintainable, minimal Linux configuration for running Saika Lane continuously on a dedicated terminal.
The configuration includes:

- USB serial communication with electronic targets
- Shot sound playback
- Score sheet printing
- Communication with a central MQTT broker
- Automatic startup after power-on and automatic recovery after a crash

Minimizing storage alone is not the goal. Prioritize recovery in the field, security updates, and peripheral compatibility.

## Assumptions

- Use a bare-metal x86-64 terminal, not a VM.
- Use the latest point release of Debian 13 (trixie) amd64 as the base OS.
- In Debian Installer, omit the desktop environment and install only the standard system and, if needed, SSH.
- Install Saika Lane from a prebuilt Linux `.deb`; do not use Node.js or C++ build tools on the terminal.
- The Linux version is currently experimental, and builds target x64 only. Complete testing on physical hardware before production deployment.

## Configuration

| Area            | Selection                    | Notes                                                                |
| --------------- | ---------------------------- | -------------------------------------------------------------------- |
| Init / service  | systemd + logind             | Manage the dedicated user session and automatic recovery             |
| Display         | Cage                         | A Wayland kiosk compositor that maximizes a single application       |
| Graphics        | Mesa                         | GPU drivers for the target terminal are also required                |
| Audio           | PipeWire + WirePlumber       | Select a fixed output for Chromium Web Audio and allow test playback |
| Printing        | CUPS                         | Use IPP Everywhere printers as the standard                          |
| USB printing    | ipp-usb                      | Use IPP-over-USB printers without drivers                            |
| MQTT            | Saika Lane -> central broker | Normally, do not install a broker on lane terminals                  |
| Network         | NetworkManager               | Configure without a GUI using `nmtui`                                |
| Persistent data | Kiosk user home              | Back up `~/.config/Saika Lane/`                                      |

Do not install a conventional desktop environment, display manager, web browser, or development tools.

## Example packages

This is a minimal example assuming driverless printing. Let `apt` resolve the libraries required by the actual `.deb`.

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

Add the corresponding `printer-driver-*` packages only when using legacy printers.
If using an AppImage, the current build may require FUSE 2, so prefer `.deb` for the minimal configuration.

## Runtime user and kiosk service

- Create a dedicated non-root user such as `saika`.
- Do not grant the dedicated user `sudo` privileges or use it for interactive administration.
- Keep the administrator account separate from the kiosk user.
- Start Cage and Saika Lane as a systemd service on tty1.
- Use `PAMName=login` in the service so that PipeWire and `uaccess` can recognize the logind session.
- Set `Restart=always` and a short `RestartSec`.
- Do not pass Cage's `-s` option, which allows users to switch VTs.
- Do not pass `--no-sandbox`, which disables the Chromium sandbox.

The service outline follows. Check the generated `.deb` for the executable path.

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

## USB serial

For prototyping, the kiosk user can be added to the `dialout` group. In production, use a udev rule restricted to the
VID/PID of the target device, together with logind's `uaccess`.

```udev
SUBSYSTEM=="tty", ATTRS{idVendor}=="<VID>", ATTRS{idProduct}=="<PID>", TAG+="uaccess"
```

Connect the actual hardware to confirm its VID/PID; do not use example values unchanged. Include USB removal and
reconnection, as well as automatic reconnection after a reboot, in acceptance testing.

## Audio

- Run PipeWire and WirePlumber in the same kiosk user session as Saika Lane.
- During initial setup, select an output from a list equivalent to `wpctl status`.
- Save the unmuted state, default output, and OS volume, then test playback with Saika Lane's shot sound.
- Prefer a fixed analog output or USB audio on terminals where the output changes with the HDMI connection state.

## Printing

- Select AirPrint / IPP Everywhere printers as the standard hardware.
- Discover network printers using CUPS and Avahi.
- Use `ipp-usb` for USB printers that support IPP-over-USB.
- Allow the kiosk user to print only; do not add it to the `lpadmin` group.
- During initial setup, select a default printer and print a test page.
- Do not expose the CUPS administration interface to external networks.

Typical verification commands:

```bash
lpstat -e
lpstat -p -d
lpoptions -d <printer-name>
```

Saika Lane currently opens the browser's print dialog. If one-touch printing becomes necessary, separately evaluate
silent printing to the default printer from the Electron main process.

## MQTT

- Install only `mosquitto-clients` on lane terminals for connection checks.
- Place the broker on a central server and connect terminals over Ethernet.
- Give each terminal a unique lane ID and a descriptive lane alias.
- Use the settings `enabled`, `brokerUrl`, `laneAlias`, `autoConnect`, and `laneId`.
- During initial setup, perform a publish/subscribe round-trip test.
- Reconnect with backoff even if the network or broker is unavailable immediately after startup.

Address these limitations in the current implementation before packaging the system as an appliance:

1. `autoConnect` is saved, but there is no startup logic that reads the settings and connects.
2. MQTT username/password and TLS client certificate authentication are not supported.

Until authentication is supported, interim deployments must use a dedicated VLAN, a firewall, and broker-side network
restrictions. Do not expose anonymous listeners to untrusted networks.

## Persistent data

Manage the following directory separately from the OS image and application files:

```text
~/.config/Saika Lane/
```

It contains the SQLite database, settings, logs, and ShotLog. Provide backups, free-space monitoring, and integrity checks
after sudden power loss. Keep this area writable even if a read-only root filesystem is adopted later.

## Target setup experience

In the first phase, provide a provisioner that configures the terminal with only the following steps after installing
Debian 13 minimal:

```bash
sudo ./saika-appliance install --app ./Saika-Lane.deb
sudo saika-configure
sudo reboot
```

`saika-configure` performs interactive configuration and functional checks in this order:

1. Detect the electronic target and verify permissions.
2. Select an audio output and test playback.
3. Select a printer and print a test page.
4. Configure the lane number / alias and MQTT broker URL, then test the connection.

Also provide `saika-doctor` to diagnose USB, audio, CUPS, MQTT, time synchronization, free disk space, and the Saika Lane
service together. Make the provisioner rerunnable and idempotent.

In the second phase, invoke the same provisioner from Debian Installer preseed to create an installation USB drive.
Prefer an unattended installer, since cloning raw disk images can also duplicate `machine-id`, SSH host keys, and lane IDs.

## Acceptance checks

- Saika Lane starts in full screen after power-on without user interaction.
- The system recovers automatically after Saika Lane or Cage crashes.
- The Chromium sandbox is enabled.
- Shot sounds play through the selected output without delay.
- The default printer can print a test page and a score sheet.
- MQTT connects automatically at startup and reconnects after a network interruption.
- Electronic targets are detected again and reconnected after USB removal and reinsertion.
- Settings, sessions, and ShotLog persist after a reboot.
- Shot display and local storage continue to work when the MQTT broker is unreachable.

## Prerequisites for production

- Update Electron to a supported release.
- Add E2E tests on physical Linux hardware for USB, audio, Cage, the print dialog, and GPU acceleration.
- Implement MQTT automatic connection at startup and authentication.
- Define procedures for installing, updating, and rolling back the `.deb`.
- Implement the provisioner and `saika-doctor`, and repeatedly validate them from a clean Debian 13 installation.

## References

- [Debian 13 release information](https://www.debian.org/releases/trixie/)
- [Debian Installer: automated installation using preseeding](https://www.debian.org/releases/trixie/amd64/apb.en.html)
- [Debian package: Cage](https://packages.debian.org/trixie/cage)
- [Debian: IPP Everywhere](https://wiki.debian.org/CUPSIPPEverywhere)
- [Debian: driverless printing](https://wiki.debian.org/CUPSDriverlessPrinting)
- [Electron release support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
