// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useFetch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/lib/useFetch', () => ({ useFetch: mocks.useFetch }));

import { SettingsPage } from '@/components/AdminPages';
import { ADMIN_NAV_PATHS, roleCanAccessView } from '@/lib/admin-access-matrix';

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

describe('admin architecture is registered in canonical navigation, not general settings', () => {
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
  ])('keeps the architecture destination available to %s through the canonical admin route', (_label, roles) => {
    expect(ADMIN_NAV_PATHS.architecture).toBe('/admin/architecture');
    expect(roleCanAccessView(roles[0], 'architecture')).toBe(true);

    renderSettingsFor(roles);
    expect(screen.queryByRole('button', { name: 'معمارية النظام' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('architecture-registry-panel')).not.toBeInTheDocument();
  });

  it.each([
    ['staff', ['staff']],
    ['accountant', ['accountant']],
    ['customer manager', ['customer_manager']],
    ['customer', ['customer']],
  ])('does not grant the architecture route or duplicate settings panel to %s', (_label, roles) => {
    expect(roleCanAccessView(roles[0], 'architecture')).toBe(false);

    renderSettingsFor(roles);
    expect(screen.queryByRole('button', { name: 'معمارية النظام' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('architecture-registry-panel')).not.toBeInTheDocument();
  });
});
