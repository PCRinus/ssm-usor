import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { invalidateSignatures } from './signature-queries';

const clientId = '11111111-2222-4333-8444-555555555555';
const otherClientId = '99999999-2222-4333-8444-555555555555';
const employeeId = '22222222-3333-4444-8555-666666666666';

describe('invalidateSignatures', () => {
  it("refreshes the client's employees' tests, where a test sheet's slots are, and nothing of another client", async () => {
    const queryClient = new QueryClient();
    const keys = {
      tests: [`/clients/${clientId}/employees/${employeeId}/tests`],
      otherTests: [`/clients/${otherClientId}/employees/${employeeId}/tests`],
      employee: [`/clients/${clientId}/employees/${employeeId}`],
      recordSignatures: [`/clients/${clientId}/training-records/r1/signatures`],
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, {});
    await invalidateSignatures(queryClient, clientId);
    const invalidated = (key: string[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(invalidated(keys.tests)).toBe(true);
    expect(invalidated(keys.recordSignatures)).toBe(true);
    expect(invalidated(keys.otherTests)).toBe(false);
    expect(invalidated(keys.employee)).toBe(false);
  });
});
