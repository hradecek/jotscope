# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please).
You never edit version numbers or the changelog by hand.

## The flow

1. Land changes on `main` using [Conventional Commit](https://www.conventionalcommits.org/)
   messages. With squash-only merges, **the PR title is the commit message**, so
   the PR title must be conventional (a CI check enforces this):
   - `fix: …` → patch (`1.0.1`)
   - `feat: …` → minor (`1.1.0`)
   - `feat!: …` or a `BREAKING CHANGE:` footer → major (`2.0.0`)
   - `docs:`, `chore:`, `ci:`, `refactor:`, `test:` → no release
2. release-please opens/updates a **"chore: release X.Y.Z"** PR that bumps
   `package.json` + `manifest.json` and updates `CHANGELOG.md`. It accumulates
   changes until you're ready.
3. **Merge that PR.** release-please then automatically:
   - creates the git tag `vX.Y.Z`,
   - publishes the GitHub Release with notes,
   - builds the store zip (`npm run build:zip`) and attaches it to the release,
   - uploads & publishes to the Chrome Web Store *(only once the secrets below are set)*.

Build the package locally anytime with `npm run build:zip` → `dist/jotscope.zip`
(an allowlist of just the runtime files — no docs, tests, or scripts).

## Chrome Web Store secrets

Add these as repository secrets (Settings → Secrets and variables → Actions).
Until they exist, the store step is skipped — releases still get the zip attached.

| Secret | Where it comes from |
| --- | --- |
| `CWS_EXTENSION_ID` | The extension's ID in the Web Store dashboard |
| `CWS_CLIENT_ID` | Google Cloud OAuth client (Chrome Web Store API enabled) |
| `CWS_CLIENT_SECRET` | Same OAuth client |
| `CWS_REFRESH_TOKEN` | Generated once via the OAuth consent flow for that client |

See the [Chrome Web Store API docs](https://developer.chrome.com/docs/webstore/using-api)
for generating the OAuth client and refresh token. The upload uses
[`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli).

> `--auto-publish` sends the new version straight to review and publishes on
> approval. To stage a draft instead (publish manually in the dashboard), drop
> that flag in `.github/workflows/release-please.yml`.
