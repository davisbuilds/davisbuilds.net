#!/usr/bin/env node
/**
 * Verify the live release or a given release ID against its manifest.
 * Use --no-http to skip the origin HTTP comparison or --public to compare the public host.
 */
import { parseArgs } from 'node:util';
import { currentRelease, verifyRelease } from './lib/release.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'no-http': { type: 'boolean', default: false }, public: { type: 'boolean', default: false } } });
const id = positionals[0] ?? currentRelease();
if (!id) {
  console.error('verify-deploy: no release is active');
  process.exit(1);
}
const problems = await verifyRelease(id, { served: !values['no-http'], publicCheck: values.public });
if (problems.length) {
  console.error(`verify-deploy: ${id} failed:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`ok: ${id}`);
