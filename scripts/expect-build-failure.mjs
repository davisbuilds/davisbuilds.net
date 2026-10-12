// Each bad essay fixture must fail the build, and the
// error must name both the file and the problem field. Builds into temporary
// directories so the real dist/ is untouched.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CASES = [
  { dir: './tests/fixtures/writing-bad', file: 'missing-written-by', field: 'written_by' },
  { dir: './tests/fixtures/writing-bad-date', file: 'impossible-date', field: 'created' },
];

let failed = false;
for (const c of CASES) {
  const outDir = mkdtempSync(join(tmpdir(), 'dbs-bad-build-'));
  const run = spawnSync('pnpm', ['exec', 'astro', 'build', '--outDir', outDir], {
    env: { ...process.env, DAVISBUILDS_CONTENT: c.dir },
    encoding: 'utf8',
  });
  rmSync(outDir, { recursive: true, force: true });
  const output = `${run.stdout}\n${run.stderr}`;
  if (run.status !== 0 && output.includes(c.file) && output.includes(c.field)) {
    console.log(`PASS (build failed on ${c.file}.md, naming ${c.field})`);
  } else {
    failed = true;
    console.error(`FAIL ${c.file}: exit ${run.status}; output ${output.includes(c.file) ? 'names' : 'does not name'} the file`);
    console.error(output.slice(-2000));
  }
}
process.exit(failed ? 1 : 0);
