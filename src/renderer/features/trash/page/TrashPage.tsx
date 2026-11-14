import { useInfiniteQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Archive, ArrowUpDown, Clock, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EmptyState,
  PageContent,
  PageToolbar,
  ToggleGroup,
  useWorkspaceShell,
} from '@renderer/components';
import { trashListQuery } from '../api/queries';
import { TRASH_TABS, trashEntityType, type TrashTab } from '../api/search';
import { TrashList } from '../components/TrashList';
import { useTrashActions } from '../hooks/use-trash-actions';
import styles from '../components/TrashPage.module.css';

const trashRoute = getRouteApi('/app/$workspaceId/trash');

const TAB_LABELS: Record<TrashTab, string> = {
  all: 'All',
  projects: 'Projects',
  tasks: 'Tasks',
  notes: 'Notes',
};

const EMPTY: Record<TrashTab, { title: string; description: string }> = {
  all: {
    title: 'Nothing in the trash',
    description: 'Tasks, projects and notes you move to the trash stay here until you delete them.',
  },
  projects: { title: 'No projects in the trash', description: 'Trashed projects show up here.' },
  tasks: { title: 'No tasks in the trash', description: 'Trashed tasks show up here.' },
  notes: { title: 'No notes in the trash', description: 'Trashed notes show up here.' },
};

/**
 * Trash (`/app/$workspaceId/trash`, Figma `7159:11875`): what was moved to the trash, newest
 * first, by kind in `?tab`. Each row restores, deletes for good or opens its item; Empty Trash
 * deletes them all (docs/deleting.md).
 */
export function TrashPage() {
  const search = trashRoute.useSearch();
  const navigate = trashRoute.useNavigate();
  const tab = search.tab ?? 'all';
  const actions = useTrashActions();
  const { size } = useWorkspaceShell();
  const list = useInfiniteQuery(trashListQuery(trashEntityType(search.tab)));
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  // Empty Trash empties every kind, so it is offered whenever anything is in the trash: rows in
  // this tab say so at once, else the whole trash's first page (which the loader primes, so the
  // button draws in its state from the first frame)
  const anything = useInfiniteQuery({ ...trashListQuery('all'), enabled: tab !== 'all' });
  const trashHasItems =
    items.length > 0 || (anything.data?.pages.some((page) => page.items.length > 0) ?? false);

  return (
    <>
      <PageToolbar
        start={
          <ToggleGroup
            aria-label="Show"
            value={tab}
            onValueChange={(value) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  tab: value === 'all' ? undefined : (value as TrashTab),
                }),
                replace: true,
              })
            }
            items={TRASH_TABS.map((value) => ({ value, label: TAB_LABELS[value] }))}
          />
        }
        end={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button icon={ArrowUpDown} value="Date trashed" hideValue={size === 'compact'}>
                    Sort
                  </Button>
                }
              />
              <DropdownMenuContent width="sm" align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value="trashed">
                    <DropdownMenuRadioItem value="trashed" icon={Clock}>
                      Date trashed
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button icon={Trash2} disabled={!trashHasItems} onClick={() => void actions.empty()}>
              Empty Trash
            </Button>
          </>
        }
      />
      <PageContent layout="list" data-testid="page" data-tab={tab}>
        {list.data && items.length === 0 ? (
          <EmptyState icon={Archive} {...EMPTY[tab]} />
        ) : (
          <TrashList
            items={items}
            actions={actions}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
            footer={
              items.length > 0 && (
                <p className={styles.footnote}>
                  Items in the trash are kept until you delete them.
                </p>
              )
            }
          />
        )}
      </PageContent>
    </>
  );
}
