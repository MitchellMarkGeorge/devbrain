// The development switches on the app's command line: `npm run dev -- --seed --reset`, or
// `npm run seed:dev -- --path .dev2`. Read from process.argv rather than app.commandLine, which
// takes only `--seed=7`, so `--seed 7` works too. A packaged app reads none of them.

export interface SeedSwitches {
  // --seed <n>: the dataset's shape; null for the seed's default
  seed: number | null;
  // --reset: wipe the DevBrain folder first, which is refused otherwise
  reset: boolean;
  // --name <name>: the workspace's name, instead of DEV_WORKSPACE_NAME
  name: string | null;
  // --seed-only: quit once seeded, without opening a window
  quit: boolean;
}

export interface DevSwitches {
  // --path <folder>: the DevBrain folder, relative to the repository, instead of DEV_PATH
  path: string | null;
  // seed before startup (--seed or --seed-only); null without either
  seed: SeedSwitches | null;
}

export const NO_DEV_SWITCHES: DevSwitches = { path: null, seed: null };

// a switch that can't be read; its message says how to write it
export class DevSwitchError extends Error {
  name = 'DevSwitchError';
}

/**
 * The development switches in `argv` (process.argv): `--name value` or `--name=value`. Anything
 * else is left alone, for Electron and Chromium. Throws a DevSwitchError for a switch without
 * the value it needs, a seed that isn't a whole number, or `--reset` or `--name` without a seed.
 */
export function readDevSwitches(argv: readonly string[]): DevSwitches {
  const path = valueOf(argv, 'path');
  const name = valueOf(argv, 'name');
  const seed = valueOf(argv, 'seed');
  const reset = argv.includes('--reset');
  const quit = argv.includes('--seed-only');

  if (path === '') throw new DevSwitchError('--path needs a folder: --path <folder>');
  if (name === '') throw new DevSwitchError('--name needs a name: --name <name>');
  if (seed !== undefined && seed !== '' && !/^\d+$/.test(seed)) {
    throw new DevSwitchError(`--seed takes a whole number, not "${seed}"`);
  }

  if (seed === undefined && !quit) {
    if (reset || name !== undefined) {
      throw new DevSwitchError('--reset and --name only apply with --seed or --seed-only');
    }
    return { path: path ?? null, seed: null };
  }
  return {
    path: path ?? null,
    seed: {
      seed: seed === undefined || seed === '' ? null : Number(seed),
      reset,
      name: name ?? null,
      quit,
    },
  };
}

// The switch's value: undefined when it is absent, '' when it is there with none. A value is the
// next argument when it doesn't start with a dash.
function valueOf(argv: readonly string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.slice(`--${name}=`.length);
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = argv[index + 1];
  return next === undefined || next.startsWith('-') ? '' : next;
}

/**
 * `argv` without the switches that seed, keeping `--path` and anything else: what scripts/dev.mts
 * passes when it relaunches Electron after a rebuild, so only the first launch seeds and every
 * one opens the same folder.
 */
export function withoutSeedSwitches(argv: readonly string[]): string[] {
  const kept: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--reset' || arg === '--seed-only') continue;
    if (arg.startsWith('--seed=') || arg.startsWith('--name=')) continue;
    if (arg === '--seed' || arg === '--name') {
      // and its value, when it has one
      if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) i++;
      continue;
    }
    kept.push(arg);
  }
  return kept;
}
