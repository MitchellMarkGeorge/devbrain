// The environment variables that hold OAuth client ids and secrets. The main build inlines each one
// (see vite/main.config.ts), so this file imports nothing: the build config loads it directly.
export const OAUTH_CLIENT_ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
