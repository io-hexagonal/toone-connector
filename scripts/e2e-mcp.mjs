// End-to-end check over real stdio: starts the bundled server, lists tools, reads, and proves actions need a yes.
// Never confirms anything, so it starts no routine, drafts nothing and opens nothing in Toone.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = process.argv[2] ?? 'plugin/server/toone-connector.mjs';
let failed = 0;
const check = (name, ok, note = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`); if (!ok) failed += 1; };
const text = (r) => r.content?.[0]?.text ?? '';

async function connect(capabilities, onAsk) {
  const client = new Client({ name: 'e2e', version: '0' }, { capabilities });
  if (onAsk) client.setRequestHandler(ElicitRequestSchema, onAsk);
  await client.connect(new StdioClientTransport({ command: 'node', args: [server, 'mcp'], env: { ...process.env, TOONE_CONNECTOR_UNPROMPTED: '' } }));
  return client;
}

const plain = await connect({});
const tools = (await plain.listTools()).tools;
check('lists 14 tools', tools.length === 14, tools.map((t) => t.name).join(' '));
check('every tool is marked read-only or not', tools.every((t) => typeof t.annotations?.readOnlyHint === 'boolean'));
check('5 tools act, 4 of them destructive', tools.filter((t) => t.annotations?.readOnlyHint === false).length === 5 && tools.filter((t) => t.annotations?.destructiveHint).length === 4);
const defs = JSON.stringify(tools).length;
check('tool definitions stay small', defs < 8000, `${defs} chars`);

const overview = await plain.callTool({ name: 'toone_overview', arguments: {} });
check('overview answers', !overview.isError && text(overview).includes('"workspace"'), `${text(overview).length} chars`);
const routines = JSON.parse(text(await plain.callTool({ name: 'toone_routines', arguments: {} }))).routines;
check('routines listed', routines.length > 0, `${routines.length} routines`);
const runs = JSON.parse(text(await plain.callTool({ name: 'toone_runs', arguments: { limit: 2 } }))).runs;
check('recent runs listed', runs.length > 0);
if (runs[0]) {
  const run = await plain.callTool({ name: 'toone_run', arguments: { runId: runs[0].runId } });
  check('one run stays under 6,000 chars', !run.isError && text(run).length < 6000, run.isError ? text(run) : `${text(run).length} chars`);
}
const books = JSON.parse(text(await plain.callTool({ name: 'toone_record_books', arguments: {} }))).books;
check('record books listed', Array.isArray(books), `${books.length} books`);
const withRecords = books.find((b) => b.records > 0);
if (withRecords) {
  const handled = await plain.callTool({ name: 'toone_handled', arguments: { book: withRecords.id, limit: 3 } });
  check('handled lookup answers', !handled.isError && JSON.parse(text(handled)).returned <= 3, `${text(handled).length} chars`);
}
const explored = await plain.callTool({ name: 'toone_explore', arguments: { search: 'grants', limit: 3 } });
const found = explored.isError ? { routines: [], bundles: [] } : JSON.parse(text(explored));
check('Explore search answers, short', !explored.isError && found.routines.length + found.bundles.length > 0 && text(explored).length < 4000, `${text(explored).length} chars`);
const pick = found.routines[0] ?? found.bundles[0];
if (pick) {
  const page = await plain.callTool({ name: 'toone_explore', arguments: { listing: pick.id } });
  check('one Explore listing says what setup asks', !page.isError && Array.isArray(JSON.parse(text(page)).youProvide), `${text(page).length} chars`);
  const noAsk = await plain.callTool({ name: 'toone_install', arguments: { listing: pick.id } });
  check('install is refused when the client cannot ask', noAsk.isError === true && text(noAsk).includes('CONFIRMATION_UNAVAILABLE'));
}
const target = routines[0].id;
const refused = await plain.callTool({ name: 'toone_start', arguments: { routine: target } });
check('start is refused when the client cannot ask', refused.isError === true && text(refused).includes('CONFIRMATION_UNAVAILABLE'));
const DESCRIPTION = 'Every Monday, list the five most relevant Product Hunt launches (connector check, never sent).';
const noDraft = await plain.callTool({ name: 'toone_make_routine', arguments: { description: DESCRIPTION } });
check('make routine is refused when the client cannot ask', noDraft.isError === true && text(noDraft).includes('CONFIRMATION_UNAVAILABLE'));
const bad = await plain.callTool({ name: 'toone_routines', arguments: { workspace: 'no-such-workspace' } });
check('unknown workspace gives a plain error', bad.isError === true && text(bad).includes('WORKSPACE_NOT_FOUND'));
await plain.close();

let asked = null;
const asking = await connect({ elicitation: {} }, async (req) => { asked = req.params.message; return { action: 'decline' }; });
const declined = await asking.callTool({ name: 'toone_start', arguments: { routine: target } });
check('start asks the person, naming the routine', typeof asked === 'string' && asked.includes(routines[0].name), asked?.split('\n')[0]);
check('a no starts nothing', declined.isError === true && text(declined).includes('NOT_CONFIRMED'));
const unticked = await connect({ elicitation: {} }, async () => ({ action: 'accept', content: { confirm: false } }));
const stillNo = await unticked.callTool({ name: 'toone_control', arguments: { runId: 'x', action: 'cancel' } });
check('an unticked box changes nothing', stillNo.isError === true && text(stillNo).includes('NOT_CONFIRMED'));
asked = null;
const notDrafted = await asking.callTool({ name: 'toone_make_routine', arguments: { description: DESCRIPTION } });
check('make routine asks, naming the project and quoting the description', typeof asked === 'string' && /^Make a routine in .+\?/.test(asked) && asked.includes('Every Monday, list the five'), asked?.split('\n')[0]);
check('a no drafts nothing', notDrafted.isError === true && text(notDrafted).includes('NOT_CONFIRMED'));
if (pick) {
  asked = null;
  const notInstalled = await asking.callTool({ name: 'toone_install', arguments: { listing: pick.id } });
  check('install asks, naming the listing and the project', typeof asked === 'string' && asked.includes(pick.title) && asked.includes(' into '), asked?.split('\n')[0]);
  check('a no opens nothing', notInstalled.isError === true && text(notInstalled).includes('NOT_CONFIRMED'));
}
await asking.close(); await unticked.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
