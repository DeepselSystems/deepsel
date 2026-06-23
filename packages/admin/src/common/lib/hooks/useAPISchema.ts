import { useMemo, useCallback } from 'react';
import type { OpenAPISchema } from '../types';

/** A resolved field type entry (simple, date-time, enum, or null) */
export interface FieldColType {
  type: string;
  enum?: string[];
}

/**
 * Derives column type metadata and schema helpers for a given model
 * from a raw OpenAPI schema object.
 *
 * @param modelName - API model name (e.g. 'user', 'product')
 * @param APISchema - Raw OpenAPI schema fetched from /openapi.json
 */
export function useAPISchema(modelName: string, APISchema: OpenAPISchema | null) {
  const paths = APISchema?.paths as Record<string, unknown> | undefined;
  const components = APISchema?.components as { schemas: Record<string, unknown> } | undefined;

  const createOneResponseSchema = useMemo(() => {
    if (!APISchema || !modelName) return null;
    try {
      const ref = (
        (paths?.[`/${modelName}`] as Record<string, unknown>)?.post as Record<string, unknown>
      )?.responses as Record<string, unknown>;
      const schemaRef = (
        ((ref?.['200'] as Record<string, unknown>)?.content as Record<string, unknown>)?.[
          'application/json'
        ] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      const schemaId = (schemaRef?.$ref as string | undefined)?.split('/').pop();
      return schemaId ? (components?.schemas[schemaId] ?? null) : null;
    } catch {
      return null;
    }
  }, [APISchema, modelName]);

  const getOneResponseSchema = useMemo(() => {
    if (!APISchema || !modelName) return null;
    try {
      const ref = (
        (paths?.[`/${modelName}/{item_id}`] as Record<string, unknown>)?.get as Record<
          string,
          unknown
        >
      )?.responses as Record<string, unknown>;
      const schemaRef = (
        ((ref?.['200'] as Record<string, unknown>)?.content as Record<string, unknown>)?.[
          'application/json'
        ] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      const schemaId = (schemaRef?.$ref as string | undefined)?.split('/').pop();
      return schemaId ? ((components?.schemas[schemaId] as Record<string, unknown>) ?? null) : null;
    } catch {
      return null;
    }
  }, [APISchema, modelName]);

  const searchResponseSchema = useMemo(() => {
    if (!APISchema || !modelName) return null;
    try {
      const ref = (
        (paths?.[`/${modelName}/search`] as Record<string, unknown>)?.post as Record<
          string,
          unknown
        >
      )?.responses as Record<string, unknown>;
      const schemaRef = (
        ((ref?.['200'] as Record<string, unknown>)?.content as Record<string, unknown>)?.[
          'application/json'
        ] as Record<string, unknown>
      )?.schema as Record<string, unknown>;
      const schemaId = (schemaRef?.$ref as string | undefined)?.split('/').pop();
      return schemaId ? ((components?.schemas[schemaId] as Record<string, unknown>) ?? null) : null;
    } catch {
      return null;
    }
  }, [APISchema, modelName]);

  const searchItemResponseSchema = useMemo(() => {
    if (!searchResponseSchema) return null;
    try {
      const schemaId = (
        (
          (searchResponseSchema.properties as Record<string, unknown>)?.data as Record<
            string,
            unknown
          >
        )?.items as Record<string, unknown>
      )?.$ref as string | undefined;
      return schemaId
        ? ((components?.schemas[schemaId.split('/').pop()!] as Record<string, unknown>) ?? null)
        : null;
    } catch {
      return null;
    }
  }, [searchResponseSchema, components]);

  /**
   * Resolves a $ref string to its schema definition
   */
  const getSchemaFromRef = useCallback(
    (ref: string): Record<string, unknown> | null => {
      if (!APISchema || !ref) return null;
      const schemaId = ref.split('/').pop();
      return schemaId ? ((components?.schemas[schemaId] as Record<string, unknown>) ?? null) : null;
    },
    [APISchema, components],
  );

  /**
   * Returns the column type(s) for a given field name in the model schema.
   * Handles simple fields, enum $refs, anyOf multi-type fields, and date-time formats.
   */
  const getFieldColTypes = useCallback(
    (fieldName: string): FieldColType[] => {
      if (!getOneResponseSchema || !fieldName) return [];
      const properties = getOneResponseSchema.properties as Record<string, unknown> | undefined;
      const field = properties?.[fieldName] as Record<string, unknown> | undefined;
      if (!field) return [];

      // simple field
      if (field.type) {
        return [{ type: field.type as string }];
      }

      // enum field via $ref
      if (field.$ref) {
        const refSchema = getSchemaFromRef(field.$ref as string);
        if (refSchema?.type === 'string' && refSchema.enum) {
          return [{ type: 'enum', enum: refSchema.enum as string[] }];
        }
        return [{ type: (refSchema?.type as string) ?? 'string' }];
      }

      // multi-type field (anyOf)
      const anyOf = field.anyOf as Array<Record<string, unknown>> | undefined;
      if (anyOf) {
        return anyOf.map((item) => {
          if (item.type === 'string' && item.format === 'date-time') {
            return { type: 'date-time' };
          }
          return { type: item.type as string };
        });
      }

      return [];
    },
    [getOneResponseSchema, getSchemaFromRef],
  );

  return {
    APISchema,
    createOneResponseSchema,
    getOneResponseSchema,
    searchResponseSchema,
    searchItemResponseSchema,
    getFieldColTypes,
  };
}
