import { describe, it, expect } from 'vitest';
import configureAdmin from '../src/common/configureAdmin.js';
import BackendHostURLState from '../src/common/stores/BackendHostURLState.js';

describe('configureAdmin', () => {
  it('updates the backendHost store value', () => {
    configureAdmin({ backendHost: 'https://x.example/api/v1' });
    expect(BackendHostURLState.getState().backendHost).toBe('https://x.example/api/v1');
  });

  it('persists the value to localStorage', () => {
    configureAdmin({ backendHost: 'https://persist.example/api/v1' });
    expect(localStorage.getItem('backendHost')).toBe('https://persist.example/api/v1');
  });

  it('is a no-op when called with no args', () => {
    BackendHostURLState.getState().setBackendHost('https://seed.example/api/v1');
    configureAdmin();
    expect(BackendHostURLState.getState().backendHost).toBe('https://seed.example/api/v1');
  });

  it('is a no-op when backendHost is undefined', () => {
    BackendHostURLState.getState().setBackendHost('https://seed2.example/api/v1');
    configureAdmin({});
    expect(BackendHostURLState.getState().backendHost).toBe('https://seed2.example/api/v1');
  });

  it('reflects the latest value when called repeatedly', () => {
    configureAdmin({ backendHost: 'https://first.example/api/v1' });
    configureAdmin({ backendHost: 'https://second.example/api/v1' });
    expect(BackendHostURLState.getState().backendHost).toBe('https://second.example/api/v1');
  });
});
