// Essay frontmatter. The content collection validates every essay
// against this at build time, so a missing field, an unknown value, or a
// `updated` or `published` date earlier than `created` fails the build.
import { z } from 'astro/zod';
import { isCalendarDate } from './dates.ts';

export const STATUSES = ['notes', 'draft', 'in progress', 'finished'] as const;
export const CONFIDENCES = [
  'certain', 'highly likely', 'likely', 'possible', 'unlikely', 'highly unlikely', 'remote', 'impossible', 'personal',
] as const;

export { isCalendarDate };

// YAML turns an unquoted date into a Date and silently rolls impossible days
// over (2026-02-31 becomes March 3), so the schema can't see the original.
// The loader runs this on the raw frontmatter text first.
// `published` may be blank: that means unpublished, as in the vault.
export function checkRawDates(frontmatter: string): string[] {
  const problems: string[] = [];
  for (const field of ['created', 'updated', 'published']) {
    const line = frontmatter.match(new RegExp(`^${field}:[ \\t]*(.*)$`, 'm'));
    if (!line) continue;
    const value = line[1].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    if (field === 'published' && !value) continue;
    if (!isCalendarDate(value)) problems.push(`\`${field}\` must be a real date as YYYY-MM-DD (got "${value}")`);
  }
  return problems;
}

// Accepts the Date YAML produces for an unquoted date, or a quoted
// YYYY-MM-DD string. Empty values and impossible days are rejected.
const calendarDate = z.union([
  z.date(),
  z.string().refine(isCalendarDate, 'must be a real date as YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00Z`)),
]);

export const essaySchema = z
  .strictObject({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    created: calendarDate,
    updated: calendarDate,
    status: z.enum(STATUSES),
    confidence: z.enum(CONFIDENCES),
    importance: z.int().min(0).max(10),
    tags: z.array(z.string().trim().min(1)),
    written_by: z.string().trim().min(1),
    // The date the essay went public. Blank (bare or quoted) or missing means
    // unpublished; only the owner sets it.
    published: z.union([z.literal('').transform(() => null), calendarDate]).nullish(),
    also_on: z.url({ protocol: /^https$/ }).optional(),
    canonical: z.url({ protocol: /^https$/ }).optional(),
  })
  .refine((e) => e.updated.getTime() >= e.created.getTime(), {
    message: '`updated` is earlier than `created`',
    path: ['updated'],
  })
  .refine((e) => !e.published || e.published.getTime() >= e.created.getTime(), {
    message: '`published` is earlier than `created`',
    path: ['published'],
  });

export type EssayData = z.infer<typeof essaySchema>;
export type Status = (typeof STATUSES)[number];
