# Toone plugin for Claude

See, start and decide on your [Toone](https://trytoone.com) routines from Claude. Toone is a macOS app that runs repeatable, multi-step routines. This plugin lets Claude ask Toone what is running, what is waiting for you and what a run did, and lets you start or stop a routine after you confirm.

## What you need

- macOS with the Toone app open (Direct edition; the App Store edition does not accept outside connections).
- Node.js 20 or newer on your PATH.
- Claude Code, or Cowork running on your computer. It does not work in web or phone chat.

## Install

In Claude Code:

```
/plugin install toone --marketplace mattwebhub/toone-connector
```

## Try these

- "What are my Toone routines doing right now?"
- "What's waiting for me in Toone?"
- "What did the last Reddit Radar run do?"
- "Did we already contact Jane Doe?"
- "Run the weekly report routine." (you are asked to confirm first)

## What it contains

- **Tool server** `server/toone-connector.mjs`, started with `node`. It is the bundled, unminified build of the TypeScript in `src/` of [the repository](https://github.com/mattwebhub/toone-connector); CI fails if the two differ.
- **Skills** `toone-status` and `toone-run`.

## Everything it runs, sends and fetches

- **Runs:** one Node process, the tool server. Nothing else, and no install scripts.
- **Connects to:** only `ws://localhost` on the port the Toone app listens on (9876 unless Toone wrote another to `~/.toone/mcp-server/bridge.json`). It makes no internet requests and sends no data to the plugin's author or anyone else.
- **Reads:** `~/.toone/mcp-server/bridge.json` for the port.
- **Writes:** `~/.toone/connector/state.json`, one random id per workspace so it reuses a single conversation in Toone. No conversation content is stored or logged.
- **Through Toone it can:** read routine names, run summaries and records; and, only after you confirm in Claude's prompt, start a routine, pause, continue or cancel a run, or give a waiting run its inputs. A routine you start does whatever you built it to do, which can include sending or publishing as you.

## Tools

Read (no prompt): `toone_overview`, `toone_waiting`, `toone_routines`, `toone_runs`, `toone_run`, `toone_record_books`, `toone_handled`, `toone_workspaces`.

Act (always asks you): `toone_start`, `toone_control`, `toone_answer`.

## Troubleshooting

- **"Could not reach the Toone app":** open Toone. If it is open, check you have the Direct edition.
- **"This client cannot show a confirmation prompt":** the client does not support MCP elicitation. Start the routine in the Toone app, or use the command line from the repository.
- **Wrong workspace:** say the workspace name, or start Claude in that project's folder.

Support: [GitHub issues](https://github.com/mattwebhub/toone-connector/issues). Security reports: the repository's Security tab.
