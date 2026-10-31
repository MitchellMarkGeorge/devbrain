import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportFileError } from '../../shared/errors';
import {
  childPath,
  createUniqueDirectory,
  readImportFile,
  safeFileName,
  uniqueName,
} from '../../transfer/files';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-transfer-files-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function reason(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ImportFileError);
  return (error as ImportFileError).reason;
}

describe('readImportFile', () => {
  it('reads UTF-8 text and drops a byte order mark', async () => {
    const file = path.join(dir, 'tasks.csv');
    await fs.writeFile(file, '\ufefftitle\nCafé');
    expect(await readImportFile(file, 1024)).toBe('title\nCafé');
  });

  it('refuses a file over the limit, without reading it', async () => {
    const file = path.join(dir, 'big.csv');
    await fs.writeFile(file, 'x'.repeat(101));
    expect(await reason(readImportFile(file, 100))).toBe('too_large');
    await fs.writeFile(file, 'x'.repeat(100));
    expect(await readImportFile(file, 100)).toHaveLength(100);
  });

  it('refuses binary files and text that is not UTF-8', async () => {
    const binary = path.join(dir, 'image.csv');
    await fs.writeFile(binary, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
    expect(await reason(readImportFile(binary, 1024))).toBe('not_text');
    const latin1 = path.join(dir, 'latin1.csv');
    await fs.writeFile(latin1, Buffer.from([0x43, 0x61, 0x66, 0xe9]));
    expect(await reason(readImportFile(latin1, 1024))).toBe('not_text');
  });

  it('refuses a directory and a missing file', async () => {
    expect(await reason(readImportFile(dir, 1024))).toBe('unreadable');
    expect(await reason(readImportFile(path.join(dir, 'missing.csv'), 1024))).toBe('unreadable');
  });

  it('names the file by its base name only', async () => {
    const error = await readImportFile(path.join(dir, 'missing.csv'), 1024).catch((e) => e);
    expect(error.fileName).toBe('missing.csv');
    expect(error.message).not.toContain(dir);
  });
});

describe('export file names', () => {
  it('never leave the folder, hide the file or use a reserved name', () => {
    expect(safeFileName('../../etc/passwd')).toBe('-..-etc-passwd');
    expect(safeFileName('..')).toBe('Untitled');
    expect(safeFileName('.hidden')).toBe('hidden');
    expect(safeFileName('a\\b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i');
    expect(safeFileName('line\nbreak\u0000')).toBe('line-break-');
    expect(safeFileName('Ends with dots...  ')).toBe('Ends with dots');
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('   ')).toBe('Untitled');
    expect([...safeFileName('x'.repeat(300))]).toHaveLength(100);
    for (const title of ['../a', '/abs/path', 'C:\\win', '..\\..\\up']) {
      expect(path.dirname(childPath(dir, `${safeFileName(title)}.md`))).toBe(path.resolve(dir));
    }
  });

  it('childPath refuses a name that leaves its folder', () => {
    expect(() => childPath(dir, '../escape.md')).toThrow();
    expect(() => childPath(dir, 'sub/inner.md')).toThrow();
  });

  it('are made unique without regard to case', () => {
    const taken = new Set<string>();
    expect(uniqueName('Notes', taken)).toBe('Notes');
    expect(uniqueName('notes', taken)).toBe('notes (2)');
    expect(uniqueName('Notes', taken)).toBe('Notes (3)');
  });

  it('createUniqueDirectory never reuses a folder that is there', async () => {
    const first = await createUniqueDirectory(dir, 'Export');
    const second = await createUniqueDirectory(dir, 'Export');
    expect(path.basename(first)).toBe('Export');
    expect(path.basename(second)).toBe('Export (2)');
  });
});
