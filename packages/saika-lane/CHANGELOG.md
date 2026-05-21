# @sasakiuri/saika-lane

## 0.2.5

### Patch Changes

- Include Preparation and IDLE shot impacts in printed score sheets when no Match shots have been recorded yet.

## 0.2.4

### Patch Changes

- Update displayed shot numbers so Preparation and Match use separate continuous sequences, with Preparation reset when the Preparation button is pressed.

## 0.2.3

### Patch Changes

- Preserve the saved lane number across session resets.

## 0.2.2

### Patch Changes

- Change the fullscreen shortcut from Numpad Enter to F11.

## 0.2.1

### Patch Changes

- Stabilize settings persistence by unifying storage around `settings.json`, improving reconnect and legacy settings recovery, and preserving explicit default user preferences.

## 0.2.0

### Minor Changes

- [#30](https://github.com/sasakiuri/oss/pull/30) [`3396210`](https://github.com/sasakiuri/oss/commit/3396210d84f10a8de26c56d8701a43640de7d543) Thanks [@sasakiuri](https://github.com/sasakiuri)! - Enable debug panel in production builds to aid field diagnostics, and fix AudioContext handling so playback resumes reliably after the context has been suspended by the browser during idle periods.
