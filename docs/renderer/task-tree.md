# The task list as a tree

The tasks page's list and group views draw each subtask indented under its parent. Core builds
that tree and pages it (`tasks.tree`), so the list is complete and stable as it loads: a row never
moves once drawn, and every parent whose subtasks match the filter can show them. The board,
Home, a note's or an event's tasks and search keep the flat `tasks.list`.

## What a page holds

For the page's filter **F** and sort **S** (`TaskService.listTaskTree`, `src/main/core/tasks`):

- **Roots** are the tasks matching F whose parent is missing or doesn't match F. A top-level task
  is a root; so is a subtask whose parent is filtered out (closed, in another project, in the
  Trash), which keeps its parent's pill to say where it belongs.
- **A root's subtree** is its matching descendants at any depth. One whose parent doesn't match F
  is not in it: it is a root of its own.
- **A page is `limit` roots** (100) in S's order, by the same keyset cursor as `tasks.list` (sort
  value, then id). Each root is followed by its subtree in tree order, each set of siblings in S's
  order too. So under Sort Priority a High subtask of a Low parent sits under that parent, at the
  parent's place in the list.
- **A big subtree comes later.** A root with more than `INLINE_SUBTREE_LIMIT` (50) matching
  subtasks comes alone, with `subtreeSize`, and `tasks.subtree` loads its rows when it is
  expanded. A page is then at most `limit × (1 + INLINE_SUBTREE_LIMIT)` rows, however a workspace
  nests; in practice a little over 100.

- **Parents form a tree.** A cycle of parents would have no root, so its tasks would be left out
  of the list. DevBrain doesn't make one and its providers don't allow one; see
  [Cycles of parents](#cycles-of-parents) for how to show them if that changes.

Each row is a `TaskTreeItem` (`src/common/types`): the list row plus its `depth` (0 for a root)
and `subtreeSize` (set only on a root sent alone). Pages vary in size, which costs nothing: the
list draws only the rows in view, and "near the end" counts rows, not pages.

A page is one roots query, one recursive walk down `parent_task_id` from its roots (for the
subtrees' sizes and the ids of those that come inline), one read of those rows by id, and the list
details over all of them. The walk names the parent index (`indexed by`): with a filter on another
indexed column, SQLite would read that index at every step of the walk instead.

## The renderer

- **Queries** (`features/tasks/api/queries.ts`): the list view is one infinite `taskTreeQuery`;
  each group of the group view is a `groupTasksQuery` over `tasks.tree`, its group's condition
  folded into F, so a subtask grouped apart from its parent is a root in its own group.
- **`TaskListFrame`** keeps which parents the user has shown or hidden, and drops the choice of a
  parent once it leaves the list (filtered out, trashed), so it starts afresh if it comes back. A parent with its subtasks
  inline starts shown; a root sent alone starts hidden, and showing it runs `subtreeQuery` for it
  (one `useQueries` over the shown ones). `lib/tree.ts` puts the loaded subtrees in place
  (`withSubtrees`), finds the parents (`parentsIn`: rows followed by a deeper row, and roots sent
  alone) and leaves out what a hidden parent hides (`visibleRows`).
- **`TaskList`'s `nested`** draws the rows it is given as a tree from their `depth`, as core sent
  it (`treeOf` works out the guides; the parent pill is left off a nested row), and the frame's `subtasksShown` makes a parent's count the button
  that shows and hides its subtasks, as → / ← and its menu do. That count opens no hover card: the
  subtasks it would list are the rows under it.

The count stays the task's own: "1/3" counts every subtask, while the tree shows those matching F.

## Cost

Measured over `seed:large`, which has one parent with 1,000 subtasks for this
([performance](../performance.md#the-task-tree)): a page of the tree costs 2–7 ms in main against
1.5–2 ms for a page of `tasks.list`, the group view about 1.5 times what it did, and expanding the
1,000-subtask parent 15 ms in main for 645 KB. Scrolling the whole list takes 55 pages instead of 89.

## Cycles of parents

**Not supported.** The tree takes parents to form a tree, and a cycle has no task at its top, so
none of its members is a root and the list leaves all of them out. The walks still end (`union`
in the walk down, place-once in `inTreeOrder`), so nothing loops. That is fine while a cycle can't
happen:

- **Locally**, "Make subtask of…" (`TaskService.demoteTask`) refuses to put a task under itself or
  under one of its own subtasks.
- **From providers**, Jira (its issue-type hierarchy), Asana and Azure DevOps (documented: tree
  topology) refuse a cycle; Linear and GitHub's sub-issues are taken to as well, though that wasn't
  checked against their docs. Notion's sub-items, a self-relation on a database, might not.

If a provider that allows them is ever synced, or a sync is found to leave one behind (applying a
task's new parent before its parent's own move, across two pages), the tree can show a cycle this
way. It was built, measured and tested, then taken out until it is needed.

**Rule.** Of the tasks matching the filter, each cycle's member with the smallest id is a root as
well. It keeps its parent pill (the member at the end of its own cycle), and the rest of the cycle
nests under it, so each task shows once. The id makes the choice fixed; any fixed order would do.

**Roots.** Add one condition to `listTaskTree`'s roots, beside "no parent" and "a parent that
doesn't match": `inArray(tasks.id, cycleRoots(match))`, with `match` the filter on the tasks table.

```ts
/** The tasks to treat as roots because their parents form a cycle among those matching `match`. */
export function cycleRoots(match: SQL): SQL {
  return sql`(with recursive up(start, id) as (
    select ${tasks.id}, ${tasks.parentTaskId} from ${tasks}
      where ${tasks.parentTaskId} >= ${tasks.id} and ${match}
    union
    select up.start, ${tasks.parentTaskId} from up join ${tasks} on ${tasks.id} = up.id
      where up.id > up.start and ${tasks.parentTaskId} is not null and ${match}
  )
  select start from up where id = start)`;
}
```

It walks up from matching tasks through matching parents, recording (start, ancestor) pairs, and
keeps the starts it comes back to. Only a cycle's smallest member is wanted, and walking up from it
never passes a smaller id, so a walk starts only where the parent's id is at least the task's own
(`>=`: a task its own parent is a cycle of one) and goes on only while the ancestor's id is larger
than the start's. Correct for any ids: the smallest member's walk goes all the way round and comes
back; every other member's reaches the smallest and stops; a task not in a cycle never comes back.
A walk that only enters a cycle ends at a smaller id, or after one turn, where `union` drops the
pairs already found. Not correlated with the query, so SQLite runs it once a page.

**Subtrees.** The walk down from a cycle's root reaches the root again at the end of its own cycle,
so `descendantIds` must leave it out: `select root, id from sub where id != root`. Without it the
root counts in its own `subtreeSize` (`inTreeOrder` already places it once).

**Cost.** On `seed:large` (`perf:core`, p50), the three tree pages took 6.3, 3.7 and 1.9 ms with the
check, as without it. Ids are time-ordered and a parent is nearly always made before its subtasks,
so nearly every walk ends before it starts; with random ids a walk would average about two steps,
and the worst case (a long chain of ever-larger ids) walks the chain, as an unpruned walk would. An
unpruned walk over every matching subtask's ancestry cost up to 16 ms a page.

**Tests** (in `core/tests/tasks/tree.test.ts`; the app can't make a cycle, so they write
`parent_task_id` directly): a cycle of three (its smallest member the root, the rest at depths 1
and 2, its parent pill the last member); a task hanging off a cycle, under it; a task its own
parent, alone; a cycle the filter already breaks, the usual way; paging through a cycle, each task
once; a cycle root's subtree without itself. Removing the roots condition fails the first three.
