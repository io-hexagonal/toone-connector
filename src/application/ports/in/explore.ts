import type { ExploreDetail, ExploreResults, InstallHandoff, ListingKind } from '../../../domain/explore.js';
import type { Confirm, Scope } from './connector.js';

/** Finding shared routines in Toone's Explore library and installing one. Install always goes through `confirm`. */
export interface ExploreConnector {
  search(req: { search: string; kind?: ListingKind; limit?: number }): Promise<ExploreResults>;
  /** One listing by id, or by words that match exactly one. */
  listing(req: { listing: string }): Promise<ExploreDetail>;
  install(req: Scope & { listing: string }, confirm: Confirm): Promise<InstallHandoff>;
}
