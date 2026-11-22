import { priceLabel, type ExploreDetail, type ExploreListing, type ListingKind } from '../../../domain/explore.js';
import { clip } from '../../../domain/text.js';

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const SUMMARY_LIMIT = 200;
const TEXT_LIMIT = 120;
const MAX_ITEMS = 8;

/** The title Toone's Explore shows: the display title when there is one. */
const titleOf = (e: Raw): string => str(e.display_title) || str(e.title);

/** One catalog entry (a routine or a bundle) as a short listing. */
export function toListing(kind: ListingKind, e: Raw): ExploreListing {
  const price = obj(e.price);
  const author = str(e.author_name) || 'someone';
  return {
    kind,
    id: kind === 'routine' ? str(e.workflow_id) : str(e.bundle_id),
    title: titleOf(e),
    summary: clip(str(e.card_summary) || str(e.summary), SUMMARY_LIMIT),
    price: priceLabel(typeof price.amount === 'number' ? price.amount : 0, str(price.currency) || 'USD'),
    by: e.author_official === true ? `${author} (official)` : author,
    codeFiles: e.has_code_artifacts === true || list(e.members).some((m) => obj(m.entry ?? m).has_code_artifacts === true),
    steps: kind === 'routine' && typeof e.step_count === 'number' ? e.step_count : null,
    routines: list(e.members).map((m) => titleOf(obj(m.entry ?? m))).filter(Boolean),
  };
}

/** A catalog search answer: `{ data: [entries] }`. */
export function toListings(kind: ListingKind, payload: unknown): ExploreListing[] {
  return list(obj(payload).data).map((e) => toListing(kind, e));
}

/** One listing's page, with what setup asks for and what to have ready. */
export function toExploreDetail(kind: ListingKind, payload: unknown): ExploreDetail {
  const p = obj(payload);
  const e = Object.keys(obj(p.data)).length > 0 ? obj(p.data) : p;
  const profile = obj(e.listing_profile);
  const prepare = str(obj(profile.time_and_effort).you_prepare);
  return {
    ...toListing(kind, e),
    youProvide: list(profile.you_provide).map((i) => clip(str(i.label), TEXT_LIMIT)).filter(Boolean).slice(0, MAX_ITEMS),
    prepare: prepare ? clip(prepare, 300) : null,
    thirdParties: list(profile.third_parties).map((t) => str(t.name) || str(t.domain)).filter(Boolean).slice(0, MAX_ITEMS),
  };
}
