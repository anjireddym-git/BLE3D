# BLE3D

BLE3D is a local desktop application that discovers nearby advertising Bluetooth Low Energy devices and displays their approximate radial proximity in an interactive 3D scene. The computer running BLE3D is always the origin.

> BLE signal strength can estimate rough distance, but one ordinary Bluetooth receiver cannot measure direction. BLE3D therefore uses stable synthetic angles for readability. It is a proximity visualization, not physical XYZ positioning or trilateration.

## Features

- Non-connecting BLE advertisement discovery through `btleplug`
- Median + EMA RSSI filtering, log-distance ranging, uncertainty, and confidence
- Stable 3D placement with radial uncertainty and interactive camera controls
- Evidence-based device-type labels and icons from advertised names, Bluetooth class, payload signatures, and standard services
- Full Bluetooth SIG company/service assigned-number labels, with identification-confidence explanations
- Constant screen-size device icons with an independent size control; camera zoom never enlarges or shrinks them
- Search and filters for signal, range, identity, services, manufacturers, confidence, and state
- Device aliases, details, historical charts, and guided 1 m / 3 m calibration
- SQLite history with 10-second buckets and one-minute compaction after 24 hours
- Development-only simulated scanner for repeatable demos and tests
- Local-only operation: no analytics, cloud, or network API

## Requirements

- Node.js 20 or later
- Rust stable
- Tauri 2 platform prerequisites
- A Bluetooth Low Energy adapter

### macOS

Install Xcode Command Line Tools or Xcode. BLE3D targets macOS 10.15 or later and includes the required Bluetooth purpose strings. The first scan causes macOS to request Bluetooth permission. If permission was denied, enable BLE3D under **System Settings → Privacy & Security → Bluetooth**.

### Windows

Install Microsoft C++ Build Tools with **Desktop development with C++** and the WebView2 runtime. Windows 10 or newer is recommended for the native BLE backend.

### Linux

Install the Tauri WebKitGTK prerequisites, BlueZ, and D-Bus development packages. The user running BLE3D must be allowed to access the system BlueZ service. Exact package names vary by distribution; common Debian/Ubuntu packages include `libwebkit2gtk-4.1-dev`, `libdbus-1-dev`, `libbluetooth-dev`, and `bluez`.

## Development

```sh
npm install
npm run tauri dev
```

To use deterministic test devices, open **Settings & data**, stop any active scan, enable **Simulated scanner**, save, and start scanning again. The option is compiled out of production builds.

Useful checks:

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

The database is stored in the OS-specific Tauri application-data directory as `ble3d.sqlite3`. Discovery history remains there until **Clear discovery history** is confirmed. Calibration profiles and application settings are preserved by that action and can be removed separately.

## Calibration

Select a live device and choose **Calibrate this device**. Capture it while stationary at exactly 1 meter, then at 3 meters. BLE3D uses trimmed eight-second measurements to calculate the reference RSSI and path-loss exponent. A profile can apply only to that platform identifier or serve as the shared environment fallback.

Calibration improves consistency but cannot eliminate antenna orientation, obstruction, reflections, transmitter variation, or OS-level advertisement filtering. BLE3D exposes these limitations through an uncertainty range and confidence grade instead of presenting the estimate as precise.

## Privacy and identity

BLE3D never connects to discovered peripherals. It stores opaque identifiers supplied by the operating system and does not attempt to merge identifiers heuristically. Some systems rotate or hide device addresses, so one physical device may appear as multiple records over time. Only devices currently broadcasting BLE advertisements can be discovered; classic Bluetooth and non-advertising phones or computers will not appear.

Device-type labels are evidence-based, not guaranteed. A manufacturer ID names the company that registered the advertisement payload format and may identify a chipset or protocol provider rather than the product brand. BLE3D therefore grades labels as **identified**, **probable**, or **limited**, explains the evidence in Device Details, and hides unidentified signals from the map by default. They can be restored with **Advanced filters → Show unidentified signals**.
