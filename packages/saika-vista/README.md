<!-- SPDX-License-Identifier: MIT -->

# Saika Vista

Saika Vista is the Saika suite's spectator display application. One operator PC configures individual monitors on local and remote Vista PCs. Lane supplies targets and scores; Director also supplies standings and result publication states. Vista cannot start, stop, score, assign or adjudicate a competition.

## Run and package

From the repository root, install the pinned Node.js and npm versions from `package.json`, then:

```sh
npm install
npm run dev --workspace=@sasakiuri/saika-vista
npm run build --workspace=@sasakiuri/saika-vista
npm run test --workspace=@sasakiuri/saika-vista
npm run test:e2e --workspace=@sasakiuri/saika-vista
```

Build installers on the respective OS with `build:win`, `build:mac` or `build:linux`. The packaged application includes its renderer, runtime, fonts supplied by the operating system, and third-party license notices. It does not download application assets or require an internet account at venue startup. Use an operating system with Japanese fonts installed when displaying Japanese athlete names.

The application uses the same Electron version as Lane and Director. The initial installation targets are Windows 10/11 x64, macOS 12+ x64/arm64 and Ubuntu 22.04+ x64 desktop. The macOS floor follows the pinned Electron 43 runtime; see [Electron compatibility changes](https://www.electronjs.org/docs/latest/breaking-changes/). Platform packages must pass their native CI jobs and venue acceptance before deployment. This repository's implementation verification does not substitute for a venue's monitor, graphics driver and network checks.

## Set up a venue

1. In Lane or Director, open **Settings → Vista**, enable spectator sharing and read the endpoint and pairing secret on that PC. Start a supported standard individual competition. Air rifle, air pistol, beam rifle and beam pistol qualification and finals have explicit display definitions.
2. In Vista, open **Data sources**. Use **Discover devices**, select the intended candidate and enter its pairing secret. Manual endpoints work across subnets where discovery is unavailable. A discovery result is a candidate; pairing pins the source's stable identity.
3. In **Audience screens**, add a screen on the intended monitor, choose its source and competition/session, then select fixed lanes or Director athletes. Edit the draft and choose **Apply to screen**. Standings require a single Director subject; multiple Lane subjects can share a target grid.
4. Use **Identify** to locate the physical screen. Check both the configuration persisted by the display PC and the audience renderer's acknowledgement. An offline or disconnected monitor is never shown as currently rendering.
5. For additional PCs, install and start Vista there. In **Display PCs**, read that PC's endpoint and secret, then pair it from the operator PC. Each physical monitor has its own configuration. A PC has one registered controller; release it from the controller or revoke control locally before transferring ownership. A managed display PC cannot manage other PCs. Disconnect an operator PC's display PCs before registering it under another controller.

Sharing uses application-encrypted HTTP over the venue LAN. Lane listens on TCP 45831, Director on TCP 45832, and Vista saves its initially allocated TCP port for subsequent launches. Device discovery uses IPv4 multicast `239.255.83.37:45837` with a local-link TTL. Permit these connections through the host firewall on the venue network. No MQTT broker or separately installed communication service is required for Lane-only display.

Keep device clocks within 30 seconds of each other, including on an offline LAN. The authenticated transport rejects expired requests; its clock synchronization message means the PCs' clocks should be synchronized before retrying. Countdown displays apply their own stricter confirmation checks.

## Operating screens

- Choose target grids, athlete focus, Director standings or final summaries. Page density, fixed/automatic paging, page duration, zoom and shot filters are independent per screen. Shot filters operate within the participant's current sighting, match or shoot-off mode and preserve competition totals. Target cards and ranking rows scale to fit the screen; choose fewer positions for larger text and targets. The density limit applies to one page, not the total number of lanes or monitors.
- Final shows target cards for live or reference standings. For competition results, it shows the complete result scope with Director's result names, scores, places and classifications, together with the supplied publication state. Lane and athlete selections stay saved for target views; they do not filter result rows. Page counts and density follow the displayed result rows.
- **Standby** temporarily hides a screen while acquisition and storage continue. **Resume display** returns to the same selected subjects. A source's next session never silently replaces the selected competition.
- A label belongs to its selected subject. It does not change registered athlete information. Select specific lane IDs to keep vacant/disconnected positions in a fixed layout; athlete tracking follows Director's confirmed assignments.
- Targets use the provider's stored definition and millimetre coordinates. Missing coordinates are not plotted at the center. The dashed locator is a visibility aid, distinct from the supplied shot diameter. Scores, classifications, rankings and publication state are supplied by the source.
- Match totals remain identified during sighting and shoot-off fire. Current sighting and shoot-off series sums are shown as unavailable when the source only supplies match series totals.
- Saved, incomplete and stale data remain explicitly marked. Previously official results are not described as currently official while their publication status cannot be reconfirmed. A clock reaching zero does not end a competition or certify a result.

## Startup and recovery

Enable **Open this audience screen automatically when Vista starts** for each monitor and **Start Vista at login on this PC** in Display PCs. Windows/macOS use the operating system's login-item facility. Linux installs a per-user XDG autostart entry; the desktop session must support it. Login startup is available in packaged builds. OS login and machine power-on remain outside Vista. Active audience windows request prevention of display sleep; confirm monitor firmware, screen-lock and desktop power policy at the venue.

When the primary monitor restores an audience screen, Vista keeps the operator window closed so it cannot cover that display. A managed display PC keeps accepting its controller's connections even when all windows are closed, so screens can be added again remotely. Launch Vista again to open the operator window when settings need attention; use the application menu's Quit action to stop Vista on that PC.

Vista saves configuration, pairing and selected snapshots in `vista.json` in Electron's application user-data directory. Atomic file replacement preserves the preceding file on failed writes. Do not delete this directory while its saved displays are needed. Back it up with the application stopped; it contains pairing secrets and athlete display data. Unsupported document versions, invalid authority/settings and malformed JSON are preserved and prevent startup instead of being replaced with defaults.

Each saved snapshot is validated separately. An invalid snapshot stays unchanged in the saved file while valid subjects and screen settings remain usable. The operator sees the affected source/subject, or the entry number if its identity cannot be read. A freshly validated snapshot can restore that subject without deleting the invalid original, including an unsupported snapshot version; restart uses the valid copy. An entry whose identity is unreadable continues to show a diagnostic. Invalid received updates retain the preceding valid snapshot and report an error while unrelated subjects continue updating; rejected network payloads are not archived.

After restart, saved data is marked unconfirmed until the exact source and subject respond. Standby survives restart. Replacing or disconnecting a monitor closes its audience window; assign the replacement explicitly. When a remote PC is offline, requested configuration and the last confirmed applied revision remain distinct. Disconnecting a remote PC cannot complete until that PC acknowledges the release; local revocation provides recovery when the old controller is absent.

A rejected screen setting retains its preceding applied selection and reports the error on that screen. Other screens on the same PC continue receiving updates and accepting settings.

Use **Revoke remote controller** on the display PC to invalidate the old pairing secret and controller session. Then pair the replacement operator with the new secret. Neither old queued frames nor old configuration revisions are accepted after the ownership change.

## Validation scope

Automated coverage includes encrypted source/peer exchange, isolation of operator IPC from audience windows, snapshot correction and ordering, durable restoration, ownership and replay rejection, configuration application, target rendering, paging and publication labels. Electron end-to-end tests exercise a real source connection, actual audience window, rendering acknowledgement, standby and offline restart.

The 100-lane/12-hour physical acceptance scenario from the [requirements](../saika-docs/vista/REQUIREMENTS.md) still requires representative PCs, network links and monitors. Do not interpret unit tests or a simulated clock as a completed 12-hour venue test. See the [architecture decision](../../docs/adr/0016-vista-display-architecture.md) for acquisition and storage boundaries.
