#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkDocument } from '../../src/lib/telemetry-schema.ts';
import { checkAgainstPrevious } from '../../src/lib/telemetry-rules.ts';
import { sshVerb } from '../lib/release.mjs';
import { CANDIDATE, PUBLISHED } from './state.mjs';

const HOST = process.env.DAVISBUILDS_TELEMETRY_HOST ?? 'davisbuilds-telemetry';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { previous: { type: 'string' } } });
const file = positionals[0] ?? CANDIDATE;
const previousPath = values.previous ?? PUBLISHED;

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const checked = checkDocument(read(file));
let errors = checked.ok ? [] : checked.errors;
if (checked.ok && existsSync(previousPath)) {
  const previous = checkDocument(read(previousPath));
  errors = previous.ok ? checkAgainstPrevious(checked.value, previous.value) : previous.errors.map((e) => `previous: ${e}`);
}
if (errors.length) {
  console.error(`upload: ${file} failed validation; nothing was uploaded:`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// WHY: Reject directory creation failures before changing the published document.
mkdirSync(path.dirname(previousPath), { recursive: true });
console.log(sshVerb(HOST, ['put'], readFileSync(file)));
copyFileSync(file, `${previousPath}.tmp`);
renameSync(`${previousPath}.tmp`, previousPath);
console.log(`uploaded ${file}; ${previousPath} is the new baseline`);
