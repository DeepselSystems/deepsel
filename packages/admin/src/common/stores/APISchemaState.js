import { create } from 'zustand';
import BackendHostURLState from './BackendHostURLState.js';

const initialState = {
  APISchema: null,
  isLoading: false,
  error: null,
};

const useAPISchemaStore = create((set, get) => ({
  ...initialState,
  setAPISchema: (APISchema) => {
    set(() => ({ APISchema }));
  },
  fetchAPISchema: async () => {
    if (get().APISchema || get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const { backendHost } = BackendHostURLState.getState();
      const baseUrl = backendHost.replace(/\/api\/v1\/?$/, '');
      // When using relative proxy path, openapi.json needs to go through /api/v1 proxy too
      const schemaUrl = baseUrl === '' ? '/api/v1/openapi.json' : `${baseUrl}/openapi.json`;
      const response = await fetch(schemaUrl, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      set({ APISchema: data, isLoading: false });
      return data;
    } catch (error) {
      set({ error, isLoading: false });
      console.error('Failed to fetch API schema:', error);
    }
  },
}));

export default useAPISchemaStore;
