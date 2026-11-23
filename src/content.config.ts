// WHY: Tests can select a fixture content directory to keep working drafts out of builds under test.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineCollection } from 'astro:content';
import { glob, type Loader } from 'astro/loaders';
import { checkRawDates, essaySchema } from './lib/essay-schema';

const base = process.env.DAVISBUILDS_CONTENT ?? './src/content/writing';
const files = glob({ pattern: '**/*.md', base });

const loader: Loader = {
  name: 'writing',
  load: async (context) => {
    await files.load(context);
    for (const entry of context.store.values()) {
      if (!entry.filePath) continue;
      const raw = readFileSync(path.resolve(entry.filePath), 'utf8');
      const frontmatter = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      const problems = checkRawDates(frontmatter);
      if (problems.length) throw new Error(`${entry.filePath}: ${problems.join('; ')}`);
    }
  },
};

const writing = defineCollection({ loader, schema: essaySchema });

export const collections = { writing };
