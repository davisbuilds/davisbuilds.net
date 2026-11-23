// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import rehypeSidenotes from './src/lib/rehype-sidenotes.mjs';

export default defineConfig({
  site: 'https://davisbuilds.net',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [sitemap()],
  // WHY: Sandboxed demo frames have an opaque origin, so their font requests are
  // cross-origin. Dev and preview send this header; nginx sends it for
  // /oneshots/_vendor/ in production.
  server: { headers: { 'Access-Control-Allow-Origin': '*' } },
  // WHY: The margin-note plugin uses rehype, so the site selects the unified Markdown pipeline.
  markdown: { processor: unified({ rehypePlugins: [rehypeSidenotes] }) },
});
