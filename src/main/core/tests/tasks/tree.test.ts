import { beforeEach, describe, expect, it } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { generateId } from '@common/ids';
import {
  TaskPriority,
  TaskStatus,
  type SettablePriority,
  type Task,
  type TaskTreeItem,
} from '@common/types';
import { TaskService } from '../../tasks/service';
import { ArchiveService } from '../../archive/service';
import { collectPages } from '../../shared/pagination';
import { INLINE_SUBTREE_LIMIT } from '../../tasks/tree';
import { NotFoundError } from '../../shared/errors';
import { createDb } from '../utils';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';

let db: BetterSQLite3Database;
let tasks: TaskService;

beforeEach(() => {
  db = createDb();
  tasks = new TaskService(db);
});

const HIGH: SettablePriority = TaskPriority.HIGH;
const MEDIUM: SettablePriority = TaskPriority.MEDIUM;
const LOW: SettablePriority = TaskPriority.LOW;
const BY_PRIORITY = { sortBy: 'priority' } as const;

// the rows as "title@depth", in the order they came
const shape = (items: TaskTreeItem[]) => items.map((item) => `${item.title}@${item.depth}`);

const sub = (parent: Task, title: string, priority: SettablePriority = LOW, status?: TaskStatus) =>
  tasks.createSubtask(parent.id, { title, priority, status });

describe('TaskService — listTaskTree', () => {
  it('places each subtask under its parent, siblings in the sort order, at any depth', () => {
    const low = tasks.createTask({ title: 'Low parent', priority: LOW });
    const high = tasks.createTask({ title: 'High parent', priority: HIGH });
    sub(high, 'A low', LOW);
    const aHigh = sub(high, 'A high', HIGH);
    sub(aHigh, 'Deep medium', MEDIUM);
    sub(aHigh, 'Deep high', HIGH);
    // a High subtask of a Low parent stays under its parent
    sub(low, 'Under low', HIGH);

    const page = tasks.listTaskTree({}, BY_PRIORITY);
    expect(shape(page.items)).toEqual([
      'High parent@0',
      'A high@1',
      'Deep high@2',
      'Deep medium@2',
      'A low@1',
      'Low parent@0',
      'Under low@1',
    ]);
    expect(page.items.every((item) => item.subtreeSize === null)).toBe(true);
  });

  it('orders siblings ascending too, with undated tasks last', () => {
    const parent = tasks.createTask({ title: 'Parent' });
    const day = (n: number) => new Date(2027, 0, n);
    tasks.createSubtask(parent.id, { title: 'Undated', dueDate: null });
    tasks.createSubtask(parent.id, { title: 'Third', dueDate: day(3) });
    tasks.createSubtask(parent.id, { title: 'First', dueDate: day(1) });

    const page = tasks.listTaskTree({}, { sortBy: 'dueDate', direction: 'asc' });
    expect(shape(page.items)).toEqual(['Parent@0', 'First@1', 'Third@1', 'Undated@1']);
  });

  it('makes a subtask whose parent is filtered out a root, keeping its parent summary', () => {
    const parent = tasks.createTask({ title: 'Done parent', status: TaskStatus.COMPLETED });
    const open = sub(parent, 'Open subtask');
    sub(open, 'Open grandchild');
    sub(parent, 'Done subtask', LOW, TaskStatus.COMPLETED);

    const page = tasks.listTaskTree({ excludeClosed: true });
    expect(shape(page.items)).toEqual(['Open subtask@0', 'Open grandchild@1']);
    expect(page.items[0].parentTask?.title).toBe('Done parent');
  });

  it('leaves a filtered-out subtask out, and its matching subtask becomes a root', () => {
    const parent = tasks.createTask({ title: 'Parent' });
    const done = sub(parent, 'Done', LOW, TaskStatus.COMPLETED);
    sub(done, 'Open under done');

    const page = tasks.listTaskTree({ excludeClosed: true });
    expect(shape(page.items).sort()).toEqual(['Open under done@0', 'Parent@0']);
  });

  it('treats an archived parent as missing', () => {
    const parent = tasks.createTask({ title: 'Parent' });
    sub(parent, 'Child');
    new ArchiveService(db).archiveTask(parent.id);
    // archiving a task archives its subtasks too, so make one live again under the archived parent
    const orphan = tasks.createTask({ title: 'Orphan' });
    db.update(tasksTable)
      .set({ parentTaskId: parent.id })
      .where(eq(tasksTable.id, orphan.id))
      .run();

    expect(shape(tasks.listTaskTree().items)).toEqual(['Orphan@0']);
  });

  it('pages by roots, each with its whole subtree, and the cursor resumes after the last root', () => {
    const parents = [1, 2, 3].map((n) =>
      tasks.createTask({ title: `Parent ${n}`, priority: [HIGH, MEDIUM, LOW][n - 1] }),
    );
    for (const parent of parents) {
      for (const n of [1, 2, 3]) sub(parent, `${parent.title} / ${n}`);
    }

    const first = tasks.listTaskTree({}, BY_PRIORITY, { limit: 2 });
    expect(first.items.filter((item) => item.depth === 0).map((item) => item.title)).toEqual([
      'Parent 1',
      'Parent 2',
    ]);
    // two roots, eight rows
    expect(first.items).toHaveLength(8);
    const second = tasks.listTaskTree({}, BY_PRIORITY, { limit: 2, cursor: first.nextCursor! });
    expect(shape(second.items)).toEqual([
      'Parent 3@0',
      expect.stringMatching(/^Parent 3 \/ \d@1$/),
      expect.stringMatching(/^Parent 3 \/ \d@1$/),
      expect.stringMatching(/^Parent 3 \/ \d@1$/),
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it('reads every matching task exactly once across pages, in tree order', () => {
    const roots = Array.from({ length: 7 }, (_, i) =>
      tasks.createTask({ title: `Root ${i}`, priority: [HIGH, MEDIUM, LOW][i % 3] }),
    );
    roots.forEach((root, i) => {
      for (let n = 0; n < i % 4; n++) {
        const child = sub(root, `${root.title}.${n}`, [LOW, HIGH][n % 2]);
        if (n === 1) sub(child, `${child.title}.x`);
      }
    });
    const whole = tasks.listTaskTree({}, BY_PRIORITY, { limit: 200 }).items;
    const paged = collectPages((page) =>
      tasks.listTaskTree({}, BY_PRIORITY, { ...page, limit: 3 }),
    );
    expect(paged.map((item) => item.id)).toEqual(whole.map((item) => item.id));
    expect(new Set(whole.map((item) => item.id)).size).toBe(tasks.listTasks().items.length);
  });

  it(`brings a subtree of ${INLINE_SUBTREE_LIMIT} inline, and sends a bigger one's root alone`, () => {
    const fits = tasks.createTask({ title: 'Fits', priority: HIGH });
    const big = tasks.createTask({ title: 'Big', priority: LOW });
    for (let n = 0; n < INLINE_SUBTREE_LIMIT; n++) sub(fits, `fits ${n}`);
    const first = sub(big, 'big 0');
    // the limit counts every depth
    for (let n = 1; n < INLINE_SUBTREE_LIMIT; n++) sub(first, `big ${n}`);
    sub(big, 'one too many');

    const items = tasks.listTaskTree({}, BY_PRIORITY).items;
    expect(items).toHaveLength(1 + INLINE_SUBTREE_LIMIT + 1);
    expect(items[0]).toMatchObject({ title: 'Fits', subtreeSize: null });
    expect(items.at(-1)).toMatchObject({ title: 'Big', depth: 0, subtreeSize: 51 });
  });
});

describe('TaskService — listSubtree', () => {
  it('gives the rows listTaskTree would place under the root, its subtasks at depth 1', () => {
    const root = tasks.createTask({ title: 'Root' });
    sub(root, 'Low', LOW);
    const high = sub(root, 'High', HIGH);
    sub(high, 'Deep');
    sub(root, 'Done', LOW, TaskStatus.COMPLETED);

    const filter = { excludeClosed: true };
    const subtree = tasks.listSubtree(root.id, filter, BY_PRIORITY);
    expect(shape(subtree)).toEqual(['High@1', 'Deep@2', 'Low@1']);
    expect(tasks.listTaskTree(filter, BY_PRIORITY).items.slice(1)).toEqual(subtree);
  });

  it('throws NotFoundError for a missing root', () => {
    expect(() => tasks.listSubtree(generateId('task'))).toThrow(NotFoundError);
  });
});

describe('TaskService — listTaskTree with a cycle of parents', () => {
  // the app refuses to make one ("Make subtask of…"), so the parents are written directly, as a
  // sync could write them
  const setParent = (id: string, parentId: string) =>
    db
      .update(tasksTable)
      .set({ parentTaskId: parentId as never })
      .where(eq(tasksTable.id, id as never))
      .run();
  const ids = (items: TaskTreeItem[]) => items.map((item) => item.id);

  it('makes the cycle member with the smallest id its root, the rest under it, each once', () => {
    const [first, second, third] = ['Gather', 'Draft', 'Review']
      .map((title) => tasks.createTask({ title }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    // first → second → third → first
    setParent(second.id, first.id);
    setParent(third.id, second.id);
    setParent(first.id, third.id);
    const other = tasks.createTask({ title: 'Other' });

    const items = tasks.listTaskTree({}, BY_PRIORITY).items;
    expect(new Set(ids(items))).toEqual(new Set([first.id, second.id, third.id, other.id]));
    expect(items).toHaveLength(4);
    const at = items.findIndex((item) => item.id === first.id);
    expect(items.slice(at, at + 3).map((item) => [item.id, item.depth])).toEqual([
      [first.id, 0],
      [second.id, 1],
      [third.id, 2],
    ]);
    // the root keeps its parent's summary: the task at the end of its own cycle
    expect(items[at].parentTask?.id).toBe(third.id);
    expect(items[at].subtreeSize).toBeNull();
  });

  it('places a task hanging off a cycle under it, and lists a task its own parent alone', () => {
    const a = tasks.createTask({ title: 'A' });
    const b = tasks.createTask({ title: 'B' });
    setParent(a.id, b.id);
    setParent(b.id, a.id);
    const child = sub(a, 'Child of A');
    const self = tasks.createTask({ title: 'Self' });
    setParent(self.id, self.id);

    const items = tasks.listTaskTree({}, BY_PRIORITY, { limit: 200 }).items;
    expect(items).toHaveLength(4);
    expect(new Set(ids(items))).toEqual(new Set([a.id, b.id, child.id, self.id]));
    expect(items.find((item) => item.id === self.id)?.depth).toBe(0);
    expect(
      items
        .filter((item) => item.depth === 0)
        .map((item) => item.id)
        .sort(),
    ).toEqual([a.id < b.id ? a.id : b.id, self.id].sort());
  });

  it('breaks no cycle the filter already breaks', () => {
    const a = tasks.createTask({ title: 'A' });
    const b = tasks.createTask({ title: 'B', status: TaskStatus.COMPLETED });
    setParent(a.id, b.id);
    setParent(b.id, a.id);
    // with B filtered out, A's parent doesn't match: A is a root the usual way
    expect(ids(tasks.listTaskTree({ excludeClosed: true }).items)).toEqual([a.id]);
  });

  it('pages through a cycle, reading each task once', () => {
    const made = Array.from({ length: 5 }, (_, i) => tasks.createTask({ title: `T${i}` }));
    setParent(made[1].id, made[0].id);
    setParent(made[0].id, made[1].id);
    const paged = collectPages((page) =>
      tasks.listTaskTree({}, BY_PRIORITY, { ...page, limit: 2 }),
    );
    expect(paged.map((item) => item.id).sort()).toEqual(made.map((task) => task.id).sort());
  });

  it('sees no cycle in a chain whose parents are newer than their subtasks', () => {
    // made oldest first, then each put under the next newer one, as a re-parent can do
    const [low, mid, high] = ['Low', 'Mid', 'High'].map((title) => tasks.createTask({ title }));
    setParent(low.id, mid.id);
    setParent(mid.id, high.id);
    expect(tasks.listTaskTree({}, BY_PRIORITY).items.map((item) => [item.id, item.depth])).toEqual([
      [high.id, 0],
      [mid.id, 1],
      [low.id, 2],
    ]);
  });

  it("gives a cycle's root its subtree without itself", () => {
    const a = tasks.createTask({ title: 'A' });
    const b = tasks.createTask({ title: 'B' });
    setParent(a.id, b.id);
    setParent(b.id, a.id);
    const root = a.id < b.id ? a : b;
    expect(ids(tasks.listSubtree(root.id))).toEqual([(root === a ? b : a).id]);
  });
});
