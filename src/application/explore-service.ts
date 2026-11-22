import { ConnectorError } from '../domain/errors.js';
import {
  installAsk,
  parseListingRef,
  pickListing,
  type ExploreDetail,
  type ExploreResults,
  type InstallHandoff,
  type ListingKind,
} from '../domain/explore.js';
import { pickWorkspace, type Workspace } from '../domain/workspace.js';
import type { Confirm, Scope } from './ports/in/connector.js';
import type { ExploreConnector } from './ports/in/explore.js';
import type { AppLinksPort } from './ports/out/app-links.js';
import type { ExploreCatalogPort } from './ports/out/explore-catalog.js';
import type { TooneAppPort } from './ports/out/toone-app.js';

const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 10;

export class ExploreService implements ExploreConnector {
  constructor(
    private readonly app: TooneAppPort,
    private readonly catalog: ExploreCatalogPort,
    private readonly links: AppLinksPort,
    private readonly cwd: string,
  ) {}

  search(req: { search: string; kind?: ListingKind; limit?: number }): Promise<ExploreResults> {
    const limit = Math.min(MAX_RESULTS, Math.max(1, Math.floor(req.limit ?? DEFAULT_RESULTS) || DEFAULT_RESULTS));
    return this.catalog.search({ words: req.search.trim(), kind: req.kind, limit });
  }

  async listing(req: { listing: string }): Promise<ExploreDetail> {
    const ref = parseListingRef(req.listing);
    if (ref) return this.catalog.detail(ref);
    const found = await this.catalog.search({ words: req.listing.trim(), limit: MAX_RESULTS });
    return this.catalog.detail(pickListing([...found.routines, ...found.bundles], req.listing));
  }

  async install(req: Scope & { listing: string }, confirm: Confirm): Promise<InstallHandoff> {
    const project = await this.projectOpenInApp(req.workspace);
    const detail = await this.listing(req);
    if (!(await confirm(installAsk(detail, project.name)))) {
      throw new ConnectorError('NOT_CONFIRMED', 'Not confirmed, so nothing was done.');
    }
    await this.links.showExploreListing(detail);
    const button = detail.kind === 'bundle' ? 'Use this bundle' : 'Use this routine';
    return {
      kind: detail.kind,
      id: detail.id,
      title: detail.title,
      project: project.name,
      next: `Toone now shows it in Explore. To install, press "${button}" there; Toone's setup asks for what it needs and installs it into ${project.name}.`,
    };
  }

  /** Explore installs into the project open in Toone, so that is the only one this can target. */
  private async projectOpenInApp(wanted: string | undefined): Promise<Workspace> {
    const all = await this.app.workspaces();
    const open = all.find((w) => w.selectedInApp);
    if (!open) throw new ConnectorError('NOT_OPEN_IN_APP', 'No project is open in Toone. Open the project to install into, then ask again.');
    if (wanted) {
      const named = pickWorkspace(all, wanted, this.cwd);
      if (named.id !== open.id) {
        throw new ConnectorError(
          'NOT_OPEN_IN_APP',
          `Explore installs into the project open in Toone, which is ${open.name}. Open ${named.name} in Toone first, then ask again.`,
        );
      }
    }
    return open;
  }
}
