import fs from 'node:fs/promises';
import path from 'node:path';
import { isId, type ProjectId, type TaskId } from '@common/ids';
import type { NoteService } from '../notes/service';
import type { ProjectService } from '../projects/service';
import type { TaskService } from '../tasks/service';
import { resolveDefaultDueDate, type TaskDefaults } from '../tasks/defaults';
import type { CreateNoteOptions } from '../notes/types';
import { toDateString } from '../shared/dates';
import { ImportFileError, InvalidInputError } from '../shared/errors';
import { errorClass } from '../shared/logger';
import { collectPages } from '../shared/pagination';
import {
  childPath,
  createUniqueDirectory,
  extensionOf,
  formatBytes,
  readImportFile,
  safeFileName,
  uniqueName,
} from './files';
import {
  MAX_NOTE_FILE_BYTES,
  MAX_NOTE_FILES,
  MAX_NOTES_TOTAL_BYTES,
  MAX_TASK_FILE_BYTES,
} from './limits';
import { formatNoteMarkdown, parseNoteMarkdown } from './note-format';
import {
  formatTasksCsv,
  formatTasksJson,
  parseTasksCsv,
  parseTasksJson,
  toExportedTasks,
  type TaskRecord,
} from './task-format';
import { matchKey, planTaskImport } from './task-import';
import type {
  NoteExportResult,
  NoteImportIssue,
  NoteImportSummary,
  TaskExportResult,
  TaskFileFormat,
  TaskImportSummary,
} from './types';

export const NOTE_EXTENSIONS = ['md', 'markdown', 'txt'];

export interface TransferServiceOptions {
  tasks: TaskService;
  notes: NoteService;
  projects: ProjectService;
  // read at each import, so a changed setting applies to the next one
  taskDefaults: () => TaskDefaults;
  // the clock defaults and export names follow; tests pass a fixed one
  now?: () => Date;
}

/**
 * Imports tasks and notes from files and exports them to files (docs/import-export.md). The main
 * process picks the files with its dialogs and passes their paths; nothing in a file is ever taken
 * as a path. Everything is created through TaskService and NoteService, so the change events,
 * search index and recents follow an import as they follow anything created by hand.
 */
export class TransferService {
  private readonly tasks: TaskService;
  private readonly notes: NoteService;
  private readonly projects: ProjectService;
  private readonly taskDefaults: () => TaskDefaults;
  private readonly now: () => Date;

  constructor(options: TransferServiceOptions) {
    this.tasks = options.tasks;
    this.notes = options.notes;
    this.projects = options.projects;
    this.taskDefaults = options.taskDefaults;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Imports the tasks in a .csv or .json file. Throws ImportFileError when the file as a whole
   * can't be read (too large, not text, malformed, another extension); otherwise every valid row is
   * created in one transaction and the rest are reported in the summary.
   */
  async importTasksFromFile(filePath: string): Promise<TaskImportSummary> {
    const format = taskFileFormat(filePath);
    const text = await readImportFile(filePath, MAX_TASK_FILE_BYTES);
    return this.importTasks(text, format, path.basename(filePath));
  }

  /**
   * Imports tasks from a file's text. Bad rows are skipped and reported rather than failing the
   * import; the good ones are created together, all or none (TaskService.createTaskTrees).
   */
  importTasks(
    text: string,
    format: TaskFileFormat,
    fileName = `tasks.${format}`,
  ): TaskImportSummary {
    const { roots, warnings } =
      format === 'csv' ? parseTasksCsv(text, fileName) : parseTasksJson(text, fileName);

    const defaults = this.taskDefaults();
    const plan = planTaskImport(roots, {
      defaultDueDate: resolveDefaultDueDate(defaults.defaultDueDate, this.now()),
      defaultPriority: defaults.defaultPriority,
      projectsByTitle: this.projectsByTitle(),
      existingTaskIds: this.existingTaskIds(roots),
    });
    const created = this.tasks.createTaskTrees(plan.trees);
    return {
      created: created.length,
      skipped: plan.skipped,
      errors: plan.errors,
      warnings: [...warnings, ...plan.warnings].sort((a, b) => a.row - b.row),
    };
  }

  /**
   * Writes every active task, synced ones marked with their source, to `filePath` as CSV or JSON,
   * replacing what is there (the save dialog has asked).
   */
  async exportTasksToFile(filePath: string, format: TaskFileFormat): Promise<TaskExportResult> {
    const { content, count } = this.exportTasks(format);
    await fs.writeFile(filePath, content, 'utf8');
    return { path: filePath, format, count };
  }

  exportTasks(format: TaskFileFormat): { content: string; count: number } {
    // active tasks, subtasks and synced ones included, oldest first; each names its project
    const tasks = collectPages((page) =>
      this.tasks.listTasks({}, { sortBy: 'createdAt', direction: 'asc' }, page),
    );
    const roots = toExportedTasks(tasks);
    const content = format === 'csv' ? formatTasksCsv(roots) : formatTasksJson(roots, this.now());
    return { content, count: tasks.length };
  }

  /**
   * Imports Markdown files as notes, one note per file. Throws ImportFileError when there are too
   * many files or they are too large together. A file that can't be read or has bad front matter
   * is reported and the rest imported; the notes are created together, all or none
   * (NoteService.createNotes).
   */
  async importNotesFromFiles(filePaths: string[]): Promise<NoteImportSummary> {
    const summary: NoteImportSummary = { created: 0, skipped: [], errors: [], warnings: [] };
    if (filePaths.length === 0) return summary;
    const firstName = path.basename(filePaths[0]);
    if (filePaths.length > MAX_NOTE_FILES) {
      throw new ImportFileError(
        'too_large',
        firstName,
        `Import at most ${MAX_NOTE_FILES.toLocaleString('en-US')} notes at a time`,
      );
    }
    await this.checkTotalSize(filePaths, firstName);

    const records = [];
    for (const filePath of filePaths) {
      const file = path.basename(filePath);
      if (!NOTE_EXTENSIONS.includes(extensionOf(filePath))) {
        summary.errors.push({ file, title: null, message: 'Not a Markdown file' });
        continue;
      }
      try {
        const raw = await readImportFile(filePath, MAX_NOTE_FILE_BYTES);
        records.push({ file, ...parseNoteMarkdown(raw, filePath) });
      } catch (error) {
        if (!(error instanceof ImportFileError)) throw error;
        summary.errors.push({ file, title: null, message: error.message });
      }
    }

    const noteIds = records.flatMap(({ id }) => (isId('note', id) ? [id] : []));
    const existing = new Set<string>(this.notes.getByIds(noteIds).map(({ id }) => id));
    const projectsByTitle = this.projectsByTitle();
    const batch: CreateNoteOptions[] = [];
    for (const { file, title, project, id, content } of records) {
      const issue = (message: string): NoteImportIssue => ({ file, title, message });
      if (id !== null && existing.has(id)) {
        summary.skipped.push(issue('Already in this workspace'));
        continue;
      }
      let projectId: ProjectId | undefined;
      if (project !== null) {
        const matches = projectsByTitle.get(matchKey(project)) ?? [];
        if (matches.length === 1) [projectId] = matches;
        else {
          summary.warnings.push(
            issue(
              matches.length === 0
                ? `No project is named "${project}"; imported without a project`
                : `${matches.length} projects are named "${project}"; imported without a project`,
            ),
          );
        }
      }
      batch.push({ title, projectId, content });
    }

    summary.created = (await this.notes.createNotes(batch)).length;
    return summary;
  }

  /**
   * Writes every active note as a Markdown file with front matter (title, project, id) into a new
   * folder inside `parentDir`, named "DevBrain notes YYYY-MM-DD" (with " (2)" and so on when that
   * exists). File names come from titles, made safe and unique; nothing outside the new folder is
   * written. A note whose file can't be read is left out and reported.
   */
  async exportNotesToFolder(parentDir: string): Promise<NoteExportResult> {
    const stat = await fs.stat(parentDir).catch(() => null);
    if (!stat?.isDirectory()) throw new InvalidInputError('Choose a folder to export notes into');

    // active notes, oldest first, so clashing names number in the order the notes were made
    const notes = collectPages((page) =>
      this.notes.listNotes({}, { sortBy: 'createdAt', direction: 'asc' }, page),
    );
    const dir = await createUniqueDirectory(
      parentDir,
      `DevBrain notes ${toDateString(this.now())}`,
    );
    const taken = new Set<string>();
    const errors: NoteExportResult['errors'] = [];
    let count = 0;
    for (const note of notes) {
      let content: string;
      try {
        content = await this.notes.readContent(note.id);
      } catch (error) {
        errors.push({
          noteId: note.id,
          title: note.title,
          message: `Its file could not be read (${errorClass(error)})`,
        });
        continue;
      }
      const name = uniqueName(safeFileName(note.title || 'Untitled'), taken);
      const project = note.project?.title ?? null;
      await fs.writeFile(
        childPath(dir, `${name}.md`),
        formatNoteMarkdown({ id: note.id, title: note.title, project }, content),
        { encoding: 'utf8', flag: 'wx' },
      );
      count += 1;
    }
    return { path: dir, count, errors };
  }

  // the active projects by matchKey(title); a title several projects share maps to all of them
  private projectsByTitle(): Map<string, ProjectId[]> {
    const byTitle = new Map<string, ProjectId[]>();
    const active = collectPages((page) => this.projects.listProjects({}, undefined, page));
    for (const { id, title } of active) {
      const key = matchKey(title);
      byTitle.set(key, [...(byTitle.get(key) ?? []), id]);
    }
    return byTitle;
  }

  // the ids in the file, at any depth, that are active tasks in this workspace
  private existingTaskIds(roots: TaskRecord[]): Set<string> {
    const ids: TaskId[] = [];
    const collect = (records: TaskRecord[]) => {
      for (const { id, subtasks } of records) {
        if (isId('task', id)) ids.push(id);
        collect(subtasks);
      }
    };
    collect(roots);
    const existing = new Set<string>();
    // in chunks, under SQLite's limit on bound values
    for (let i = 0; i < ids.length; i += 500) {
      for (const task of this.tasks.getByIds(ids.slice(i, i + 500))) existing.add(task.id);
    }
    return existing;
  }

  private async checkTotalSize(filePaths: string[], firstName: string): Promise<void> {
    let total = 0;
    for (const filePath of filePaths) {
      const stat = await fs.stat(filePath).catch(() => null);
      // a missing file is reported by its own read
      if (stat?.isFile()) total += stat.size;
    }
    if (total > MAX_NOTES_TOTAL_BYTES) {
      throw new ImportFileError(
        'too_large',
        firstName,
        `These notes are larger than ${formatBytes(MAX_NOTES_TOTAL_BYTES)} together`,
      );
    }
  }
}

// the format a task file's extension names; ImportFileError (unsupported_type) for another
export function taskFileFormat(filePath: string): TaskFileFormat {
  const extension = extensionOf(filePath);
  if (extension === 'csv' || extension === 'json') return extension;
  const name = path.basename(filePath);
  throw new ImportFileError('unsupported_type', name, `${name} is not a CSV or JSON file`);
}
