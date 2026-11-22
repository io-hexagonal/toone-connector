import type { PairOutcome, PairScope, PairingCode, PairingState } from '../../../domain/pairing.js';

/** Pairing this connector with Toone, for the command line. */
export interface Pairing {
  pair(scope: PairScope, onCode: (code: PairingCode) => void): Promise<PairOutcome>;
  unpair(): boolean;
  state(): PairingState;
}
