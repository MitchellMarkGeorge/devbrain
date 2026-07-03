import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isErrnoException, isNotFound, fileExists, directoryExists } from '../../local/utils';

describe('isErrnoException', () => {
  it('returns true when error has a code property', () => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    expect(isErrnoException(err)).toBe(true);
  });

  it('returns false for plain Error with no code', () => {
    expect(isErrnoException(new Error('plain'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isErrnoException('string')).toBe(false);
    expect(isErrnoException(null)).toBe(false);
    expect(isErrnoException(42)).toBe(false);
  });
});

describe('isNotFound', () => {
  it('returns true for ENOENT errors', () => {
    const err = Object.assign(new Error(), { code: 'ENOENT' });
    expect(isNotFound(err)).toBe(true);
  });

  it('returns false for other errno codes', () => {
    const err = Object.assign(new Error(), { code: 'EACCES' });
    expect(isNotFound(err)).toBe(false);
  });

  it('returns false for plain errors with no code', () => {
    expect(isNotFound(new Error('no code'))).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isNotFound('ENOENT')).toBe(false);
  });
});

describe('fileExists', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-utils-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true });
  });

  it('returns true for an existing file', async () => {
    const filePath = path.join(dir, 'test.txt');
    await fs.writeFile(filePath, 'content');
    expect(await fileExists(filePath)).toBe(true);
  });

  it('returns false for a missing path', async () => {
    expect(await fileExists(path.join(dir, 'missing.txt'))).toBe(false);
  });

  it('returns false for a directory', async () => {
    expect(await fileExists(dir)).toBe(false);
  });
});

describe('directoryExists', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-utils-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true });
  });

  it('returns true for an existing directory', async () => {
    expect(await directoryExists(dir)).toBe(true);
  });

  it('returns false for a missing path', async () => {
    expect(await directoryExists(path.join(dir, 'missing'))).toBe(false);
  });

  it('returns false for a file', async () => {
    const filePath = path.join(dir, 'file.txt');
    await fs.writeFile(filePath, '');
    expect(await directoryExists(filePath)).toBe(false);
  });
});
