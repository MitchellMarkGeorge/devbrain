import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateId } from '@common/ids';
import {
  writeNoteFile,
  readNoteFile,
  deleteNoteFile,
  serializeNoteFile,
  MalformedNoteFileError,
} from '../../local/notes';
import { fileExists } from '../../local/utils';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-notes-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('writeNoteFile / readNoteFile', () => {
  it('writes a file that can be read back with the same id, title, and content', async () => {
    const id = generateId('note');
    const filePath = path.join(dir, `${id}.md`);
    await writeNoteFile(filePath, { id, title: 'My note' }, 'Hello world');

    const result = await readNoteFile(filePath);
    expect(result).toEqual({ id, title: 'My note', content: 'Hello world' });
  });

  it('creates parent directories that do not exist yet', async () => {
    const id = generateId('note');
    const filePath = path.join(dir, 'nested', 'notes', `${id}.md`);
    await writeNoteFile(filePath, { id, title: 'x' }, '');
    expect(await fileExists(filePath)).toBe(true);
  });

  it('refuses to overwrite an existing file', async () => {
    const id = generateId('note');
    const filePath = path.join(dir, `${id}.md`);
    await writeNoteFile(filePath, { id, title: 'first' }, '');

    await expect(writeNoteFile(filePath, { id, title: 'second' }, '')).rejects.toThrow();

    const result = await readNoteFile(filePath);
    expect(result.title).toBe('first');
  });

  it('throws MalformedNoteFileError when front matter is missing', async () => {
    const filePath = path.join(dir, 'plain.md');
    await fs.writeFile(filePath, 'Just a plain markdown file.');

    await expect(readNoteFile(filePath)).rejects.toBeInstanceOf(MalformedNoteFileError);
  });

  it('throws MalformedNoteFileError when front matter is missing required fields', async () => {
    const filePath = path.join(dir, 'incomplete.md');
    const id = generateId('note');
    await fs.writeFile(filePath, serializeNoteFile({ id, title: 'x' }, ''));
    // strip the title field to make the front matter invalid
    const raw = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(filePath, raw.replace(/title:.*\n/, ''));

    await expect(readNoteFile(filePath)).rejects.toBeInstanceOf(MalformedNoteFileError);
  });
});

describe('deleteNoteFile', () => {
  it('deletes an existing file', async () => {
    const id = generateId('note');
    const filePath = path.join(dir, `${id}.md`);
    await writeNoteFile(filePath, { id, title: 'x' }, '');

    await deleteNoteFile(filePath);
    expect(await fileExists(filePath)).toBe(false);
  });

  it('does not throw when the file does not exist', async () => {
    const filePath = path.join(dir, 'never-existed.md');
    await expect(deleteNoteFile(filePath)).resolves.toBeUndefined();
  });
});
