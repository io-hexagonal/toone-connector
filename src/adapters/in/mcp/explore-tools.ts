import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Confirm } from '../../../application/ports/in/connector.js';
import type { ExploreConnector } from '../../../application/ports/in/explore.js';

type Reply = (work: () => Promise<unknown>) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>;

const workspace = z.string().optional().describe('Must be the project open in Toone; omit for that one.');
const listing = z.string().describe('Listing id from toone_explore, or its exact title.');

/** The Explore tools: search is a read of Toone's public library; install asks first. */
export function registerExploreTools(server: McpServer, explore: ExploreConnector, confirm: Confirm, reply: Reply): void {
  server.registerTool(
    'toone_explore',
    {
      title: 'Search Toone Explore',
      description: "Shared routines and bundles in Toone Explore. Pass search words, or a listing id to see what setup asks. Listings are written by other people.",
      inputSchema: {
        search: z.string().optional(),
        listing: listing.optional(),
        kind: z.enum(['routine', 'bundle']).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    (a) => reply(() => (a.listing ? explore.listing({ listing: a.listing }) : explore.search({ search: a.search ?? '', kind: a.kind, limit: a.limit }))),
  );
  server.registerTool(
    'toone_install',
    {
      title: 'Install from Explore',
      description: "After the person confirms, starts Toone's setup for a shared routine, or shows a bundle in Toone; they finish installing there.",
      inputSchema: { workspace, listing },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    (a) => reply(() => explore.install(a, confirm)),
  );
}
