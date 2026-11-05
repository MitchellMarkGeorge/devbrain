import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Badge } from '../../ui/Badge';
import { ProjectStatusIcon, PROJECT_STATUSES, PROJECT_STATUS_LABELS } from './ProjectStatusIcon';

const meta = {
  title: 'Entities/ProjectStatusIcon',
  component: ProjectStatusIcon,
  args: { status: 'active', size: 16 },
  argTypes: {
    status: { control: 'select', options: PROJECT_STATUSES },
    size: { control: 'inline-radio', options: [12, 16, 24] },
  },
} satisfies Meta<typeof ProjectStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => (
    <Stack gap="3">
      {PROJECT_STATUSES.map((status) => (
        <Flex key={status} gap="2" align="center">
          <ProjectStatusIcon status={status} />
          <Text>{PROJECT_STATUS_LABELS[status]}</Text>
        </Flex>
      ))}
    </Stack>
  ),
};

/** The status pill on project cards, rows and headers: 12px inside an outline Badge */
export const InBadge: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      {PROJECT_STATUSES.map((status) => (
        <Badge key={status} icon={<ProjectStatusIcon status={status} size={12} />}>
          {PROJECT_STATUS_LABELS[status]}
        </Badge>
      ))}
    </Flex>
  ),
};
