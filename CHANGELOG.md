# Changelog

All notable changes to the Toone connector. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [0.2.1] - 2026-11-24

The repository moved to the Hexagonal organisation.

### Changed

- **New home.** The repository is now `io-hexagonal/toone-connector`. In Claude Code, add it with `/plugin marketplace add io-hexagonal/toone-connector`. The old address still redirects.
- The package's links (repository, issues, security reports) and its MCP Registry name (`io.github.io-hexagonal/toone-connector`) point to the new home. Nothing changes in how the connector works.

## [0.2.0] - 2026-11-24

The first version published to npm. It adds pairing, Toone Explore, failed-step decisions and making a routine. Pairing, making a routine and starting an Explore setup need a Toone app newer than 1.0.82; with 1.0.82 the connector still works as 0.1 did and says what the app cannot do yet.

### Added

- **Pairing.** Toone asks you once to allow the connector, after you compare a six-digit code, and you choose read only or start-and-control. The connector then proves who it is on every connection and checks it is talking to the same Toone. `toone-connector pair`, `pair --read-only` and `unpair`. Against a Toone that cannot pair, it connects as before and every answer says the connection is not paired.
- **Toone Explore.** `toone_explore` and `toone-connector explore` search shared routines and bundles, or show what one listing's setup asks for.
- **Install from Explore.** `toone_install` and `toone-connector install`: after you confirm, Toone starts its own setup conversation for a routine and you finish it there. For a bundle, or a Toone that cannot start setup for the connector, Toone shows the listing page instead; the answer says which happened.
- **Make a routine.** `toone_make_routine` and `toone-connector make-routine`: after you confirm, Toone's own assistant drafts a routine from a description, and you review and publish it in Toone. A plan limit is reported plainly.
- **Failed steps.** `toone_waiting` shows why a step failed and the choices: retry, fix in Toone, or stop. `toone_control` continue retries it unchanged.

### Changed

- 14 tools instead of 11; five of them act, and each asks you first.
- A read-only pairing's refusal says how to pair again to allow the action.
- When Toone will not tell the connector where the app is installed (it does not tell a paired connector), Toone offers the Explore page with an "Open" notice. If Toone cannot do that either, the answer says where to find the listing in Explore.
- Errors keep Toone's own refusal code, so the reason is not lost.
- An answer stays valid JSON when a note about the connection is added; the note is a separate item.

### Fixed

- The tool server ends when its client goes away, also while a connection to Toone is open.

## [0.1.0] - 2026-11-22

Published on GitHub only, never on npm. A Claude Code plugin, a tool server for any MCP client (`toone-connector mcp`) and a command line, for the Toone Mac app (Direct edition).

### Added

- Eight read tools: `toone_overview`, `toone_waiting`, `toone_routines`, `toone_runs`, `toone_run`, `toone_record_books`, `toone_handled`, `toone_workspaces`.
- Three action tools that ask the person first through the client's own prompt (MCP elicitation): `toone_start`, `toone_control` (pause, continue, cancel) and `toone_answer` (give a waiting run its inputs). A client that cannot ask is refused.
- Command line: `status`, `waiting`, `routines`, `runs`, `run`, `books`, `handled`, `start`, `pause`, `continue`, `cancel`, `doctor`, `mcp`.
- Claude Code plugin with the bundled tool server and two skills, `toone-status` and `toone-run`.
- `pnpm e2e:live`: an end-to-end check that confirms each action against a live run of one named test routine.

### Fixed (found by the live check)

- `toone_waiting` now gives the id that `toone_answer` needs. It was empty, so answering a waiting run could not work.
- The confirmation for `toone_answer` names the routine being answered.
- Pause, continue and cancel wait until Toone has applied them, and report it when Toone accepted the request but could not apply it. Before, every accepted request read as done.
- `toone_run` says why a failed step failed.
