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

/**
 * What the connector did for an install. 'setup': Toone started its setup conversation.
 * 'page': Toone shows the listing's page. 'offer': Toone offers the page with an "Open" notice.
 */
export interface InstallHandoff extends ListingRef {
  title: string;
  project: string;
  how: 'setup' | 'page' | 'offer';
  next: string;
  /** Toone's own words, when it started setup. */
  toone?: string;
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
    detail.kind === 'routine'
      ? `Toone starts its setup in ${project} (an older Toone opens the listing instead); nothing is installed until you finish it there.`
      : `Toone shows its Explore page in ${project}. Nothing is installed until you press "${button}" there and finish Toone's setup.`,
  ];
  return { title: `Install "${detail.title}" into ${project}?`, detail: parts.filter(Boolean).join(' ') };
}

const buttonFor = (kind: ListingKind): string => (kind === 'bundle' ? 'Use this bundle' : 'Use this routine');

/** After Toone started its setup conversation for a routine. */
export function setupNext(title: string, project: string, reused: boolean): string {
  const what = reused ? `Toone had already started setting up "${title}"` : `Toone started setting up "${title}"`;
  return `${what} in ${project}. Click "Open" on Toone's notice to go to it; its assistant asks you there about code files and what it needs. Nothing is installed until you finish.`;
}

/** After Toone showed or offered the listing's page. `why` explains a fallback from setup. */
export function pageNext(kind: ListingKind, project: string, shown: 'opened' | 'offered', why = ''): string {
  const button = buttonFor(kind);
  const where = shown === 'opened' ? 'Toone now shows it in Explore. To install, press' : 'Toone shows a notice with an "Open" button for it; your screen was left as it was. Click it, then press';
  return `${why}${where} "${button}"; Toone's setup asks for what it needs and installs it into ${project}.`;
}

/** Where to find a listing by hand, when the connector cannot show it. */
export function findItYourself(title: string, id: string, kind: ListingKind, project: string): string {
  return `Nothing was installed. In Toone, open Explore in ${project}, search for "${title}" (${id}) and press "${buttonFor(kind)}".`;
}
