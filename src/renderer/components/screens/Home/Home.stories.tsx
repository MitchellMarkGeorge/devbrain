import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AllCaughtUpScreen,
  FirstRunScreen,
  FreeDayScreen,
  HomeScreen,
  NoEventsScreen,
  NoProjectsScreen,
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
 * Figma "Home" (7254:8102): the 800px column with a meeting soon, then today's tasks. Figma "No
 * notes" (7259:10348) looks the same.
 */
export const Home: Story = { render: () => <HomeScreen /> };

/** Figma "All caught up" (7257:8792): nothing due; meetings, then recent notes as a list. */
export const AllCaughtUp: Story = { render: () => <AllCaughtUpScreen /> };

/** Figma "Free day" (7261:11556): notes first, so as small cards; then recent projects. */
export const FreeDay: Story = { render: () => <FreeDayScreen /> };

/** Figma "No events" (7259:11058): today's tasks, then recent notes. */
export const NoEvents: Story = { render: () => <NoEventsScreen /> };

/** Figma "No tasks yet" (7257:9513): meetings, then "Get started" fills the empty slot. */
export const NoTasksYet: Story = { render: () => <NoTasksYetScreen /> };

/** Figma "No tasks or events" (7262:12053): projects, then "Get started". */
export const NoTasksOrEvents: Story = { render: () => <NoTasksOrEventsScreen /> };

/** Figma "No projects" (7259:9634): tasks without project pills. */
export const NoProjects: Story = { render: () => <NoProjectsScreen /> };

/** Figma "First run" (7257:10066): "Welcome, Mitchell" and the three setup steps. */
export const FirstRun: Story = { render: () => <FirstRunScreen /> };

/** Figma 7608:59215: at 960 × 640 the sidebar is the rail, the logomark hides and the page scrolls from the top. */
export const Compact: Story = { render: () => <HomeScreen width={960} height={640} /> };

/** Home pinned to the light theme (Figma "Light theme", 7426:45045). */
export const Light: Story = {
  globals: { theme: 'light' },
  render: () => <HomeScreen />,
};
