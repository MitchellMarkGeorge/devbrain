import { describe, it, expect } from 'vitest';
import { DevSwitchError, readDevSwitches, withoutSeedSwitches } from '../../runtime/dev-switches';

// process.argv as `electron .` gets it
const argv = (...args: string[]) => ['/path/to/electron', '.', ...args];

describe('readDevSwitches', () => {
  it('reads none from a plain launch, or from switches meant for Chromium', () => {
    expect(readDevSwitches(argv())).toEqual({ path: null, seed: null });
    expect(readDevSwitches(argv('--no-sandbox', '--ozone-platform=headless'))).toEqual({
      path: null,
      seed: null,
    });
  });

  it('reads --path alone, for the app to open another folder', () => {
    expect(readDevSwitches(argv('--path', '.dev2'))).toEqual({ path: '.dev2', seed: null });
    expect(readDevSwitches(argv('--path=.dev2'))).toEqual({ path: '.dev2', seed: null });
  });

  it('reads a bare --seed as the default dataset, continuing into the app', () => {
    expect(readDevSwitches(argv('--seed', '--reset'))).toEqual({
      path: null,
      seed: { seed: null, reset: true, name: null, quit: false },
    });
  });

  it('reads every seed switch, in either form', () => {
    const expected = {
      path: '.dev2',
      seed: { seed: 7, reset: true, name: 'Perf', quit: true },
    };
    expect(
      readDevSwitches(
        argv('--seed-only', '--seed', '7', '--name', 'Perf', '--path', '.dev2', '--reset'),
      ),
    ).toEqual(expected);
    expect(
      readDevSwitches(argv('--seed-only', '--seed=7', '--name=Perf', '--path=.dev2', '--reset')),
    ).toEqual(expected);
  });

  it('seeds for --seed-only without --seed', () => {
    expect(readDevSwitches(argv('--seed-only')).seed).toEqual({
      seed: null,
      reset: false,
      name: null,
      quit: true,
    });
  });

  it.each([
    [['--seed', 'many'], '--seed takes a whole number'],
    [['--seed=-1'], '--seed takes a whole number'],
    [['--seed', '--path'], '--path needs a folder'],
    [['--seed', '--name=', '--reset'], '--name needs a name'],
    [['--reset'], 'only apply with --seed'],
    [['--name', 'Perf'], 'only apply with --seed'],
  ])('refuses %j', (args, message) => {
    expect(() => readDevSwitches(argv(...args))).toThrow(DevSwitchError);
    expect(() => readDevSwitches(argv(...args))).toThrow(message);
  });
});

describe('withoutSeedSwitches', () => {
  it('drops the seed switches and their values, keeping --path and the rest', () => {
    expect(
      withoutSeedSwitches([
        '--seed',
        '7',
        '--reset',
        '--name',
        'Perf',
        '--path',
        '.dev2',
        '--seed-only',
        '--inspect',
      ]),
    ).toEqual(['--path', '.dev2', '--inspect']);
    expect(withoutSeedSwitches(['--seed=7', '--name=Perf', '--path=.dev2'])).toEqual([
      '--path=.dev2',
    ]);
  });

  it('keeps the switch after a bare --seed', () => {
    expect(withoutSeedSwitches(['--seed', '--path', '.dev2'])).toEqual(['--path', '.dev2']);
  });
});
