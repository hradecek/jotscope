# Security Policy

## Reporting a vulnerability

Please report security issues **privately** - do **not** open a public issue.

Use GitHub's private advisory flow:

- Go to the repository's **Security** tab → **Report a vulnerability**, or
- open <https://github.com/hradecek/jotscope/security/advisories/new>

You'll get an acknowledgement, and I'll work on a fix. Once it's resolved and released, the advisory can be published - with credit to you, if you'd like.

## Supported versions

Jotscope is pre-1.x; the latest release (currently **1.0.0**) is the only supported version.

## Scope notes

Jotscope runs entirely in your browser. It makes **no** network requests except an optional, off-by-default fetch of an issuer's public JWKS for signature verification. Decoded tokens and history are stored only in your browser's `localStorage`.

Reports are especially welcome about anything that would contradict that model - token data leaving the browser, unexpected network calls, or issues in clipboard/storage handling.
