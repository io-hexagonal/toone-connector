import { ConnectorError } from './errors.js';
import { clip } from './text.js';

/** Explore is Toone's library of routines and bundles that people share. */
export type ListingKind = 'routine' | 'bundle';

export interface ListingRef {
  kind: ListingKind;
  id: string;
}

export interface ExploreListing extends ListingRef {
  title: string;
  summary: string;
  /** "Free", or the price in its currency. */
  price: string;
  by: string;
  /** True when the listing comes with code files that setup offers to install. */
  codeFiles: boolean;
  /** Routines: number of steps. Bundles: the routines inside. */
  steps: number | null;
  routines: string[];
}

export interface ExploreDetail extends ExploreListing {
  /** What setup asks the person for, in the listing's words. */
  youProvide: string[];
  /** What to have ready before the first run. */
  prepare: string | null;
  /** Outside sites or services the listing says it uses. */
  thirdParties: string[];
}

export interface ExploreQuery {
  words: string;
  kind?: ListingKind;
  limit: number;
}

export interface ExploreResults {
  routines: ExploreListing[];
  bundles: ExploreListing[];
}

/** What the connector did for an install: Toone shows the listing; the person installs it there. */
export interface InstallHandoff extends ListingRef {
  title: string;
  project: string;
  next: string;
}

const ID_PATTERN = /^(wfl|wfb)_[a-z0-9]{8,32}$/;

/** A listing id as Toone's Explore links use it, or null when the text is not one. */
export function parseListingRef(text: string): ListingRef | null {
  const id = text.trim();
  const match = ID_PATTERN.exec(id);
  if (!match) return null;
  return { kind: match[1] === 'wfl' ? 'routine' : 'bundle', id };
}

/** Picks exactly one listing from search results, preferring an exact title. */
export function pickListing(found: ExploreListing[], wanted: string): ExploreListing {
  const needle = wanted.trim().toLowerCase();
  const exact = found.filter((l) => l.title.toLowerCase() === needle);
  const hits = exact.length > 0 ? exact : found;
  if (hits.length === 1 && hits[0]) return hits[0];
  if (hits.length === 0) throw new ConnectorError('LISTING_NOT_FOUND', `Nothing in Explore matches "${wanted}".`);
  throw new ConnectorError(
    'LISTING_AMBIGUOUS',
    `"${wanted}" matches ${hits.length} listings: ${hits.slice(0, 6).map((l) => `${l.title} (${l.id})`).join('; ')}. Use the id.`,
  );
}

/** "Free", or "USD 19.00" from an amount in the currency's minor unit. */
export function priceLabel(amount: number, currency: string): string {
  if (!(amount > 0)) return 'Free';
  const digits = /^(JPY|KRW|VND|CLP|ISK)$/i.test(currency) ? 0 : 2;
  return `${currency.toUpperCase()} ${(amount / 10 ** digits).toFixed(digits)}`;
}

/** The question shown before Toone opens a listing for installing. */
export function installAsk(detail: ExploreDetail, project: string): { title: string; detail: string } {
  const what = detail.kind === 'bundle' ? `bundle of ${detail.routines.length} routines` : 'routine';
  const button = detail.kind === 'bundle' ? 'Use this bundle' : 'Use this routine';
  const parts = [
    `Shared ${what} by ${detail.by}. ${detail.price === 'Free' ? 'Free.' : `Price: ${detail.price}.`}`,
    detail.codeFiles
      ? 'It comes with code files; Toone setup shows them and asks before installing them.'
      : 'It comes with no code files.',
    detail.youProvide.length > 0 ? `Setup will ask you for: ${clip(detail.youProvide.join('; '), 300)}.` : 'Setup lists nothing you must provide.',
    detail.thirdParties.length > 0 ? `It uses: ${clip(detail.thirdParties.join(', '), 160)}.` : '',
    `Toone opens its Explore page in ${project}. Nothing is installed until you press "${button}" there and finish Toone's setup.`,
  ];
  return { title: `Install "${detail.title}" into ${project}?`, detail: parts.filter(Boolean).join(' ') };
}
