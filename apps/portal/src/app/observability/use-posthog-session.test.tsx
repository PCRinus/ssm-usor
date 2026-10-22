import { screen, waitFor } from '@testing-library/react';
import type { PostHog } from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useGetPortalMe,
  useGetPortalSigningAgreementState,
  useGetPortalTests,
  useListPortalResponsiblePersons,
  useListPortalSignatureRequests,
  useListPortalSigningAgreements,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import {
  disposeRuntimes,
  fakeAuthClient,
  fakeSession,
  mountPortal,
  participation,
  queryPending,
  queryResult,
} from '@/test/portal';

const posthog = vi.hoisted(() => ({
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
  resetGroups: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  capture: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('./posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./posthog')>()),
  loadPostHog: async () => posthog as unknown as PostHog,
}));

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
  useGetPortalSigningAgreementState: vi.fn(),
  useListPortalSignatureRequests: vi.fn(),
  useListPortalSigningAgreements: vi.fn(),
  useListPortalTrainingRecords: vi.fn(),
  useGetPortalTests: vi.fn(),
  useListPortalResponsiblePersons: vi.fn(),
}));

beforeEach(() => {
  Object.values(posthog).forEach((mock) => mock.mockReset());
  vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [participation()] }));
  vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(queryResult({ agreement: null }));
  vi.mocked(useListPortalSignatureRequests).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useListPortalSigningAgreements).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useListPortalTrainingRecords).mockReturnValue(queryPending());
  vi.mocked(useGetPortalTests).mockReturnValue(queryPending());
  vi.mocked(useListPortalResponsiblePersons).mockReturnValue(queryPending());
});

afterEach(() => disposeRuntimes());

describe('PostHog in the portal', () => {
  it('names the participant by their sign-in address and groups them under their client', async () => {
    mountPortal(fakeAuthClient(fakeSession()), '/');
    await screen.findByTestId('portal-bar');

    await waitFor(() =>
      expect(posthog.identify).toHaveBeenCalledWith('user-1', {
        name: 'Pop Ana',
        email: 'ana@example.ro',
        phone: undefined,
      })
    );
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
    expect(posthog.group).toHaveBeenCalledWith('client', participation().clientId, {
      name: 'Mobilă Bună S.A.',
      organization_name: 'Prevenție Vest S.R.L.',
    });
    expect(posthog.register).toHaveBeenCalledWith({
      participant_kind: 'employee',
      organization_name: 'Prevenție Vest S.R.L.',
    });
    expect(posthog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: 'http://localhost:5174/',
    });
  });

  it('names a participant who signed in by phone by that number', async () => {
    mountPortal(fakeAuthClient(fakeSession({ email: '', phone: '40722123456' })), '/');

    await waitFor(() =>
      expect(posthog.identify).toHaveBeenCalledWith('user-1', {
        name: 'Pop Ana',
        email: undefined,
        phone: '40722123456',
      })
    );
  });

  it('forgets the participant and stops recording on sign-out', async () => {
    const runtime = mountPortal(fakeAuthClient(fakeSession()), '/');
    await waitFor(() => expect(posthog.identify).toHaveBeenCalled());

    await runtime.auth.signOut();

    await waitFor(() => expect(posthog.reset).toHaveBeenCalled());
    expect(posthog.stopSessionRecording).toHaveBeenCalled();
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
  });
});
