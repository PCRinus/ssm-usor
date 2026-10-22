import { currentPrivacyNoticeVersion } from '@ssm-usor/contracts';
import type { Session } from '@supabase/supabase-js';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import type {
  PortalEmployeeDataResponse,
  PortalMeResponseParticipationsItem,
  PortalTestsResponse,
  PortalTrainingRecordsResponse,
  PortalTrainingRecordsResponseItemsItemSlotsItem,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import App from '@/app/App';
import { createPortalRuntime, type PortalRuntime } from '@/app/portal-runtime';
import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

export function fakeSession(user: { email?: string; phone?: string } = {}): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-10-17T08:00:00Z',
      email: user.email ?? 'ana@example.ro',
      phone: user.phone ?? '',
    },
  } as Session;
}

export function fakeAuthClient(session: Session | null = null) {
  return {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ data: { session: fakeSession() }, error: null })),
  } satisfies AuthClient;
}

const runtimes: PortalRuntime[] = [];

export function disposeRuntimes() {
  runtimes.splice(0).forEach((runtime) => runtime.dispose());
}

export function mountPortal(client: AuthClient | null, path = '/') {
  const runtime = createPortalRuntime(
    client,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:8787'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

export function participation(
  overrides: Partial<PortalMeResponseParticipationsItem> = {}
): PortalMeResponseParticipationsItem {
  return {
    participantId: '6f0c3e43-0c1b-4f4b-8a1e-000000000001',
    organizationName: 'Prevenție Vest S.R.L.',
    clientId: '6f0c3e43-0c1b-4f4b-8a1e-0000000000c1',
    clientName: 'Mobilă Bună S.A.',
    kind: 'employee',
    employeeId: '6f0c3e43-0c1b-4f4b-8a1e-0000000000e1',
    fullName: 'Pop Ana',
    noticeVersion: currentPrivacyNoticeVersion,
    language: null,
    ...overrides,
  };
}

export function queryResult<T>(data: T) {
  return {
    data,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  } as never;
}

export function queryPending() {
  return {
    data: undefined,
    error: null,
    isPending: true,
    isError: false,
    isSuccess: false,
    refetch: vi.fn(),
  } as never;
}

export function queryFailure(status: number) {
  return {
    data: undefined,
    error: new ApiHttpError(status, { error: 'forbidden', message: 'Forbidden.' }),
    isPending: false,
    isError: true,
    isSuccess: false,
    refetch: vi.fn(),
  } as never;
}

export const trainingStatus = (
  overrides: Partial<PortalTrainingRecordsResponse['training']['ssm']> = {}
): PortalTrainingRecordsResponse['training']['ssm'] => ({
  state: 'current',
  dueOn: '2027-03-12',
  lastPeriodicOn: '2026-09-12',
  intervalMonths: 6,
  intervalSource: 'client',
  ...overrides,
});

export const recordSlot = (
  slot: PortalTrainingRecordsResponseItemsItemSlotsItem['slot'],
  overrides: Partial<PortalTrainingRecordsResponseItemsItemSlotsItem> = {}
): PortalTrainingRecordsResponseItemsItemSlotsItem => ({
  slot,
  state: 'unassigned',
  signedAt: null,
  signerName: null,
  signerJobTitle: null,
  ...overrides,
});

export function trainingRecords(
  overrides: Partial<PortalTrainingRecordsResponse> = {}
): PortalTrainingRecordsResponse {
  return {
    items: [
      {
        id: '6f0c3e43-0c1b-4f4b-8a1e-0000000000a1',
        domain: 'ssm',
        phase: 'periodic',
        heldOn: '2026-09-12',
        durationMinutes: 90,
        material: 'Instrucțiuni proprii pentru utilizarea fierăstrăului circular.',
        trainer: { name: 'Radu Stan', jobTitle: 'Șef de atelier' },
        verifier: null,
        supplementaryReason: null,
        occupation: 'Tâmplar',
        admission: null,
        slots: [recordSlot('trainee'), recordSlot('trainer')],
      },
      {
        id: '6f0c3e43-0c1b-4f4b-8a1e-0000000000a2',
        domain: 'psi',
        phase: 'introductory_general',
        heldOn: '2026-02-03',
        durationMinutes: 480,
        material: 'Prevenirea și stingerea incendiilor.',
        trainer: { name: 'Ioana Dinu', jobTitle: 'Cadru tehnic PSI' },
        verifier: null,
        supplementaryReason: null,
        occupation: 'Tâmplar',
        admission: null,
        slots: [recordSlot('trainee'), recordSlot('trainer')],
      },
    ],
    training: {
      ssm: trainingStatus(),
      psi: trainingStatus({ state: 'overdue', dueOn: '2026-08-03', intervalMonths: 12 }),
    },
    ...overrides,
  };
}

export function employeeData(): PortalEmployeeDataResponse {
  return {
    employee: {
      lastName: 'Pop',
      firstName: 'Ana',
      employeeNumber: 'M-17',
      contractTitle: 'Tâmplar universal',
      position: 'Tâmplar',
      workplace: 'Atelierul din Lugoj',
      hiredAt: '2024-02-15',
      homeAddress: 'Str. Lungă 5, Lugoj',
      birthDate: '1990-05-04',
      birthPlace: 'Timișoara',
      bloodGroup: 'A(II)',
      rhFactor: '+',
      qualification: 'Tâmplar',
      education: 'Liceu',
      authorizations: null,
      commuteRoute: 'Pe jos, pe strada Lungă',
      commuteMinutes: 15,
    },
    training: trainingRecords().training,
    client: { name: 'Mobilă Bună S.A.' },
    provider: { name: 'Prevenție Vest S.R.L.', phone: '0722 000 111' },
  };
}

type PortalDomainTests = PortalTestsResponse['ssm'];

export const testStatus = (
  overrides: Partial<PortalDomainTests['status']> = {}
): PortalDomainTests['status'] => ({
  state: 'none',
  awaitingTest: null,
  lastPassedOn: null,
  dueOn: null,
  ...overrides,
});

export function portalTests(
  overrides: { ssm?: Partial<PortalDomainTests>; psi?: Partial<PortalDomainTests> } = {}
): PortalTestsResponse {
  const domain = (domainOverrides: Partial<PortalDomainTests> = {}) => ({
    status: testStatus(),
    results: [],
    attempts: [],
    inProgress: null,
    ...domainOverrides,
  });
  return {
    ssm: domain(overrides.ssm) as PortalTestsResponse['ssm'],
    psi: domain(overrides.psi) as PortalTestsResponse['psi'],
  };
}
