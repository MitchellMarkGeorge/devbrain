import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { CircleCheck, FileText, Folder, LayoutDashboard, type LucideIcon } from 'lucide-react';
import type { Project } from '@common/types';
import {
  Breadcrumb,
  DatePicker,
  Icon,
  PageFavoriteButton,
  PageToolbar,
  ProjectHeader,
  resolveColor,
  Tabs,
  TabsList,
  TabsTab,
  useFormat,
} from '../../../components';
import { trpc } from '../../../ipc';
import { NotFoundPage } from '../../app/NotFoundPage';
import { PageHeaderSlot, useCrumbLink } from '../../app/page-header';
import { useHistoryPosition } from '../../app/use-history-position';
import { useRecordView } from '../../app/use-record-view';
import { ipcErrorCode } from '../../../workspace/errors';
import { isSynced } from '../../tasks/queries';
import { projectRoute } from '../route-api';
import type { ProjectTab } from '../search';
import { ProjectStatusPill } from '../ProjectStatusPill';
import { useProjectActions } from '../use-project-actions';
import { ProjectDescription } from './ProjectDescription';
import { ProjectMenu } from './ProjectMenu';
import { ProjectNotesTab } from './ProjectNotesTab';
import { ProjectOverview } from './ProjectOverview';
import { ProjectTasksTab } from './ProjectTasksTab';

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
 * `7159:13886`): the star and the "…" menu in the header, then the tabs in `?tab`: Overview (the
 * header with its status, dates, progress and description, over the tasks grouped by status),
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
      <PageToolbar
        start={
          <Tabs size="lg" value={tab} onValueChange={(value) => setTab(value as ProjectTab)}>
            <TabsList aria-label="Project">
              {(Object.keys(TAB_LABELS) as ProjectTab[]).map((value) => (
                <TabsTab key={value} value={value} icon={TAB_ICONS[value]}>
                  {TAB_LABELS[value]}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
        }
      />
      {tab === 'overview' && (
        <ProjectOverview project={project} header={<ProjectPageHeader project={project} />} />
      )}
      {tab === 'tasks' && <ProjectTasksTab project={project} />}
      {tab === 'notes' && <ProjectNotesTab project={project} />}
    </>
  );
}

/**
 * The overview's header: the name, status, dates and description, all editable. Its progress pill
 * is left out: the Overview's Progress card shows it.
 */
function ProjectPageHeader({ project }: { project: Project }) {
  const { now } = useFormat();
  const actions = useProjectActions();
  const synced = isSynced(project);
  return (
    <ProjectHeader
      project={project}
      statusPill={
        <ProjectStatusPill
          status={project.status}
          disabled={synced}
          onChange={(status) => actions.setStatus(project, status)}
        />
      }
      onTitleChange={synced ? undefined : (title) => actions.update(project, { title })}
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
      description={<ProjectDescription project={project} />}
    />
  );
}
