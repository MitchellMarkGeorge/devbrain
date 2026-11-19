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
            { label: 'Getting started', slug: 'docs/getting-started' },
            { label: 'How your work connects', slug: 'docs/connections' },
          ],
        },
        {
          label: 'Using DevBrain',
          items: [
            { label: 'Home and quick capture', slug: 'docs/home' },
            { label: 'Tasks', slug: 'docs/tasks' },
            { label: 'Projects', slug: 'docs/projects' },
            { label: 'Notes and the editor', slug: 'docs/notes' },
            { label: 'Calendar', slug: 'docs/calendar' },
            { label: 'Search', slug: 'docs/search' },
          ],
        },
        {
          label: 'Your data',
          items: [
            {
              label: 'Integrations',
              items: [
                { label: 'How sync works', slug: 'docs/integrations' },
                { label: 'Linear', slug: 'docs/integrations/linear' },
                { label: 'Google Calendar', slug: 'docs/integrations/google-calendar' },
              ],
            },
            { label: 'Workspaces', slug: 'docs/workspaces' },
            { label: 'Data and privacy', slug: 'docs/data-and-privacy' },
            { label: 'Import and export', slug: 'docs/import-export' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Settings', slug: 'docs/settings' },
            { label: 'Keyboard shortcuts', slug: 'docs/keyboard-shortcuts' },
            { label: 'Troubleshooting and FAQ', slug: 'docs/troubleshooting' },
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
