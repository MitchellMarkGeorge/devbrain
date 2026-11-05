import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AllCaughtUpScreen,
  FirstRunScreen,
  FreeDayScreen,
  HomeScreen,
  NoEventsScreen,
  NoTasksOrEventsScreen,
  NoTasksYetScreen,
} from './HomeScreens';

const meta = {
  title: 'Screens/Home/Home',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Figma "Home" (7254:8102): the 800px column, centred, with its one section: a meeting in 12
 * minutes is the soonest thing, so Meetings. Figma "No notes" (7259:10348) and "No projects" (7259:9634) look the same.
 */
export const Home: Story = { render: () => <HomeScreen /> };

/** Figma "All caught up" (7257:8792): nothing due; a meeting soon. */
export const AllCaughtUp: Story = { render: () => <AllCaughtUpScreen /> };

/** Figma "Free day" (7261:11556): nothing coming up, so the notes just edited, as small cards. */
export const FreeDay: Story = { render: () => <FreeDayScreen /> };

/** Figma "No events" (7259:11058): today's tasks. */
export const NoEvents: Story = { render: () => <NoEventsScreen /> };

/** Figma "No tasks yet" (7257:9513): a meeting soon; the summary says there are no tasks yet. */
export const NoTasksYet: Story = { render: () => <NoTasksYetScreen /> };

/** Figma "No tasks or events" (7262:12053): no meetings or tasks, but project deadlines coming up. */
export const NoTasksOrEvents: Story = { render: () => <NoTasksOrEventsScreen /> };

/** Figma "First run" (7257:10066): "Welcome, Mitchell" and the three setup steps. */
export const FirstRun: Story = { render: () => <FirstRunScreen /> };

/** The app's default window, 1200 × 800: everything fits without scrolling. */
export const DefaultWindow: Story = { render: () => <HomeScreen width={1200} height={800} /> };

/** Figma 7608:59215: at 960 × 640, with the sidebar as the rail. */
export const Compact: Story = { render: () => <HomeScreen width={960} height={640} /> };

/** Home pinned to the light theme (Figma "Light theme", 7426:45045). */
export const Light: Story = {
  globals: { theme: 'light' },
  render: () => <HomeScreen />,
};
