# Toone plugin for Claude

See, start and decide on your [Toone](https://trytoone.com) routines from Claude. Toone is a macOS app that runs repeatable, multi-step routines. This plugin lets Claude ask Toone what is running, what is waiting for you and what a run did, and lets you start or stop a routine after you confirm.

## What you need

- macOS with the Toone app open (Direct edition; the App Store edition does not accept outside connections). Pairing, making a routine and starting an Explore setup need a Toone newer than 1.0.82; with 1.0.82 the plugin says what the app cannot do yet.
- Node.js 20 or newer on your PATH.
- Claude Code, or Cowork running on your computer. It does not work in web or phone chat.

## Install

In Claude Code:

```
/plugin marketplace add io-hexagonal/toone-connector
/plugin install toone@toone
```

## Try these

- "What are my Toone routines doing right now?"
- "What's waiting for me in Toone?"
- "What did the last Reddit Radar run do?"
- "Did we already contact Jane Doe?"
- "Run the weekly report routine." (you are asked to confirm first)
- "Make this a Toone routine." (Toone drafts it; you publish it in Toone)

## What it contains

- **Tool server** `server/toone-connector.mjs`, started with `node`. It is the bundled, unminified build of the TypeScript in `src/` of [the repository](https://github.com/io-hexagonal/toone-connector); CI fails if the two differ.
- **Skills** `toone-status` and `toone-run`.

## Everything it runs, sends and fetches

- **Runs:** one Node process, the tool server. Nothing else, and no install scripts.
- **Connects to:** only `ws://localhost` on the port the Toone app listens on (9876 unless Toone wrote another to `~/.toone/mcp-server/bridge.json`). For Explore searches it also reads Toone's public catalog (`api.trytoone.com`), sending only the search words or a listing id. It sends no data to the plugin's author or anyone else.
- **Reads:** `~/.toone/mcp-server/bridge.json` for the port.
- **Writes:** `~/.toone/connector/state.json`, one random id per workspace so it reuses a single conversation in Toone; and `~/.toone/connector/credential.json` (permissions 0600), the key Toone gives the connector when you allow it. No conversation content is stored or logged.
- **Pairing:** the first time, a Toone that can pair asks you to allow the connector and shows a six-digit code the connector also shows. You choose read only or start-and-control; Toone enforces it.
- **Through Toone it can:** read routine names, run summaries and records; and, only after you confirm in Claude's prompt, start a routine, pause, continue or cancel a run, give a waiting run its inputs, hand Toone a description to draft a routine (you publish it in Toone), or start Toone's setup for an Explore routine (you finish it in Toone). A routine you start does whatever you built it to do, which can include sending or publishing as you.

## Tools

Read (no prompt): `toone_overview`, `toone_waiting`, `toone_routines`, `toone_runs`, `toone_run`, `toone_record_books`, `toone_handled`, `toone_workspaces`, `toone_explore`.

Act (always asks you): `toone_start`, `toone_control`, `toone_answer`, `toone_install`, `toone_make_routine`.

## Troubleshooting

- **"Could not reach the Toone app":** open Toone. If it is open, check you have the Direct edition.
- **"Toone is asking you to allow this connector":** in Toone, check the code matches, choose what it may do, click Allow, then ask again.
- **"Toone did not accept this connector's pairing" or "could not prove it is the Toone app":** it was revoked, or Toone was reinstalled. Run `node <plugin>/server/toone-connector.mjs pair` in a terminal.
- **"This client cannot show a confirmation prompt":** the client does not support MCP elicitation. Start the routine in the Toone app, or use the command line from the repository.
- **"This connector is paired read only":** run `node <plugin>/server/toone-connector.mjs pair` in a terminal and choose "May start and control routines" in Toone.
- **Wrong workspace:** say the workspace name, or start Claude in that project's folder.

Support: [GitHub issues](https://github.com/io-hexagonal/toone-connector/issues). Security reports: the repository's Security tab.
