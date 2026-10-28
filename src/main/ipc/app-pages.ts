import { pathToFileURL } from 'node:url';

// The app's own pages: the only ones that may call main over IPC (senderGuard) or that the window
// may navigate to (the will-navigate guard in src/main/index.ts). Anything else, a provider's link
// that escaped the renderer's rules included, is refused (docs/security/untrusted-content.md).
export interface AppPages {
  includes(url: string | null | undefined): boolean;
}

export interface AppPagesOptions {
  // in development, the Vite dev server: any page on its origin
  devServerUrl?: string;
  // otherwise the built renderer's index.html, an absolute path, with any hash or query
  indexHtml: string;
}

export function appPages({ devServerUrl, indexHtml }: AppPagesOptions): AppPages {
  if (devServerUrl) {
    const { origin } = new URL(devServerUrl);
    return { includes: (url) => parse(url)?.origin === origin };
  }
  const index = pathToFileURL(indexHtml);
  return {
    includes: (url) => {
      const parsed = parse(url);
      return (
        parsed?.protocol === 'file:' &&
        parsed.host === index.host &&
        parsed.pathname === index.pathname
      );
    },
  };
}

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
