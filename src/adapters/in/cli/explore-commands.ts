import type { Confirm } from '../../../application/ports/in/connector.js';
import type { ExploreConnector } from '../../../application/ports/in/explore.js';
import type { ExploreListing, ListingKind } from '../../../domain/explore.js';
import { parseListingRef } from '../../../domain/explore.js';

export interface ExploreArgs {
  command: 'explore' | 'install';
  words: string[];
  workspace?: string;
  kind?: string;
  limit?: number;
  json: boolean;
}

const line = (l: ExploreListing): string =>
  `  ${l.title}  [${l.id}]  ${l.price}${l.codeFiles ? ', code files' : ''}${l.routines.length ? `, ${l.routines.length} routines` : ''}. ${l.summary}`;

/** `explore WORDS`, `explore LISTING_ID` and `install LISTING`. */
export async function runExploreCommand(explore: ExploreConnector, args: ExploreArgs, out: (line: string) => void, confirm: Confirm): Promise<number> {
  const text = args.words.join(' ');
  const show = (value: unknown, human: () => void): void => (args.json ? out(JSON.stringify(value, null, 2)) : human());
  if (args.command === 'install') {
    const done = await explore.install({ workspace: args.workspace, listing: text }, confirm);
    show(done, () => out(done.next));
    return 0;
  }
  if (parseListingRef(text)) {
    const d = await explore.listing({ listing: text });
    show(d, () => {
      out(line(d));
      if (d.routines.length) out(`  Routines: ${d.routines.join(', ')}`);
      out(d.youProvide.length ? `  Setup asks for: ${d.youProvide.join('; ')}` : '  Setup asks for nothing up front.');
      if (d.prepare) out(`  Have ready: ${d.prepare}`);
    });
    return 0;
  }
  const kind = args.kind === 'routine' || args.kind === 'bundle' ? (args.kind as ListingKind) : undefined;
  const found = await explore.search({ search: text, kind, limit: args.limit });
  show(found, () => {
    if (!found.routines.length && !found.bundles.length) out('Nothing in Explore matches.');
    if (found.routines.length) out('Routines:');
    found.routines.forEach((l) => out(line(l)));
    if (found.bundles.length) out('Bundles:');
    found.bundles.forEach((l) => out(line(l)));
  });
  return 0;
}
