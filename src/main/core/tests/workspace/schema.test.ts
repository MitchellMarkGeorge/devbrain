import { describe, it, expect } from 'vitest';
import { workspaceInfoSchema, workspaceRegistrySchema } from '../../workspace/schema';
import type { WorkspaceInfo } from '../../workspace/types';

const validInfo: WorkspaceInfo = {
  id: 'wsp_abc123' as WorkspaceInfo['id'],
  name: 'My Workspace',
  color: '#000000',
  path: '/home/user/.devbrain/workspaces/wsp_abc123',
  createdAt: Date.now(),
  lastOpenedAt: null,
};

describe('workspaceInfoSchema', () => {
  it('accepts a valid workspace info object', () => {
    expect(workspaceInfoSchema.safeParse(validInfo).success).toBe(true);
  });

  it('rejects null color', () => {
    expect(workspaceInfoSchema.safeParse({ ...validInfo, color: null }).success).toBe(false);
  });

  it('accepts a non-null lastOpenedAt', () => {
    expect(workspaceInfoSchema.safeParse({ ...validInfo, lastOpenedAt: Date.now() }).success).toBe(
      true,
    );
  });

  it('rejects id without wsp_ prefix', () => {
    expect(workspaceInfoSchema.safeParse({ ...validInfo, id: 'abc123' }).success).toBe(false);
  });

  it('rejects missing name', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name, ...noName } = validInfo;
    expect(workspaceInfoSchema.safeParse(noName).success).toBe(false);
  });

  it('rejects missing createdAt', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { createdAt, ...noCreatedAt } = validInfo;
    expect(workspaceInfoSchema.safeParse(noCreatedAt).success).toBe(false);
  });
});

describe('workspaceRegistrySchema', () => {
  it('accepts an empty registry', () => {
    expect(workspaceRegistrySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a registry with a valid entry', () => {
    expect(workspaceRegistrySchema.safeParse({ [validInfo.id]: validInfo }).success).toBe(true);
  });

  it('rejects keys without wsp_ prefix', () => {
    expect(workspaceRegistrySchema.safeParse({ abc123: validInfo }).success).toBe(false);
  });

  it('rejects invalid workspace info values', () => {
    expect(
      workspaceRegistrySchema.safeParse({ [validInfo.id]: { id: validInfo.id } }).success,
    ).toBe(false);
  });
});
