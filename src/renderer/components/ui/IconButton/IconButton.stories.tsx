import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bold,
  Ellipsis,
  Italic,
  Link,
  Maximize2,
  Plus,
  Search,
  SquarePen,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { TooltipProvider } from '../Tooltip';
import { IconButton } from './IconButton';

const meta = {
  title: 'UI/IconButton',
  component: IconButton,
  args: { icon: Ellipsis, label: 'More actions' },
  argTypes: {
    icon: { control: false },
    size: { control: 'inline-radio', options: ['default', 'sm', 'xs'] },
    variant: {
      control: 'select',
      options: ['ghost', 'default', 'outline', 'secondary', 'destructive', 'primary'],
    },
    tone: { control: 'inline-radio', options: ['default', 'muted'] },
    tooltip: { control: 'boolean' },
    tooltipSide: { control: 'inline-radio', options: ['top', 'right', 'bottom', 'left'] },
    disabled: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const Label = ({ children }: { children: string }) => (
  <Text size="xs" tone="muted" style={{ width: 96 }}>
    {children}
  </Text>
);

/** Point at it: its label shows in a tooltip, and it is the button's accessible name too */
export const Default: Story = {};

/** 32px, 28px (editor toolbar, selection bar) and 24px (sidebar, panel headers) */
export const Sizes: Story = {
  render: (args) => (
    <Flex gap="3" align="center">
      <IconButton {...args} size="default" />
      <IconButton {...args} size="sm" />
      <IconButton {...args} size="xs" />
    </Flex>
  ),
};

/** `ghost` is the default; the other Button variants work too */
export const Variants: Story = {
  render: () => (
    <Stack gap="3">
      {(['ghost', 'default', 'outline', 'secondary', 'destructive'] as const).map((variant) => (
        <Flex key={variant} gap="3" align="center">
          <Label>{variant}</Label>
          <IconButton
            variant={variant}
            icon={variant === 'destructive' ? Trash2 : Star}
            label={variant === 'destructive' ? 'Move to trash' : 'Favorite'}
          />
          <IconButton variant={variant} size="sm" icon={Plus} label="New task" />
          <IconButton variant={variant} size="xs" icon={X} label="Close" />
        </Flex>
      ))}
    </Stack>
  ),
};

/** `muted` rests in `muted-foreground` and lifts on hover: panel headers, the sidebar, rows */
export const MutedTone: Story = {
  render: () => (
    <Flex gap="1" align="center">
      <IconButton tone="muted" size="xs" icon={Search} label="Search" />
      <IconButton tone="muted" size="xs" icon={SquarePen} label="New" />
      <IconButton tone="muted" size="xs" icon={Maximize2} label="Open as page" />
      <IconButton tone="muted" size="xs" icon={X} label="Close" />
    </Flex>
  ),
};

/** An editor toolbar: 28px buttons, the tooltips above */
export const Toolbar: Story = {
  render: () => (
    <Flex gap="1" align="center">
      <IconButton size="sm" icon={Bold} label="Bold" tooltip="Bold  ⌘B" tooltipSide="top" />
      <IconButton size="sm" icon={Italic} label="Italic" tooltip="Italic  ⌘I" tooltipSide="top" />
      <IconButton size="sm" icon={Link} label="Link" tooltip="Link  ⌘K" tooltipSide="top" />
    </Flex>
  ),
};

/** A toggle: `aria-pressed` says whether it is on (the detail page's star) */
export const Toggle: Story = {
  render: () => {
    const [on, setOn] = useState(false);
    return (
      <IconButton
        icon={<Star size={16} strokeWidth={1.75} fill={on ? 'currentColor' : 'none'} />}
        label={on ? 'Remove from favorites' : 'Add to favorites'}
        tone="muted"
        aria-pressed={on}
        onClick={() => setOn(!on)}
      />
    );
  },
};

/** The trigger of a menu: the "…" menu at the right of a detail page's top bar */
export const MenuTrigger: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton icon={Ellipsis} label="More actions" />} />
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Convert to project</DropdownMenuItem>
        <DropdownMenuItem shortcut="⌘D">Duplicate</DropdownMenuItem>
        <DropdownMenuItem>Copy as Markdown</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" icon={Trash2}>
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

/** No tooltip, when something nearby already names the button */
export const WithoutTooltip: Story = {
  args: { tooltip: false, icon: X, label: 'Clear selection' },
};

export const Disabled: Story = {
  args: { disabled: true },
};
