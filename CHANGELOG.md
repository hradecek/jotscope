# Changelog

All notable changes to Jotscope are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). From v1.0.0 on,
entries below the top are generated automatically by release-please from
[Conventional Commits](https://www.conventionalcommits.org/).

## [1.0.0] - 2026-07-13

Initial public release.

### Features

- Offline JWT decode, inspect, and verify — everything runs locally, no network calls, no telemetry.
- Visual claims tree: typed values, timestamp formatting, nested objects, array chips, and privileged-role flagging.
- Multi-token detection from a pasted URL or blob (e.g. OAuth callback fragments).
- Local history of recently decoded tokens — deduped, capped, disable-able, and clearable in Settings.
- Signature checks with `alg: none` / weak-algorithm warnings and an optional, opt-in JWKS fetch.
- Light and dark themes.
