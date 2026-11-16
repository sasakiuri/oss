<!-- SPDX-License-Identifier: MIT -->

# Saika Vista

Saika Vista displays targets, scores and standings for spectators. One operator PC configures monitors on local and remote Vista PCs. Lane supplies targets and scores; Director also supplies standings and publication status. Competition controls and adjudication stay in Lane and Director.

## Run and package

From the repository root, install the pinned Node.js and npm versions from `package.json`, then:

```sh
npm ci
npm run dev --workspace=@sasakiuri/saika-vista
npm run build --workspace=@sasakiuri/saika-vista
npm run test --workspace=@sasakiuri/saika-vista
npm run test:e2e --workspace=@sasakiuri/saika-vista
```

Build installers on the respective OS with `build:win`, `build:mac` or `build:linux`. The packaged application includes its renderer, runtime, fonts supplied by the operating system, and third-party license notices. It does not download application assets or require an internet account at venue startup. Use an operating system with Japanese fonts installed when displaying Japanese athlete names.

The application uses the same Electron version as Lane and Director. The initial installation targets are Windows 10/11 x64, macOS 12+ x64/arm64 and Ubuntu 22.04+ x64 desktop. The macOS floor follows the pinned Electron 43 runtime; see [Electron compatibility changes](https://www.electronjs.org/docs/latest/breaking-changes/). Before deployment, run native CI and venue acceptance checks on the target OS, monitors, graphics drivers, and network.

## Set up a venue

1. In Lane or Director, open **Settings → Vista**, enable spectator sharing and read the endpoint and pairing secret on that PC. Start a supported standard individual competition: air rifle, air pistol, beam rifle or beam pistol qualification or finals.
2. In Vista, open **Data sources**. Use **Discover devices**, select the source and enter the secret shown on that PC to register it. Enter the endpoint manually if discovery is unavailable, such as across subnets.
3. In **Audience screens**, add a screen on the intended monitor, choose its source and competition/session, then select fixed lanes or Director athletes. Edit the draft and choose **Apply to screen**. Vista asks before discarding unapplied edits when switching screens or closing the editor. Standings require a single Director subject; multiple Lane subjects can share a target grid.
4. Use **Identify** to locate the physical screen. Check **Settings saved on display PC** and **Displaying** or **On standby** above the editor. Open **Settings and display confirmation** for revision details; **Data reception** shows source freshness separately. Offline or disconnected monitors show that their display cannot be confirmed.
5. For additional PCs, install and start Vista there. Open **Display PCs → Control this PC from another Vista** to read that PC's endpoint and secret, then use **Connect another display PC** on the operator PC. Each physical monitor has its own configuration. A PC has one registered controller; release it from the controller or revoke control locally before transferring ownership. A managed display PC cannot manage other PCs. Disconnect an operator PC's display PCs before registering it under another controller.

Sharing uses application-encrypted HTTP over the venue LAN. Lane listens on TCP 45831, Director on TCP 45832, and Vista saves its initially allocated TCP port for subsequent launches. Device discovery uses IPv4 multicast `239.255.83.37:45837` with a local-link TTL. Permit these connections through the host firewall on the venue network. No MQTT broker or separately installed communication service is required for Lane-only display.

Keep device clocks within 30 seconds of each other, including on an offline LAN. The authenticated transport rejects expired requests; its clock synchronization message means the PCs' clocks should be synchronized before retrying. Countdown displays apply their own stricter confirmation checks.

## Operating screens

The operator and audience screens use a dark theme, consistent with Lane and Director, regardless of the operating system's appearance setting.

- Choose target grids, athlete focus, Director standings or final summaries. Page density, fixed/automatic paging, page duration, zoom and shot filters are independent per screen. Shot filters operate within the participant's current sighting, match or shoot-off mode and preserve competition totals. Target cards and ranking rows scale to fit the screen; choose fewer positions for larger text and targets. The density limit applies to one page, not the total number of lanes or monitors.
- Open **Target appearance** in the screen editor for zoom and shot filters, and **Startup and standby** for automatic opening and standby settings. Screen rows identify the assigned monitor; use the search field to find a screen or PC.
- Final shows target cards for live or reference standings. For competition results, it shows the complete result scope with Director's result names, scores, places and classifications, together with the supplied publication state. Lane and athlete selections stay saved for target views; they do not filter result rows. Page counts and density follow the displayed result rows.
- **Standby** temporarily hides a screen while acquisition and storage continue. The audience sees the standby state and screen name. **Resume display** returns to the same selected subjects. A source's next session never silently replaces the selected competition.
- A label belongs to its selected subject. It does not change registered athlete information. Select specific lane IDs to keep vacant/disconnected positions in a fixed layout; athlete tracking follows Director's confirmed assignments.
- Targets use the provider's stored definition and millimetre coordinates. Missing coordinates are not plotted at the center. The dashed locator is a visibility aid, distinct from the supplied shot diameter. Scores, classifications, rankings and publication state are supplied by the source.
- Match totals remain identified during sighting and shoot-off fire. Current sighting and shoot-off series sums are shown as unavailable when the source only supplies match series totals.
- Saved, incomplete and stale data are marked on screen. Previously official results need confirmation from the source before they can be shown as currently official. A clock reaching zero does not end a competition or certify a result.

## Startup and recovery

Enable **Open this audience screen automatically when Vista starts** for each monitor and **Start Vista at login on this PC** in Display PCs. Windows/macOS use the operating system's login-item facility. Linux installs a per-user XDG autostart entry; the desktop session must support it. Login startup is available in packaged builds. OS login and machine power-on remain outside Vista. Active audience windows request prevention of display sleep; confirm monitor firmware, screen-lock and desktop power policy at the venue.

When saved login startup is enabled, each launch registers the current application path again, including the new AppImage path after an update. A registration failure appears in the operator window while audience restoration and data reception continue. Resolve the operating system error and retry the setting in **Display PCs → This PC**.

When the primary monitor restores an audience screen, Vista keeps the operator window closed so it cannot cover that display. A managed display PC keeps accepting its controller's connections even when all windows are closed, so screens can be added again remotely. Launch Vista again to open the operator window when settings need attention; use the application menu's Quit action to stop Vista on that PC.

Vista saves settings, pairing and selected display data in `vista.json` in the application's data directory. Back up this directory with Vista stopped; it contains pairing secrets and athlete data.

If the file cannot be replaced, Vista keeps the previous data and restores any changed login startup setting. If that restoration fails, check the operating system setting as directed by the error message. If Vista reports **Storage unconfirmed** after replacing the file, the new settings remain in use. Resolve the storage problem and save again before restarting.

An unsupported file version, invalid settings or unreadable JSON prevents startup and leaves the file intact.

If a saved competition or session is invalid, Vista identifies it in the operator view while other displays remain usable. New valid data can restore that display, including after an unsupported snapshot version; the invalid original stays in the file. Unidentifiable entries continue to show an error by entry number. Invalid network updates are rejected without saving them, and the preceding valid data stays on screen.

After restart, saved data stays unconfirmed until its source responds for that competition or session. Standby also survives restart. Replacing or disconnecting a monitor closes its audience window; assign the replacement in Audience screens. For offline PCs, Vista shows the requested settings and the last confirmed settings separately. Removing a remote PC requires its response; if the old controller is unavailable, revoke control on the display PC.

A rejected screen setting retains its preceding applied selection and reports the error on that screen. Other screens on the same PC continue receiving updates and accepting settings.

Use **Revoke remote controller** on the display PC, then pair the replacement operator with the new secret. Requests from the old controller are rejected, including delayed settings changes.

## Application updates

Open **Display PCs → This PC → Application updates** to check the installed version and choose **Check for updates**. Installed releases also check at startup and download available updates when internet access is available. Choose **Restart and install** when the download is ready, then confirm the restart. Normal application shutdown does not install an update.

Save edits and stop audience operations before installing. Restarting closes this PC's audience windows and interrupts its display connections. Update each PC locally, including managed display PCs, to the same release. Development builds do not support updates. Retry a failed check after restoring internet access; an installation failure after shutdown displays an error and restarts the application.

## Validation scope

Automated tests cover source and display PC communication, access control, data updates and recovery, screen settings, target rendering, paging and publication labels. Electron end-to-end tests check source connections, audience windows and display confirmation, standby, shutdown during window loading and offline restart.

The [100-lane, 12-hour venue test](../saika-docs/vista/REQUIREMENTS.md) remains pending and requires representative PCs, network links, and monitors. See [Vista display data](../../ARCHITECTURE.md#vista-display-data) for acquisition and storage.
