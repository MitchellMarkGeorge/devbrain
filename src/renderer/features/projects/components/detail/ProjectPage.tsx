import type { CSSProperties, FocusEvent, KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { CircleCheck, FileText, Folder, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { ProjectStatus, type Project } from '@common/types';
import {
  Breadcrumb,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EditorTitle,
  Icon,
  PageFavoriteButton,
  PageToolbar,
  ProjectHeader,
  resolveColor,
  Tabs,
  TabsList,
  TabsTab,
  useFormat,
} from '@renderer/components';
import { trpc } from '@renderer/ipc';
import { NotFoundPage } from '@renderer/shared/components/NotFoundPage';
import { PageHeaderSlot, useCrumbLink } from '@renderer/layouts/workspace/page-header';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';
import { useRecordView } from '@renderer/shared/hooks/use-record-view';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { isSynced } from '@renderer/features/tasks/api/queries';
import { projectRoute } from '../../api/route-api';
import type { ProjectTab } from '../../api/search';
import { ColourItems } from '../colour';
import { ProjectStatusPill } from '../ProjectStatusPill';
import { useProjectActions } from '../../hooks/use-project-actions';
import { ProjectDescription } from './ProjectDescription';
import { ProjectMenu } from './ProjectMenu';
import { ProjectNotesTab } from './ProjectNotesTab';
import { ProjectOverview } from './ProjectOverview';
import { ProjectTasksTab } from './ProjectTasksTab';
import styles from './ProjectPage.module.css';

const TAB_ICONS: Record<ProjectTab, LucideIcon> = {
  overview: LayoutDashboard,
  tasks: CircleCheck,
  notes: FileText,
};

const TAB_LABELS: Record<ProjectTab, string> = {
  overview: 'Overview',
  tasks: 'Tasks',
  notes: 'Notes',
};

/**
 * A project's page (`/app/$workspaceId/projects/$projectId`, Figma `7159:12540`, `7159:13218`,
 * `7159:13886`): the star and the "…" menu in the header, then the tabs in `?tab`, underlined:
 * Overview (the project as a document, its tasks under it, and a rail of its progress and notes),
 * Tasks (the tasks views with the project fixed) and Notes (its notes as cards). A synced project's
 * fields are its provider's, so they are read-only here. The loader has the project before the
 * first frame; a project deleted while it is open shows not-found.
 */
export function ProjectPage() {
  const { projectId } = projectRoute.useParams();
  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));
  useRecordView(projectId);
  if (project.data === undefined) {
    return project.isError && ipcErrorCode(project.error) === 'not_found' ? <NotFoundPage /> : null;
  }
  // a new project, a fresh page: the name and description start from it
  return <ProjectPageContent key={project.data.id} project={project.data} />;
}

function ProjectPageContent({ project }: { project: Project }) {
  const { workspaceId } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const navigate = projectRoute.useNavigate();
  const appNavigate = useNavigate();
  const router = useRouter();
  const { canGoBack } = useHistoryPosition();
  const crumbLink = useCrumbLink();
  const actions = useProjectActions();
  const tab = search.tab ?? 'overview';
  const color = resolveColor(project.color, 'blue');

  // a tab is a section of the page: switching replaces the entry, and leaves the other tab's params
  const setTab = (next: ProjectTab) =>
    void navigate({ search: { tab: next === 'overview' ? undefined : next }, replace: true });

  async function trash() {
    if (!(await actions.trash(project))) return;
    if (canGoBack) router.history.back();
    else
      void appNavigate({
        to: '/app/$workspaceId/projects',
        params: { workspaceId },
        replace: true,
      });
  }

  return (
    <>
      <PageHeaderSlot
        place={
          <Breadcrumb
            items={[
              crumbLink('Projects', { to: '/app/$workspaceId/projects', params: { workspaceId } }),
              {
                label: project.title,
                icon: <Icon icon={Folder} size={16} style={{ color }} />,
              },
            ]}
          />
        }
        actions={
          <>
            <PageFavoriteButton
              favorite={project.favoritedAt !== null}
              onFavoriteChange={(favorite) => actions.setFavorite(project, favorite)}
            />
            <ProjectMenu project={project} actions={actions} onTrash={() => void trash()} />
          </>
        }
      />
      <PageToolbar className={styles.tabsBar}>
        <Tabs
          variant="line"
          size="lg"
          className={styles.tabs}
          value={tab}
          onValueChange={(value) => setTab(value as ProjectTab)}
        >
          <TabsList aria-label="Project">
            {(Object.keys(TAB_LABELS) as ProjectTab[]).map((value) => (
              <TabsTab key={value} value={value} icon={TAB_ICONS[value]}>
                {TAB_LABELS[value]}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      </PageToolbar>
      {tab === 'overview' && (
        <ProjectOverview project={project} header={<ProjectPageHeader project={project} />} />
      )}
      {tab === 'tasks' && <ProjectTasksTab project={project} />}
      {tab === 'notes' && <ProjectNotesTab project={project} />}
    </>
  );
}

/**
 * The overview's header: the tile (Change colour), the name, status, dates with how long is left,
 * and the description, all editable but a synced project's. The name is an `EditorTitle`, saved
 * as a task's is: on leaving it or Enter, if it changed and isn't empty; Escape puts it back.
 */
function ProjectPageHeader({ project }: { project: Project }) {
  const { now } = useFormat();
  const actions = useProjectActions();
  const synced = isSynced(project);

  function saveTitle(event: FocusEvent<HTMLHeadingElement>) {
    const title = (event.currentTarget.textContent ?? '').trim();
    if (title === project.title) return;
    if (title === '') event.currentTarget.textContent = project.title;
    else actions.update(project, { title });
  }

  function onTitleKey(event: KeyboardEvent<HTMLHeadingElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.currentTarget.textContent = project.title;
      event.currentTarget.blur();
    }
  }

  return (
    <ProjectHeader
      project={project}
      icon={
        <ProjectTile
          color={project.color}
          disabled={synced}
          onChange={(color) => actions.update(project, { color })}
        />
      }
      title={
        <EditorTitle
          // keyed on the name, so a rename elsewhere (or a sync) shows here
          key={project.title}
          size="lg"
          placeholder="Project name"
          contentEditable={!synced}
          suppressContentEditableWarning
          spellCheck={false}
          aria-label="Name"
          onBlur={saveTitle}
          onKeyDown={onTitleKey}
        >
          {project.title}
        </EditorTitle>
      }
      statusPill={
        <ProjectStatusPill
          status={project.status}
          disabled={synced}
          onChange={(status) => actions.setStatus(project, status)}
        />
      }
      duePicker={
        synced ? undefined : (
          <DatePicker
            today={now}
            value={project.dueDate ?? undefined}
            onChange={(date) => actions.update(project, { dueDate: date ?? null })}
            onClear={project.dueDate ? () => actions.update(project, { dueDate: null }) : undefined}
          />
        )
      }
      startPicker={
        synced ? undefined : (
          <DatePicker
            today={now}
            value={project.startDate ?? undefined}
            onChange={(date) => actions.update(project, { startDate: date ?? null })}
            onClear={
              project.startDate ? () => actions.update(project, { startDate: null }) : undefined
            }
          />
        )
      }
      meta={<TimeLeft project={project} />}
      description={<ProjectDescription project={project} />}
    />
  );
}

/** How long is left, in whole days ("6 days left", "Due today", "2 days overdue", "Done Nov 12"). */
function TimeLeft({ project }: { project: Project }) {
  const { now, formatDate } = useFormat();
  const { dueDate, status, completedAt } = project;
  if (status === ProjectStatus.COMPLETED) {
    return completedAt ? <>Done {formatDate(completedAt)}</> : null;
  }
  if (!dueDate) return null;
  const today = DateTime.fromJSDate(now).startOf('day');
  const days = Math.round(DateTime.fromJSDate(dueDate).startOf('day').diff(today, 'days').days);
  if (days < 0) {
    return (
      <span className={styles.late}>
        {-days} {days === -1 ? 'day' : 'days'} overdue
      </span>
    );
  }
  return <>{days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `${days} days left`}</>;
}

/** The project's folder in its colour on a tint of it, opening the swatches. */
function ProjectTile({
  color,
  disabled,
  onChange,
}: {
  color: string | null;
  disabled: boolean;
  onChange: (hex: string) => void;
}) {
  const style = { '--tile': resolveColor(color, 'blue') } as CSSProperties;
  if (disabled) {
    return (
      <span className={styles.tile} style={style}>
        <Icon icon={Folder} size={20} />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button" className={styles.tile} style={style} aria-label="Change colour">
            <Icon icon={Folder} size={20} />
          </button>
        }
      />
      <DropdownMenuContent align="start">
        <ColourItems color={color} onChange={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
