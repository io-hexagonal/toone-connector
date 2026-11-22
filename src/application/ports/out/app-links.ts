import type { ListingRef } from '../../../domain/explore.js';

/** Opens a page inside the running Toone app, where the person takes it from there. */
export interface AppLinksPort {
  showExploreListing(ref: ListingRef): Promise<void>;
}
