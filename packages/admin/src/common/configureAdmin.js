import BackendHostURLState from './stores/BackendHostURLState.js';

export default function configureAdmin({ backendHost } = {}) {
  if (backendHost) {
    BackendHostURLState.getState().setBackendHost(backendHost);
  }
}
