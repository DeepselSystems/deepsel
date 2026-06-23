import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import DeepselAdminProvider from '../src/common/DeepselAdminProvider.jsx';
import BackendHostURLState from '../src/common/stores/BackendHostURLState.js';

function HostReader() {
  const backendHost = BackendHostURLState((s) => s.backendHost);
  return <div data-testid="host">{backendHost}</div>;
}

describe('DeepselAdminProvider', () => {
  it('renders children', () => {
    render(
      <DeepselAdminProvider backendHost="https://x.example/api/v1">
        <div>child</div>
      </DeepselAdminProvider>,
    );
    expect(screen.getByText('child')).toBeDefined();
  });

  it('updates store before children render (first paint sees new value)', () => {
    render(
      <DeepselAdminProvider backendHost="https://child.example/api/v1">
        <HostReader />
      </DeepselAdminProvider>,
    );
    expect(screen.getByTestId('host').textContent).toBe('https://child.example/api/v1');
  });

  it('updates the store when the backendHost prop changes', () => {
    const { rerender } = render(
      <DeepselAdminProvider backendHost="https://a.example/api/v1">
        <HostReader />
      </DeepselAdminProvider>,
    );
    expect(screen.getByTestId('host').textContent).toBe('https://a.example/api/v1');

    rerender(
      <DeepselAdminProvider backendHost="https://b.example/api/v1">
        <HostReader />
      </DeepselAdminProvider>,
    );
    expect(screen.getByTestId('host').textContent).toBe('https://b.example/api/v1');
  });

  it('does not clobber the store when backendHost prop is omitted', () => {
    act(() => {
      BackendHostURLState.getState().setBackendHost('https://seed.example/api/v1');
    });

    render(
      <DeepselAdminProvider>
        <HostReader />
      </DeepselAdminProvider>,
    );
    expect(screen.getByTestId('host').textContent).toBe('https://seed.example/api/v1');
  });
});
