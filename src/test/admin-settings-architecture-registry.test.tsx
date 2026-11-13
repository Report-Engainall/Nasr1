// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useFetch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/useFetch', () => ({ useFetch: mocks.useFetch }));
vi.mock('@/components/reference-model/observability/ArchitectureRegistryPanel', () => ({
  ArchitectureRegistryPanel: () => <div data-testid="architecture-registry-panel">سجل معمارية التطبيق</div>,
}));

import { SettingsPage } from '@/components/AdminPages';

function renderSettingsFor(roles: string[]) {
  mocks.useAuth.mockReturnValue({
    user: { id: 'user-1', profileId: 'profile-1', roles },
  });
  mocks.useFetch.mockReturnValue({
    data: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
  return render(<SettingsPage onNotice={vi.fn()} />);
}

describe('admin architecture registry settings access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ['admin', ['admin']],
    ['manager', ['manager']],
  ])('exposes the read-only architecture tab to %s', async (_label, roles) => {
    renderSettingsFor(roles);
    const tab = screen.getByRole('button', { name: 'معمارية النظام' });
    expect(tab).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(tab);
    await waitFor(() => {
      expect(screen.getByTestId('architecture-registry-panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: 'معمارية النظام' })).toBeInTheDocument();
  });

  it.each([
    ['staff', ['staff']],
    ['accountant', ['accountant']],
    ['customer manager', ['customer_manager']],
    ['customer', ['customer']],
  ])('does not expose or mount the architecture registry for %s', (_label, roles) => {
    renderSettingsFor(roles);
    expect(screen.queryByRole('button', { name: 'معمارية النظام' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('architecture-registry-panel')).not.toBeInTheDocument();
  });
});
