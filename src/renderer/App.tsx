import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindow, Copy, House, Keyboard, PanelRight, Sparkles, Trash2 } from 'lucide-react';
import {
  AppShell,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Flex,
  Heading,
  Kbd,
  Logomark,
  OnboardingScreen,
  PageContent,
  PageFavoriteButton,
  PageHeader,
  PageMenuButton,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetItemTitle,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarItem,
  SidebarWorkspace,
  Stack,
  Text,
  ToggleGroup,
  useAppShell,
  WorkspaceSwitcher,
} from './components';
import type { WorkspaceId } from '@common/ids';
import { HomeContent } from './components/screens/Home/HomeScreens';
import { useWindowFrame, type Platform } from './components/lib/platform';
import { trpc } from './ipc';
import { useHeldFor, useOpeningWorkspace } from './workspace-opening';

// A test bench for the window frame until the app's screens are wired up: the shell with its
// title bar on this platform, the keys named for it, a sheet, the onboarding screen, the theme
// (which repaints Windows' caption buttons), and Home as the design system draws it, with sample
// content.

type PageId = 'home' | 'frame' | 'shortcuts' | 'sheet';

const PAGES: { id: PageId; label: string; icon: typeof AppWindow }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'frame', label: 'Window frame', icon: AppWindow },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'sheet', label: 'Sheet', icon: PanelRight },
];

const PLATFORM_NAMES: Record<Platform, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

/** Back and forward through the pages visited, as the window bar's arrows expect. */
function useHistory(first: PageId) {
  const [state, setState] = useState({ stack: [first], index: 0 });
  return {
    page: state.stack[state.index],
    go: (page: PageId) =>
      setState(({ stack, index }) =>
        stack[index] === page
          ? { stack, index }
          : { stack: [...stack.slice(0, index + 1), page], index: index + 1 },
      ),
    back: () => setState(({ stack, index }) => ({ stack, index: Math.max(0, index - 1) })),
    forward: () =>
      setState(({ stack, index }) => ({ stack, index: Math.min(stack.length - 1, index + 1) })),
    canGoBack: state.index > 0,
    canGoForward: state.index < state.stack.length - 1,
  };
}

// how long the splash shows at least, so a quick switch doesn't flicker
const SPLASH_MINIMUM_MS = 600;

export function App() {
  const history = useHistory('frame');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const title = PAGES.find((p) => p.id === history.page)?.label ?? '';

  // The splash, as the app will show it: at start, while the workspace open last time reopens,
  // and while a workspace opens (a switch closes the open one first), whoever started it
  const current = useQuery(trpc.workspaces.current.queryOptions());
  const openLast = useMutation(trpc.workspaces.openLast.mutationOptions());
  const { mutate: reopenLast } = openLast;
  useEffect(() => reopenLast(), [reopenLast]);
  const opening = useOpeningWorkspace();
  const starting = !current.data && (openLast.isIdle || openLast.isPending);
  const splash = useHeldFor(opening !== null || starting, SPLASH_MINIMUM_MS);

  if (splash) {
    return <OnboardingScreen logo={<Logomark size="lg" pulse />} />;
  }

  if (onboarding) {
    return (
      <OnboardingScreen
        logo={<Logomark size="md" />}
        title="Welcome to DevBrain"
        description="The window before a workspace is open: check the strip at the top."
      >
        <Button onClick={() => setOnboarding(false)}>Back to the shell</Button>
      </OnboardingScreen>
    );
  }

  return (
    <AppShell
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <WorkspaceMenu />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              {PAGES.map((page) => (
                <SidebarItem
                  key={page.id}
                  icon={page.icon}
                  active={history.page === page.id}
                  onClick={() => history.go(page.id)}
                >
                  {page.label}
                </SidebarItem>
              ))}
              <SidebarItem icon={Sparkles} onClick={() => setOnboarding(true)}>
                Onboarding screen
              </SidebarItem>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      }
      header={
        // Home has no title bar content of its own
        history.page === 'home' ? (
          <PageHeader />
        ) : (
          <PageHeader
            actions={
              <>
                <PageFavoriteButton favorite={false} />
                <PageMenuButton>
                  <DropdownMenuItem icon={Copy} shortcut="⌘D">
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={Trash2} shortcut="⌘⌫" variant="destructive">
                    Move to trash
                  </DropdownMenuItem>
                </PageMenuButton>
              </>
            }
          >
            <Breadcrumb items={['DevBrain', title]} />
          </PageHeader>
        )
      }
      sheetOpen={sheetOpen && history.page === 'sheet'}
      onBack={history.back}
      onForward={history.forward}
      canGoBack={history.canGoBack}
      canGoForward={history.canGoForward}
    >
      {history.page === 'home' && <HomeContent />}
      {history.page === 'frame' && <FramePage />}
      {history.page === 'shortcuts' && <ShortcutsPage />}
      {history.page === 'sheet' && <SheetPage open={sheetOpen} onOpenChange={setSheetOpen} />}
    </AppShell>
  );
}

/**
 * The sidebar's workspace menu over the real registry: switch, add a new one, open a folder, or
 * show the open one's folder. A switch shows the splash until the new workspace is open.
 */
function WorkspaceMenu() {
  const current = useQuery(trpc.workspaces.current.queryOptions());
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const open = useMutation(trpc.workspaces.open.mutationOptions());
  const create = useMutation(trpc.workspaces.create.mutationOptions());
  const importFolder = useMutation(trpc.workspaces.importFolder.mutationOptions());
  const showInFolder = useMutation(trpc.workspace.showInFolder.mutationOptions());

  const workspaces = list.data?.items ?? [];
  const openNew = (entry: { id: WorkspaceId } | null) => {
    if (entry) open.mutate({ id: entry.id });
  };
  return (
    <SidebarWorkspace name={current.data?.name ?? 'No workspace open'}>
      <WorkspaceSwitcher
        workspaces={workspaces.map(({ id, name }) => ({ id, name }))}
        current={current.data?.id ?? ''}
        onSelect={(id) => open.mutate({ id: id as WorkspaceId })}
        onCreate={() =>
          create.mutate(
            { name: `Workspace ${workspaces.length + 1}`, color: '#3b82f6' },
            { onSuccess: openNew },
          )
        }
        onOpenFolder={() => importFolder.mutate(undefined, { onSuccess: openNew })}
        onShowInFinder={() => showInFolder.mutate()}
      />
    </SidebarWorkspace>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="3">
      <Heading level={3}>{title}</Heading>
      {children}
    </Stack>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Flex gap="1" justify="between">
      <Text tone="muted">{label}</Text>
      <Text>{children}</Text>
    </Flex>
  );
}

const TRY: Record<Platform, string[]> = {
  macos: [
    'The traffic lights sit in the slot at the top left, beside the sidebar toggle.',
    'Drag the window by the strip at the top; double-click it to zoom.',
  ],
  windows: [
    'Minimise, maximise and close sit at the top right, in the theme’s colours.',
    'Hover maximise: the snap layouts appear.',
    'The ☰ button at the top left opens the app menu.',
    'Open the sheet: it starts under the header, away from the window’s close.',
    'Drag the window by the strip at the top; double-click it to maximise.',
  ],
  linux: [
    'The system’s title bar and menu bar sit above the page.',
    'The window row has no traffic lights or menu button, only the controls.',
  ],
};

function FramePage() {
  const frame = useWindowFrame();
  const shell = useAppShell();
  const version = useQuery(trpc.app.version.queryOptions());
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.settings.get.queryOptions());
  // The new setting shows at once, the control and the page's theme alike, rather than the old one
  // until settings.get refetches; a failed save refetches the settings saved.
  const update = useMutation(
    trpc.settings.update.mutationOptions({
      onMutate: (next) => queryClient.setQueryData(trpc.settings.get.queryKey(), next),
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() }),
    }),
  );

  return (
    <PageContent layout="document">
      <Stack gap="8">
        <Stack gap="2">
          <Heading level={1}>Window frame</Heading>
          <Text tone="muted">
            The title bar this platform gets. Resize the window below 1080px for the rail and the
            drawer, or press <Kbd>⌘\</Kbd> to collapse the sidebar.
          </Text>
        </Stack>

        <Card>
          <CardContent>
            <Stack gap="2">
              <Fact label="Platform">{PLATFORM_NAMES[frame.platform]}</Fact>
              <Fact label="Window controls">
                {frame.controls === 'system' ? 'Drawn by the system' : 'Painted by the page'}
              </Fact>
              <Fact label="Window size">{shell.size}</Fact>
              <Fact label="Sidebar">{shell.rail ? 'Rail' : 'Full'}</Fact>
              <Fact label="App version">{version.data ?? '…'}</Fact>
            </Stack>
          </CardContent>
        </Card>

        <Section title="Try">
          <Stack gap="1" render={<ul />}>
            {TRY[frame.platform].map((line) => (
              <Text key={line} render={<li />}>
                {line}
              </Text>
            ))}
          </Stack>
        </Section>

        <Section title="Theme">
          <Text tone="muted">
            The window’s background follows it, and on Windows the caption buttons repaint.
          </Text>
          {settings.data ? (
            <ToggleGroup
              value={settings.data.theme}
              onValueChange={(theme) =>
                update.mutate({ ...settings.data, theme: theme as typeof settings.data.theme })
              }
              items={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          ) : (
            <Text tone="subtle">The settings can’t be read: DevBrain didn’t load.</Text>
          )}
        </Section>

        <Section title="App menu">
          <Text tone="muted">
            Windows shows no menu bar, so its ☰ button pops up the app menu. This button does the
            same on any platform.
          </Text>
          <div>
            <Button
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                frame.onOpenAppMenu?.({ x: box.left, y: box.bottom });
              }}
            >
              Open the app menu
            </Button>
          </div>
        </Section>
      </Stack>
    </PageContent>
  );
}

const KEYS: { label: string; keys: string }[] = [
  { label: 'Search', keys: '⌘K' },
  { label: 'Collapse or expand the sidebar', keys: '⌘\\' },
  { label: 'Settings', keys: '⌘,' },
  { label: 'Bold', keys: '⌘B' },
  { label: 'Strikethrough', keys: '⌘⇧X' },
  { label: 'Create and keep the dialog open', keys: '⌘↵' },
  { label: 'Set priority to high', keys: '⇧2' },
  { label: 'Go to Tasks', keys: 'G T' },
  { label: 'Open', keys: '↵' },
];

function ShortcutsPage() {
  return (
    <PageContent layout="document">
      <Stack gap="8">
        <Stack gap="2">
          <Heading level={1}>Shortcuts</Heading>
          <Text tone="muted">
            Keys are written as on macOS and named for the platform: Ctrl, Shift and Alt on Windows
            and Linux. Lone keys and sequences stay as they are.
          </Text>
        </Stack>
        <Card>
          <CardContent>
            <Stack gap="2">
              {KEYS.map(({ label, keys }) => (
                <Fact key={keys} label={label}>
                  <Kbd>{keys}</Kbd>
                </Fact>
              ))}
            </Stack>
          </CardContent>
        </Card>
        <Section title="In a menu">
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button />}>Task actions</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={Copy} shortcut="⌘D">
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem icon={Trash2} shortcut="⌘⌫" variant="destructive">
                  Move to trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Section>
      </Stack>
    </PageContent>
  );
}

function SheetPage({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shell = useAppShell();
  const floating = shell.size === 'compact';
  return (
    <PageContent layout="document">
      <Stack gap="4" align="start">
        <Heading level={1}>Sheet</Heading>
        <Text tone="muted">
          Docked beside the page, or floating over it below 1080px. On Windows it starts under the
          header, so its close never sits beside the window’s; elsewhere it runs the full height.
        </Text>
        <Button icon={PanelRight} onClick={() => onOpenChange(!open)}>
          {open ? 'Close the sheet' : 'Open the sheet'}
        </Button>
      </Stack>
      <Sheet open={open} onOpenChange={onOpenChange} variant={floating ? 'overlay' : 'docked'}>
        <SheetContent container={floating ? undefined : shell.sheetContainer}>
          <SheetHeader onOpenAsPage={() => undefined}>Task</SheetHeader>
          <SheetBody>
            <SheetItemTitle>Check the title bar on every platform</SheetItemTitle>
            <Text tone="muted">The sheet’s own open-as-page and close sit at its top right.</Text>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
}
