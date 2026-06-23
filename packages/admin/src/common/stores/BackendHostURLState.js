import { create } from 'zustand';
import envBackendHost from '../../constants/backendHost.js';

const normalize = (host) => {
  if (host == null || host === '') return host;
  if (host.endsWith('/api/v1')) return host;
  return host.endsWith('/') ? host + 'api/v1' : host + '/api/v1';
};

const initialState = {
  backendHost: normalize(localStorage.getItem('backendHost')) || envBackendHost,
};

export default create((set) => ({
  ...initialState,
  setBackendHost: (backendHost) => {
    const next = normalize(backendHost);
    localStorage.setItem('backendHost', next);
    set(() => ({ backendHost: next }));
  },
  resetDefault: () => set(() => ({ backendHost: envBackendHost })),
}));
