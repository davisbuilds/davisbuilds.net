#!/usr/bin/env node
/**
 * Validate a candidate telemetry document before publication.
 * Pass <document.json> and optionally --previous <published.json>. Invalid input exits with status 1.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkDocument } from '../../src/lib/telemetry-schema.ts';
import { checkAgainstPrevious } from '../../src/lib/telemetry-rules.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { previous: { type: 'string' } } });
if (positionals.length !== 1) {
  console.error('usage: validate.mjs <document.json> [--previous <published.json>]');
  process.exit(2);
}

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const doc = read(positionals[0]);
const checked = checkDocument(doc);
let errors = checked.ok ? [] : checked.errors;
if (checked.ok && values.previous) {
  const previous = checkDocument(read(values.previous));
  errors = previous.ok ? checkAgainstPrevious(checked.value, previous.value) : previous.errors.map((e) => `previous: ${e}`);
}

if (errors.length) {
  console.error(`${positionals[0]}: invalid`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${positionals[0]}: valid`);
