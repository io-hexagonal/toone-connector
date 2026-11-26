# Toone connector

[![io-hexagonal/toone-connector MCP server](https://glama.ai/mcp/servers/io-hexagonal/toone-connector/badges/score.svg)](https://glama.ai/mcp/servers/io-hexagonal/toone-connector)

See, start and decide on your [Toone](https://trytoone.com/en) routines from Claude.

Claude is where you talk. Toone is where repeating jobs run. This connector lets Claude ask Toone what is running, what is waiting for you and what a run did, and lets you start or stop a routine after you confirm. It never does the routine's work itself.

It is three things in one small package:

- **A Claude Code plugin** (`plugin/`): 14 tools and two skills.
- **A tool server** (`toone-connector mcp`) for any MCP client.
- **A command line** (`toone-connector status`, `start`, …) for a terminal.

> **Status: 0.2.** Reading, starting, answering, pausing, continuing and cancelling work with the released Toone (1.0.82, Direct edition, macOS), and are confirmed against live runs of a harmless test routine (`pnpm e2e:live`). **Pairing, making a routine and starting an Explore setup need a Toone newer than 1.0.82.** With 1.0.82 the connector connects without pairing and says so in every answer, `toone_make_routine` answers that this Toone cannot do it yet, and `toone_install` shows the listing page. Those three were tried against a development build of Toone, not a released one. Not yet tested: routines with sub-routines, automatic (script) steps, several workspaces at once, and any client other than the test client and Claude Code.

## What you need

- A Mac with the Toone app open, **Direct edition** (the download from [trytoone.com](https://trytoone.com/en)). The App Store edition does not accept outside connections, so the connector cannot reach it.
- Node.js 20 or newer.
- With a Toone that can pair, you allow the connector in Toone the first time (see [Pairing](#pairing)).

Everything goes through the Toone app on the same Mac. Nothing works with the app closed, and nothing works from claude.ai on the web or a phone. The one exception is searching Explore, which reads Toone's public library over the internet.

## Use it in Claude Code

Inside Claude Code:

```
/plugin marketplace add io-hexagonal/toone-connector
/plugin install toone@toone
```

Then ask: "what are my Toone routines doing?", "what's waiting for me?", "did we already contact Jane Doe?", "run the reddit radar".

To try it from a checkout without installing:

```sh
git clone https://github.com/io-hexagonal/toone-connector && cd toone-connector
claude --plugin-dir ./plugin
```

## Use it in another MCP client

The tool server is the npm package `toone-connector`, started with the argument `mcp` over stdio:

```json
{ "mcpServers": { "toone": { "command": "npx", "args": ["-y", "toone-connector", "mcp"] } } }
```

The five tools that act need a client that can show a confirmation prompt (MCP elicitation). In a client that cannot, the read tools work and the others are refused.

## Use it in a terminal

```sh
npm install -g toone-connector
toone-connector pair       # allow the connector in Toone (once)
toone-connector doctor     # check the connection
toone-connector status     # running, waiting, last finished
toone-connector run RUN_ID # one run, one line per step
toone-connector start "reddit radar"   # asks before starting
toone-connector make-routine "Every Monday, list this week's top launches"   # asks first
toone-connector explore grants         # search Toone Explore
toone-connector install LISTING_ID     # asks first; you finish in Toone
```

`toone-connector explore grants` searches [Toone Explore](https://trytoone.com/en/explore), the public library of routines people have shared. That search finds, for example, [Find Funding](https://trytoone.com/en/explore/routines/find-funding-hn64ep4n) and the [Find and Apply to Grants](https://trytoone.com/en/explore/bundles/find-and-apply-to-grants-tf7lj72j) bundle.

`toone-connector help` lists every command. From a checkout, `pnpm install && pnpm build`, then `node dist/main.js` in place of `toone-connector`.

## The tools

| Tool | Does | Asks first |
|---|---|---|
| `toone_overview` | Running or paused runs, what is waiting, last finished | no |
| `toone_waiting` | Everything blocked on you; for a failed step, the choices (retry, fix, stop) | no |
| `toone_routines` | List or search routines | no |
| `toone_runs` | Past runs | no |
| `toone_run` | One run: a line per step | no |
| `toone_record_books` | The lists routines keep of what they handled | no |
| `toone_handled` | Look up who or what was already handled | no |
| `toone_workspaces` | Projects Toone knows | no |
| `toone_explore` | Search Toone Explore for shared routines and bundles, or see what one needs | no |
| `toone_start` | Run a routine | **yes** |
| `toone_control` | Pause, continue or cancel a run; continue retries a failed step held for you | **yes** |
| `toone_answer` | Give a waiting run its inputs | **yes** |
| `toone_install` | Start Toone's setup for an Explore routine, or show a bundle in Toone | **yes** |
| `toone_make_routine` | Hand Toone a description; Toone's assistant drafts the routine and you publish it in Toone | **yes** |

Answers are short on purpose. A run that is 80,000 characters inside Toone comes back as about 2,000.

`toone_explore` reads Toone's public Explore library (the one the app and trytoone.com show) over the internet; only your search words or a listing id are sent. Listings are written by other people, so read them as such. `toone_install` asks you first, naming the listing, the project open in Toone, whether it comes with code files and what setup will ask for. For a routine, Toone then starts its own setup conversation and shows an "Open" notice; its assistant asks you there about code files and inputs, and nothing is installed until you finish. The connector never answers those questions. A bundle has no setup conversation, so Toone shows its Explore page instead and you press "Use this bundle" there. A Toone too old to start setup for the connector gets the listing page, as before; the answer says which of the two happened.

When the connector is paired, Toone does not tell it where the app is installed, so Toone shows an "Open" notice for the page rather than the connector opening it. The same happens whenever Toone will not say where it runs from. Where Toone cannot show the notice either, the answer says where to find the listing in Explore.

`toone_make_routine` asks you first, naming the project and quoting the start of the description. Toone's own assistant then drafts the routine in Toone and may ask you questions there; you review and publish it in Toone, and nothing runs until you do. If your Toone plan's routine limit is reached, Toone refuses and the connector says so.

## Pairing

Toone asks you before an outside program can use it.

1. The first time the connector talks to Toone (a tool call in Claude, or `toone-connector pair` in a terminal), it asks Toone to pair and shows a six-digit code: "check that the code is 482913".
2. Toone shows a prompt with the connector's name and the same code. Check the codes match, choose **Read only** or **May start and control routines**, and click **Allow**.
3. Toone hands the connector a key, once. The connector keeps it in `~/.toone/connector/credential.json`, readable only by your macOS user, and uses it for every later connection.

From then on Toone checks the key on every connection, and the connector checks that it is talking to the same Toone: a program that only holds Toone's port gets nothing. A read-only connector can look but cannot start, pause, continue, cancel or answer runs, make a routine or install from Explore; Toone refuses those itself, and the connector says how to pair again to allow them. Settings › Connected Apps in Toone lists the connector with when it was paired and last used, and **Revoke** disconnects it at once.

From Claude, the first tool call answers "Toone is asking you to allow this connector … code 482913"; allow it in Toone and ask again. If you decline, the connector stops asking; run `toone-connector pair` to try again. `toone-connector pair --read-only` suggests read only; `toone-connector unpair` forgets the key on this Mac (revoke it in Toone too).

Against a Toone version from before pairing, the connector connects without pairing, as 0.1 did, and every answer says the connection is not paired. If Toone is set to **Only allow paired apps to connect**, an unpaired connector is refused and told to run `toone-connector pair`.

## How confirmation works

A routine can send messages or publish as you. Text from the web can also end up in Claude's context. So Claude must not be able to start one by itself.

The five tools that act ask **you** through the client's own prompt (MCP elicitation), not through the conversation. No answer, a "no", or an unticked box means nothing happens. A client that cannot show the prompt is refused. `TOONE_CONNECTOR_UNPROMPTED=allow` turns the question off; only set it where nothing untrusted reaches the model.

This is the connector's own safeguard, on top of Toone's: Toone decides whether the connector may connect at all and whether it may act (pairing, above). Toone does not ask again for each action. See [SECURITY.md](SECURITY.md).

Pause, continue and cancel are applied by Toone a moment after it accepts them. The connector waits up to 20 seconds and reports the result, including when Toone accepted a request but could not apply it.

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
    out/explore/             Toone's public Explore catalog
plugin/                      the Claude Code plugin (manifest, skills, bundled server)
```

```sh
pnpm verify   # types, unit tests, architecture check, build
pnpm e2e      # 23 checks against the running Toone app; never confirms an action.
              # With a Toone that can pair and no pairing yet, Toone shows its pairing prompt: pair first
pnpm e2e:live "Connector E2E (safe to delete)" --workspace NAME
              # confirms real actions on ONE named routine; refuses to run without one
```

`e2e:live` starts real runs. Point it only at a routine that does nothing outside its own run: one per-run input, then a few steps that only reply "OK". It never matches a routine loosely; the name or id must be exact.

## Known issues

These are in the Toone app, not the connector:

- **Pausing right as a step starts or ends can break the run** (seen on Toone 1.0.82). Paused within a second or two of a step starting, the step failed after Continue. Paused just after a step finished, Continue was refused and the run stayed paused until cancelled. The connector reports both instead of claiming success. Pausing while a step is under way works.
- **Runs started from the connector report back into its conversation in Toone.** Toone posts each pause, wait and finish there, and its own assistant replies to each one, which uses a model turn.

## Not yet

Notes for a routine (the Toone app does not offer them to connectors yet), answering the questions Toone asks while it drafts a routine or sets one up (answer them in Toone), the Continue or Finish question a routine can ask at the end of a run (answer it in Toone for now), triggers from other apps, phone notifications, and use from claude.ai or the phone (that needs a hosted connector).

## Licence

Apache 2.0. "Toone" and the Toone logo are trademarks and are not covered by the licence.
