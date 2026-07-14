# Changelog

All notable changes to Jotscope are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). From v1.0.0 on,
entries below the top are generated automatically by release-please from
[Conventional Commits](https://www.conventionalcommits.org/).

## [1.1.0](https://github.com/hradecek/jotscope/compare/jotscope-v1.0.0...jotscope-v1.1.0) (2026-07-14)


### Features

* animate the empty-state brand mark on open ([#2](https://github.com/hradecek/jotscope/issues/2)) ([d37508a](https://github.com/hradecek/jotscope/commit/d37508a4218d5558bb79d0c423158d753a2a0310))


### Bug Fixes

* defer the empty-state animation ~1s so it lands after open ([#4](https://github.com/hradecek/jotscope/issues/4)) ([1716a81](https://github.com/hradecek/jotscope/commit/1716a81d23e7599fb956610370347237d4492311))

## [1.0.0] - 2026-07-13

Initial public release.

### Features

- Offline JWT decode, inspect, and verify — everything runs locally, no network calls, no telemetry.
- Visual claims tree: typed values, timestamp formatting, nested objects, array chips, and privileged-role flagging.
- Multi-token detection from a pasted URL or blob (e.g. OAuth callback fragments).
- Local history of recently decoded tokens — deduped, capped, disable-able, and clearable in Settings.
- Signature checks with `alg: none` / weak-algorithm warnings and an optional, opt-in JWKS fetch.
- Light and dark themes.
