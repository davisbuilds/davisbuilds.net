#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { findNames, findPrivateNames, privateNames, publicNames, scanTargets } from './lib/private-names.mjs';
import { DEPLOY_HOST, files, ID_RE, MANIFEST, manifestOf, remote, requireServeCheck, rsyncBinary, RSYNC_SHELL, SNAPSHOTS, verifyRelease } from './lib/release.mjs';

const { values } = parseArgs({
  options: {
    'no-activate': { type: 'boolean', default: false },
    'no-http': { type: 'boolean', default: false },
    public: { type: 'boolean', default: false },
    'allow-branch': { type: 'boolean', default: false },
  },
});
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const die = (msg) => { console.error(`deploy: ${msg}`); process.exit(1); };

if (run('git', ['status', '--porcelain']).trim()) die('the working tree has changes; deploy only committed work');
const sha = run('git', ['rev-parse', 'HEAD']).trim();
if (!values['allow-branch']) {
  run('git', ['fetch', '-q', 'origin', 'main']);
  if (sha !== run('git', ['rev-parse', 'origin/main']).trim()) die('HEAD is not origin/main (pass --allow-branch to deploy it anyway)');
}
const RSYNC = rsyncBinary();
if (!values['no-http'] && !values['no-activate']) {
  try { requireServeCheck(); } catch (e) { die(e.message); }
}
for (const v of ['DAVISBUILDS_FIXTURES', 'DAVISBUILDS_CONTENT', 'DAVISBUILDS_ONESHOTS']) {
  if (process.env[v]) die(`${v} is set; a release is always a production build`);
}

for (const p of ['private/tests', 'private/names.txt']) if (!existsSync(p)) die(`no ${p}; a deploy needs the private checkout's server checks and name list`);
console.log('server config checks…');
run('pnpm', ['exec', 'vitest', 'run', 'private/tests'], { stdio: 'inherit' });

console.log('building…');
run('pnpm', ['build'], { stdio: 'inherit' });

// WHY: Release snapshots exclude fixture inputs and telemetry, which is published independently.
const built = files('dist');
if (built.includes('telemetry.json')) die('dist/ contains telemetry.json; the site never ships it');
const fixtures = built.filter((f) => /(^|\/)fixture-/.test(f));
if (fixtures.length) die(`dist/ contains fixture content (${fixtures[0]}); is this a fixture build?`);
for (const f of ['index.html', '404.html']) if (!built.includes(f)) die(`dist/ has no ${f}`);

// WHY: Known public repository names provide a positive control before trusting a clean private-name scan.
const self = JSON.parse(run('gh', ['repo', 'view', '--json', 'name'])).name;
const texts = scanTargets(built, (f) => readFileSync(path.join('dist', f), 'utf8'));
if (!findNames(texts, publicNames()).length) die('the private-name scan found no public repository names either; it is not reading the build');
const leaks = findPrivateNames(texts, privateNames(self));
if (leaks.length) die(`dist/ names a private project:\n  ${leaks.join('\n  ')}`);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const id = `${stamp}-${sha.slice(0, 7)}`;
if (!ID_RE.test(id)) die(`bad release id ${id}`);
const snap = path.join(SNAPSHOTS, id);
cpSync('dist', snap, { recursive: true });
writeFileSync(path.join(snap, MANIFEST), manifestOf(snap));
console.log(`release ${id}: ${built.length} files`);

console.log(`uploading to ${DEPLOY_HOST}:incoming/${id}/…`);
// WHY: Web-readable modes whatever the local umask; the server also refuses a
// release nginx couldn't read.
run(RSYNC, ['-a', '--delete', '--chmod=D755,F644', ...RSYNC_SHELL, `${snap}/`, `${DEPLOY_HOST}:${id}/`], { stdio: 'inherit' });
console.log(remote('finalize', id));
if (values['no-activate']) {
  console.log(`not activated; ${id} is verified on the server and the previous release keeps serving`);
  process.exit(0);
}
console.log(remote('activate', id));

const problems = await verifyRelease(id, { served: !values['no-http'], publicCheck: values.public });
if (problems.length) {
  console.error(`deploy: ${id} is active but failed verification:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('roll back with: node scripts/rollback.mjs');
  process.exit(1);
}
const gc = remote('gc');
if (gc) console.log(gc);
// WHY: Keep the snapshots the server keeps, so any of them can be verified over HTTP.
const local = existsSync(SNAPSHOTS) ? readdirSync(SNAPSHOTS).filter((d) => ID_RE.test(d)).sort() : [];
for (const d of local.slice(0, -5)) rmSync(path.join(SNAPSHOTS, d), { recursive: true, force: true });
console.log(`live: ${id}`);
