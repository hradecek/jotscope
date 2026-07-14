# Releasing

Version bumps and the changelog are handled by
[release-please](https://github.com/googleapis/release-please) — you never edit
them by hand — but **releases are triggered manually**. Merging feature/fix PRs
does *not* start a release; you decide when to cut one.

## The flow

1. **Land changes freely.** Merge as many PRs as you like. Use
   [Conventional Commit](https://www.conventionalcommits.org/) PR titles (a CI
   check enforces this), because they decide the version bump when you do release:
   - `fix: …` → patch (`1.0.1`)
   - `feat: …` → minor (`1.1.0`)
   - `feat!: …` or a `BREAKING CHANGE:` footer → major (`2.0.0`)
   - `docs:`, `chore:`, `ci:`, `refactor:`, `test:` → don't affect the version

   Nothing release-related happens on these merges.
2. **When you're ready to release**, run the workflow manually:
   **Actions → release-please → Run workflow** (or `gh workflow run release-please.yml`).
   It opens a **"chore(main): release X.Y.Z"** PR that bumps `package.json` +
   `manifest.json` and writes `CHANGELOG.md` from everything merged since the last release.
3. **Review and merge that PR.** Merging it automatically:
   - creates the git tag `vX.Y.Z`,
   - publishes the GitHub Release with notes,
   - builds the store zip (`npm run build:zip`) and attaches it to the release,
   - uploads the new version to the Chrome Web Store as a **draft** *(only once the secrets below are set)*.
4. **Publish manually.** Open the [Web Store dashboard](https://chrome.google.com/webstore/devconsole),
   review the uploaded draft, and click **Submit for review**. The current
   version stays live until Google approves the new one.

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

> The workflow uploads a **draft only** (no `--auto-publish`), so you always
> get a final look before submitting for review. To fully automate instead,
> add `--auto-publish` to the upload step in
> `.github/workflows/release-please.yml` — it will then submit for review and
> publish on approval with no manual step.
