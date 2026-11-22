import type { ListingRef } from '../../../domain/explore.js';
import type { Workspace } from '../../../domain/workspace.js';

/**
 * Shows an Explore listing in the running Toone app. 'opened': Toone shows the page now.
 * 'offered': Toone shows a notice with an "Open" button and leaves the screen as it was.
 */
export interface AppLinksPort {
  showExploreListing(ref: ListingRef, workspace: Workspace): Promise<'opened' | 'offered'>;
}
