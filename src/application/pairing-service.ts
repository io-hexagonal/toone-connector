import type { PairOutcome, PairScope, PairingCode, PairingState } from '../domain/pairing.js';
import type { Pairing } from './ports/in/pairing.js';
import type { TooneAppPairingPort } from './ports/out/toone-pairing.js';

/** Pairing use cases. Consent happens in the Toone app; this only starts it and keeps the answer. */
export class PairingService implements Pairing {
  constructor(private readonly app: TooneAppPairingPort) {}

  pair(scope: PairScope, onCode: (code: PairingCode) => void): Promise<PairOutcome> {
    return this.app.pair(scope, onCode);
  }

  unpair(): boolean {
    return this.app.forget();
  }

  state(): PairingState {
    return this.app.state();
  }
}
