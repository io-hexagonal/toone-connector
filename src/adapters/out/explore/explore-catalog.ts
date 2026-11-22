import type { ExploreCatalogPort } from '../../../application/ports/out/explore-catalog.js';
import { ConnectorError } from '../../../domain/errors.js';
import type { ExploreDetail, ExploreQuery, ExploreResults, ListingKind, ListingRef } from '../../../domain/explore.js';
import { toExploreDetail, toListings } from './explore-mappers.js';

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const TIMEOUT_MS = 15_000;
const PATHS: Record<ListingKind, string> = { routine: 'workflows', bundle: 'bundles' };

/**
 * Reads Toone's public Explore catalog over HTTPS, the same one the app and the website show.
 * Only the search words and listing ids are sent; no account and nothing from this Mac.
 */
export class ExploreCatalog implements ExploreCatalogPort {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async search(query: ExploreQuery): Promise<ExploreResults> {
    const wants = (kind: ListingKind): boolean => !query.kind || query.kind === kind;
    const page = { query: query.words, limit: String(query.limit) };
    const [routines, bundles] = await Promise.all([
      wants('routine') ? this.get('workflows', { ...page, listing: 'all' }).then((p) => toListings('routine', p)) : [],
      wants('bundle') ? this.get('bundles', page).then((p) => toListings('bundle', p)) : [],
    ]);
    return { routines: routines.slice(0, query.limit), bundles: bundles.slice(0, query.limit) };
  }

  async detail(ref: ListingRef): Promise<ExploreDetail> {
    return toExploreDetail(ref.kind, await this.get(`${PATHS[ref.kind]}/${encodeURIComponent(ref.id)}`));
  }

  private async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchFn(url.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new ConnectorError('CATALOG_UNAVAILABLE', 'Could not reach Toone Explore. Check the internet connection and try again.');
    }
    if (response.status === 404) throw new ConnectorError('LISTING_NOT_FOUND', 'That listing is not in Toone Explore (it may have been removed).');
    if (!response.ok) throw new ConnectorError('CATALOG_UNAVAILABLE', `Toone Explore answered with an error (${response.status}). Try again later.`);
    return response.json();
  }
}
