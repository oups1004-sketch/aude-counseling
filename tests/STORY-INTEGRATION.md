# Story submission integration check

Run `npm ci`, `npm run build`, then `node tests/story-integration-check.cjs`.
The test starts its own production Next server on 127.0.0.1:3187 and an
in-memory PostgreSQL database through PGlite. Override the port with
`AUDE_INTEGRATION_PORT` if necessary. All credentials are isolated test values.

To include Chromium, install Playwright and its browser, then set
`AUDE_BROWSER_MODULE` to the absolute path of the installed `playwright` package.
An optional `AUDE_CHROMIUM_MODULE` accepts a Sparticuz Chromium module path for
restricted execution environments. The existing seven-width browser check is
also run when browser mode is enabled.

Coverage:
- Real production HTTP handlers, admin authentication, INSERT-only PostgreSQL RLS.
- Database commit followed by failed acknowledgement, simultaneous retries,
  and preservation of existing admin notes/reply state and consent timestamps.
- Historical adaptation request survives review, status, importance and note edits.
- Browser mode: reload after failed acknowledgement, re-enter same content,
  one database row, success focus, retry-key cleanup, admin detail/edit/reload,
  filtered CSV download with commas, quotes and multiline content.

Limits:
- The REST transport is a small test adapter, not deployed PostgREST. Production
  gateway/RLS configuration and deployment identity still need live-environment verification.
- Chromium desktop viewport emulation does not verify iOS Safari, mobile keyboards,
  screen readers or an actual Excel application.
- Retry identity survives reload in the same tab via sessionStorage. Story and
  contact data are never persisted. A fresh independent tab or unavailable storage
  does not guarantee deduplication across page loads. Successful receipt clears the key.
- CSV intentionally contains the current filtered list, not checkbox selection;
  the admin API currently returns at most 500 stories. This change does not alter it.
