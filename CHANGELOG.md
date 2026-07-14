# Changelog

All notable changes to Jotscope are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). From v1.0.0 on,
entries below the top are generated automatically by release-please from
[Conventional Commits](https://www.conventionalcommits.org/).

## [1.0.1](https://github.com/hradecek/jotscope/compare/jotscope-v1.0.0...jotscope-v1.0.1) (2026-07-14)


### Bug Fixes

* drop unused "storage" permission ([1b68d59](https://github.com/hradecek/jotscope/commit/1b68d59406e2460c86edec19a4d0152b799e151d))
* guard escapeHtml against non-string input ([5cb5f36](https://github.com/hradecek/jotscope/commit/5cb5f3699805f39344837bf82546cbce4ad74ade))

## [1.0.0] - 2026-07-13

Initial public release.

### Features

- Offline JWT decode, inspect, and verify — everything runs locally, no network calls, no telemetry.
- Visual claims tree: typed values, timestamp formatting, nested objects, array chips, and privileged-role flagging.
- Multi-token detection from a pasted URL or blob (e.g. OAuth callback fragments).
- Local history of recently decoded tokens — deduped, capped, disable-able, and clearable in Settings.
- Signature checks with `alg: none` / weak-algorithm warnings and an optional, opt-in JWKS fetch.
- Light and dark themes.
