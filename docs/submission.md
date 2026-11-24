# Submitting the Toone connector

Text and checklists for two listings: the **Claude plugin directory** (the `plugin/` folder) and the **official MCP Registry** (the npm package, described by `server.json`). This is the text for **0.2.0**. Nothing here has been submitted or published. Requirements were read from the sources below on 2026-11-22; re-check them before submitting, since both change.

Sources:

- Claude plugin directory: [Submit your plugin](https://claude.com/docs/plugins/submit), [Plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist), [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference), [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
- MCP Registry: [Quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx), [Package types](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx), [server.json schema 2025-12-11](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).

## Order of work

1. Release `v0.2.1` (see "Releasing" below): this publishes `toone-connector` to npm and creates the GitHub release and the tag the directory listing points at.
2. Publish `server.json` to the MCP Registry (it only stores metadata, so the npm package must exist first).
3. Submit `plugin/` to the Claude plugin directory from the developer portal, at tag `v0.2.1`.

## Releasing

The release workflow (`.github/workflows/release.yml`) runs only when a tag like `v0.2.1` is pushed. It checks that `package.json`, `plugin/.claude-plugin/plugin.json`, `server.json`, the CLI's version and `CHANGELOG.md` agree with the tag (`pnpm release:check`), runs the type check, tests and build, checks the bundled plugin server matches the sources, publishes to npm with provenance, and creates a GitHub release with that version's changelog section as notes.

State on 2026-11-24: versions are 0.2.1 everywhere, the changelog section is dated, `pnpm verify` and `pnpm release:check --tag v0.2.1` pass, and `main` holds the release commit. No tag exists and nothing is on npm.

**What the workflow needs:**

- `NPM_TOKEN`: an npm automation token or a granular token that may publish `toone-connector` (for the first publish of a new name, a granular token needs "read and write" on all packages of the account, or use an automation token). Add it as a repository secret, or as a secret of the `release` environment. The job names the `release` environment; GitHub creates it empty on the first run if it does not exist, and it can be given a required reviewer.
- Nothing else. The GitHub release uses the workflow's own token (`contents: write`), and npm provenance uses GitHub's identity token (`id-token: write`); both are already granted in the workflow.

**Release through the workflow** (from a clean checkout of `main`):

```sh
gh secret set NPM_TOKEN -R io-hexagonal/toone-connector      # paste the token; once
git checkout main && git pull --ff-only
pnpm install --frozen-lockfile && pnpm verify && pnpm release:check --tag v0.2.1
git tag v0.2.1
git push origin v0.2.1
gh run watch -R io-hexagonal/toone-connector                  # the "release" run
npm view toone-connector version                            # 0.2.1
```

**Or by hand, without the workflow** (no provenance, since that needs GitHub's runner):

```sh
git clone https://github.com/io-hexagonal/toone-connector && cd toone-connector
pnpm install --frozen-lockfile && pnpm verify && pnpm release:check --tag v0.2.1 --notes /tmp/notes.md
git diff --exit-code -- plugin/server
npm login
npm publish --access public --provenance=false
git tag v0.2.1 && git push origin v0.2.1
gh release create v0.2.1 --title v0.2.1 --notes-file /tmp/notes.md --verify-tag
```

Use one of the two, not both. On the hand route the tag push still starts the workflow; its publish step then fails (no token, or "version already published"), which is harmless, and the release is the one created by hand.

**Checks before the tag** on a Mac with Toone open (optional but recommended): `pnpm e2e`, and `pnpm e2e:live "Connector E2E (safe to delete)" --workspace <test workspace>`. `pnpm e2e` never confirms an action, but with a Toone that can pair and no pairing stored, the first call makes Toone show its pairing prompt, so pair first (`toone-connector pair`). Neither was run for the 0.2.0 commit, for that reason.

## MCP Registry

**Name:** `io.github.io-hexagonal/toone-connector` (GitHub login namespace, so `mcp-publisher login github` must be done by a public member of the `io-hexagonal` organisation).

**server.json** (in the repository root):

- `name`: `io.github.io-hexagonal/toone-connector`
- `title`: Toone
- `description` (100 characters at most): "See, start and decide on your Toone routines. Needs the Toone Mac app (Direct edition) open."
- `packages[0]`: npm `toone-connector`, `version` pinned, transport `stdio`, positional argument `mcp`.

**Steps** (owner, after the npm release):

```sh
npm view toone-connector@0.2.1 mcpName     # must print io.github.io-hexagonal/toone-connector
brew install mcp-publisher
cd toone-connector                          # the checkout at v0.2.1; server.json is read from here
mcp-publisher login github                  # as a public member of io-hexagonal
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.io-hexagonal/toone-connector"
```

The registry checks that the npm package's `mcpName` equals the `server.json` name, so this only works after npm has 0.2.0. Each later release needs `mcp-publisher publish` again with the new version.

| Requirement | Status |
|---|---|
| Package published on the public npm registry | Not yet: needs the `v0.2.1` release |
| `package.json` has `mcpName` equal to the `server.json` name | Met |
| `server.json` validates against the 2025-12-11 schema | Met (checked with a JSON Schema validator) |
| `description` at most 100 characters | Met (92) |
| `version` is exact, not a range or `latest`, and matches npm | Met for 0.2.0; `release:check` keeps them in step |
| Name in the `io.github.<login>/` namespace, published by that GitHub account | Met for the name; the login is the owner's step |
| Name free on npm and in the registry | `toone-connector` was free on npm on 2026-11-24 (`npm view` answers 404); no `io.github.io-hexagonal/*` entry in the registry on 2026-11-22 |

Optional later: publish to the registry from the release workflow with GitHub OIDC (`mcp-publisher login github-oidc`), which needs `id-token: write` (already granted to the job).

## Claude plugin directory

**Where:** the developer portal at claude.ai/directory/manage → **Submit new** → **Plugin bundle**. Needs a paid Claude plan, a role that can submit, and the GitHub account connected on claude.ai with push access to `io-hexagonal/toone-connector`.

**Portal steps, in order:**

1. Open claude.ai/directory/manage and choose **Submit new**, then **Plugin bundle**.
2. Source: repository `io-hexagonal/toone-connector`, plugin path `plugin`, tag `v0.2.1` (the tag must exist, so release first).
3. Add the icon before the first save (the first icon saved sticks).
4. Let the portal validate; fix anything marked **Blocking**.
5. Fill in the listing text, example prompts and data handling answers below.
6. In the notes for the reviewer, say how to try it (see "For the reviewer").
7. Submit.

**Listing text:**

- Name: `toone`
- Display name: Toone
- Short description (from `plugin.json`): "See, start and decide on your Toone routines from Claude. Needs the Toone app (Direct edition) open on this Mac."
- Long description:

  Toone is a Mac app that runs repeatable, multi-step routines. This plugin lets Claude ask the Toone app on the same Mac what is running, what is waiting for you, what a run did, and who or what a routine already handled. After you confirm in Claude's own prompt, it can start a routine, pause, continue or cancel a run, give a waiting run its inputs, hand Toone a description to draft a new routine, or start Toone's setup for a shared routine from Toone Explore. It never does a routine's work itself, and nothing that changes anything happens without your confirmation. Toone asks you once to allow the plugin, and you choose whether it may only read or also start and control routines. It needs the Toone app (Direct edition, downloaded from trytoone.com) open on the Mac and Node.js 20 or newer. It does not work with the Mac App Store edition, or from Claude on the web or a phone.

- Category: productivity / automation.
- Links: documentation `https://github.com/io-hexagonal/toone-connector#readme`, support `https://github.com/io-hexagonal/toone-connector/issues`, privacy `https://trytoone.com/en/privacy`, terms `https://trytoone.com/en/terms`.

**Example prompts** (the policy asks for at least three):

1. "What are my Toone routines doing right now?"
2. "What's waiting for me in Toone?"
3. "What did the last run of the weekly report routine do?"
4. "Did we already contact Jane Doe?"
5. "Run the weekly report routine." (shows a confirmation first)
6. "Is there a shared routine for grant applications?"
7. "Make this a Toone routine: every Monday, list last week's top launches." (shows a confirmation first; Toone drafts it and the person publishes it in Toone)

**Data handling answers:**

- What data it reads: what the person's own routines recorded in the Toone app on their Mac: routine names, run summaries, and record-book entries, which can include names of people a routine contacted. Short summaries go to Claude when the person asks.
- What it stores: two small files on the person's Mac under `~/.toone/connector/`. `state.json` holds one random id per workspace. `credential.json` (readable only by the person's macOS user) holds the key Toone gave the plugin when the person allowed it. No conversation content is stored or logged.
- Where data goes: to the Toone app on the same Mac (`ws://localhost`). The only internet request is a search of Toone's public Explore library at `api.trytoone.com` over HTTPS, which sends the search words or a listing id and nothing about the person or their routines, with no account and no identifier.
- Shared with third parties, sold, or used for advertising or training: no. The plugin's author receives nothing from the plugin.
- Retention and deletion: nothing beyond the two files above. `toone-connector unpair` removes the key; deleting `~/.toone/connector/` removes everything, and Revoke in Toone (Settings › Connected Apps) makes the key useless.
- Authentication: none with any online service. The plugin pairs with the local app: the person compares a six-digit code and clicks Allow in Toone.
- Actions with side effects: starting a routine, pausing, continuing or cancelling a run, answering a waiting run, drafting a routine, starting a setup. Each asks the person through the client's own prompt (MCP elicitation) and is refused where the client cannot ask. Tools are marked with `readOnlyHint` and `destructiveHint` accordingly.
- Financial transactions, health data, content for people under 18: none.

**For the reviewer** (the policy asks for a test account with sample data; this plugin has no account):

- It needs the Toone Mac app, Direct edition, from https://trytoone.com, open on the same Mac, with at least one project and one routine. Explore search (example 6) works with any project and no routine.
- Without the app, every tool answers "Could not reach the Toone app" and does nothing else.
- Offer a sample project with a harmless routine (one input, a few steps that only reply "OK") on request, and a contact for questions.

### Requirements checklist

| Requirement (pre-submission checklist and policy) | Status |
|---|---|
| Plugin folder contains `.claude-plugin/plugin.json` | Met |
| Everything the plugin runs is inside the plugin folder; no `..` paths | Met (`node ${CLAUDE_PLUGIN_ROOT}/server/toone-connector.mjs mcp`) |
| No symlinks, submodules, LFS pointers, `.DS_Store` in the plugin folder | Met |
| `name` lowercase, digits and hyphens, our own brand, not reserved | Met (`toone`) |
| `description`, `author`, `version` set | Met |
| README of 40 words or more in the plugin folder | Met |
| License in the plugin folder or `license` in `plugin.json` | Met (both, Apache-2.0) |
| README describes everything the plugin runs, sends and fetches | Met ("Everything it runs, sends and fetches") |
| `.mcp.json` valid; local server started from a plugin file with plain arguments | Met |
| No package launchers (`npx` etc.), no lockfile in the plugin folder, no `.npmrc` | Met |
| No credentials in any file; none read from the environment | Met |
| Skills have valid front matter with a text `description` | Met |
| `claude plugin validate ./plugin` passes | Met on 2026-11-24 (one warning: no icon; one note: hosts not declared) |
| Every tool has `title`, `readOnlyHint` and `destructiveHint` set accurately | Met: 14 tools, 9 read-only, 4 destructive (`toone_start`, `toone_control`, `toone_answer`, `toone_install`), 1 that changes something without running or removing anything (`toone_make_routine`). Checked by `pnpm e2e` and by listing the tools of the built server |
| Tool descriptions say only what the tool does: no promotion, no instructions to call other tools | Met (reviewed for 0.2.0) |
| Privacy policy, support and documentation links | Met in `plugin.json` (`privacyPolicyUrl`, `supportUrl`, `documentationUrl`, `termsOfServiceUrl`); confirm the privacy page covers the connector |
| Icon: square PNG, 512 to 2048 px, under 2 MB, at `.claude-plugin/icon.png` or set in `icon` | **Not met** (warning only). The first icon saved in the portal sticks, so add it before the first save |
| Every non-image file under 256 KiB | **Not met: held for a reviewer.** `server/toone-connector.mjs` is about 1.6 MB (the MCP SDK and its dependencies bundled so the plugin needs no install). Readable, not minified, but a bundle, so expect a reviewer hold |
| Logic a server runs is readable by the validator (shell scripts) | **Held for a reviewer** by design: the server is a Node file. Unavoidable for a Node MCP server |
| `network.hosts` declared in `plugin.json` | Not set. `claude plugin validate` suggests it (`localhost` and `api.trytoone.com`), but the field needs Claude Code 2.1.328 or later and older versions may refuse the manifest. Decide before submitting |
| A standard test account with sample data (policy §3D) | **Not met.** The plugin needs the Toone Mac app (Direct edition) running with routines; see "For the reviewer" |
| The listing describes what a user can actually do | **Not met until a Toone newer than 1.0.82 is released.** Pairing, making a routine and starting an Explore setup need it; with the released 1.0.82 a reviewer sees the plugin connect unpaired and refuse those two actions plainly. Either release that Toone first, or cut the listing text (pairing, drafting a routine) and example 7 to what 1.0.82 does |
| Works on each surface users will use | Partly: Claude Code and Cowork on the Mac. It cannot work in claude.ai web or mobile chat (no local app there); the README says so |
| Repository public before the listing goes live | Met (public) |

### Owner steps

- [ ] Add the `NPM_TOKEN` secret and release `v0.2.1` (above).
- [ ] `mcp-publisher publish` for the MCP Registry.
- [ ] Add `plugin/.claude-plugin/icon.png` (square PNG, 512 to 2048 px, under 2 MB), commit it before the tag so the tagged plugin has it.
- [ ] Decide on `network.hosts`.
- [ ] Release a Toone that can pair, or trim the listing to what Toone 1.0.82 does.
- [ ] Confirm the privacy page at trytoone.com covers the connector (local connection, Explore search).
- [ ] Prepare how a reviewer can try it (a sample project with the test routine).
- [ ] In the portal: validate, fix anything marked **Blocking**, answer the data handling and compliance steps, submit.
