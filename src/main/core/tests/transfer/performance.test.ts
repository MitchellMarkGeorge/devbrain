import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { openDevBrain } from '../../index';
import { openMemorySettingsStore } from '../__mocks__/memory-settings-store';
import { WORKSPACE_OPTIONS } from '../utils';
import { MAX_TASK_ROWS } from '../../transfer/limits';

// How long a task import holds the main process, on a real workspace (a database file in WAL, with
// search kept in step). Opt in with DEVBRAIN_PERF=1 (and --silent=false to see the timings). The
// measured numbers are in docs/import-export.md, "How long an import takes"; the bounds here are
// looser, so a slow machine passes and a cost that grows faster than the rows again does not.

const RUN = process.env.DEVBRAIN_PERF === '1';
const DESCRIPTION = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, "quoted". '.repeat(5);

// `rows` tasks, a quarter of them top-level with three subtasks each
function csv(rows: number): string {
  const lines = ['id,parent_id,title,description,status,priority,due_date'];
  const description = `"${DESCRIPTION.replace(/"/g, '""')}"`;
  for (let i = 0; i < rows; i++) {
    const parent = i % 4 === 0 ? '' : `t${i - (i % 4)}`;
    lines.push(`t${i},${parent},Task ${i},${description},in_progress,high,2026-11-02`);
  }
  return lines.join('\n');
}

async function timeImport(rows: number): Promise<number> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-import-perf-'));
  const devBrain = await openDevBrain({
    path: path.join(dir, 'brain'),
    settingsStore: openMemorySettingsStore,
    createIfMissing: true,
    workspace: WORKSPACE_OPTIONS,
  });
  try {
    const { id } = await devBrain.workspaces.create({ name: 'Perf', color: '#000000' });
    const workspace = await devBrain.workspaces.open(id);
    const text = csv(rows);
    const started = performance.now();
    const { created } = workspace.transfer.importTasks(text, 'csv');
    const took = performance.now() - started;
    expect(created).toBe(rows);
    expect(
      workspace.search.search({ query: `"Task ${rows - 1}"`, entityType: ['task'] }),
    ).toHaveLength(1);
    console.log(`import of ${rows} tasks: ${Math.round(took)} ms`);
    // the export reads them back a page at a time, with each page's project and link lookups
    const exportStarted = performance.now();
    expect(workspace.transfer.exportTasks('csv').count).toBe(rows);
    const exportTook = performance.now() - exportStarted;
    console.log(`export of ${rows} tasks: ${Math.round(exportTook)} ms`);
    expect(exportTook).toBeLessThan(5_000);
    return took;
  } finally {
    await devBrain.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe.runIf(RUN)('task import performance', () => {
  it('imports the largest file allowed in a few seconds, its cost growing with the rows', async () => {
    const quarter = await timeImport(MAX_TASK_ROWS / 4);
    const full = await timeImport(MAX_TASK_ROWS);
    expect(full).toBeLessThan(10_000);
    // four times the rows: about four times as long; a cost per row that grows with the table
    // (indexing that reads the whole index, as it once did) makes it 10 to 20 times
    expect(full / quarter).toBeLessThan(8);
  }, 120_000);
});
