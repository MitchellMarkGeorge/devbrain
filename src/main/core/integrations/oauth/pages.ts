import { BROWSER_PAGE_COLOURS, BROWSER_PAGE_FONT } from '@common/theme';
import logomarkDark from '../../../../renderer/assets/devbrain-logomark-dark.svg?raw';
import logomark from '../../../../renderer/assets/devbrain-logomark.svg?raw';
import template from './page.html?raw';

// The pages the loopback listener serves to the browser at the end of a sign-in: page.html, with
// the tokens, the logomark assets as data URIs, and each page's title and message filled in

const dataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;

const colours = (theme: keyof typeof BROWSER_PAGE_COLOURS) =>
  Object.entries(BROWSER_PAGE_COLOURS[theme])
    .map(([name, value]) => `--${name}: ${value};`)
    .join(' ');

function page(title: string, message: string): string {
  const values: Record<string, string> = {
    title,
    message,
    dark: colours('dark'),
    light: colours('light'),
    font: BROWSER_PAGE_FONT,
    logomark: dataUri(logomark),
    logomarkDark: dataUri(logomarkDark),
  };
  return template.replace(/{{(\w+)}}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`page.html has no value for {{${name}}}`);
    return values[name];
  });
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
