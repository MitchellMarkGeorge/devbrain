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
- **`TaskListFrame`** keeps which parents the user has shown or hidden. A parent with its subtasks
  inline starts shown; a root sent alone starts hidden, and showing it runs `subtreeQuery` for it
  (one `useQueries` over the shown ones). `lib/tree.ts` puts the loaded subtrees in place
  (`withSubtrees`), finds the parents (`parentsIn`: rows followed by a deeper row, and roots sent
  alone) and leaves out what a hidden parent hides (`visibleRows`).
- **`TaskList`'s `nested`** draws the rows it is given as a tree (`treeOf`, the guides, the parent
  pill left off a nested row), and the frame's `subtasksShown` makes a parent's count the button
  that shows and hides its subtasks, as → / ← and its menu do.

The count stays the task's own: "1/3" counts every subtask, while the tree shows those matching F.

## Cost

Measured over `seed:large`, which has one parent with 1,000 subtasks for this
([performance](../performance.md#the-task-tree)): a page of the tree costs 2–7 ms in main against
1.5–2 ms for a page of `tasks.list`, the group view about 1.5 times what it did, and expanding the
1,000-subtask parent 15 ms in main for 645 KB. Scrolling the whole list takes 55 pages instead of 89.
