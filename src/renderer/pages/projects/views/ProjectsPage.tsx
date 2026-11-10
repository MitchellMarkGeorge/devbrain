import { useMemo, useState, type MouseEvent } from 'react';
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
  ProjectRow,
  VirtualCardGrid,
  VirtualList,
} from '../../../components';
import { PageHeaderSlot } from '../../app/page-header';
import { useOpenEntity } from '../../app/use-open-entity';
import { isSynced } from '../../tasks/queries';
import { projectListQuery } from '../queries';
import { CLEAR_PROJECT_FILTERS, hasProjectFilters, projectListInput } from '../search';
import { ProjectStatusPill } from '../ProjectStatusPill';
import { useProjectActions } from '../use-project-actions';
import { useProjectsSearch } from '../use-projects-search';
import { ProjectsEmptyState, ProjectsErrorState, ProjectsLoading } from './ProjectsStates';
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
 * returns. A row or card opens the project; right-click for Favorite and Move to trash.
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
      <VirtualList
        items={projects}
        getKey={(project) => project.id}
        onEndReached={onEndReached}
        aria-label="Projects"
        renderItem={(project) => (
          <ProjectRow
            project={project}
            stats={project.stats}
            data-project-id={project.id}
            onOpen={() => openEntity({ id: project.id })}
          />
        )}
      />
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
