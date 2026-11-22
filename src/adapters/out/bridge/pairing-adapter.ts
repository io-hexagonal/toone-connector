import type { TooneAppPairingPort } from '../../../application/ports/out/toone-pairing.js';
import { ConnectorError } from '../../../domain/errors.js';
import type { PairOutcome, PairScope, PairingCode, PairingState } from '../../../domain/pairing.js';
import { startPairing } from './bridge-auth.js';
import { type BridgeClient, CLIENT_NAME } from './bridge-client.js';
import type { CredentialStore } from './credential-store.js';

/** Pairs with the Toone app over its pairing socket and keeps the credential it hands back. */
export class TooneAppPairingAdapter implements TooneAppPairingPort {
  constructor(
    private readonly bridge: BridgeClient,
    private readonly credentials: CredentialStore,
    private readonly name: string = CLIENT_NAME,
  ) {}

  async pair(scope: PairScope, onCode: (code: PairingCode) => void): Promise<PairOutcome> {
    const session = await startPairing(this.bridge.url, this.name, scope);
    if (session === 'unsupported') return { status: 'unsupported' };
    onCode({ code: session.code, expiresAt: session.expiresAt });
    const decision = await session.decision;
    session.close();
    if (decision.status === 'failed') throw new ConnectorError('APP_ERROR', `Toone: ${decision.message}`);
    if (decision.status !== 'approved') return { status: decision.status };
    this.credentials.save({ clientId: decision.clientId, secret: decision.secret, scope: decision.scope, pairedAt: new Date().toISOString() });
    // The next call reconnects with the new pairing.
    await this.bridge.close();
    return { status: 'approved', scope: decision.scope };
  }

  forget(): boolean {
    return this.credentials.remove();
  }

  state(): PairingState {
    const credential = this.credentials.load();
    return credential ? { paired: true, scope: credential.scope, pairedAt: credential.pairedAt } : { paired: false };
  }
}
