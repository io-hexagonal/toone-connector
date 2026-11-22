# Toone connector

See, start and decide on your [Toone](https://trytoone.com) routines from Claude.

Claude is where you talk. Toone is where repeating jobs run. This connector lets Claude ask Toone what is running, what is waiting for you and what a run did, and lets you start or stop a routine after you confirm. It never does the routine's work itself.

It is three things in one small package:

- **A Claude Code plugin** (`plugin/`): 11 tools and two skills.
- **A tool server** (`toone-connector mcp`) for any MCP client.
- **A command line** (`toone-connector status`, `start`, …) for a terminal.

> **Status: 0.1, works on one machine.** Reads are tested against a running Toone app. Starting, pausing, continuing, cancelling and answering are tested up to the confirmation; they have not yet been confirmed against a live run. Nothing is published to npm or a plugin directory.

## What you need

- macOS with the Toone app open, **Direct edition**. The App Store edition does not accept outside connections.
- Node.js 20 or newer.

## Use it in Claude Code

```sh
git clone https://github.com/mattwebhub/toone-connector && cd toone-connector
claude --plugin-dir ./plugin
```

Then ask: "what are my Toone routines doing?", "what's waiting for me?", "did we already contact Jane Doe?", "run the reddit radar".

To install it for every session, inside Claude Code:

```
/plugin marketplace add mattwebhub/toone-connector
/plugin install toone@toone
```

## Use it in a terminal

```sh
pnpm install && pnpm build
node dist/main.js doctor     # check the connection
node dist/main.js status     # running, waiting, last finished
node dist/main.js run RUN_ID # one run, one line per step
node dist/main.js start "reddit radar"   # asks before starting
```

## The tools

| Tool | Does | Asks first |
|---|---|---|
| `toone_overview` | Running or paused runs, what is waiting, last finished | no |
| `toone_waiting` | Everything blocked on you | no |
| `toone_routines` | List or search routines | no |
| `toone_runs` | Past runs | no |
| `toone_run` | One run: a line per step | no |
| `toone_record_books` | The lists routines keep of what they handled | no |
| `toone_handled` | Look up who or what was already handled | no |
| `toone_workspaces` | Projects Toone knows | no |
| `toone_start` | Run a routine | **yes** |
| `toone_control` | Pause, continue or cancel a run | **yes** |
| `toone_answer` | Give a waiting run its inputs | **yes** |

Answers are short on purpose. A run that is 80,000 characters inside Toone comes back as about 2,000.

## How confirmation works

A routine can send messages or publish as you. Text from the web can also end up in Claude's context. So Claude must not be able to start one by itself.

The three tools that act ask **you** through the client's own prompt (MCP elicitation), not through the conversation. No answer, a "no", or an unticked box means nothing happens. A client that cannot show the prompt is refused. `TOONE_CONNECTOR_UNPROMPTED=allow` turns the question off; only set it where nothing untrusted reaches the model.

This is the connector's own safeguard. The Toone app does not yet ask for consent from outside callers; see [SECURITY.md](SECURITY.md).

## How it is built

Ports and adapters, checked by [Zoner](https://github.com/io-hexagonal/zoner) on every `pnpm verify`:

```
src/
  main.ts                    wiring
  domain/                    routines, runs, waiting items, records: plain data and rules
  application/
    connector-service.ts     the use cases
    ports/in/                what the connector offers
    ports/out/               what it needs from the Toone app
  adapters/
    in/mcp/                  the tools Claude sees
    in/cli/                  the command line
    out/bridge/              the loopback connection to the Toone app
plugin/                      the Claude Code plugin (manifest, skills, bundled server)
```

```sh
pnpm verify   # types, unit tests, architecture check, build
pnpm e2e      # 15 checks against the running Toone app; never confirms an action
```

## Not in 0.1

Search and install from Explore, "make this a routine", notes for a routine, the proceed decision at the end of a run, triggers from other apps, phone notifications, and use from claude.ai or the phone (that needs a hosted connector).

## Licence

Apache 2.0. "Toone" and the Toone logo are trademarks and are not covered by the licence.
