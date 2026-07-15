# Privacy Policy ' Jotscope

**Effective date:** 15 July 2026

Jotscope ("the extension") is a JWT (JSON Web Token) inspector that runs entirely
in your browser. This policy explains exactly what the extension does and does
not do with your data. In short: **Jotscope does not collect, transmit, or sell
any personal data, and the developer operates no servers that receive your data.**

## What Jotscope does with your data

### Token decoding ' 100% local
Every JWT you paste or load is decoded, parsed, and (optionally) verified
**locally on your device**, inside the browser. Token contents are never sent to
the developer or any analytics service.

### Data stored on your device
The extension saves the following in your browser's local storage
(`localStorage`), **on your device only** ' it is never uploaded anywhere:

- **Preferences/settings** - e.g. default tab and view, timestamp format,
  weak-algorithm flagging, key-fetch mode, and the expiry-warning threshold.
- **History** (optional) - recently inspected tokens, so you can reopen them.
  History is on by default but can be **turned off** in Settings, and you can
  **clear it** at any time. When history is off, nothing is retained.

Because this data lives only in your browser profile, uninstalling the extension
or clearing browser data removes it.

### Network activity - only optional key fetching
Jotscope makes **no network requests** for normal decoding. The **only** time it
contacts the network is to verify a token's signature using a public key set
(JWKS), and only when you ask it to:

- In **Manual** mode (the default), no keys are fetched automatically. You can
  paste a JWKS URL yourself to verify a signature.
- In **Automatic** mode (opt-in), the extension derives the issuer's
  `.well-known/jwks.json` URL from the token's `iss` claim and fetches it.

In both cases the request is a standard HTTPS `GET` for the **public keys only**.
**Your token and its contents are never transmitted** - verification happens
locally with the downloaded public key. These requests go directly to the key
server you or the token specify; the developer does not operate, proxy, or log
them.

## Permissions

- **`clipboardRead`** - used solely to let you paste a JWT from your clipboard.
  Clipboard contents are processed locally and never transmitted.

Jotscope requests no host permissions and no access to your browsing activity,
tabs, or page content.

## What Jotscope does NOT do

- No analytics, telemetry, tracking, or advertising.
- No accounts, no sign-in, no cookies.
- No selling, sharing, or transmitting of personal data.
- No servers operated by the developer receive your data.

## Children's privacy

Jotscope is a developer tool and is not directed at children. It collects no
personal information from anyone.

## Changes to this policy

If this policy changes, the updated version will be published in the project
repository with a new effective date.

## Contact

Questions about privacy? Please open an issue at
<https://github.com/hradecek/jotscope/issues>.
