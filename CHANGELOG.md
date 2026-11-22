# Changelog

All notable changes to the Toone connector. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

- `toone_make_routine` and `toone-connector make-routine`: after the person confirms, hand Toone a description; Toone's own assistant drafts the routine and the person publishes it in Toone. A plan limit and a read-only pairing are reported plainly.

### Changed

- `toone_install` starts Toone's own setup conversation for an Explore routine instead of only opening its page. Bundles, and Toone versions that cannot start setup for the connector, still get the listing page; the answer says which happened.
- When paired, the connector has Toone offer an Explore page with an "Open" notice, because a paired connector may not read the app's details; if Toone cannot, the answer says where to find the listing.
- A read-only pairing's refusal says how to pair again to allow the action.

## [0.1.0] - Unreleased

First release: a Claude Code plugin, a tool server for any MCP client (`toone-connector mcp`) and a command line, for the Toone Mac app (Direct edition).

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
