import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  BoardCard,
  BoardColumn,
  Box,
  Button,
  Flex,
  GroupHeading,
  Heading,
  Sidebar,
  Stack,
  TaskList,
  Text,
  ToggleGroup,
  NoteCard,
  Grid,
} from '..';
import { tasks } from './fixtures';
function Workspace() {
  const [view, setView] = useState('list');
  return (
    <Flex align="stretch" style={{ height: 'calc(100vh - 64px)', minHeight: 640 }}>
      <Sidebar workspace="DevBrain" workspaceColor="indigo" active="Tasks" />
      <Box padding={6} style={{ flex: 1, minWidth: 0 }}>
        <Stack gap={6}>
          <Flex justify="space-between">
            <div>
              <Heading as="h1" variant="page">
                Tasks
              </Heading>
              <Text tone="muted">A little more focus for the day ahead.</Text>
            </div>
            <Button icon="plus">New Task</Button>
          </Flex>
          <Flex justify="space-between" gap={4}>
            <ToggleGroup
              value={view}
              onValueChange={setView}
              label="Task view"
              items={[
                { value: 'list', icon: 'list', label: 'List' },
                { value: 'board', icon: 'columns-3', label: 'Board' },
              ]}
            />
            <Flex gap={2}>
              <Button
                variant="outline"
                icon="filter"
                value="Assigned to me"
                title="Filter: Assigned to me"
              >
                Filter
              </Button>
              <Button
                variant="outline"
                icon="arrow-down-wide-narrow"
                value="Due date"
                title="Sort: Due date"
              >
                Sort
              </Button>
            </Flex>
          </Flex>
          {view === 'list' ? (
            <div>
              <GroupHeading
                label="This week"
                subtitle="Keep the important work moving"
                icon="calendar"
                iconColor="blue"
                done={1}
                total={4}
              />
              <TaskList tasks={tasks} />
            </div>
          ) : (
            <Grid columns={3} gap={6}>
              {(['not-started', 'in-progress', 'completed'] as const).map((status) => (
                <BoardColumn
                  key={status}
                  name={status.replaceAll('-', ' ')}
                  status={status}
                  count={tasks.filter((task) => task.status === status).length}
                >
                  {tasks
                    .filter((task) => task.status === status)
                    .map((task) => (
                      <BoardCard key={task.id} task={task} />
                    ))}
                </BoardColumn>
              ))}
            </Grid>
          )}
          <Heading>Recent notes</Heading>
          <Grid columns={2} gap={4}>
            <NoteCard
              title="Design system"
              updated="2h ago"
              preview="A quiet interface that keeps the work in focus."
            />
            <NoteCard
              title="Planning"
              updated="Yesterday"
              preview="What matters this week, and what can wait."
            />
          </Grid>
        </Stack>
      </Box>
    </Flex>
  );
}
const meta = {
  title: 'Examples/Workspace',
  component: Workspace,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Workspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
