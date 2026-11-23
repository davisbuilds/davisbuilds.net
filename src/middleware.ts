// WHY: Process the rendered HTML so external-link handling also covers Markdown and generated content.
import { defineMiddleware } from 'astro:middleware';
import { markExternalLinks } from './lib/external-links';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  return new Response(markExternalLinks(await response.text()), response);
});
