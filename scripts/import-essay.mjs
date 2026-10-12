#!/usr/bin/env node
// Copies a vault Writing note into src/content/writing/<slug>.md in the site's
// frontmatter (src/lib/essay-import.ts). Re-run it after editing the note in
// Obsidian; the vault stays the source. Nothing is written if the note has a
// problem, and every problem is listed.
//
//   node scripts/import-essay.mjs "<vault note>.md" [--dry-run]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { convertNote, sourceOf } from '../src/lib/essay-import.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node scripts/import-essay.mjs "<vault note>.md" [--dry-run]');
  process.exit(2);
}

// The note's path within its vault (the folder holding .obsidian) is its
// identity: two folders can each have a note with the same name.
const abs = path.resolve(file);
let vault = path.dirname(abs);
while (!existsSync(path.join(vault, '.obsidian')) && path.dirname(vault) !== vault) vault = path.dirname(vault);
if (!existsSync(path.join(vault, '.obsidian'))) {
  console.error(`${file} isn't inside an Obsidian vault (no .obsidian folder above it)`);
  process.exit(1);
}
const source = path.relative(vault, abs).split(path.sep).join('/');

let imported;
try {
  imported = convertNote(readFileSync(file, 'utf8'), path.basename(file), source);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const out = path.join('src/content/writing', `${imported.slug}.md`);
const before = existsSync(out) ? readFileSync(out, 'utf8') : null;
// Two note names can make the same slug ("A & B" and "A B"); never let one
// replace the other, or a file written by hand.
if (before !== null && sourceOf(before) !== source) {
  const owner = sourceOf(before);
  console.error(`${out} already exists ${owner ? `from vault note "${owner}"` : 'and was not imported'}; rename this note or move that file first`);
  process.exit(1);
}
const state = before === null ? 'new' : before === imported.markdown ? 'unchanged' : 'updated';
if (dryRun) {
  process.stdout.write(imported.markdown);
  console.error(`\n(dry run) would write ${out} (${state})`);
} else {
  if (state !== 'unchanged') writeFileSync(out, imported.markdown);
  console.log(`${out} (${state}); the essay will be at /writing/${imported.slug}/`);
}
