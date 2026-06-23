import { useAPISchema as useAPISchemaBase } from '../lib/hooks';
import APISchemaState from '../stores/APISchemaState.js';

export default function useAPISchema(modelName) {
  const { APISchema } = APISchemaState();

  return useAPISchemaBase(modelName, APISchema);
}
