# Security

Report a vulnerability privately with GitHub's "Report a vulnerability" button on this repository's Security tab. Please do not open a public issue.

## What this connector can reach

It connects to the Toone app on the same Mac over a loopback WebSocket. Through it, it can read routine and run summaries and records, and, after the person confirms, start or control a run. It does not drive the browser, read files, or edit records.

## What is tested

- **Confirmation before every action.** Starting, pausing, continuing, cancelling and answering each ask the person through the MCP client's own prompt. A "no", an unticked box or a client that cannot ask means nothing is sent to Toone (`pnpm e2e`, every release).
- **Actions against live runs.** With a "yes", each action was confirmed end to end against live runs of a harmless test routine on one Mac: start, answer a waiting input, pause, continue, cancel, and read the final states back (`pnpm e2e:live`). The confirmation names the routine for start, pause, continue, cancel and answer.
- **Not tested:** routines with sub-routines, steps held after a failure, automatic (script) steps, several workspaces at once, and MCP clients other than the test client and Claude Code. Treat those as unverified.

## Known limits

- **The Toone app (Direct edition) does not authenticate local callers.** Any program on the Mac can use the same connection without this connector. The confirmation here protects against a model being talked into acting; it does not protect against other software on the machine. Pairing and in-app consent belong in the app.
- **Confirmation depends on the client.** It uses the MCP client's prompt. A client that auto-accepts prompts removes the safeguard. `TOONE_CONNECTOR_UNPROMPTED=allow` and the command line's `--yes` turn the question off on purpose.
- **Toone's own assistant sees runs the connector starts.** A run started through the connector reports its updates (paused, waiting for input, finished) into the connector's conversation in Toone, and Toone's assistant replies there. A run waiting for an input is offered to that conversation first, so Toone's assistant could answer it before you do. The connector itself never answers without your confirmation.
- **An accepted pause, continue or cancel is not always applied.** Toone applies them after accepting them. The connector waits for the outcome and reports a failure as an error; if Toone is still working on it after 20 seconds, the reply says so rather than claiming success.
- The connector stores one request id per workspace in `~/.toone/connector/state.json`. It is not a secret.
