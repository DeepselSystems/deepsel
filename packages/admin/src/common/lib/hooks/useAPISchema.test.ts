import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAPISchema } from './useAPISchema';

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    created_at: {
      anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
    },
    role: { $ref: '#/components/schemas/RoleEnum' },
    parent: { $ref: '#/components/schemas/UserRef' },
  },
};

const buildSchema = () => ({
  paths: {
    '/user': {
      post: {
        responses: {
          '200': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
    },
    '/user/{item_id}': {
      get: {
        responses: {
          '200': {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
    },
    '/user/search': {
      post: {
        responses: {
          '200': {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserSearchResponse' } },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: userSchema,
      UserSearchResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
          total: { type: 'integer' },
        },
      },
      RoleEnum: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
      UserRef: { type: 'object' },
    },
  },
});

describe('useAPISchema', () => {
  it('returns null selectors and an empty field type list when schema is missing', () => {
    const { result } = renderHook(() => useAPISchema('user', null));
    expect(result.current.APISchema).toBeNull();
    expect(result.current.createOneResponseSchema).toBeNull();
    expect(result.current.getOneResponseSchema).toBeNull();
    expect(result.current.searchResponseSchema).toBeNull();
    expect(result.current.searchItemResponseSchema).toBeNull();
    expect(result.current.getFieldColTypes('name')).toEqual([]);
  });

  it('resolves create/getOne/search response schemas via $ref', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('user', schema as never));

    expect(result.current.createOneResponseSchema).toBe(userSchema);
    expect(result.current.getOneResponseSchema).toBe(userSchema);
    expect(result.current.searchResponseSchema).toBe(schema.components.schemas.UserSearchResponse);
    expect(result.current.searchItemResponseSchema).toBe(userSchema);
  });

  it('returns null when the model has no matching paths', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('unknown', schema as never));
    expect(result.current.createOneResponseSchema).toBeNull();
    expect(result.current.getOneResponseSchema).toBeNull();
    expect(result.current.searchResponseSchema).toBeNull();
  });

  it('getFieldColTypes returns the primitive type for simple fields', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('user', schema as never));
    expect(result.current.getFieldColTypes('id')).toEqual([{ type: 'integer' }]);
    expect(result.current.getFieldColTypes('name')).toEqual([{ type: 'string' }]);
  });

  it('getFieldColTypes resolves $ref enums', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('user', schema as never));
    expect(result.current.getFieldColTypes('role')).toEqual([
      { type: 'enum', enum: ['admin', 'editor', 'viewer'] },
    ]);
  });

  it('getFieldColTypes falls back to the ref schema type when not an enum', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('user', schema as never));
    expect(result.current.getFieldColTypes('parent')).toEqual([{ type: 'object' }]);
  });

  it('getFieldColTypes surfaces date-time from anyOf', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('user', schema as never));
    expect(result.current.getFieldColTypes('created_at')).toEqual([
      { type: 'date-time' },
      { type: 'null' },
    ]);
  });

  it('getFieldColTypes returns [] for unknown fields', () => {
    const schema = buildSchema();
    const { result } = renderHook(() => useAPISchema('user', schema as never));
    expect(result.current.getFieldColTypes('does_not_exist')).toEqual([]);
  });
});
