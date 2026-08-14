# Security policy

## Supported versions

BLE3D is currently an early preview. Security fixes are applied to the latest revision on the primary development branch; older builds are not maintained.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use the repository's **Security → Report a vulnerability** flow to open a private security advisory. If private reporting is unavailable, contact a maintainer privately through the repository owner profile and include only enough information to establish a secure follow-up channel.

Include:

- A concise description and potential impact
- Affected revision, platform, and configuration
- Reproduction steps or a minimal proof of concept
- Whether BLE hardware or physical proximity is required
- Any suggested mitigation

Do not include real bystander device identifiers or private Bluetooth payloads. Use the simulated scanner or sanitized fixtures whenever possible.

## Response expectations

Maintainers will aim to acknowledge a complete report within seven days, assess severity, and coordinate a fix and disclosure timeline. This is a volunteer project, so response times are goals rather than guarantees.

## Security boundaries

BLE3D is intended to scan advertisements locally without connecting to peripherals or transmitting discovery data. Reports involving unexpected network access, unauthorized GATT connections, unsafe payload handling, database exposure, or permission bypasses are especially valuable.
