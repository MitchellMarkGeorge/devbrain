import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { notes as notesTable } from '@main/db/schema/notes';
import { createDb } from '../utils';
import { ArchiveService } from '../../archive/service';
import { NoteChange, NoteService } from '../../notes/service';
import { ProjectService } from '../../projects/service';
import { TaskService } from '../../tasks/service';
import { TaskPriority } from '../../tasks/types';
import { ImportFileError } from '../../shared/errors';
import { MAX_NOTE_FILE_BYTES, MAX_NOTE_FILES } from '../../transfer/limits';
import { TransferService } from '../../transfer/service';

// Importing and exporting notes through TransferService, over real services, a database and files.

const NOW = new Date(2026, 9, 31, 15, 30);
const DUE = new Date(2026, 11, 1);

let dir: string;
let files: string;
let db: BetterSQLite3Database;
let notes: NoteService;
let projects: ProjectService;
let transfer: TransferService;

function workspaceAt(workspacePath: string, database = createDb()) {
  const n = new NoteService(database, workspacePath);
  const p = new ProjectService(database);
  const service = new TransferService({
    tasks: new TaskService(database),
    notes: n,
    projects: p,
    taskDefaults: () => ({ defaultDueDate: 'today', defaultPriority: TaskPriority.LOW }),
    now: () => NOW,
  });
  return { db: database, notes: n, projects: p, transfer: service };
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-transfer-notes-'));
  files = path.join(dir, 'chosen');
  await fs.mkdir(files);
  ({ db, notes, projects, transfer } = workspaceAt(path.join(dir, 'workspace')));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function write(name: string, content: string | Buffer): Promise<string> {
  const filePath = path.join(files, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('importing Markdown files', () => {
  it('takes the title from the front matter, or else from the file name', async () => {
    const site = projects.createProject({ title: 'Website', dueDate: DUE });
    const summary = await transfer.importNotesFromFiles([
      await write('with-front-matter.md', '---\ntitle: Kickoff\nproject: website\n---\n# Agenda\n'),
      await write('Plain notes.markdown', '# Heading\n\nNo front matter here.\n\n---\n\nA rule.\n'),
      await write('empty.txt', ''),
    ]);
    expect(summary).toEqual({ created: 3, skipped: [], errors: [], warnings: [] });

    const all = notes.listAll();
    expect(all.map(({ title, projectId }) => [title, projectId])).toEqual([
      ['Kickoff', site.id],
      ['Plain notes', null],
      ['empty', null],
    ]);
    expect(await notes.readContent(all[0].id)).toBe('# Agenda\n');
    // a --- rule in the body is not front matter
    expect(await notes.readContent(all[1].id)).toBe(
      '# Heading\n\nNo front matter here.\n\n---\n\nA rule.\n',
    );
    expect(all[1].preview).toContain('No front matter here');
  });

  it('reports bad files and imports the rest', async () => {
    const summary = await transfer.importNotesFromFiles([
      await write('good.md', 'Fine'),
      await write('bad-yaml.md', '---\ntitle: [unclosed\n---\nBody'),
      await write('list.md', '---\n- a\n- b\n---\nBody'),
      await write('object-title.md', '---\ntitle:\n  nested: true\n---\nBody'),
      await write('binary.md', Buffer.from([0x00, 0x01, 0x02])),
      await write('image.png', 'not markdown'),
      await write('too-big.md', 'x'.repeat(MAX_NOTE_FILE_BYTES + 1)),
      await write('unknown-project.md', '---\nproject: Nope\n---\nBody'),
    ]);
    expect(summary.created).toBe(2);
    expect(summary.errors.map(({ file, message }) => [file, message])).toEqual([
      ['bad-yaml.md', expect.stringContaining('not valid YAML')],
      ['list.md', expect.stringContaining('"key: value" pairs')],
      ['object-title.md', expect.stringContaining('"title" in its front matter must be text')],
      ['binary.md', expect.stringContaining('not a text file')],
      ['image.png', 'Not a Markdown file'],
      ['too-big.md', expect.stringContaining('larger than 5 MB')],
    ]);
    expect(summary.warnings).toEqual([
      {
        file: 'unknown-project.md',
        title: 'unknown-project',
        message: 'No project is named "Nope"; imported without a project',
      },
    ]);
  });

  it('ignores any path or id in the front matter, writing each note into the workspace', async () => {
    const summary = await transfer.importNotesFromFiles([
      await write(
        'sneaky.md',
        '---\ntitle: Sneaky\nid: ../../outside\nfilePath: /etc/passwd\n---\nBody',
      ),
    ]);
    expect(summary.created).toBe(1);
    const [note] = notes.listAll();
    expect(note.id).toMatch(/^nte_/);
    const [row] = db.select().from(notesTable).all();
    expect(path.dirname(row.filePath)).toBe(path.join(dir, 'workspace', 'notes'));
    await expect(fs.readdir(path.join(dir, '..'))).resolves.not.toContain('outside');
  });

  it('creates the notes together, sending created with their content', async () => {
    const seen: NoteChange[] = [];
    notes.onChange((change) => seen.push(change));
    await transfer.importNotesFromFiles([
      await write('a.md', 'Alpha'),
      await write('b.md', 'Beta'),
    ]);
    expect(seen.map((change) => [change.type, change.content])).toEqual([
      ['created', 'Alpha'],
      ['created', 'Beta'],
    ]);
  });

  it('refuses too many files, or too much together, before reading any', async () => {
    const many = Array.from({ length: MAX_NOTE_FILES + 1 }, (_, i) => path.join(files, `${i}.md`));
    await expect(transfer.importNotesFromFiles(many)).rejects.toBeInstanceOf(ImportFileError);

    const big = await write('big.md', 'x'.repeat(MAX_NOTE_FILE_BYTES));
    const error = await transfer
      .importNotesFromFiles(Array.from({ length: 11 }, () => big))
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'import_file', reason: 'too_large' });
    expect(notes.listAll()).toEqual([]);
  });
});

describe('exporting notes', () => {
  it('writes a new folder of .md files that imports back as it was', async () => {
    const site = projects.createProject({ title: 'Website', dueDate: DUE });
    const kickoff = await notes.createNote({ title: 'Kickoff: "v2"', projectId: site.id });
    await notes.updateNoteContent(kickoff.id, '# Agenda\n\n- one\n');
    await notes.createNote({ title: 'Kickoff: "v2"' });
    await notes.createNote({ title: '' });
    await notes.createNote({ title: '../../escape' });

    const result = await transfer.exportNotesToFolder(files);
    expect(result).toEqual({
      path: path.join(files, 'DevBrain notes 2026-10-31'),
      count: 4,
      errors: [],
    });
    const written = (await fs.readdir(result.path)).sort();
    expect(written).toEqual(
      ['-..-escape.md', 'Kickoff- -v2-.md', 'Kickoff- -v2- (2).md', 'Untitled.md'].sort(),
    );
    // nothing was written outside the new folder
    expect((await fs.readdir(files)).sort()).toEqual(['DevBrain notes 2026-10-31']);
    expect(await fs.readFile(path.join(result.path, 'Kickoff- -v2-.md'), 'utf8')).toBe(
      `---\ntitle: 'Kickoff: "v2"'\nproject: Website\nid: ${kickoff.id}\n---\n# Agenda\n\n- one\n`,
    );

    // a second export gets its own folder
    expect((await transfer.exportNotesToFolder(files)).path).toBe(
      path.join(files, 'DevBrain notes 2026-10-31 (2)'),
    );

    // into the same workspace: nothing new
    const paths = written.map((name) => path.join(result.path, name));
    expect(await transfer.importNotesFromFiles(paths)).toMatchObject({
      created: 0,
      skipped: expect.arrayContaining([
        expect.objectContaining({ message: 'Already in this workspace' }),
      ]),
    });

    // into another one: the same notes
    const other = workspaceAt(path.join(dir, 'other'));
    other.projects.createProject({ title: 'Website', dueDate: DUE });
    expect((await other.transfer.importNotesFromFiles(paths)).created).toBe(4);
    const imported = other.notes
      .listAll()
      .find((note) => note.title === 'Kickoff: "v2"' && note.projectId);
    expect(imported).toBeDefined();
    expect(await other.notes.readContent(imported!.id)).toBe('# Agenda\n\n- one\n');
  });

  it('leaves out a note whose file is gone, and archived notes', async () => {
    const gone = await notes.createNote({ title: 'Gone' });
    const archived = await notes.createNote({ title: 'Archived' });
    await fs.rm(path.join(dir, 'workspace', 'notes', `${gone.id}.md`));
    new ArchiveService(db).archiveNote(archived.id);

    const result = await transfer.exportNotesToFolder(files);
    expect(result.count).toBe(0);
    expect(result.errors).toEqual([
      { noteId: gone.id, title: 'Gone', message: expect.stringContaining('could not be read') },
    ]);
  });

  it('refuses a path that is not a folder', async () => {
    const file = await write('file.md', 'x');
    await expect(transfer.exportNotesToFolder(file)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });
});
