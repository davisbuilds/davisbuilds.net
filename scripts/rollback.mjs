#!/usr/bin/env node
/**
 * Activate the previous release and verify it against its manifest.
 * Use --no-http to skip the origin HTTP comparison or --public to compare the public host.
 */
import { parseArgs } from 'node:util';
import { remote, requireServeCheck, verifyRelease } from './lib/release.mjs';

const { values } = parseArgs({ options: { 'no-http': { type: 'boolean', default: false }, public: { type: 'boolean', default: false } } });
if (!values['no-http']) {
  try {
    requireServeCheck();
  } catch (e) {
    console.error(`rollback: ${e.message}`);
    process.exit(1);
  }
}
const out = remote('rollback');
console.log(out);
const id = out.match(/^active: (\S+)$/m)?.[1];
if (!id) {
  console.error('rollback: the server did not name the release it activated');
  process.exit(1);
}
const problems = await verifyRelease(id, { served: !values['no-http'], publicCheck: values.public });
if (problems.length) {
  console.error(`rollback: ${id} is active but failed verification:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`live: ${id}`);
