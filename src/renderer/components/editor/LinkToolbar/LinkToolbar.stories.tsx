import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '../../ui/Tooltip';
import { LinkToolbar } from './LinkToolbar';

const meta = {
  title: 'Editor/LinkToolbar',
  component: LinkToolbar,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof LinkToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** state=empty: paste or type, then Enter */
export const Empty: Story = { args: { value: '' } };

/** state=filled: the address, Open link and Remove link */
export const Filled: Story = {
  args: {
    value:
      'https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce',
  },
};

export const Interactive: Story = {
  args: { value: '' },
  render: function Render() {
    const [value, setValue] = useState('');
    return <LinkToolbar value={value} onValueChange={setValue} onRemove={() => setValue('')} />;
  },
};
