import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectHeader } from './ProjectHeader';

const meta = {
  title: 'Projects/ProjectHeader',
  component: ProjectHeader,
  args: {
    title: 'Auth Overhaul',
    status: 'active',
    start: 'Jun 1',
    due: 'Jul 1',
    done: 3,
    total: 12,
    description: (
      <>
        <p>
          The implicit grant is deprecated under OAuth 2.1: access tokens come back in the redirect
          URI fragment, where browser history and scripts on the page can leak them. PKCE closes
          that gap.
        </p>
        <p>This project moves every first-party client to the code flow with PKCE by Jul 1.</p>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 760 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A new project: no tasks (no progress pill), a due date only, no description */
export const NewProject: Story = {
  args: {
    title: 'Billing Revamp',
    status: 'not-started',
    start: undefined,
    due: 'Aug 1',
    done: 0,
    total: 0,
    description: undefined,
  },
};
