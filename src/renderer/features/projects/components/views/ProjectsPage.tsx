import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ExternalLink, Star, Trash2 } from 'lucide-react';
import type { ProjectListItem } from '@common/types';
import {
  Breadcrumb,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  PageContent,
  PageToolbar,
  ProjectCard,
  ProjectList,
  VirtualCardGrid,
  type ProjectListHandle,
} from '@renderer/components';
import { KeyScope, useListCommands } from '@renderer/keyboard';
import { PageHeaderSlot } from '@renderer/layouts/workspace/page-header';
import { useOpenEntity } from '@renderer/shared/hooks/use-open-entity';
import { isSynced } from '@renderer/features/tasks/api/queries';
import { projectListQuery } from '../../api/queries';
import { CLEAR_PROJECT_FILTERS, hasProjectFilters, projectListInput } from '../../api/search';
import { ProjectStatusPill } from '../ProjectStatusPill';
import { useProjectActions } from '../../hooks/use-project-actions';
import { useProjectsSearch } from '../../hooks/use-projects-search';
import { ProjectsEmptyState, ProjectsErrorState, ProjectsLoading } from './ProjectsStates';
import { ProjectsSelectionBar } from './ProjectsSelectionBar';
import styles from './ProjectsView.module.css';
import {
  PROJECT_VIEW_ICONS,
  PROJECT_VIEW_LABELS,
  ProjectsFilterMenu,
  ProjectsToolbarEnd,
} from './ProjectsToolbar';

const stopOpen = (event: MouseEvent) => event.stopPropagation();

// a row of project cards: the card's 16px padding, three rows of text and the bar, and the gap
const CARD_ROW_HEIGHT = 148;

/**
 * The projects page (`/app/$workspaceId/projects`, Figma `7158:15157` list, `7158:15487` cards):
 * Filter (status, Active by default; source), Sort, the list / cards toggle and New Project, over
 * the virtualized rows or cards of `projects.list`, each with its progress from the stats the list
 * returns. A row or card opens the project; right-click for Favorite and Move to trash. List rows
 * select as the tasks list's do (a checkbox, X), with a selection bar of Status, Favorite and Move
 * to trash, and the list keys (↵, F, ⌘⌫).
 */
export function ProjectsPage() {
  const { search, resolved, setSearch } = useProjectsSearch();
  const openEntity = useOpenEntity();
  const actions = useProjectActions();
  const query = useInfiniteQuery(projectListQuery(projectListInput(resolved)));
  const projects = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const onEndReached = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  };
  // the project whose row or card was right-clicked: the menu is drawn for it
  const [menuProject, setMenuProject] = useState<ProjectListItem | null>(null);
  const list = useRef<ProjectListHandle<ProjectListItem>>(null);
  // the selected projects, by id; on the list view only
  const [selected, setSelected] = useState<string[]>([]);
  const selectedProjects = projects.filter((project) => selected.includes(project.id));

  // the list keys: on the selected rows, or the focused one
  useListCommands(list, {
    open: (project) => openEntity({ id: project.id }),
    toggleFavorite: (rows) => actions.toggleFavorite(rows),
    trash: (rows) =>
      void actions.trashAll(rows).then((moved) => {
        if (moved) setSelected([]);
      }),
  });

  let content;
  if (query.isPending) content = <ProjectsLoading />;
  else if (query.isError) content = <ProjectsErrorState onRetry={() => void query.refetch()} />;
  else if (projects.length === 0) {
    content = (
      <ProjectsEmptyState
        filtered={hasProjectFilters(search)}
        onClearFilters={() => setSearch(CLEAR_PROJECT_FILTERS)}
      />
    );
  } else if (resolved.view === 'card') {
    content = (
      <VirtualCardGrid
        gap="md"
        items={projects}
        getKey={(project) => project.id}
        estimateRowHeight={CARD_ROW_HEIGHT}
        onEndReached={onEndReached}
        aria-label="Projects"
        renderItem={(project) => (
          <ProjectCard
            project={project}
            stats={project.stats}
            data-project-id={project.id}
            role="link"
            aria-label={project.title}
            onClick={() => openEntity({ id: project.id })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.target === event.currentTarget) {
                openEntity({ id: project.id });
              }
            }}
            statusPill={
              // a click on the pill, or in its menu (which React bubbles through the portal),
              // opens the menu, not the project
              <span onClick={stopOpen} style={{ display: 'contents' }}>
                <ProjectStatusPill
                  status={project.status}
                  disabled={isSynced(project)}
                  onChange={(status) => actions.setStatus(project, status)}
                />
              </span>
            }
          />
        )}
      />
    );
  } else {
    content = (
      // the bar is outside the list's key scope: keys on its buttons (↵ on Clear) are theirs
      <div className={styles.region}>
        <KeyScope name="list" render={<div className={styles.region} />}>
          <ProjectList
            ref={list}
            projects={projects}
            aria-label="Projects"
            selected={selected}
            onSelectedChange={setSelected}
            onOpen={(project) => openEntity({ id: project.id })}
            onEndReached={onEndReached}
          />
        </KeyScope>
        <ProjectsSelectionBar
          projects={selectedProjects}
          actions={actions}
          onClear={() => {
            setSelected([]);
            // the bar is going: focus back to the list's focused row
            list.current?.moveFocus(0);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeaderSlot
        place={
          <Breadcrumb
            items={[
              'Projects',
              {
                label: PROJECT_VIEW_LABELS[resolved.view],
                icon: PROJECT_VIEW_ICONS[resolved.view],
              },
            ]}
          />
        }
      />
      <PageToolbar
        start={<ProjectsFilterMenu resolved={resolved} setSearch={setSearch} />}
        end={<ProjectsToolbarEnd resolved={resolved} setSearch={setSearch} />}
      />
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <PageContent
              layout={resolved.view === 'card' ? 'grid' : 'list'}
              data-testid="page"
              data-view={resolved.view}
            />
          }
          onContextMenu={(event) => {
            const item = (event.target as Element).closest<HTMLElement>('[data-project-id]');
            const project = item
              ? (projects.find((p) => p.id === item.dataset.projectId) ?? null)
              : null;
            setMenuProject(project);
            if (!project) event.preventDefault();
          }}
        >
          {content}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {menuProject && (
            <>
              <ContextMenuItem
                icon={ExternalLink}
                shortcut="↵"
                onClick={() => openEntity({ id: menuProject.id })}
              >
                Open
              </ContextMenuItem>
              <ContextMenuItem
                icon={Star}
                onClick={() => actions.setFavorite(menuProject, menuProject.favoritedAt === null)}
              >
                {menuProject.favoritedAt === null ? 'Favorite' : 'Unfavorite'}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={Trash2}
                variant="destructive"
                disabled={isSynced(menuProject)}
                onClick={() => void actions.trash(menuProject)}
              >
                Move to trash
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
}
