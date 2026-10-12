#!/usr/bin/env node
// Roll back to the release before the current one, then verify
// it: on the server against its manifest, and every file nginx serves against
// the same manifest (--no-http skips that; --public also checks the public
// hostname against the local snapshot).
//
//   node scripts/rollback.mjs [--no-http] [--public]
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
