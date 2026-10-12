// Run manifests (run.toml) from the oneshots repository, schema 1. The
// repository accepts outside contributions, so everything here is untrusted
// input: a manifest that doesn't validate fails the build, naming its run.
import { parse } from 'smol-toml';
import { z } from 'astro/zod';
import { isCalendarDate } from '../dates.ts';

export class RunError extends Error {
  readonly slug: string;
  constructor(slug: string, reason: string) {
    super(`oneshots run "${slug}": ${reason}`);
    this.name = 'RunError';
    this.slug = slug;
  }
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const relPath = z.string().min(1).max(200);
const unrecorded = z.literal('unrecorded');

const manifestSchema = z
  .object({
    schema: z.literal(1),
    slug: z.string().regex(SLUG_RE),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(600),
    date: z.string().refine(isCalendarDate, 'must be a real date as YYYY-MM-DD'),
    kind: z.enum(['long-horizon', 'single-file']),
    medium: z.array(z.string().trim().min(1).max(40)).max(20),
    hero: relPath.optional(),
    entry: relPath,
    curator_note: z.string().max(4000).default(''),
    agent: z.object({
      model: z.string().trim().min(1).max(80),
      model_id: z.string().max(80).optional(),
      harness: z.string().trim().min(1).max(120),
      reasoning: z.string().max(40).optional(),
    }),
    run: z.object({
      brief: z.union([unrecorded, relPath]),
      human_turns: z.union([z.int().min(0).max(1000), unrecorded]),
      wall_clock_minutes: z.union([z.number().positive().max(100_000), unrecorded]).optional(),
      log: relPath.optional(),
      snapshots: relPath.optional(),
    }),
    build: z.record(z.string(), z.unknown()).optional(),
    assets: z
      .array(
        z.object({
          file: z.string().max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
          description: z.string().max(400).default(''),
        }),
      )
      .default([]),
  })
  .refine((m) => m.kind !== 'long-horizon' || (m.hero !== undefined && m.run.log !== undefined), {
    message: 'long-horizon runs must declare hero and run.log',
  });

export type Manifest = z.infer<typeof manifestSchema>;

// TOML dates arrive as smol-toml TomlDate objects; the manifest wants a plain
// local date. Anything else (a time, a date-time) is left for the schema to reject.
function normalizeDate(value: unknown): unknown {
  if (value instanceof Date && 'isDate' in value && typeof value.isDate === 'function' && value.isDate()) {
    return value.toISOString();
  }
  return value;
}

export function parseManifest(dirName: string, toml: string): Manifest {
  let raw: Record<string, unknown>;
  try {
    raw = parse(toml) as Record<string, unknown>;
  } catch (e) {
    throw new RunError(dirName, `run.toml is not valid TOML (${(e as Error).message.split('\n')[0]})`);
  }
  if (raw.schema !== 1) {
    throw new RunError(dirName, `unsupported manifest schema ${JSON.stringify(raw.schema)} (this site reads schema 1)`);
  }
  // The parser has already rolled an impossible unquoted date over, so check
  // every unquoted date value in the raw text.
  for (const m of toml.matchAll(/=[ \t]*(\d{4}-\d{2}-\d{2})(?![\d-])/g)) {
    if (!isCalendarDate(m[1])) throw new RunError(dirName, `date: ${m[1]} is not a real date`);
  }
  const result = manifestSchema.safeParse({ ...raw, date: normalizeDate(raw.date) });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new RunError(dirName, `${issue.path.join('.') || 'manifest'}: ${issue.message}`);
  }
  if (result.data.slug !== dirName) {
    throw new RunError(dirName, `slug "${result.data.slug}" does not match its directory`);
  }
  return result.data;
}

// Which lab a model comes from, for the page's filters.
export function labOf(agent: Manifest['agent']): 'anthropic' | 'openai' | 'other' {
  const id = `${agent.model_id ?? ''} ${agent.model}`.toLowerCase();
  if (/\bclaude\b|claude-|\bfable\b/.test(id)) return 'anthropic';
  if (/\bgpt\b|gpt-|\bcodex\b|\bo\d\b/.test(id)) return 'openai';
  return 'other';
}
