import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Field, FieldError, FieldLabel } from './Field';

const meta = {
  title: 'UI/Field',
  component: Field,
  args: { label: 'Project name' },
  decorators: [(Story) => <div style={{ width: 320 }}>{Story()}</div>],
  render: (args) => (
    <Field {...args}>
      <Input placeholder="DevBrain launch" />
    </Field>
  ),
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: { label: 'Workspace name', description: 'Shown in the sidebar and the workspace menu.' },
};

export const WithError: Story = {
  args: { label: 'Project name', error: 'Enter a name for the project.' },
};

export const WithTextarea: Story = {
  render: () => (
    <Field label="Description">
      <Textarea placeholder="Add a description…" />
    </Field>
  ),
};

/** Base UI's own validation: the error shows once the field is touched and empty. */
export const Validation: Story = {
  render: () => (
    <Stack gap="4">
      <Field validationMode="onBlur">
        <FieldLabel>Event title</FieldLabel>
        <Input required placeholder="Mitchell / Jesse 1:1" />
        <FieldError match="valueMissing">Enter a title for the event.</FieldError>
      </Field>
    </Stack>
  ),
};
