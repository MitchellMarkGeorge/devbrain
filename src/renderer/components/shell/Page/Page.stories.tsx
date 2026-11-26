import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Trash2 } from 'lucide-react';
import { Text } from '../../layout/Text';
import { DemoToolbarEnd, DemoToolbarStart } from '../../lists/ListToolbar/fixtures';
import { DropdownMenuItem, DropdownMenuSeparator } from '../../ui/DropdownMenu';
import { TooltipProvider } from '../../ui/Tooltip';
import { Page, PageContent, PageFavoriteButton, PageMenuButton, PageToolbar } from './Page';

// Outside a WorkspaceShell, as here, a page draws its actions in a 48px bar at its top and leaves
// its title out; in a shell both go up in the title bar (see the WorkspaceShell stories).

const meta = {
  title: 'Shell/Page',
  component: Page,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ width: 1184, height: 320, display: 'flex' }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

const outline = { flex: 1, outline: '1px dashed var(--border)' };

/** A list page: no actions, the toolbar row with its values at its top. */
export const ListPage: Story = {
  render: () => (
    <Page title="Tasks" style={outline}>
      <PageToolbar
        start={<DemoToolbarStart list="tasks" />}
        end={<DemoToolbarEnd list="tasks" />}
      />
    </Page>
  ),
};

/** The list page in dark: the toolbar's `outline` buttons, the page's colour in a `border` line. */
export const ListPageDark: Story = {
  ...ListPage,
  name: 'List page — dark',
  globals: { theme: 'dark' },
};

/** A detail page: the star and the "…" menu as its actions, its content in the document column. */
export const DetailPage: Story = {
  render: () => (
    <Page
      title="Implement OAuth2 PKCE flow"
      style={outline}
      actions={
        <>
          <PageFavoriteButton favorite />
          <PageMenuButton>
            <DropdownMenuItem icon={Copy}>Copy as Markdown</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={Trash2} variant="destructive">
              Move to trash
            </DropdownMenuItem>
          </PageMenuButton>
        </>
      }
    >
      <PageContent layout="document">
        <Text tone="muted">A task: the star and “…” are its actions.</Text>
      </PageContent>
    </Page>
  ),
};

/** Compact windows: the toolbar values hide (the buttons' `hideValue`). */
export const CompactToolbar: Story = {
  render: () => (
    <Page style={outline}>
      <PageToolbar
        start={<DemoToolbarStart list="tasks" compact />}
        end={<DemoToolbarEnd list="tasks" compact />}
      />
    </Page>
  ),
};

/**
 * `document` content: a 720px column centred in the page, whatever the width. The dashed outline
 * is the `PageContent`: the page's scroller, filling the page's height.
 */
export const DocumentContent: Story = {
  render: () => (
    <Page style={outline}>
      <PageContent layout="document" style={{ outline: '1px dashed var(--border)' }}>
        <Text tone="muted">A note, a task, Settings or Integrations: 720px, centred.</Text>
      </PageContent>
    </Page>
  ),
};

const PARAGRAPHS = Array.from(
  { length: 12 },
  (_, index) =>
    `Paragraph ${index + 1}. A document taller than the page scrolls whole inside its PageContent, its scrollbar over the page's right edge, while the actions above it stay put.`,
);

/** A document taller than the page: the `PageContent` scrolls it, and the actions bar stays put. */
export const LongDocument: Story = {
  render: () => (
    <Page style={outline} actions={<PageFavoriteButton favorite={false} />}>
      <PageContent layout="document">
        {PARAGRAPHS.map((text) => (
          <Text key={text} render={<p />} tone="muted">
            {text}
          </Text>
        ))}
      </PageContent>
    </Page>
  ),
};

/** `home` content: Home's 800px column, centred down the page while it fits. */
export const HomeContent: Story = {
  render: () => (
    <Page style={outline}>
      <PageContent layout="home">
        <Text tone="muted" align="center">
          Home’s column, centred across the page and down it.
        </Text>
      </PageContent>
    </Page>
  ),
};
