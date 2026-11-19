/**
 * The site's share image (og:image): the card a link to any page shows in Slack, X, LinkedIn and
 * the like. public/og.png is made by `npm run website:screenshots` (e2e/screenshots/share-card.ts),
 * never by hand; its size is the one those services expect.
 */
export const SHARE_IMAGE = {
  path: '/og.png',
  width: 1200,
  height: 630,
  alt: 'DevBrain, the second brain for developers: its task list beside the words “Your tasks, projects, notes and calendar, in one local-first desktop app.”',
};
