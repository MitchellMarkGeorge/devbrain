import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailMenu, OpenMenu, type DetailPage } from './menus';

const meta = {
  title: 'Screens/Menus/Detail menus',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PAGES: DetailPage[] = ['task', 'task-synced', 'task-detached', 'project', 'note'];

/**
 * Figma's DetailMenu (7430:55705), the "…" of a page header, in its five variants: a task, a
 * synced task, a detached one, a project and a note.
 */
export const Gallery: Story = {
  render: () => (
    <div
      style={{ position: 'relative', width: 1440, height: 420, background: 'var(--background)' }}
    >
      {PAGES.map((page, i) => (
        <OpenMenu key={page} x={40 + i * 248} y={40}>
          <DetailMenu page={page} align="start" sideOffset={0} />
        </OpenMenu>
      ))}
    </div>
  ),
};
