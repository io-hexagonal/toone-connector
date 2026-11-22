import { execFile } from 'node:child_process';
import type { AppLinksPort } from '../../../application/ports/out/app-links.js';
import { ConnectorError } from '../../../domain/errors.js';
import { parseListingRef, type ListingRef } from '../../../domain/explore.js';
import type { Workspace } from '../../../domain/workspace.js';
import type { BridgeClient, BridgeIdentity } from './bridge-client.js';
import { UNKNOWN_OPERATION } from './flows.js';

/** Hands one `toone://` link to one app on disk. */
export type OpenWith = (appPath: string, url: string) => Promise<void>;

const openWithMacOS: OpenWith = (appPath, url) =>
  new Promise((resolve, reject) => {
    execFile('open', ['-a', appPath, url], (error) => (error ? reject(error) : resolve()));
  });

/** The `.app` folder of the running Toone, from the executable path it reports. */
export function appBundlePath(executablePath: unknown): string | null {
  if (typeof executablePath !== 'string') return null;
  const cut = executablePath.indexOf('.app/Contents/');
  return cut > 0 ? executablePath.slice(0, cut + 4) : null;
}

/** The Explore link Toone itself shares for a listing. */
export function exploreLink(ref: ListingRef): string {
  const checked = parseListingRef(ref.id);
  if (!checked || checked.kind !== ref.kind) throw new ConnectorError('LISTING_NOT_FOUND', `"${ref.id}" is not an Explore listing id.`);
  return `toone://explore/${checked.kind === 'routine' ? 'routines' : 'bundles'}/${checked.id}`;
}

/**
 * Shows Explore listings in the running Toone app. Paired, Toone offers the page with an "Open"
 * notice (a paired connector may not read the app's details). Unpaired, the link goes to the exact
 * app that answers the bridge, never to whichever copy of Toone the system would pick for `toone://`.
 */
export class AppLinks implements AppLinksPort {
  constructor(
    private readonly bridge: BridgeClient,
    private readonly identityFor: (workspace: Workspace) => Promise<BridgeIdentity>,
    private readonly openWith: OpenWith = openWithMacOS,
  ) {}

  async showExploreListing(ref: ListingRef, workspace: Workspace): Promise<'opened' | 'offered'> {
    const link = exploreLink(ref);
    await this.bridge.connectionGeneration();
    if (this.bridge.paired) {
      await this.offer(ref, workspace);
      return 'offered';
    }
    const about = (await this.bridge.call('agent', { op: 'desktop_diagnostics', desktop: {} })) as { executablePath?: unknown };
    const appPath = appBundlePath(about?.executablePath);
    if (!appPath) throw new ConnectorError('APP_ERROR', 'Toone did not say where it runs from, so the connector cannot open the page in it. Open Explore in Toone instead.');
    try {
      await this.openWith(appPath, link);
    } catch {
      throw new ConnectorError('APP_ERROR', `Could not open the page in Toone. Open ${link} yourself, or find it in Toone's Explore.`);
    }
    return 'opened';
  }

  private async offer(ref: ListingRef, workspace: Workspace): Promise<void> {
    const params = { op: 'desktop_navigate', desktop: { workspaceId: workspace.id, target: 'explore', listingKind: ref.kind, listingId: ref.id } };
    try {
      await this.bridge.call('agent', params, await this.identityFor(workspace));
    } catch (error) {
      const code = error instanceof ConnectorError ? error.appCode : undefined;
      if (code === 'INVALID_NAVIGATION_TARGET' || (code && UNKNOWN_OPERATION.has(code))) {
        throw new ConnectorError('NOT_SUPPORTED_BY_APP', 'This Toone version cannot show an Explore page to a paired connector.', code);
      }
      throw error;
    }
  }
}
