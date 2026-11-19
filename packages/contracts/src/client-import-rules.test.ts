import { describe, expect, it } from 'vitest';

import { proposedIncluded, proposedUntickedReason } from './client-import-rules';

describe('what a client import proposes unticked', () => {
  const employee = { otherCompanyName: null, role: 'employee' };

  it('names why an item waits for the member to tick it', () => {
    expect(proposedUntickedReason(employee)).toBeNull();
    expect(proposedIncluded(employee)).toBe(true);
    expect(proposedUntickedReason({ ...employee, otherCompanyName: 'ALTA S.R.L.' })).toBe(
      'other_company'
    );
    expect(proposedUntickedReason({ ...employee, role: 'legal_representative' })).toBe(
      'legal_representative'
    );
    expect(proposedUntickedReason({ otherCompanyName: null, managementOnly: true })).toBe(
      'management_only'
    );
    expect(proposedIncluded({ otherCompanyName: null, managementOnly: true })).toBe(false);
  });
});
