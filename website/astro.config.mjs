// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { fileURLToPath } from 'node:url';

// The site's address, for canonical links and the sitemap: devbrainapp.dev, also in a preview
// build, so search engines treat a preview as a copy of the real site. SITE_URL overrides it.
const site = process.env.SITE_URL ?? 'https://devbrainapp.dev';

export default defineConfig({
  site,
  integrations: [
    starlight({
      title: 'DevBrain',
      description: 'The second brain for developers.',
      // the app's logomark, read from the app (website/README.md: what the site shares with it)
      logo: {
        dark: '../src/renderer/assets/devbrain-logomark.svg',
        light: '../src/renderer/assets/devbrain-logomark-dark.svg',
        alt: 'DevBrain',
      },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/MitchellMarkGeorge/devbrain' },
      ],
      editLink: {
        baseUrl: 'https://github.com/MitchellMarkGeorge/devbrain/edit/main/website/',
      },
      // Inter and Geist Mono, as in the app, then the app's tokens and the theme built on them
      customCss: [
        '@fontsource/inter/400.css',
        '@fontsource/inter/500.css',
        '@fontsource/inter/600.css',
        '@fontsource/geist-mono/400.css',
        './src/styles/starlight.css',
      ],
      components: {
        // the docs' header links back to the marketing pages
        SocialIcons: './src/components/DocsHeaderLinks.astro',
      },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'docs' },
            { label: 'Installing DevBrain', slug: 'docs/install' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Workspaces', slug: 'docs/workspaces' },
            { label: 'Integrations', slug: 'docs/integrations' },
            { label: 'Import and export', slug: 'docs/import-export' },
          ],
        },
        // the rest of the site, also in the docs' menu on phones, where the header has no room
        // for DocsHeaderLinks
        {
          label: 'DevBrain',
          items: [
            { label: 'Home', link: '/' },
            { label: 'Download', link: '/download/' },
            { label: 'Changelog', link: '/changelog/' },
          ],
        },
      ],
    }),
  ],
  vite: {
    server: {
      // the site imports the app's tokens and logomark from ../src (website/README.md)
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
  },
});
