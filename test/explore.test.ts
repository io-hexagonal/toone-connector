import { describe, expect, it, vi } from 'vitest';
import { AppLinks, appBundlePath, exploreLink } from '../src/adapters/out/bridge/app-links.js';
import type { BridgeClient } from '../src/adapters/out/bridge/bridge-client.js';
import { ExploreCatalog, type FetchLike } from '../src/adapters/out/explore/explore-catalog.js';
import { toExploreDetail, toListings } from '../src/adapters/out/explore/explore-mappers.js';
import { ExploreService } from '../src/application/explore-service.js';
import type { AppLinksPort } from '../src/application/ports/out/app-links.js';
import type { ExploreCatalogPort } from '../src/application/ports/out/explore-catalog.js';
import type { TooneAppPort } from '../src/application/ports/out/toone-app.js';
import { ConnectorError } from '../src/domain/errors.js';
import { installAsk, parseListingRef, pickListing, priceLabel, type ExploreDetail, type ExploreListing } from '../src/domain/explore.js';

const listing = (over: Partial<ExploreListing> = {}): ExploreListing => ({
  kind: 'routine', id: 'wfl_abcdefgh12', title: 'Apply to Grants', summary: 's', price: 'Free', by: 'Toone Team (official)',
  codeFiles: false, steps: 11, routines: [], ...over,
});
const detail = (over: Partial<ExploreDetail> = {}): ExploreDetail => ({ ...listing(), youProvide: ['Funding plan'], prepare: null, thirdParties: [], ...over });

// Shapes as Toone Explore returns them, trimmed.
const routineEntry = {
  workflow_id: 'wfl_hgyfifbahlhxzxc3', title: 'Apply to Grants', display_title: 'Fill and Submit Grant Applications',
  card_summary: 'Fills grant applications.', summary: 'Long summary', price: { amount: 0, currency: 'USD' },
  author_name: 'Toone Team', author_official: true, has_code_artifacts: false, step_count: 11, cover_image_data_url: 'data:image/jpeg;base64,AAAA',
};
const bundleEntry = {
  bundle_id: 'wfb_mq35pytutf7lj72j', title: 'Find and Apply to Grants', summary: 'Two routines.', price: { amount: 1999, currency: 'usd' },
  author_name: 'Ana', has_code_artifacts: false, member_count: 2,
  members: [{ title: 'Find Funding', has_code_artifacts: false }, { title: 'Apply to Grants', display_title: 'Fill grants', has_code_artifacts: true }],
};

describe('explore domain', () => {
  it('reads listing ids the way Toone links do', () => {
    expect(parseListingRef('wfl_hgyfifbahlhxzxc3')).toEqual({ kind: 'routine', id: 'wfl_hgyfifbahlhxzxc3' });
    expect(parseListingRef(' wfb_mq35pytutf7lj72j ')?.kind).toBe('bundle');
    expect(parseListingRef('apply to grants')).toBeNull();
    expect(parseListingRef('wfl_x; rm -rf /')).toBeNull();
  });
  it('labels prices', () => {
    expect(priceLabel(0, 'USD')).toBe('Free');
    expect(priceLabel(1999, 'usd')).toBe('USD 19.99');
    expect(priceLabel(500, 'JPY')).toBe('JPY 500');
  });
  it('picks one listing, preferring an exact title', () => {
    const all = [listing(), listing({ id: 'wfl_other00000', title: 'Apply to Grants Pro' })];
    expect(pickListing(all, 'apply to grants').id).toBe('wfl_abcdefgh12');
    expect(() => pickListing(all, 'grants')).toThrowError(/matches 2 listings/);
    expect(() => pickListing([], 'x')).toThrowError(ConnectorError);
  });
  it('asks with what, where, code files and setup', () => {
    const ask = installAsk(detail({ codeFiles: true }), 'growth');
    expect(ask.title).toBe('Install "Apply to Grants" into growth?');
    expect(ask.detail).toContain('code files');
    expect(ask.detail).toContain('Setup will ask you for: Funding plan');
    expect(ask.detail).toContain('Use this routine');
    expect(installAsk(detail({ codeFiles: false, youProvide: [] }), 'g').detail).toContain('no code files');
  });
});

describe('explore mappers', () => {
  it('keeps a search answer short and drops covers', () => {
    const [r] = toListings('routine', { data: [routineEntry] });
    expect(r).toMatchObject({ id: 'wfl_hgyfifbahlhxzxc3', title: 'Fill and Submit Grant Applications', price: 'Free', by: 'Toone Team (official)', steps: 11 });
    expect(JSON.stringify(r)).not.toContain('base64');
    const [b] = toListings('bundle', { data: [bundleEntry] });
    expect(b).toMatchObject({ kind: 'bundle', price: 'USD 19.99', routines: ['Find Funding', 'Fill grants'], codeFiles: true });
  });
  it('reads what setup asks for from the listing page', () => {
    const d = toExploreDetail('routine', { ...routineEntry, listing_profile: {
      you_provide: [{ input_id: 'in-plan', label: 'Funding plan from Find Funding' }],
      time_and_effort: { you_prepare: 'A funding plan.' }, third_parties: [{ name: 'Grants.gov', domain: 'grants.gov' }] } });
    expect(d).toMatchObject({ youProvide: ['Funding plan from Find Funding'], prepare: 'A funding plan.', thirdParties: ['Grants.gov'] });
  });
});

describe('ExploreCatalog', () => {
  it('searches routines and bundles with the words', async () => {
    const urls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ data: url.includes('/bundles') ? [bundleEntry] : [routineEntry] }) };
    };
    const found = await new ExploreCatalog('https://example.test/v1', fetchFn).search({ words: 'grants', limit: 3 });
    expect(found.routines).toHaveLength(1);
    expect(found.bundles).toHaveLength(1);
    expect(urls.some((u) => u.startsWith('https://example.test/v1/workflows?query=grants&limit=3&listing=all'))).toBe(true);
  });
  it('turns a missing listing and a network failure into plain errors', async () => {
    const missing = new ExploreCatalog('https://example.test/v1', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    await expect(missing.detail({ kind: 'routine', id: 'wfl_abcdefgh12' })).rejects.toMatchObject({ code: 'LISTING_NOT_FOUND' });
    const offline = new ExploreCatalog('https://example.test/v1', async () => { throw new Error('offline'); });
    await expect(offline.search({ words: 'x', limit: 1 })).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
  });
});

describe('AppLinks', () => {
  it('opens the listing in the running app, not any copy of Toone', async () => {
    const bridge = { call: vi.fn(async () => ({ executablePath: '/Apps/Toone.app/Contents/MacOS/Toone' })) } as unknown as BridgeClient;
    const openWith = vi.fn(async () => {});
    await new AppLinks(bridge, openWith).showExploreListing({ kind: 'bundle', id: 'wfb_mq35pytutf7lj72j' });
    expect(openWith).toHaveBeenCalledWith('/Apps/Toone.app', 'toone://explore/bundles/wfb_mq35pytutf7lj72j');
  });
  it('refuses ids that are not Explore ids, and an app that does not say where it is', async () => {
    expect(() => exploreLink({ kind: 'routine', id: 'wfb_mq35pytutf7lj72j' })).toThrowError(ConnectorError);
    expect(appBundlePath('/usr/bin/node')).toBeNull();
    const bridge = { call: vi.fn(async () => ({})) } as unknown as BridgeClient;
    const openWith = vi.fn(async () => {});
    await expect(new AppLinks(bridge, openWith).showExploreListing({ kind: 'routine', id: 'wfl_abcdefgh12' })).rejects.toThrowError(ConnectorError);
    expect(openWith).not.toHaveBeenCalled();
  });
});

function fakes(selected = true) {
  const app = {
    workspaces: async () => [
      { id: 'w1', name: 'growth', projectPath: '/p/growth', loaded: true, selectedInApp: selected },
      { id: 'w2', name: 'other', projectPath: '/p/other', loaded: true, selectedInApp: false },
    ],
  } as unknown as TooneAppPort;
  const catalog: ExploreCatalogPort = {
    search: vi.fn(async () => ({ routines: [listing()], bundles: [] })),
    detail: vi.fn(async (ref) => detail({ id: ref.id, kind: ref.kind })),
  };
  const links: AppLinksPort = { showExploreListing: vi.fn(async () => {}) };
  return { service: new ExploreService(app, catalog, links, '/p/other'), catalog, links };
}

describe('ExploreService install', () => {
  it('opens nothing when the person says no', async () => {
    const { service, links } = fakes();
    await expect(service.install({ listing: 'wfl_abcdefgh12' }, async () => false)).rejects.toMatchObject({ code: 'NOT_CONFIRMED' });
    expect(links.showExploreListing).not.toHaveBeenCalled();
  });
  it('names the project open in Toone, then hands the listing to the app', async () => {
    const { service, links } = fakes();
    const asked: string[] = [];
    const done = await service.install({ listing: 'Apply to Grants' }, async (ask) => (asked.push(ask.title), true));
    expect(asked).toEqual(['Install "Apply to Grants" into growth?']);
    expect(links.showExploreListing).toHaveBeenCalledWith(expect.objectContaining({ kind: 'routine', id: 'wfl_abcdefgh12' }));
    expect(done).toMatchObject({ project: 'growth', id: 'wfl_abcdefgh12' });
    expect(done.next).toContain('Use this routine');
  });
  it('refuses a project that is not the one open in Toone, before asking', async () => {
    const { service, catalog } = fakes();
    const confirm = vi.fn(async () => true);
    await expect(service.install({ workspace: 'other', listing: 'wfl_abcdefgh12' }, confirm)).rejects.toMatchObject({ code: 'NOT_OPEN_IN_APP' });
    expect(confirm).not.toHaveBeenCalled();
    expect(catalog.detail).not.toHaveBeenCalled();
    await expect(fakes(false).service.install({ listing: 'wfl_abcdefgh12' }, confirm)).rejects.toMatchObject({ code: 'NOT_OPEN_IN_APP' });
  });
  it('caps search results', async () => {
    const { service, catalog } = fakes();
    await service.search({ search: 'grants', limit: 99 });
    expect(catalog.search).toHaveBeenCalledWith({ words: 'grants', kind: undefined, limit: 10 });
  });
});
