# Submitting the Toone connector

Text and checklists for two listings: the **Claude plugin directory** (the `plugin/` folder) and the **official MCP Registry** (the npm package, described by `server.json`). Nothing here has been submitted. Requirements were read from the sources below on 2026-11-22; re-check them before submitting, since both change.

Sources:

- Claude plugin directory: [Submit your plugin](https://claude.com/docs/plugins/submit), [Plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist), [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference), [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
- MCP Registry: [Quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx), [Package types](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx), [server.json schema 2025-12-11](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).

## Order of work

1. Release `v0.1.0` (see "Releasing" below): this publishes `toone-connector` to npm and creates the GitHub release.
2. Publish `server.json` to the MCP Registry (it only stores metadata, so the npm package must exist first).
3. Submit `plugin/` to the Claude plugin directory from the developer portal.

## Releasing

The release workflow (`.github/workflows/release.yml`) runs only when a tag like `v0.1.0` is pushed. It checks that `package.json`, `plugin/.claude-plugin/plugin.json`, `server.json`, the CLI's version and `CHANGELOG.md` agree with the tag (`pnpm release:check`), runs the type check, tests and build, checks the bundled plugin server matches the sources, publishes to npm with provenance, and creates a GitHub release with that version's changelog section as notes.

Before the first tag:

- [ ] Add the `NPM_TOKEN` secret (an npm automation or granular token that can publish `toone-connector`). The job runs in the `release` environment, so the secret can live there and the environment can require an approval.
- [ ] Replace "Unreleased" in the `CHANGELOG.md` heading with the date.
- [ ] `pnpm verify && pnpm e2e && pnpm e2e:live "Connector E2E (safe to delete)" --workspace <test workspace>` on a Mac with Toone open.
- [ ] `pnpm release:check --tag v0.1.0`, then tag and push the tag.

## MCP Registry

**Name:** `io.github.mattwebhub/toone-connector` (GitHub login namespace, so `mcp-publisher login github` must be done as `mattwebhub`).

**server.json** (in the repository root):

- `name`: `io.github.mattwebhub/toone-connector`
- `title`: Toone
- `description` (100 characters at most): "See, start and decide on your Toone routines. Needs the Toone Mac app (Direct edition) open."
- `packages[0]`: npm `toone-connector`, `version` pinned, transport `stdio`, positional argument `mcp`.

**Steps** (owner, after the npm release):

```sh
brew install mcp-publisher
mcp-publisher login github
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.mattwebhub/toone-connector"
```

| Requirement | Status |
|---|---|
| Package published on the public npm registry | Not yet: needs the first release |
| `package.json` has `mcpName` equal to the `server.json` name | Met |
| `server.json` validates against the 2025-12-11 schema | Met (checked with a JSON Schema validator) |
| `description` at most 100 characters | Met (92) |
| `version` is exact, not a range or `latest`, and matches npm | Met for 0.1.0; `release:check` keeps them in step |
| Name in the `io.github.<login>/` namespace, published by that GitHub account | Met for the name; the login is the owner's step |
| Name free on npm and in the registry | `toone-connector` was free on npm on 2026-11-22; no `io.github.mattwebhub/*` entry in the registry |

Optional later: publish to the registry from the release workflow with GitHub OIDC (`mcp-publisher login github-oidc`), which needs `id-token: write` (already granted to the job).

## Claude plugin directory

**Where:** the developer portal at claude.ai/directory/manage → **Submit new** → **Plugin bundle**. Needs a paid Claude plan, a role that can submit, and the GitHub account connected on claude.ai with push access to `mattwebhub/toone-connector`.

**Source step:**

- Repository: `mattwebhub/toone-connector`
- Plugin path: `plugin`
- Branch or tag: `main` (or a release tag, to publish only tagged versions)

**Listing text** (from `plugin/.claude-plugin/plugin.json` and `plugin/README.md`):

- Name: `toone`
- Description: "See, start and decide on your Toone routines from Claude. Needs the Toone app (Direct edition) open on this Mac."
- Example prompts (the policy asks for at least three): "What are my Toone routines doing right now?", "What's waiting for me in Toone?", "What did the last Reddit Radar run do?", "Did we already contact Jane Doe?", "Run the weekly report routine."

**Data handling answers** (draft):

- Reads or stores personal data: it reads what the person's own routines recorded in Toone (which can include names of people a routine contacted) and passes short summaries to Claude when asked. It stores only one random id per workspace in `~/.toone/connector/state.json`. It does not log conversation content.
- Sends data to services other than declared connectors: no. It connects only to the Toone app on the same Mac (`ws://localhost`), and makes no internet requests.
- Retention: nothing is kept beyond the id above.
- Intended for people under 18: no.

### Requirements checklist

| Requirement (pre-submission checklist and policy) | Status |
|---|---|
| Plugin folder contains `.claude-plugin/plugin.json` | Met |
| Everything the plugin runs is inside the plugin folder; no `..` paths | Met (`node ${CLAUDE_PLUGIN_ROOT}/server/toone-connector.mjs mcp`) |
| No symlinks, submodules, LFS pointers, `.DS_Store` in the plugin folder | Met |
| `name` lowercase, digits and hyphens, our own brand, not reserved | Met (`toone`) |
| `description`, `author`, `version` set | Met |
| README of 40 words or more in the plugin folder | Met (about 430 words) |
| License in the plugin folder or `license` in `plugin.json` | Met (both, Apache-2.0) |
| README describes everything the plugin runs, sends and fetches | Met ("Everything it runs, sends and fetches") |
| `.mcp.json` valid; local server started from a plugin file with plain arguments | Met |
| No package launchers (`npx` etc.), no lockfile in the plugin folder, no `.npmrc` | Met |
| No credentials in any file; none read from the environment | Met |
| Skills have valid front matter with a text `description` | Met |
| `claude plugin validate ./plugin` passes | Met (one warning: no icon) |
| Every tool has `title`, `readOnlyHint` and `destructiveHint` set accurately | Met (8 read-only, 3 destructive) |
| Privacy policy, support and documentation links | Met in `plugin.json` (`privacyPolicyUrl`, `supportUrl`, `documentationUrl`, `termsOfServiceUrl`); confirm the privacy page covers the connector |
| Icon: square PNG, 512 to 2048 px, under 2 MB, at `.claude-plugin/icon.png` or set in `icon` | **Not met** (warning only). The first icon saved in the portal sticks, so add it before the first save |
| Every non-image file under 256 KiB | **Not met: held for a reviewer.** `server/toone-connector.mjs` is about 1.5 MB (the MCP SDK and its dependencies bundled so the plugin needs no install). Readable, not minified, but a bundle, so expect a reviewer hold |
| Logic a server runs is readable by the validator (shell scripts) | **Held for a reviewer** by design: the server is a Node file. Unavoidable for a Node MCP server |
| `network.hosts` declared in `plugin.json` | Not set. `claude plugin validate` suggests it (`localhost`), but the field needs Claude Code 2.1.328 or later and older versions may refuse the manifest. Decide before submitting |
| A standard test account with sample data (policy §3D) | **Not met.** The plugin needs the Toone Mac app (Direct edition) running with routines. Offer reviewers a build of Toone plus a sample project, or explain in the submission how to try it |
| Works on each surface users will use | Partly: Claude Code and Cowork on the Mac. It cannot work in claude.ai web or mobile chat (no local app there); the README says so |
| Repository public before the listing goes live | Met (public) |

### Owner steps

- [ ] Add `plugin/.claude-plugin/icon.png` (square, 512 to 2048 px).
- [ ] Decide on `network.hosts`.
- [ ] Prepare how a reviewer can try it (Toone build and a sample project with the test routine).
- [ ] Validate in the portal, fix anything marked **Blocking**, answer the data handling and compliance steps, submit.
