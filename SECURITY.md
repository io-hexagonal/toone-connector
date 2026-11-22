# Security

Report a vulnerability privately with GitHub's "Report a vulnerability" button on this repository's Security tab. Please do not open a public issue.

## What this connector can reach

It connects to the Toone app on the same Mac over a loopback WebSocket. Through it, it can read routine and run summaries and records, and, after the person confirms, start or control a run. It does not drive the browser, read files, or edit records. Toone enforces the same limits on its side: a paired connector may only use the routine operations, and a read-only one only the reads.

## Pairing

The person allows the connector once in the Toone app, after comparing a six-digit code the connector and Toone both show, and chooses read only or start-and-control. Toone then gives the connector a 32-byte key. On every later connection the connector proves it holds the key (an HMAC over a fresh random value), and Toone proves it holds the same key back; the key itself never crosses the connection again. The connector refuses a program on Toone's port that cannot give that proof. Revoking in Toone (Settings › Connected Apps) disconnects the connector and makes the key useless.

## Known limits

- **Other software running as you is not kept out.** The key is stored in `~/.toone/connector/credential.json` with permissions 0600 (in a 0700 folder). That stops other macOS users, not other programs running as you, which can read the file, or read Toone's own data directly. Pairing narrows who can use Toone's connection; it is not a sandbox.
- **Unpaired programs can still connect by default.** Toone keeps accepting unpaired local programs unless the person turns on "Only allow paired apps to connect" in Toone, because hand-registered tool servers would otherwise stop working. With it off, pairing limits what the connector can do, not what other programs can do.
- **Pairing trusts first use.** While pairing there is no key yet, so a program holding Toone's port at that moment could pose as Toone. Nothing would appear in Toone, and the connector would later fail Toone's proof and ask to pair again.
- **Older Toone versions** cannot pair. Against them the connector connects without pairing, as before, and every answer says so.
- **Confirmation depends on the client.** Actions use the MCP client's prompt. A client that auto-accepts prompts removes that safeguard; Toone's read-only scope still applies.
- The connector stores one request id per workspace in `~/.toone/connector/state.json`. It is not a secret.
