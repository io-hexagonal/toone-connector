import type { ExploreDetail, ExploreQuery, ExploreResults, ListingRef } from '../../../domain/explore.js';

/** Toone's public Explore library of shared routines and bundles. */
export interface ExploreCatalogPort {
  search(query: ExploreQuery): Promise<ExploreResults>;
  detail(ref: ListingRef): Promise<ExploreDetail>;
}
