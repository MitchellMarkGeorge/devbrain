import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Badge } from '../../ui/Badge';
import { ProjectHealth } from '@common/types';
import { HEALTH_LABELS } from '../../types';
import { HealthIcon } from './HealthIcon';

const HEALTHS = [
  ProjectHealth.ON_TRACK,
  ProjectHealth.AT_RISK,
  ProjectHealth.OFF_TRACK,
  ProjectHealth.NOT_STARTED,
  ProjectHealth.COMPLETED,
];

const meta = {
  title: 'Entities/HealthIcon',
  component: HealthIcon,
  args: { health: ProjectHealth.ON_TRACK, size: 16 },
  argTypes: {
    health: { control: { type: 'select', labels: HEALTH_LABELS }, options: HEALTHS },
    size: { control: 'inline-radio', options: [12, 16, 24] },
  },
} satisfies Meta<typeof HealthIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack gap="3">
      {HEALTHS.map((health) => (
        <Flex key={health} gap="2" align="center">
          <HealthIcon health={health} />
          <Text>{HEALTH_LABELS[health]}</Text>
        </Flex>
      ))}
    </Stack>
  ),
};

/** In the project header: an outline Badge with its label */
export const InBadge: Story = {
  render: () => (
    <Flex gap="2" wrap="wrap">
      {HEALTHS.map((health) => (
        <Badge key={health} variant="outline" icon={<HealthIcon health={health} size={12} />}>
          {HEALTH_LABELS[health]}
        </Badge>
      ))}
    </Flex>
  ),
};
