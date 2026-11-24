# Security

## Reporting a vulnerability

Report it privately: use the "Report a vulnerability" button on [this repository's Security tab](https://github.com/io-hexagonal/toone-connector/security/advisories/new), or write to hello@trytoone.com with "Security" in the subject. Please do not open a public issue. Say which version you used (`toone-connector --version`, and Toone's own version) and how to reproduce it. Fixes go into the latest release; older versions are not patched.

## What this connector can reach

It connects to the Toone app on the same Mac over a loopback WebSocket. Through it, it can read routine and run summaries and records, and, after the person confirms, start or control a run, hand Toone a description to draft a routine, or start Toone's setup for an Explore routine. It does not drive the browser, read files, edit records, publish a draft or answer Toone's setup questions. Toone enforces the same limits on its side: a paired connector may only use the routine operations, and a read-only one only the reads.

## Pairing

The person allows the connector once in the Toone app, after comparing a six-digit code the connector and Toone both show, and chooses read only or start-and-control. Toone then gives the connector a 32-byte key. On every later connection the connector proves it holds the key (an HMAC over a fresh random value), and Toone proves it holds the same key back; the key itself never crosses the connection again. The connector refuses a program on Toone's port that cannot give that proof. Revoking in Toone (Settings › Connected Apps) disconnects the connector and makes the key useless.

To search Explore it also reads Toone's public catalog over HTTPS (`api.trytoone.com`, or `TOONE_EXPLORE_API`). Only the search words or a listing id are sent, with no account. Listings are written by other people and reach the model as untrusted text. Installing never happens in the connector: after the person confirms, it asks the running Toone app to start its own setup conversation (or, for a bundle or an older Toone, to show the listing), and the app's setup asks the person about code files and inputs before anything is installed.

## What is tested

- **Confirmation before every action.** Starting, pausing, continuing, cancelling, answering, making a routine and installing each ask the person through the MCP client's own prompt. A "no", an unticked box or a client that cannot ask means nothing is sent to Toone (`pnpm e2e`, every release).
- **Actions against live runs.** With a "yes", each action was confirmed end to end against live runs of a harmless test routine on one Mac: start, answer a waiting input, pause, continue, cancel, and read the final states back (`pnpm e2e:live`). The confirmation names the routine for start, pause, continue, cancel and answer.
- **Pairing, making a routine and starting setup** are tested against a stand-in for the app (started, already started, plan limit, read-only refusal, bundle and older-app fallbacks) and were tried by hand against a development build of Toone. They need a Toone newer than 1.0.82, which is not released yet.
- **Not tested:** an approved pairing end to end against a released Toone, routines with sub-routines, steps held after a failure, automatic (script) steps, several workspaces at once, and MCP clients other than the test client and Claude Code. Treat those as unverified.

## Known limits

- **Other software running as you is not kept out.** The key is stored in `~/.toone/connector/credential.json` with permissions 0600 (in a 0700 folder). That stops other macOS users, not other programs running as you, which can read the file, or read Toone's own data directly. Pairing narrows who can use Toone's connection; it is not a sandbox.
- **Unpaired programs can still connect by default.** Toone keeps accepting unpaired local programs unless the person turns on "Only allow paired apps to connect" in Toone, because hand-registered tool servers would otherwise stop working. With it off, pairing limits what the connector can do, not what other programs can do.
- **Pairing trusts first use.** While pairing there is no key yet, so a program holding Toone's port at that moment could pose as Toone. Nothing would appear in Toone, and the connector would later fail Toone's proof and ask to pair again.
- **Older Toone versions** cannot pair. Against them the connector connects without pairing, as before, and every answer says so.
- **Confirmation depends on the client.** It uses the MCP client's prompt. A client that auto-accepts prompts removes the safeguard. `TOONE_CONNECTOR_UNPROMPTED=allow` and the command line's `--yes` turn the question off on purpose.
- **A description becomes a draft that Toone's assistant works on.** `toone_make_routine` sends the description from the conversation to Toone, where its own assistant drafts the routine and may ask the person questions. Text that reached the model from the web can end up in that description; the confirmation quotes its start, and nothing runs until the person publishes the draft in Toone.
- **Toone's own assistant sees runs the connector starts.** A run started through the connector reports its updates (paused, waiting for input, finished) into the connector's conversation in Toone, and Toone's assistant replies there. A run waiting for an input is offered to that conversation first, so Toone's assistant could answer it before you do. The connector itself never answers without your confirmation.
- **An accepted pause, continue or cancel is not always applied.** Toone applies them after accepting them. The connector waits for the outcome and reports a failure as an error; if Toone is still working on it after 20 seconds, the reply says so rather than claiming success.
- The connector stores one request id per workspace in `~/.toone/connector/state.json`. It is not a secret.
