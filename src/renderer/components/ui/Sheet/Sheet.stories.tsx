import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Clock, Repeat, Video } from 'lucide-react';
import { Flex, Stack } from '../../layout/Flex';
import { Heading } from '../../layout/Heading';
import { Text } from '../../layout/Text';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTrigger } from './Sheet';

const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function EventDetails() {
  return (
    <SheetBody>
      <Flex gap="3" align="center">
        <span
          style={{
            width: 3,
            alignSelf: 'stretch',
            borderRadius: 2,
            background: 'var(--swatch-blue)',
          }}
        />
        <Heading level={2} variant="title">
          Mitchell / Jesse 1:1
        </Heading>
      </Flex>
      <Stack gap="2">
        {[
          [CalendarDays, 'Today'],
          [Clock, '10:00 – 10:30 AM'],
          [Repeat, 'Every week on Monday'],
        ].map(([icon, label]) => (
          <Flex key={label as string} gap="2" align="center">
            <Icon icon={icon as typeof Clock} style={{ color: 'var(--muted-foreground)' }} />
            <Text>{label as string}</Text>
          </Flex>
        ))}
      </Stack>
      <Button icon={Video} size="sm" style={{ alignSelf: 'flex-start' }}>
        Join
      </Button>
    </SheetBody>
  );
}

/** Docked inside a layout column: the page narrows beside it. */
function DockedExample({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const column = useRef<HTMLDivElement>(null);
  return (
    <div style={{ display: 'flex', height: 480 }}>
      <div style={{ flex: 1, padding: 24 }}>
        <Button onClick={() => setOpen(!open)}>{open ? 'Close details' : 'Event details'}</Button>
      </div>
      <div
        ref={column}
        style={{
          position: 'relative',
          width: open ? 'var(--sheet-width)' : 0,
          transition: 'width var(--duration-slow) var(--ease-out)',
        }}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent container={column}>
          <SheetHeader onOpenAsPage={() => undefined}>Event details</SheetHeader>
          <EventDetails />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const Docked: Story = { render: () => <DockedExample defaultOpen /> };

export const Overlay: Story = {
  render: (args) => (
    <div style={{ height: 480, padding: 24 }}>
      <Sheet {...args} variant="overlay">
        <SheetTrigger render={<Button />}>Event details</SheetTrigger>
        <SheetContent>
          <SheetHeader onOpenAsPage={() => undefined}>Event details</SheetHeader>
          <EventDetails />
        </SheetContent>
      </Sheet>
    </div>
  ),
};

export const OverlayOpen: Story = { ...Overlay, args: { defaultOpen: true } };
