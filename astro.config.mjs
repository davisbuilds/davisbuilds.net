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
  // Sandboxed demo frames have an opaque origin, so their font requests are
  // cross-origin. Dev and preview send this header; nginx sends it for
  // /oneshots/_vendor/ in production.
  server: { headers: { 'Access-Control-Allow-Origin': '*' } },
  // The unified pipeline, not Astro's default Sätteri, so the margin-note
  // plugin can run as an ordinary rehype plugin.
  markdown: { processor: unified({ rehypePlugins: [rehypeSidenotes] }) },
});
