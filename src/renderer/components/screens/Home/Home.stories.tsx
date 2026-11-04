import type { Meta, StoryObj } from '@storybook/react-vite';
import { FirstRunScreen, FreeDayScreen, HomeScreen } from './HomeScreens';

const meta = {
  title: 'Screens/Home/Home',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma "Home" (7254:8102): greeting, the up-next strip, today's tasks, projects and notes, and the right column. */
export const Home: Story = { render: () => <HomeScreen /> };

/** Figma "Home — free day" (7261:11556): no meetings and nothing due today. */
export const FreeDay: Story = { render: () => <FreeDayScreen /> };

/** Figma "Home — first run" (7257:10066): a new workspace, centred welcome and quick start cards. */
export const FirstRun: Story = { render: () => <FirstRunScreen /> };

/** Figma 7608:59215: at 960 × 640 the sidebar is the rail, the right column hides and cards fit two to a row. */
export const Compact: Story = { render: () => <HomeScreen width={960} height={640} /> };

/** Home pinned to the light theme (Figma "Home — light", 7426:45045). */
export const Light: Story = {
  globals: { theme: 'light' },
  render: () => <HomeScreen />,
};
