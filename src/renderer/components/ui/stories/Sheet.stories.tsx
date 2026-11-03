import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Box,
  Button,
  EntityPill,
  Flex,
  Heading,
  PropertyRow,
  Sheet,
  Stack,
  Text,
  Textarea,
} from '..';

const meta = {
  title: 'Overlays/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  args: {
    title: 'Task details',
    description: 'Keep the work in view.',
    overlay: true,
    trigger: <Button>Open Details</Button>,
    children: (
      <Stack>
        <Heading variant="document">Implement workspace navigation</Heading>
        <PropertyRow
          properties={[
            <EntityPill key="status" status="in-progress">
              In progress
            </EntityPill>,
          ]}
        />
        <Textarea aria-label="Task description" placeholder="Add description…" />
      </Stack>
    ),
  },
} satisfies Meta<typeof Sheet>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Docked: Story = {
  args: { overlay: false, defaultOpen: true, trigger: undefined },
  decorators: [
    (Story) => (
      <Flex align="stretch" style={{ height: 480 }}>
        <Box padding={4} style={{ flex: 1 }}>
          <Heading>Workspace</Heading>
          <Text>The page narrows beside the panel.</Text>
        </Box>
        <Story />
      </Flex>
    ),
  ],
};
