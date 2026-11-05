import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Video } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { Flex, Stack } from '../../layout/Flex';
import { Grid } from '../../layout/Grid';
import { Text } from '../../layout/Text';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './Card';

const meta = {
  title: 'UI/Card',
  component: Card,
  args: { size: 'default' },
  argTypes: { size: { control: 'inline-radio', options: ['default', 'compact'] } },
  render: (args) => (
    <Card {...args} style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>Today</CardTitle>
        <CardDescription>You have 12 tasks and 4 meetings today.</CardDescription>
        <CardAction>
          <Button variant="link">View all tasks →</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Text tone="muted">3 tasks are overdue.</Text>
      </CardContent>
    </Card>
  ),
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFooter: Story = {
  render: () => (
    <Card style={{ width: 384 }}>
      <CardHeader>
        <CardTitle>Connect Linear</CardTitle>
        <CardDescription>Sync the issues assigned to you into DevBrain.</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button>Connect</Button>
        <Button variant="ghost">Not now</Button>
      </CardFooter>
    </Card>
  ),
};

/** Compact cards on Home: a schedule card and a note card */
export const Compact: Story = {
  render: () => (
    <Grid columns="repeat(2, 260px)" gap="3">
      <Card size="compact">
        <Flex align="center" gap="3">
          <span
            style={{
              width: 3,
              alignSelf: 'stretch',
              borderRadius: 2,
              background: 'var(--swatch-blue)',
            }}
          />
          <Stack gap="0.5" grow>
            <Text weight="medium" tone="strong" truncate>
              Mitchell / Jesse 1:1
            </Text>
            <Text size="xs" tone="subtle">
              <Text tone="today" weight="medium">
                12 mins
              </Text>{' '}
              · 9:00 AM
            </Text>
          </Stack>
          <Button size="xs" icon={Video}>
            Join
          </Button>
        </Flex>
      </Card>
      <Card size="compact">
        <Flex justify="between" align="center">
          <Icon icon={FileText} size={16} color="var(--muted-foreground)" />
          <Text size="xs" tone="muted">
            2h ago
          </Text>
        </Flex>
        <Text weight="medium" tone="strong">
          Q3 roadmap
        </Text>
        <Text tone="subtle" lineClamp={2}>
          Settle the calendar sync scope and agree who owns the onboarding rewrite.
        </Text>
      </Card>
    </Grid>
  ),
};
