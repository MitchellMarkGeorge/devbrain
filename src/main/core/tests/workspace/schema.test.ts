import { describe, it, expect } from 'vitest';
import { registryEntrySchema, workspaceRegistrySchema } from '../../workspace/schema';

const validEntry = {
  id: 'wsp_abc123',
  path: '/home/user/.devbrain/workspaces/wsp_abc123',
  lastOpenedAt: null,
};

describe('registryEntrySchema', () => {
  it('accepts an entry with only what belongs to this computer', () => {
    expect(registryEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it('accepts a non-null lastOpenedAt', () => {
    expect(registryEntrySchema.safeParse({ ...validEntry, lastOpenedAt: Date.now() }).success).toBe(
      true,
    );
  });

  it('accepts the name, colour and creation time an older registry kept', () => {
    const older = { ...validEntry, name: 'My Workspace', color: '#000000', createdAt: Date.now() };
    expect(registryEntrySchema.parse(older)).toEqual(older);
  });

  it('rejects an id without the wsp_ prefix', () => {
    expect(registryEntrySchema.safeParse({ ...validEntry, id: 'abc123' }).success).toBe(false);
  });

  it('rejects a missing path', () => {
    expect(registryEntrySchema.safeParse({ id: 'wsp_abc123', lastOpenedAt: null }).success).toBe(
      false,
    );
  });

  it('rejects a null colour from an older registry', () => {
    expect(registryEntrySchema.safeParse({ ...validEntry, color: null }).success).toBe(false);
  });
});

describe('workspaceRegistrySchema', () => {
  it('accepts an empty registry', () => {
    expect(workspaceRegistrySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a registry with a valid entry', () => {
    expect(workspaceRegistrySchema.safeParse({ [validEntry.id]: validEntry }).success).toBe(true);
  });

  it('rejects keys without wsp_ prefix', () => {
    expect(workspaceRegistrySchema.safeParse({ abc123: validEntry }).success).toBe(false);
  });

  it('rejects invalid entries', () => {
    expect(
      workspaceRegistrySchema.safeParse({ [validEntry.id]: { id: validEntry.id } }).success,
    ).toBe(false);
  });
});
