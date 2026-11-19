import { describe, expect, it } from 'vitest';

import { employeeListItem, employeeRecord, noPortalAccess } from './records';

describe('the employee list row builder', () => {
  it('is the same person as the employee record, with only the fields a list row has', () => {
    const row = employeeListItem({ lastName: 'Popescu', signaturesPending: 2 });

    expect(row).toMatchObject({
      id: employeeRecord().id,
      lastName: 'Popescu',
      signaturesPending: 2,
      portal: noPortalAccess,
    });
    expect(row).not.toHaveProperty('cnp');
    expect(row).not.toHaveProperty('archivedAt');
  });
});
