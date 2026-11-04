import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, CircleCheck, Copy, ListFilter, Plus, Trash2, List } from 'lucide-react';
import { Text } from '../../layout/Text';
import { Breadcrumb } from '../Breadcrumb';
import { Button } from '../Button';
import { DropdownMenuItem, DropdownMenuSeparator } from '../DropdownMenu';
import { ToggleGroup } from '../ToggleGroup';
import { TooltipProvider } from '../Tooltip';
import {
  PageContent,
  PageFavoriteButton,
  PageHeader,
  PageMenuButton,
  PageToolbar,
} from './PageHeader';

const meta = {
  title: 'Shell/PageHeader',
  component: PageHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ width: 1184 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A list page: the breadcrumb, then the toolbar row with its values. */
export const ListPage: Story = {
  render: () => (
    <>
      <PageHeader>
        <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
      </PageHeader>
      <PageToolbar
        start={
          <Button icon={ListFilter} value="Open">
            Filter
          </Button>
        }
        end={
          <>
            <Button icon={ArrowUpDown} value="Priority">
              Sort
            </Button>
            <ToggleGroup
              aria-label="View"
              items={[
                { value: 'list', icon: List },
                { value: 'board', icon: CircleCheck },
              ]}
            />
            <Button icon={Plus}>New Task</Button>
          </>
        }
      />
    </>
  ),
};

/** A detail page: the breadcrumb to the item, the star and the "…" menu at the right. */
export const DetailPage: Story = {
  render: () => (
    <PageHeader
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
      <Breadcrumb items={['Projects', 'Auth Overhaul', 'Implement OAuth2 PKCE flow']} />
    </PageHeader>
  ),
};

/** Compact windows: the toolbar values hide (the buttons' `hideValue`). */
export const CompactToolbar: Story = {
  render: () => (
    <PageToolbar
      start={
        <Button icon={ListFilter} value="Open" hideValue>
          Filter
        </Button>
      }
      end={
        <Button icon={ArrowUpDown} value="Priority" hideValue>
          Sort
        </Button>
      }
    />
  ),
};

/** `document` content: a 720px column centred under the header, whatever the width. */
export const DocumentContent: Story = {
  render: () => (
    <PageContent layout="document" style={{ outline: '1px dashed var(--border)' }}>
      <Text tone="muted">A note, a task, Settings or Integrations: 720px, centred.</Text>
    </PageContent>
  ),
};
