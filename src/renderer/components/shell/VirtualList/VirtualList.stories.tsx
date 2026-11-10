import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectRow } from '../../lists/ProjectRow';
import { SAMPLE_PROJECTS } from '../../projects/ProjectCard/fixtures';
import { VirtualList } from './VirtualList';

const THOUSAND_PROJECTS = Array.from({ length: 1000 }, (_, i) => {
  const base = SAMPLE_PROJECTS[i % SAMPLE_PROJECTS.length];
  return { ...base, title: `${base.project.title} #${i + 1}` };
});

const meta = {
  title: 'Shell/VirtualList',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 1,000 project rows, virtualized: the list fills the 600px it is given and scrolls on its own,
 * with only the rows in view in the DOM.
 */
export const ThousandRows: Story = {
  name: '1,000 rows',
  decorators: [
    (Story) => (
      <div style={{ width: 960, height: 600, display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <VirtualList
      items={THOUSAND_PROJECTS}
      getKey={(item) => item.title}
      renderItem={(item) => (
        <ProjectRow project={{ ...item.project, title: item.title }} stats={item.stats} />
      )}
      aria-label="Projects"
    />
  ),
};
