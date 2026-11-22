# Security

Report a vulnerability privately with GitHub's "Report a vulnerability" button on this repository's Security tab. Please do not open a public issue.

## What this connector can reach

It connects to the Toone app on the same Mac over a loopback WebSocket. Through it, it can read routine and run summaries and records, and, after the person confirms, start or control a run. It does not drive the browser, read files, or edit records.

## Known limits

- **The Toone app (Direct edition) does not authenticate local callers.** Any program on the Mac can use the same connection without this connector. The confirmation here protects against a model being talked into acting; it does not protect against other software on the machine. Pairing and in-app consent belong in the app.
- **Confirmation depends on the client.** It uses the MCP client's prompt. A client that auto-accepts prompts removes the safeguard.
- The connector stores one request id per workspace in `~/.toone/connector/state.json`. It is not a secret.
