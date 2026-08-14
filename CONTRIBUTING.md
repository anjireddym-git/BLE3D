# Contributing to BLE3D

Thank you for helping build BLE3D. Contributions are welcome across Rust, TypeScript, Bluetooth interoperability, signal processing, accessibility, documentation, and platform validation.

## Before you start

- Search existing issues before opening a new one.
- Use the issue templates for reproducible bugs and scoped feature proposals.
- Start a discussion before implementing a large architectural change.
- Do not include captured Bluetooth identifiers, names, or payloads from people who have not consented to their publication.

## Development setup

Install Node.js 20+, Rust stable, the Tauri 2 platform prerequisites, and a BLE adapter. Then run:

```bash
npm install
npm run tauri dev
```

The development-only simulated scanner is the preferred starting point for frontend and database work. Open **Settings & data**, enable **Simulated scanner**, and start a scan.

## Quality gates

Run the checks relevant to your change before opening a pull request:

```bash
npm test
npm run build
cargo fmt --all --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Changes to scanner behavior should include Rust tests. Changes to classification, filtering, or interaction behavior should include frontend tests. Visual changes should include before/after screenshots in the pull request.

## Pull requests

Keep pull requests focused and explain:

1. The user or contributor problem being solved
2. The implementation approach and important trade-offs
3. How the change was tested
4. Platform or hardware limitations
5. Any privacy implications

BLE behavior varies across operating systems and adapters. Hardware reports should include the operating-system version, adapter model when known, whether simulation was disabled, and sanitized logs or screenshots.

## Device classification rules

Identification must remain evidence-based and conservative:

- Prefer standard service UUIDs and explicit payload signatures over broad name matching.
- Do not infer a product type solely from a general-purpose company identifier.
- Label uncertain classifications as probable or limited.
- Add positive and negative test fixtures for new rules.
- Never introduce network fingerprinting or cloud lookup without prior project discussion.

## Signal and positioning changes

Do not present RSSI ranging as exact. Contributions must preserve the distinction between measured radial estimates and synthetic angular placement. Any multi-receiver or direction-finding work should use an explicit capability model and expose calibration quality and uncertainty.

## Documentation

Use clear language, include platform-specific commands where needed, and keep privacy and accuracy limits close to the related feature. Documentation-only pull requests are welcome.

## Conduct and security

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report potential vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
