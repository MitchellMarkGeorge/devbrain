import type { APIRoute } from 'astro';

// robots.txt: every page may be crawled, and the sitemap is where @astrojs/sitemap writes it, at
// the site's address (astro.config.mjs: SITE_URL, so a build for another address names its own)
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
