// Every rendered page passes through here, in dev and at build time, so
// links to other sites open in a new tab wherever they come from: components,
// essay Markdown, oneshots data.
import { defineMiddleware } from 'astro:middleware';
import { markExternalLinks } from './lib/external-links';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;
  return new Response(markExternalLinks(await response.text()), response);
});
