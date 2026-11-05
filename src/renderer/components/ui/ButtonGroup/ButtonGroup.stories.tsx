import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Button } from '../Button';
import { ButtonGroup } from './ButtonGroup';

const meta = {
  title: 'UI/ButtonGroup',
  component: ButtonGroup,
} satisfies Meta<typeof ButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The calendar stepper */
export const Stepper: Story = {
  render: () => (
    <ButtonGroup aria-label="Calendar range">
      <Button size="icon" icon={ChevronLeft} aria-label="Previous week" />
      <Button>Today</Button>
      <Button size="icon" icon={ChevronRight} aria-label="Next week" />
    </ButtonGroup>
  ),
};

/** The Settings split button */
export const SplitButton: Story = {
  render: () => (
    <ButtonGroup aria-label="Export">
      <Button>Export as JSON</Button>
      <Button size="icon" icon={ChevronDown} aria-label="More export formats" />
    </ButtonGroup>
  ),
};

export const Variants: Story = {
  render: () => (
    <Flex gap="4">
      <ButtonGroup aria-label="Outline">
        <Button variant="outline">Month</Button>
        <Button variant="outline">Week</Button>
        <Button variant="outline">Day</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Small">
        <Button size="sm">Previous</Button>
        <Button size="sm">Next</Button>
      </ButtonGroup>
    </Flex>
  ),
};
