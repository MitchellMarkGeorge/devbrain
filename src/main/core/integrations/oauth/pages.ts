import { BROWSER_PAGE_COLOURS, BROWSER_PAGE_FONT } from '@common/theme';

// The pages the loopback listener serves to the browser at the end of a sign-in. They are drawn as
// the onboarding screen's header (docs/design-system/components/OnboardingScreen.md): the
// logomark, a 30px title and one muted line, centred on the page. The listener stops accepting
// once it has answered, so a page loads nothing: the styles are inline and the marks are data
// URIs. Inter shows where it is installed; the page falls back along --font-sans otherwise.

// src/renderer/assets/devbrain-logomark.svg and devbrain-logomark-dark.svg, unchanged (a test
// keeps them in step)
export const LOGOMARK_SVG =
  '<svg fill="none" height="48" viewBox="0 0 40 48" width="40" xmlns="http://www.w3.org/2000/svg"><g fill="#fff"><path d="m39.9912 23.4176c-.3082-10.7763-9.1408-19.4176-19.9917-19.4176-3.4364 0-6.6703.86666-9.4952 2.39332z"/><path d="m7.69233 8.23393c-.82777.64708-1.60327 1.35793-2.31912 2.12517l33.75749 19.4899c.3034-.9937.5315-2.0202.6777-3.0728z"/><path d="m34.6261 37.6406c-.7158.7672-1.4913 1.4781-2.319 2.1252l-32.116401-18.5424c.146207-1.0527.374348-2.0792.677775-3.0728z"/><path d="m36.523 35.2717-34.54912-19.947c.43665-.9056.93953-1.7733 1.50236-2.5967l34.54906 19.9469c-.4366.9056-.9395 1.7733-1.5023 2.5968z"/><path d="m19.9995 44c3.4366 0 6.6707-.8667 9.4957-2.3936l-29.4873875-17.0245c.3078965 10.7766 9.1406275 19.4181 19.9916875 19.4181z"/></g></svg>';
export const LOGOMARK_DARK_SVG = LOGOMARK_SVG.replace('fill="#fff"', 'fill="#0a0a0a"');

const dataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const colours = (theme: keyof typeof BROWSER_PAGE_COLOURS) =>
  Object.entries(BROWSER_PAGE_COLOURS[theme])
    .map(([name, value]) => `--${name}: ${value};`)
    .join(' ');

const STYLE = `
:root { color-scheme: dark; ${colours('dark')} }
@media (prefers-color-scheme: light) { :root { color-scheme: light; ${colours('light')} } }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  display: flex; align-items: center; justify-content: center;
  padding: 24px 16px;
  background: var(--background); color: var(--foreground);
  font-family: ${BROWSER_PAGE_FONT};
  -webkit-font-smoothing: antialiased;
}
main { display: flex; flex-direction: column; align-items: center; max-width: 480px; text-align: center; }
img { display: block; width: 40px; height: 48px; }
h1 {
  margin: 38px 0 0; color: var(--foreground-strong);
  font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -0.025em;
}
p { margin: 8px 0 0; color: var(--muted-foreground); font-size: 14px; line-height: 20px; }
`
  .trim()
  .replace(/\n\s*/g, ' ');

function page(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · DevBrain</title><style>${STYLE}</style></head><body><main><picture><source srcset="${dataUri(LOGOMARK_DARK_SVG)}" media="(prefers-color-scheme: light)"><img src="${dataUri(LOGOMARK_SVG)}" alt="DevBrain" width="40" height="48"></picture><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

// the code arrived; the app exchanges it for tokens and shows the integration as connected
export const DONE_PAGE = page(
  'You’re signed in',
  'DevBrain is finishing the connection. You can close this tab.',
);
// the provider sent an error (the user declined, say) or no code
export const FAILED_PAGE = page(
  'Sign-in not completed',
  'You can close this tab and try again from DevBrain.',
);
// a callback without the state DevBrain sent: a stale tab, or another process
export const BAD_REQUEST_PAGE = page(
  'Unexpected sign-in link',
  'DevBrain isn’t waiting for this sign-in. You can close this tab.',
);
export const NOT_FOUND_PAGE = page('Nothing here', 'This page isn’t part of a DevBrain sign-in.');
