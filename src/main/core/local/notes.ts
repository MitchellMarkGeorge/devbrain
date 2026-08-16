import { NoteId } from '@common/ids';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { extractFrontmatter, serializeFrontmatter } from './frontmatter';

export type NoteFileFrontmatter = {
  id: NoteId;
  title: string;
};

export type NoteFileData = NoteFileFrontmatter & { content: string };

const noteFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export class MalformedNoteFileError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Note file is missing or has invalid front matter: ${filePath}`);
    this.name = 'MalformedNoteFileError';
    this.cause = cause;
  }
}

export function serializeNoteFile(data: NoteFileFrontmatter, content: string): string {
  return serializeFrontmatter(data, content);
}

export async function writeNoteFile(
  filePath: string,
  data: NoteFileFrontmatter,
  content: string,
): Promise<void> {
  // create a new note file. fails if there is a file that exists with the same path
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeNoteFile(data, content), { encoding: 'utf8', flag: 'wx' });
}

export async function updateNoteFile(
  filePath: string,
  data: NoteFileFrontmatter,
  content: string,
): Promise<void> {
  // note file writes are attomic so no errors mid write can corrupt it
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);

  await fs.writeFile(tmpPath, serializeNoteFile(data, content), 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    // clean up
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}

export async function readNoteFile(filePath: string): Promise<NoteFileData> {
  // read a note file and validate the font matter
  const raw = await fs.readFile(filePath, 'utf8');
  const { data: attrs, content: body } = extractFrontmatter<NoteFileFrontmatter>(raw);

  const result = noteFrontmatterSchema.safeParse(attrs);
  if (!result.success) {
    throw new MalformedNoteFileError(filePath, result.error);
  }

  return { id: result.data.id as NoteId, title: result.data.title, content: body };
}

export async function deleteNoteFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}
