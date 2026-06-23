import { useLayoutEffect } from 'react';
import BackendHostURLState from './stores/BackendHostURLState.js';

export default function DeepselAdminProvider({ backendHost, children }) {
  useLayoutEffect(() => {
    if (backendHost) {
      BackendHostURLState.getState().setBackendHost(backendHost);
    }
  }, [backendHost]);

  return children;
}
