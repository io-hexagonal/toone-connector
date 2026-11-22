import type { PairOutcome, PairScope, PairingCode, PairingState } from '../../../domain/pairing.js';

/** Pairing with the Toone app on this Mac, as the connector needs it. */
export interface TooneAppPairingPort {
  /** Asks Toone to pair; `onCode` runs once Toone shows its prompt. Resolves with the person's answer. */
  pair(scope: PairScope, onCode: (code: PairingCode) => void): Promise<PairOutcome>;
  /** Forgets the stored credential on this Mac. True when there was one. */
  forget(): boolean;
  state(): PairingState;
}
