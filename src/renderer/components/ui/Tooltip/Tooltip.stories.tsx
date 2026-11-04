import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ellipsis, Star } from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Button } from '../Button';
import { Tooltip, TooltipProvider } from './Tooltip';

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ padding: '48px 24px' }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    content: 'Favorite',
    children: <Button size="icon" variant="ghost" icon={Star} aria-label="Favorite" />,
  },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'right', 'bottom', 'left'] },
    children: { control: false },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Open: Story = { args: { defaultOpen: true } };

export const Toolbar: Story = {
  render: () => (
    <Flex gap="1">
      <Tooltip content="Favorite">
        <Button size="icon-sm" variant="ghost" icon={Star} aria-label="Favorite" />
      </Tooltip>
      <Tooltip content="More actions" side="bottom">
        <Button size="icon-sm" variant="ghost" icon={Ellipsis} aria-label="More actions" />
      </Tooltip>
    </Flex>
  ),
};

export const TruncatedName: Story = {
  render: () => (
    <Tooltip content="Mitchell / Jesse 1:1 — quarterly planning and roadmap review" defaultOpen>
      <span tabIndex={0} style={{ display: 'block', width: 180 }}>
        <Text truncate render={<span style={{ display: 'block' }} />}>
          Mitchell / Jesse 1:1 — quarterly planning and roadmap review
        </Text>
      </span>
    </Tooltip>
  ),
};

/** A sidebar item's tooltip with its shortcut, as Figma's Tooltip draws it */
export const WithShortcut: Story = {
  args: { content: 'Tasks', shortcut: 'G T', defaultOpen: true },
};
