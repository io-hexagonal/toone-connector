// Checks that every place naming the version agrees before a release, and prints that version's changelog notes.
//   node scripts/release-check.mjs [--tag vX.Y.Z] [--notes FILE]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const problems = [];

const version = JSON.parse(read('package.json')).version;
const plugin = JSON.parse(read('plugin/.claude-plugin/plugin.json')).version;
const server = JSON.parse(read('server.json'));
const main = read('src/main.ts').match(/const VERSION = '([^']+)'/)?.[1];
const seen = { 'plugin/.claude-plugin/plugin.json': plugin, 'server.json': server.version, 'server.json packages[0]': server.packages?.[0]?.version, 'src/main.ts VERSION': main };
for (const [where, value] of Object.entries(seen)) if (value !== version) problems.push(`${where} says ${value}, package.json says ${version}`);
if (server.name !== JSON.parse(read('package.json')).mcpName) problems.push('server.json name and package.json mcpName differ');

const tag = option('--tag');
if (tag && tag !== `v${version}`) problems.push(`tag ${tag} does not match version ${version}`);

const changelog = read('CHANGELOG.md');
const heading = new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\][^\\n]*\\n`, 'm');
const start = changelog.search(heading);
let notes = '';
if (start < 0) problems.push(`CHANGELOG.md has no "## [${version}]" section`);
else {
  const body = changelog.slice(start).replace(heading, '');
  const end = body.search(/^## \[/m);
  notes = (end < 0 ? body : body.slice(0, end)).trim();
  if (!notes) problems.push(`CHANGELOG.md section ${version} is empty`);
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL  ${p}`);
  process.exit(1);
}
const notesFile = option('--notes');
if (notesFile) writeFileSync(notesFile, `${notes}\n`);
console.log(`OK  ${version}: package, plugin, server.json, CLI and changelog agree`);
