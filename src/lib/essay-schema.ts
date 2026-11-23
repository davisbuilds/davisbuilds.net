import { z } from 'astro/zod';
import { isCalendarDate } from './dates.ts';

export const STATUSES = ['notes', 'draft', 'in progress', 'finished'] as const;
export const CONFIDENCES = [
  'certain', 'highly likely', 'likely', 'possible', 'unlikely', 'highly unlikely', 'remote', 'impossible', 'personal',
] as const;

export { isCalendarDate };

// WHY: Validate the original date text because YAML rolls impossible unquoted dates forward before schema validation.
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
    /** Publication date set by the owner. A blank or missing value denotes an unpublished essay. */
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
