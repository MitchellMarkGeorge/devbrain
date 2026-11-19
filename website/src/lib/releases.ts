/**
 * DevBrain's releases, read from GitHub Releases when the site is built (website/README.md).
 *
 * The installers are the files electron-builder names in electron-builder.yml (`artifactName`):
 * `DevBrain-<version>-arm64.dmg`, `DevBrain-<version>-x64.dmg`,
 * `DevBrain-Setup-<version>-x64.exe` and `DevBrain-<version>-x86_64.AppImage`. A change to those
 * names needs one here too.
 */

export const REPOSITORY = 'MitchellMarkGeorge/devbrain';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

export type Platform = 'mac-arm64' | 'mac-x64' | 'windows' | 'linux';

export interface Installer {
  platform: Platform;
  name: string;
  url: string;
  size: number;
}

export interface Release {
  version: string;
  name: string;
  url: string;
  publishedAt: Date;
  prerelease: boolean;
  /** The release notes as HTML, rendered and sanitised by GitHub */
  notesHtml: string;
  installers: Installer[];
}

export const PLATFORMS: Record<Platform, { label: string; detail: string }> = {
  'mac-arm64': { label: 'macOS', detail: 'Apple silicon (.dmg)' },
  'mac-x64': { label: 'macOS', detail: 'Intel (.dmg)' },
  windows: { label: 'Windows', detail: 'x64 installer (.exe)' },
  linux: { label: 'Linux', detail: 'x64 AppImage' },
};

function platformOf(fileName: string): Platform | undefined {
  if (fileName.endsWith('-arm64.dmg')) return 'mac-arm64';
  if (fileName.endsWith('-x64.dmg')) return 'mac-x64';
  if (fileName.startsWith('DevBrain-Setup-') && fileName.endsWith('.exe')) return 'windows';
  if (fileName.endsWith('.AppImage')) return 'linux';
  return undefined;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  body_html?: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

async function fetchReleases(): Promise<Release[]> {
  const headers: Record<string, string> = {
    // full+json adds body_html: the notes rendered and sanitised by GitHub
    Accept: 'application/vnd.github.full+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'devbrain-website-build',
  };
  // optional: raises the API's limit of 60 requests an hour for a build machine's address
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=50`, {
    headers,
  });
  // A private repository reads as not found without a token: its installers can't be downloaded
  // from the site either, so the site shows no releases
  if (response.status === 404) return [];
  if (!response.ok) {
    // Fails the build rather than publishing a download page that says there is nothing to get
    throw new Error(`GitHub releases: ${response.status} ${response.statusText}`);
  }

  const releases = (await response.json()) as GitHubRelease[];
  return releases
    .filter((r) => !r.draft && r.published_at)
    .map((r) => ({
      version: r.tag_name.replace(/^v/, ''),
      name: r.name || r.tag_name,
      url: r.html_url,
      publishedAt: new Date(r.published_at!),
      prerelease: r.prerelease,
      notesHtml: r.body_html ?? '',
      installers: r.assets.flatMap((asset) => {
        const platform = platformOf(asset.name);
        return platform
          ? [{ platform, name: asset.name, url: asset.browser_download_url, size: asset.size }]
          : [];
      }),
    }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

let releases: Promise<Release[]> | undefined;

/** Every published release, newest first; read once per build */
export function getReleases(): Promise<Release[]> {
  releases ??= fetchReleases();
  return releases;
}

/** The newest release that isn't a pre-release, or undefined before the first one */
export async function getLatestRelease(): Promise<Release | undefined> {
  return (await getReleases()).find((r) => !r.prerelease);
}

export function formatSize(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
