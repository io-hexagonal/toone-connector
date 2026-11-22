#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './adapters/in/cli/cli.js';
import { serveMcp } from './adapters/in/mcp/server.js';
import { BridgeClient } from './adapters/out/bridge/bridge-client.js';
import { CredentialStore } from './adapters/out/bridge/credential-store.js';
import { OperatorStore } from './adapters/out/bridge/operator-store.js';
import { TooneAppPairingAdapter } from './adapters/out/bridge/pairing-adapter.js';
import { TooneAppAdapter } from './adapters/out/bridge/toone-app-adapter.js';
import { ConnectorService } from './application/connector-service.js';
import { PairingService } from './application/pairing-service.js';

const VERSION = '0.1.0';
const DEFAULT_PORT = 9876;

/** The port the Toone app wrote for its tool servers, else the default. */
function bridgePort(): number {
  const fromEnv = Number(process.env.TOONE_BRIDGE_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  try {
    const file = JSON.parse(readFileSync(join(homedir(), '.toone', 'mcp-server', 'bridge.json'), 'utf8')) as { port?: number };
    if (typeof file.port === 'number') return file.port;
  } catch {
    // The file is absent until Toone has run once.
  }
  return DEFAULT_PORT;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const folder = join(homedir(), '.toone', 'connector');
  const credentials = new CredentialStore(join(folder, 'credential.json'));
  // The tool server asks Toone to pair on first use; the command line has `pair` for that.
  const bridge = new BridgeClient(bridgePort(), { credentials, autoPair: argv[0] === 'mcp' });
  const app = new TooneAppAdapter(bridge, new OperatorStore(join(folder, 'state.json')));
  const connector = new ConnectorService(app, process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  if (argv[0] === 'mcp') {
    await serveMcp(connector, {
      version: VERSION,
      withoutPrompt: process.env.TOONE_CONNECTOR_UNPROMPTED === 'allow' ? 'allow' : 'refuse',
      connectionNote: () => bridge.connectionNote(),
    });
    return;
  }
  const pairing = new PairingService(new TooneAppPairingAdapter(bridge, credentials));
  const code = await runCli(connector, argv, (line) => console.log(line), pairing);
  const note = bridge.connectionNote();
  if (note) console.error(note);
  await app.close();
  process.exitCode = code;
}

void main();
